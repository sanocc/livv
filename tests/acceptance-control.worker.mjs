// Real local workerd runtime with SYNTHETIC devices/data. Never a real OTA PASS.
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { issueCapability } from "../scripts/acceptance-capability.mjs";
import { businessDate, addDays } from "../api/src/config.js";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("../", import.meta.url));
const root = fs.mkdtempSync(path.join(tmpdir(), "poai-control-worker-"));
const pair = generateKeyPairSync("ed25519"),
  pub = pair.publicKey.export({ format: "jwk" }),
  kid = "isolated-workerd-key";
const context = {
  platform: "ctrip",
  city: "咸宁",
  keyword: "中心花坛",
  checkin: addDays(businessDate(), 1),
  checkout: addDays(businessDate(), 2),
  purpose: "PLATFORM_ACCEPTANCE",
};
const cap = issueCapability({
  privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
  kid,
  context,
  os: "macOS",
});
const config = {
  name: "poai-control-isolated",
  main: path.join(repo, "api/src/index.js"),
  compatibility_date: "2026-09-30",
  vars: {
    ENVIRONMENT: "local",
    LOCAL_ADMIN_TOKEN: "isolated-workerd-test-only",
    ACCEPTANCE_CONTROL_ENABLED: "true",
    ACCEPTANCE_CONTROL_PUBLIC_KEYS: JSON.stringify([
      { kid, kty: pub.kty, crv: pub.crv, x: pub.x },
    ]),
    ACCEPTANCE_CONTROL_REVOKED_IDS: "[]",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "isolated-acceptance-control",
      database_id: "00000000-0000-4000-8000-000000000001",
      migrations_dir: path.join(repo, "api/migrations"),
    },
  ],
};
const configPath = path.join(root, "config.json");
fs.writeFileSync(configPath, JSON.stringify(config));
const cli = path.join(repo, "node_modules/wrangler/bin/wrangler.js"),
  env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, "xdg"),
    WRANGLER_LOG_PATH: path.join(root, "logs"),
    CI: "true",
  };
execFileSync(
  process.execPath,
  [
    cli,
    "d1",
    "migrations",
    "apply",
    "isolated-acceptance-control",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    path.join(root, "d1"),
  ],
  { cwd: repo, env, stdio: "pipe" },
);
let proc,
  logs = "";
const call = async (
  route,
  method = "GET",
  body,
  auth = cap.token,
  deviceID,
) => {
  const r = await fetch("http://127.0.0.1:48971" + route, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
      ...(deviceID ? { "X-Device-ID": deviceID } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
};
try {
  proc = spawn(
    process.execPath,
    [
      cli,
      "dev",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      path.join(root, "d1"),
      "--ip",
      "127.0.0.1",
      "--port",
      "48971",
      "--inspector-port",
      "0",
    ],
    { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  proc.stdout.on("data", (c) => (logs += c));
  proc.stderr.on("data", (c) => (logs += c));
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await call("/health");
      if (r.status === 200 && r.body.database === "ok") {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(ready, true, "isolated workerd readiness");
  assert.equal(
    (await call("/v1/acceptance-control/result")).body.status,
    "NOT_CREATED",
  );
  assert.equal(
    (await call("/v1/acceptance-control/tasks", "POST", context)).status,
    409,
  );
  const id = "157317c4-4734-4abe-a778-9c3e1bac1e24",
    credential = "a".repeat(64);
  assert.equal(
    (
      await call(
        "/v1/devices/register",
        "POST",
        { device_id: id, credential, version: "1.3.6" },
        "isolated-workerd-test-only",
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        "/v1/admin/devices/" + id,
        "PATCH",
        { status: "approved" },
        "isolated-workerd-test-only",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/v1/device/environment",
        "POST",
        {
          os: "macOS",
          browser_name: "Chrome",
          browser_version: "140.0.0.0",
          manifest_version: 3,
          capabilities: { ctrip: true, market_list: true },
        },
        credential,
        id,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/v1/device/heartbeat",
        "POST",
        {
          version: "1.3.6",
          runtime: { auto: true, debugger_permission: true },
        },
        credential,
        id,
      )
    ).status,
    200,
  );
  const created = await call("/v1/acceptance-control/tasks", "POST", context);
  assert.equal(created.status, 201);
  assert.equal(
    (await call("/v1/acceptance-control/tasks", "POST", context)).status,
    200,
  );
  const claimed = await call("/v1/device/claim", "POST", {}, credential, id),
    attempt = claimed.body.attempt;
  assert.equal(claimed.body.task.id, created.body.task_id);
  assert.equal(
    (
      await call(
        "/v1/device/attempts/" + attempt.id + "/start",
        "POST",
        {},
        credential,
        id,
      )
    ).status,
    200,
  );
  for (const event of ["LIST_READY", "MARKET_LOCKED"])
    assert.equal(
      (
        await call(
          "/v1/device/attempts/" + attempt.id + "/events",
          "POST",
          { event, message: JSON.stringify({ count: 3 }) },
          credential,
          id,
        )
      ).status,
      200,
    );
  const t = claimed.body.task;
  assert.equal(
    (
      await call(
        "/v1/device/attempts/" + attempt.id + "/result",
        "POST",
        {
          source: "ctrip-dom",
          platform: t.platform,
          city: t.city,
          keyword: t.keyword,
          checkin: t.checkin,
          checkout: t.checkout,
          observed_at: new Date().toISOString(),
          exhausted: false,
          stop_reason: "TARGET_REACHED",
          hotels: [0, null, 188].map((display_price, i) => ({
            hotel_id: String(i + 1),
            hotel_name: `隔离合成酒店${i + 1}`,
            rank: i + 1,
            is_ad: false,
            display_price,
            original_price: null,
          })),
          rooms: [],
          detail_results: [],
        },
        credential,
        id,
      )
    ).status,
    200,
  );
  const report = await call("/v1/acceptance-control/result");
  assert.equal(report.body.status, "SIMULATED_PASS");
  assert.equal(report.body.execution.card_count, 3);
  assert.equal(report.body.execution.attempt_id, attempt.id);
  assert.ok(report.body.execution.snapshot_id);
  assert.deepEqual(
    report.body.observations.map((h) => h.display_price),
    [0, null, 188],
  );
  assert.ok((await call("/v1/admin/plans", "POST", {})).status >= 400);
  console.log(
    "Actual local workerd+D1: Ed25519 verification, limited create/idempotency, approved synthetic Agent protocol, snapshot/report, zero/null and admin denial PASS. All evidence is SIMULATED_PASS; no production or real OTA execution.",
  );
} catch (e) {
  console.error("Isolated workerd check failed:", e.message);
  process.exitCode = 1;
} finally {
  if (proc) {
    proc.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => proc.once("exit", r)),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  }
  fs.rmSync(root, { recursive: true, force: true });
}
