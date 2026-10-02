import test from "node:test";
import assert from "node:assert/strict";
import worker from "../api/src/index.js";
import { acceptanceReport } from "../api/src/acceptance.js";
import {
  harness,
  input,
  device,
  claimStart,
  complete,
} from "./acceptance-support.js";
import { nowIso, CONFIG } from "../api/src/config.js";
const endpoint = "/v1/admin/acceptance-tasks";
const report = (h, task) => h.call(`${endpoint}/${task.id}`);
async function create(h, os = "macOS", extra = {}) {
  const r = await h.call(endpoint, "POST", { ...input(os), ...extra });
  assert.equal(r.status, 201, JSON.stringify(r));
  return r.data.task;
}
test("acceptance uses original task/attempt/upload chain, captures start environment, preserves zero/null, and marks isolated results SIMULATED_PASS", async () => {
  const h = harness();
  try {
    const d = await device(h),
      task = await create(h);
    assert.equal(task.preferred_device_id, d.id);
    assert.equal(task.plan_id, null);
    assert.equal(task.collection_limit, 3);
    assert.equal((await report(h, task)).data.status, "AWAITING_REAL_AGENT");
    assert.equal((await h.call(endpoint)).data.tasks.length, 1);
    const a = await claimStart(h, d, task);
    await h.call(
      "/v1/device/environment",
      "POST",
      { ...d.environment, os: "Windows" },
      d.headers,
    );
    const p = await complete(h, d, task, a);
    const before = h.DB.raw.prepare("SELECT total_changes() n").get().n;
    const r = (await report(h, task)).data;
    assert.equal(r.status, "SIMULATED_PASS");
    assert.equal(r.simulation, true);
    assert.ok(Object.values(r.checks).every((v) => v === true));
    assert.equal(r.device_at_start.os, "macOS");
    assert.equal(r.device_at_start.agent_version, "1.3.6");
    assert.equal(r.snapshot.observed_at, p.observed_at);
    assert.equal(r.snapshot.attempt_id, a.id);
    assert.deepEqual(
      r.observations.map((o) => o.display_price),
      [0, null, 188],
    );
    assert.equal(r.automatic_repair_count, 0);
    assert.equal(r.retry_count, 0);
    assert.ok(!JSON.stringify(r).includes("do-not-export-raw-diagnostics"));
    assert.ok(!JSON.stringify(r).includes("credential"));
    assert.equal(h.DB.raw.prepare("SELECT total_changes() n").get().n, before);
    // Unit verification of the production rule; synthetic records are never uploaded to production.
    assert.equal(
      (await acceptanceReport(h.DB, task.id, "production")).status,
      "VERIFIED",
    );
    assert.equal(
      (await acceptanceReport(h.DB, task.id, undefined)).status,
      "SIMULATED_PASS",
    );
  } finally {
    h.DB.raw.close();
  }
});
test("Windows is distinct from macOS and device ownership remains enforced", async () => {
  const h = harness();
  try {
    const mac = await device(h),
      win = await device(h, "Windows"),
      task = await create(h, "Windows");
    assert.equal(task.preferred_device_id, win.id);
    assert.equal(
      (await h.call("/v1/device/claim", "POST", {}, mac.headers)).data,
      null,
    );
    const a = await claimStart(h, win, task);
    assert.equal(
      (
        await h.call(
          `/v1/device/attempts/${a.id}/start`,
          "POST",
          {},
          mac.headers,
        )
      ).status,
      404,
    );
    await complete(h, win, task, a);
    const r = (await report(h, task)).data;
    assert.equal(r.os, "Windows");
    assert.equal(r.status, "SIMULATED_PASS");
  } finally {
    h.DB.raw.close();
  }
});
test("acceptance idempotency does not create duplicate tasks; changed context conflicts", async () => {
  const h = harness();
  try {
    await device(h);
    const request_id = "157317c4-4734-4abe-a778-9c3e1bac1e24",
      b = { ...input(), request_id };
    const task = await create(h, "macOS", { request_id });
    assert.equal((await h.call(endpoint, "POST", b)).status, 200);
    assert.equal(
      (await h.call(endpoint, "POST", { ...b, city: "武汉" })).status,
      409,
    );
    assert.equal(h.DB.raw.prepare("SELECT count(*) n FROM tasks").get().n, 1);
    assert.equal(
      (await h.call(endpoint, "POST", input())).data.error.code,
      "NO_READY_APPROVED_CHROME_AGENT",
    );
  } finally {
    h.DB.raw.close();
  }
});
for (const reason of [
  "pending",
  "disabled",
  "offline",
  "Linux",
  "Edge",
  "auto_off",
  "debugger_off",
  "unsupported",
  "platform_not_declared",
  "busy",
  "missing_environment",
]) {
  test(`acceptance cannot target ${reason} device`, async () => {
    const h = harness();
    try {
      const d = await device(h);
      if (["pending", "disabled"].includes(reason))
        h.DB.raw
          .prepare("UPDATE devices SET status=? WHERE id=?")
          .run(reason, d.id);
      if (reason === "offline")
        h.DB.raw
          .prepare("UPDATE devices SET last_seen_at=? WHERE id=?")
          .run(nowIso(Date.now() - (CONFIG.offlineSeconds + 1) * 1000), d.id);
      if (["Linux", "Edge", "unsupported"].includes(reason))
        await h.call(
          "/v1/device/environment",
          "POST",
          {
            ...d.environment,
            ...(reason === "Linux"
              ? { os: "Linux" }
              : reason === "Edge"
                ? { browser_name: "Edge" }
                : { capabilities: { ctrip: false, market_list: true } }),
          },
          d.headers,
        );
      if (["auto_off", "debugger_off"].includes(reason))
        await h.call(
          "/v1/device/heartbeat",
          "POST",
          {
            runtime: {
              auto: reason !== "auto_off",
              debugger_permission: reason !== "debugger_off",
            },
          },
          d.headers,
        );
      if (reason === "missing_environment")
        h.DB.raw
          .prepare("UPDATE devices SET environment=NULL WHERE id=?")
          .run(d.id);
      if (reason === "busy") {
        const t = (
          await h.call("/v1/admin/tasks", "POST", {
            ...input(),
            scope: "custom",
            limit: 3,
          })
        ).data;
        await claimStart(h, d, t);
      }
      if (reason === "platform_not_declared") h.DB.raw.prepare("UPDATE devices SET supported_platforms='[]' WHERE id=?").run(d.id);
      const before = h.DB.raw.prepare("SELECT count(*) n FROM tasks").get().n;
      const r = await h.call(endpoint, "POST", input());
      assert.equal(r.status, 409);
      assert.equal(r.data.error.code, "NO_READY_APPROVED_CHROME_AGENT");
      assert.equal(
        h.DB.raw.prepare("SELECT count(*) n FROM tasks").get().n,
        before,
      );
    } finally {
      h.DB.raw.close();
    }
  });
}
test("claim rechecks OS and runtime eligibility after creation without changing ordinary task rules", async () => {
  const h = harness();
  try {
    const d = await device(h),
      task = await create(h);
    await h.call(
      "/v1/device/environment",
      "POST",
      { ...d.environment, os: "Windows" },
      d.headers,
    );
    assert.equal(
      (await h.call("/v1/device/claim", "POST", {}, d.headers)).data,
      null,
    );
    await h.call("/v1/device/environment", "POST", d.environment, d.headers);
    await h.call(
      "/v1/device/heartbeat",
      "POST",
      { runtime: { auto: false, debugger_permission: true } },
      d.headers,
    );
    assert.equal(
      (await h.call("/v1/device/claim", "POST", {}, d.headers)).data,
      null,
    );
    const ordinary = (
      await h.call("/v1/admin/tasks", "POST", {
        ...input(),
        scope: "custom",
        limit: 3,
      })
    ).data;
    const claimed = await h.call("/v1/device/claim", "POST", {}, d.headers);
    assert.equal(claimed.data.task.id, ordinary.id);
    assert.equal((await report(h, task)).data.status, "AWAITING_REAL_AGENT");
  } finally {
    h.DB.raw.close();
  }
});
for (const code of ["LOGIN_REQUIRED", "CAPTCHA_REQUIRED"]) {
  test(`${code} stops acceptance with safe diagnosis, no retry, without changing ordinary task retries`, async () => {
    const h = harness();
    try {
      const d = await device(h),
        task = await create(h),
        a = await claimStart(h, d, task);
      assert.equal(
        (
          await h.call(
            `/v1/device/attempts/${a.id}/fail`,
            "POST",
            { error_code: code, error_message: "cookie=must-not-export" },
            d.headers,
          )
        ).status,
        200,
      );
      const r = (await report(h, task)).data;
      assert.equal(r.status, "BLOCKED");
      assert.equal(r.blocker, code);
      assert.equal(r.task_status, "FAILED");
      assert.equal(r.retry_count, 0);
      assert.ok(!JSON.stringify(r).includes("must-not-export"));
      assert.equal(
        (await h.call("/v1/device/claim", "POST", {}, d.headers)).data,
        null,
      );
      const t = (
        await h.call("/v1/admin/tasks", "POST", {
          ...input(),
          scope: "custom",
          limit: 3,
        })
      ).data;
      const b = await claimStart(h, d, t);
      await h.call(
        `/v1/device/attempts/${b.id}/fail`,
        "POST",
        { error_code: code, error_message: "ordinary" },
        d.headers,
      );
      assert.equal(
        h.DB.raw.prepare("SELECT status FROM tasks WHERE id=?").get(t.id)
          .status,
        "PENDING",
      );
    } finally {
      h.DB.raw.close();
    }
  });
}
for (const scenario of [
  "no_stages",
  "no_prices",
  "partial",
  "forged_extra_event",
]) {
  test(`acceptance validates evidence for ${scenario}`, async () => {
    const h = harness();
    try {
      const d = await device(h),
        task = await create(h),
        a = await claimStart(h, d, task);
      if (scenario === "forged_extra_event")
        await h.call(
          `/v1/device/attempts/${a.id}/events`,
          "POST",
          {
            event: "STARTED",
            message: JSON.stringify({
              app_version: "9.9.9",
              acceptance_device: { os: "Windows", approved_at_start: true },
            }),
          },
          d.headers,
        );
      await complete(h, d, task, a, {
        stages: scenario !== "no_stages",
        prices:
          scenario === "no_prices"
            ? [null, null, null]
            : scenario === "partial"
              ? [188]
              : [0, null, 188],
      });
      const r = await acceptanceReport(h.DB, task.id, "production");
      if (scenario === "forged_extra_event") {
        assert.equal(r.device_at_start.agent_version, "1.3.6");
        assert.equal(r.device_at_start.os, "macOS");
      } else assert.equal(r.status, "INCONCLUSIVE");
    } finally {
      h.DB.raw.close();
    }
  });
}
test("acceptance auth, origin and platform guards remain strict, reports/readiness have no side effects", async () => {
  const h = harness();
  try {
    assert.equal((await h.call(endpoint, "POST", input(), {})).status, 501);
    const before = h.DB.raw.prepare("SELECT total_changes() n").get().n;
    for (const platform of ["meituan", "fliggy", "tongcheng", "elong"]) {
      const r = await h.call(endpoint, "POST", { ...input(), platform });
      assert.equal(r.status, 409);
      assert.equal(r.data.error.code, "AGENT_HOST_PERMISSION_REVIEW_REQUIRED");
    }
    for (const extra of [
      { url: "https://example.com" },
      { script: "run" },
      { os: "Linux" },
      { request_id: "invalid" },
      { hotel_prices: [1] },
    ])
      assert.equal(
        (await h.call(endpoint, "POST", { ...input(), ...extra })).status,
        400,
      );
    assert.equal((await h.call(endpoint + "/missing")).status, 404);
    assert.equal(
      (await h.call("/v1/admin/acceptance/readiness")).data.platforms.length,
      5,
    );
    assert.equal(h.DB.raw.prepare("SELECT total_changes() n").get().n, before);
    const r = await worker.fetch(
      new Request("http://localhost" + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer isolated-acceptance-test",
          Origin: "https://evil.example",
        },
        body: JSON.stringify(input()),
      }),
      h.env,
    );
    assert.equal(r.status, 403);
    h.env.ENVIRONMENT = "production";
    assert.equal((await h.call(endpoint, "POST", input())).status, 501);
  } finally {
    h.DB.raw.close();
  }
});
