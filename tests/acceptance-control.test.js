import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  chmodSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import worker from "../api/src/index.js";
import {
  verifyAcceptanceCapability,
  capabilityParts,
  b64url,
} from "../api/src/acceptance-capability.js";
import {
  issueCapability,
  main as signerMain,
} from "../scripts/acceptance-capability.mjs";
import { acceptanceRequest } from "../scripts/acceptance-control-client.mjs";
import {
  harness,
  input,
  device,
  claimStart,
  complete,
} from "./acceptance-support.js";
const base = "/v1/acceptance-control";
const { os: testOS, ...testContext } = input();
const context = () => ({ ...testContext, purpose: "PLATFORM_ACCEPTANCE" });
const boundaryClock = Math.floor(Date.now() / 1000);

function fixture() {
  const h = harness(),
    pair = generateKeyPairSync("ed25519"),
    kid = "isolated-test-key";
  const pub = pair.publicKey.export({ format: "jwk" }),
    privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  Object.assign(h.env, {
    ACCEPTANCE_CONTROL_ENABLED: "true",
    ACCEPTANCE_CONTROL_PUBLIC_KEYS: JSON.stringify([
      { kid, kty: pub.kty, crv: pub.crv, x: pub.x },
    ]),
    ACCEPTANCE_CONTROL_REVOKED_IDS: "[]",
  });
  const capability = (options = {}) =>
    issueCapability({
      privateKey,
      kid,
      context: context(),
      os: "macOS",
      ...options,
    });
  const headers = (token) => ({ Authorization: `Bearer ${token}` });
  const call = (cap, route = "/result", method = "GET", body, extra = {}) =>
    h.call(base + route, method, body, { ...headers(cap.token), ...extra });
  const forge = (changes = {}, head = {}) => {
    const sample = capability();
    const claims = JSON.parse(
      Buffer.from(sample.token.split(".")[1], "base64url"),
    );
    const payload = capabilityParts(
      { alg: "EdDSA", typ: "poai-acceptance-capability+JWT", kid, ...head },
      { ...claims, ...changes },
    );
    return {
      token:
        payload +
        "." +
        b64url(sign(null, Buffer.from(payload), pair.privateKey)),
    };
  };
  return { ...h, capability, headers, control: call, forge };
}
test("single-context capability creates only one existing MARKET_LIST acceptance, reads only its grant, and never marks local evidence real", async () => {
  const h = fixture();
  try {
    const d = await device(h),
      cap = h.capability();
    assert.equal((await h.control(cap)).data.status, "NOT_CREATED");
    const r = await h.control(cap, "/tasks", "POST", context());
    assert.equal(r.status, 201);
    const task = h.DB.raw
      .prepare("SELECT * FROM tasks WHERE id=?")
      .get(r.data.task_id);
    assert.equal(task.plan_id, null);
    assert.equal(task.task_type, "MARKET_LIST");
    assert.equal(task.collection_limit, 3);
    assert.equal(task.preferred_device_id, d.id);
    assert.equal(
      (await h.control(cap, "/tasks", "POST", context())).status,
      200,
    );
    assert.equal(h.DB.raw.prepare("SELECT count(*) n FROM tasks").get().n, 1);
    const a = await claimStart(h, d, task);
    const p = await complete(h, d, task, a);
    const before = h.DB.raw.prepare("SELECT total_changes() n").get().n;
    const report = (await h.control(cap)).data;
    assert.equal(report.status, "SIMULATED_PASS");
    assert.equal(report.simulation, true);
    assert.equal(report.execution.execution_id, a.id);
    assert.equal(report.execution.attempt_id, a.id);
    assert.equal(report.execution.snapshot_id, report.snapshot.snapshot_id);
    assert.equal(report.execution.observed_at, p.observed_at);
    assert.equal(report.execution.page_reached, true);
    assert.equal(report.execution.card_count, null);
    assert.equal(report.execution.uploaded_card_count, 3);
    assert.equal(report.execution.parsed_fields.display_price, 2);
    assert.equal(report.execution.parsed_fields.original_price, 0);
    assert.equal(report.execution.upload_result.status, "SUCCESS");
    assert.ok(
      !JSON.stringify(report).includes("do-not-export-raw-diagnostics"),
    );
    assert.equal(h.DB.raw.prepare("SELECT total_changes() n").get().n, before);
    assert.equal((await h.control(h.capability())).data.status, "NOT_CREATED");
    assert.equal((await h.control(cap, `/tasks/${task.id}`)).status, 404);
  } finally {
    h.DB.raw.close();
  }
});
test("server chooses approved device of issuer-pinned OS; Cloud cannot choose OS, device, URL, scope, ordinary plan or another purpose/platform", async () => {
  const h = fixture();
  try {
    const d = await device(h, "Windows"),
      cap = h.capability({ os: "Windows" });
    const before = h.DB.raw.prepare("SELECT total_changes() n").get().n;
    for (const extra of [
      { os: "macOS" },
      { device_id: d.id },
      { url: "https://example.test" },
      { scope: "all" },
      { limit: 30 },
      { plan_id: "anything" },
      { task_type: "LEGACY_MARKET_DETAIL" },
      { purpose: "MARKET_COLLECTION" },
      { platform: "meituan" },
      { platform: "fliggy" },
      { platform: "tongcheng" },
      { platform: "elong" },
    ]) {
      const r = await h.control(cap, "/tasks", "POST", {
        ...context(),
        ...extra,
      });
      assert.equal(r.status, 400, JSON.stringify(extra));
    }
    assert.equal(
      (await h.control(cap, "/tasks", "POST", { ...context(), city: "杭州" }))
        .status,
      403,
    );
    assert.equal(
      (
        await h.control(cap, "/tasks", "POST", context(), {
          Origin: "https://ota.poai.cc",
        })
      ).status,
      403,
    );
    assert.equal(h.DB.raw.prepare("SELECT total_changes() n").get().n, before);
    const r = await h.control(cap, "/tasks", "POST", context());
    assert.equal(r.status, 201);
    const t = h.DB.raw
      .prepare("SELECT * FROM tasks WHERE id=?")
      .get(r.data.task_id);
    assert.equal(t.preferred_device_id, d.id);
  } finally {
    h.DB.raw.close();
  }
});
test("capability cannot approve devices, change identity, create production plans, access ordinary tasks, upload, delete, or delegate", async () => {
  const h = fixture();
  try {
    const d = await device(h),
      cap = h.capability(),
      before = h.DB.raw.prepare("SELECT total_changes() n").get().n;
    for (const [route, method, body] of [
      ["/v1/admin/tasks", "POST", input()],
      ["/v1/admin/plans", "POST", {}],
      [`/v1/admin/devices/${d.id}`, "PATCH", { status: "approved" }],
      [`/v1/admin/devices/${d.id}`, "DELETE", {}],
      ["/v1/admin/devices", "GET"],
      ["/v1/admin/market", "GET"],
      ["/v1/device/claim", "POST", {}],
      ["/v1/device/attempts/other/result", "POST", {}],
      ["/v1/acceptance-control/tasks", "DELETE", {}],
      ["/v1/acceptance-control/tasks", "PATCH", {}],
      ["/v1/acceptance-control/result?task_id=other", "GET"],
      ["/v1/acceptance-control/issue", "POST", {}],
    ]) {
      const r = await h.call(route, method, body, h.headers(cap.token));
      assert.ok(r.status >= 400, route);
    }
    assert.equal(h.DB.raw.prepare("SELECT total_changes() n").get().n, before);
    assert.equal(
      h.DB.raw.prepare("SELECT status FROM devices WHERE id=?").get(d.id)
        .status,
      "approved",
    );
  } finally {
    h.DB.raw.close();
  }
});
test("control disabled/misconfigured fails closed, including private key config, and never falls back to admin/device credentials", async () => {
  const h = fixture();
  try {
    const cap = h.capability();
    delete h.env.ACCEPTANCE_CONTROL_ENABLED;
    assert.equal((await h.control(cap)).status, 503);
    h.env.ACCEPTANCE_CONTROL_ENABLED = "true";
    assert.equal((await h.call(base + "/result")).status, 401);
    const pub = h.env.ACCEPTANCE_CONTROL_PUBLIC_KEYS;
    for (const value of [
      undefined,
      "{}",
      "[]",
      "not-json",
      JSON.stringify([
        { ...JSON.parse(pub)[0], d: "private-signing-material" },
      ]),
      JSON.stringify([JSON.parse(pub)[0], JSON.parse(pub)[0]]),
    ]) {
      h.env.ACCEPTANCE_CONTROL_PUBLIC_KEYS = value;
      const r = await h.control(cap);
      assert.equal(r.status, 503);
      assert.ok(!JSON.stringify(r).includes("private-signing-material"));
    }
    h.env.ACCEPTANCE_CONTROL_PUBLIC_KEYS = pub;
    h.env.ACCEPTANCE_CONTROL_REVOKED_IDS = "invalid";
    assert.equal((await h.control(cap)).status, 503);
  } finally {
    h.DB.raw.close();
  }
});
for (const [name, changes, head] of [
  [
    "expanded scope",
    { scope: ["acceptance:create", "acceptance:read", "admin"] },
  ],
  ["wrong audience", { aud: "admin" }],
  ["wrong issuer", { iss: "other" }],
  ["wrong subject", { sub: "administrator" }],
  ["invalid grant", { jti: "arbitrary" }],
  ["invalid OS", { os: "Linux" }],
  ["other platform", { context: { ...context(), platform: "meituan" } }],
  ["expired", { iat: 1, nbf: 1, exp: 2 }],
  ["future", { iat: 4102444800, nbf: 4102444800, exp: 4102444801 }],
  [
    "long TTL",
    {
      iat: boundaryClock,
      nbf: boundaryClock,
      exp: boundaryClock + 1801,
    },
  ],
  ["extra claim", { admin: true }],
  ["none algorithm", {}, { alg: "none" }],
  ["foreign JWK URL", {}, { jku: "https://evil.test/keys" }],
  ["foreign key", {}, { kid: "other" }],
])
  test(`capability rejects ${name} without DB writes`, async () => {
    const h = fixture();
    try {
      const before = h.DB.raw.prepare("SELECT total_changes() n").get().n;
      assert.equal((await h.control(h.forge(changes, head))).status, 401);
      assert.equal(
        h.DB.raw.prepare("SELECT total_changes() n").get().n,
        before,
      );
    } finally {
      h.DB.raw.close();
    }
  });
test("signature tampering, expiration boundary, per-grant revocation, key removal and kill switch apply to both create and read", async () => {
  const h = fixture();
  try {
    const now = Math.floor(Date.now() / 1000),
      cap = h.capability({ now, ttl: 10 });
    const req = new Request("https://api.poai.cc" + base + "/result", {
      headers: h.headers(cap.token),
    });
    assert.ok(await verifyAcceptanceCapability(req, h.env, now + 9));
    await assert.rejects(
      () => verifyAcceptanceCapability(req, h.env, now + 10),
      /ACCEPTANCE_CONTROL_DENIED/,
    );
    const token = cap.token.split(".");
    token[1] = b64url(
      new TextEncoder().encode(
        JSON.stringify({
          ...JSON.parse(Buffer.from(token[1], "base64url")),
          context: { ...context(), city: "杭州" },
        }),
      ),
    );
    assert.equal((await h.control({ token: token.join(".") })).status, 401);
    h.env.ACCEPTANCE_CONTROL_REVOKED_IDS = JSON.stringify([cap.grant_id]);
    for (const [route, method, body] of [
      ["/result", "GET"],
      ["/tasks", "POST", context()],
    ])
      assert.equal((await h.control(cap, route, method, body)).status, 401);
    h.env.ACCEPTANCE_CONTROL_REVOKED_IDS = "[]";
    h.env.ACCEPTANCE_CONTROL_ENABLED = "false";
    assert.equal((await h.control(cap)).status, 503);
  } finally {
    h.DB.raw.close();
  }
});
test("another context occupying the grant namespace cannot be read, and CAPTCHA/failed upload cannot become PASS", async () => {
  const h = fixture();
  try {
    const d = await device(h),
      cap = h.capability();
    const r = await h.control(cap, "/tasks", "POST", context()),
      task = h.DB.raw
        .prepare("SELECT * FROM tasks WHERE id=?")
        .get(r.data.task_id),
      a = await claimStart(h, d, task);
    await h.call(
      `/v1/device/attempts/${a.id}/events`,
      "POST",
      { event: "LIST_READY", message: "private cookie" },
      d.headers,
    );
    await h.call(
      `/v1/device/attempts/${a.id}/fail`,
      "POST",
      { error_code: "CAPTCHA_REQUIRED", error_message: "private token" },
      d.headers,
    );
    const report = (await h.control(cap)).data;
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.execution.page_reached, true);
    assert.equal(report.execution.error_code, "CAPTCHA_REQUIRED");
    assert.equal(report.execution.snapshot_id, null);
    assert.equal(report.execution.upload_result, null);
    assert.ok(!JSON.stringify(report).includes("private cookie"));
    assert.ok(!JSON.stringify(report).includes("private token"));
    h.DB.raw
      .prepare("UPDATE tasks SET city='其他城市' WHERE id=?")
      .run(task.id);
    assert.equal((await h.control(cap)).status, 403);
  } finally {
    h.DB.raw.close();
  }
});
test("signed card-stage diagnostics use bounded factual count, preserve gaps, and never expose raw data", async () => {
  const h = fixture();
  try {
    const d = await device(h),
      cap = h.capability(),
      r = await h.control(cap, "/tasks", "POST", context()),
      t = h.DB.raw
        .prepare("SELECT * FROM tasks WHERE id=?")
        .get(r.data.task_id),
      a = await claimStart(h, d, t);
    await h.call(
      `/v1/device/attempts/${a.id}/events`,
      "POST",
      { event: "FAST_NAV_VERIFIED", message: "url?token=private" },
      d.headers,
    );
    await h.call(
      `/v1/device/attempts/${a.id}/events`,
      "POST",
      {
        event: "MARKET_LOCKED",
        message: JSON.stringify({ count: 3, cookie: "private" }),
      },
      d.headers,
    );
    await complete(h, d, t, a);
    const report = (await h.control(cap)).data;
    assert.equal(report.execution.card_count, 3);
    assert.equal(
      report.execution.card_count_basis,
      "agent_market_locked_unique_cards",
    );
    assert.deepEqual(report.execution.navigation, ["FAST_NAV_VERIFIED"]);
    assert.ok(!JSON.stringify(report).includes("private"));
  } finally {
    h.DB.raw.close();
  }
});
test("operator CLI issues short capability to private file, never outputs token/key and refuses unsafe input/key files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "poai-capability-test-"));
  try {
    const priv = path.join(dir, "signer.pem"),
      pub = path.join(dir, "public.json"),
      cf = path.join(dir, "context.json"),
      token = path.join(dir, "capability.token");
    assert.equal(
      signerMain([
        "keygen",
        "--private-file",
        priv,
        "--public-file",
        pub,
        "--kid",
        "test-offline",
      ]).status,
      "KEY_CREATED_OFFLINE",
    );
    assert.equal(statSync(priv).mode & 0o777, 0o600);
    assert.ok(!readFileSync(pub, "utf8").includes("PRIVATE"));
    writeFileSync(cf, JSON.stringify(context()));
    const result = signerMain([
      "issue",
      "--private-file",
      priv,
      "--kid",
      "test-offline",
      "--context-file",
      cf,
      "--os",
      "macOS",
      "--token-file",
      token,
    ]);
    assert.ok(
      !JSON.stringify(result).includes(readFileSync(token, "utf8").trim()),
    );
    assert.equal(statSync(token).mode & 0o777, 0o600);
    const flags = [
      "issue",
      "--private-file",
      priv,
      "--kid",
      "test-offline",
      "--context-file",
      cf,
      "--os",
      "macOS",
      "--token-file",
      token,
    ];
    assert.throws(() => signerMain(flags));
    assert.throws(() => signerMain([...flags, "--ttl", "1801"]));
    chmodSync(priv, 0o644);
    assert.throws(
      () => signerMain(flags),
      /Private key must be a private regular file/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Cloud client uses only fixed create/read endpoints, never redirects/retries or exposes credential in network errors", async () => {
  const h = fixture();
  try {
    const cap = h.capability();
    let calls = 0;
    for (const action of ["create", "result"]) {
      const r = await acceptanceRequest({
        token: cap.token,
        action,
        context: context(),
        fetcher: async (url, opts) => {
          calls++;
          assert.equal(
            url,
            "https://api.poai.cc" +
              base +
              (action === "create" ? "/tasks" : "/result"),
          );
          assert.equal(opts.redirect, "manual");
          return Response.json({ status: "ISOLATED_TRANSPORT_TEST" });
        },
      });
      assert.equal(r.status, "ISOLATED_TRANSPORT_TEST");
    }
    assert.equal(calls, 2);
    await assert.rejects(
      () =>
        acceptanceRequest({
          token: cap.token,
          action: "create",
          context: context(),
          fetcher: async () => {
            calls++;
            throw Error(cap.token);
          },
        }),
      (e) => !e.message.includes(cap.token),
    );
    assert.equal(calls, 3);
    await assert.rejects(
      () =>
        acceptanceRequest({
          token: cap.token,
          action: "result",
          fetcher: async () =>
            new Response("private", {
              status: 302,
              headers: { Location: "https://evil.test" },
            }),
        }),
      /unavailable or denied/,
    );
  } finally {
    h.DB.raw.close();
  }
});

test("Cloud proxy-backed placeholder is transported only to fixed API, CRLF is rejected, and oversized responses are bounded", async () => {
  let calls = 0;
  const opaque = "opaque-proxy-fixture-not-a-live-capability";
  const result = await acceptanceRequest({
    token: opaque,
    action: "result",
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, "https://api.poai.cc/v1/acceptance-control/result");
      assert.equal(init.headers.Authorization, `Bearer ${opaque}`);
      return Response.json({ status: "ISOLATED_PROXY_TRANSPORT_ONLY" });
    },
  });
  assert.equal(result.status, "ISOLATED_PROXY_TRANSPORT_ONLY");
  await assert.rejects(
    () =>
      acceptanceRequest({
        token: "invalid\r\nX-Header:bad",
        action: "result",
        fetcher: () => {
          calls++;
        },
      }),
    /Invalid acceptance client input/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      acceptanceRequest({
        token: opaque,
        action: "result",
        fetcher: async () =>
          new Response("x".repeat(100001), {
            headers: { "Content-Type": "application/json" },
          }),
      }),
    /unavailable or denied/,
  );
});

test("issuer key replacement revokes an old capability, and non-auto or unapproved Agents cannot execute control tasks", async () => {
  const h = fixture();
  try {
    const d = await device(h),
      cap = h.capability();
    const before = h.DB.raw.prepare("SELECT count(*) n FROM tasks").get().n;
    await h.call(
      "/v1/device/heartbeat",
      "POST",
      { runtime: { auto: false, debugger_permission: true } },
      d.headers,
    );
    assert.equal(
      (await h.control(cap, "/tasks", "POST", context())).status,
      409,
    );
    assert.equal(
      h.DB.raw.prepare("SELECT count(*) n FROM tasks").get().n,
      before,
    );
    await h.call(
      "/v1/device/heartbeat",
      "POST",
      { runtime: { auto: true, debugger_permission: true } },
      d.headers,
    );
    assert.equal(
      (
        await h.call(`/v1/admin/devices/${d.id}`, "PATCH", {
          status: "disabled",
        })
      ).status,
      200,
    );
    assert.equal(
      (await h.control(cap, "/tasks", "POST", context())).status,
      409,
    );
    const other = generateKeyPairSync("ed25519").publicKey.export({
      format: "jwk",
    });
    h.env.ACCEPTANCE_CONTROL_PUBLIC_KEYS = JSON.stringify([
      { kid: "isolated-test-key", kty: other.kty, crv: other.crv, x: other.x },
    ]);
    assert.equal((await h.control(cap)).status, 401);
  } finally {
    h.DB.raw.close();
  }
});
