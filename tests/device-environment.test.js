import test from "node:test";
import assert from "node:assert/strict";
import {
  collectEnvironment,
  environmentReporter,
} from "../agent/environment.js";
import {
  cleanEnvironment,
  cleanRuntime,
  saveEnvironment,
  deviceHealth,
} from "../api/src/device-environment.js";
import { database } from "./db-adapter.js";
import { sha256 } from "../api/src/auth.js";
import worker from "../api/src/index.js";
import {
  diagnosticsView,
  deviceSummary,
} from "../ota/public/device-diagnostics.js";
import { deviceDiagnostics } from "../api/src/telemetry.js";
const runtime = (os, arch) => ({
  async getPlatformInfo() {
    return { os, arch };
  },
  getManifest() {
    return { manifest_version: 3, version: "1.3.4" };
  },
});
const nav = (platformVersion, architecture, bitness) => ({
  language: "zh-CN",
  userAgent: "Chrome/154.0.0.0",
  userAgentData: {
    async getHighEntropyValues(keys) {
      assert.deepEqual(keys, [
        "platformVersion",
        "architecture",
        "bitness",
        "fullVersionList",
      ]);
      return {
        platformVersion,
        architecture,
        bitness,
        fullVersionList: [{ brand: "Google Chrome", version: "154.0.8000.12" }],
      };
    },
  },
});
test("trusted platform APIs report Windows/macOS architecture and full Chrome version; reduced UA never fakes OS version", async () => {
  const windows = await collectEnvironment(
    runtime("win", "x86-64"),
    nav("19.0.0", "x86", "64"),
    true,
  );
  assert.equal(windows.os, "Windows");
  assert.equal(windows.os_version, "11+");
  assert.equal(windows.architecture, "x64");
  assert.equal(windows.browser_version, "154.0.8000.12");
  assert.equal(windows.browser_major_version, 154);
  const mac = await collectEnvironment(
    runtime("mac", "arm"),
    nav("26.0.1", "arm", "64"),
    true,
  );
  assert.equal(mac.os, "macOS");
  assert.equal(mac.os_version, "26.0.1");
  assert.equal(mac.architecture, "arm64");
  const unknown = await collectEnvironment(
    runtime("win", "x86-64"),
    { userAgent: "Windows NT 10.0 Chrome/154.0.0.0", language: "zh-CN" },
    false,
  );
  assert.equal(unknown.os_version, null);
  assert.equal(unknown.browser_version, null);
  assert.equal(unknown.browser_major_version, 154);
  assert.equal(unknown.browser_name, "Chromium");
  const old = await collectEnvironment(
    runtime("win", "x86"),
    nav("0.0.0", "x86", "32"),
    false,
  );
  assert.equal(old.os_version, null);
});
test("environment reporting has unchanged-payload deduplication, failure backoff and does not await task execution", async () => {
  let now = 1000,
    sends = 0,
    fail = false,
    permission = true;
  const waits = [];
  const chrome = {
    runtime: runtime("win", "x86-64"),
    permissions: {
      async contains() {
        return permission;
      },
    },
    tabs: {
      async get() {
        return {
          url: "https://m.ctrip.com/webapp/hotels/hotelsearch/listPage?token=secret",
        };
      },
    },
    sidePanel: { setPanelBehavior() {} },
  };
  const reporter = environmentReporter({
    chrome,
    navigator: nav("19.0.0", "x86", "64"),
    now: () => now,
    send: async (body) => {
      sends++;
      assert.ok(!JSON.stringify(body).includes("secret"));
      if (fail) throw Error("offline");
    },
  });
  const state = { cloud: { status: "approved" }, auto: true, managed_tab: 123 };
  await reporter.refresh(state);
  for (let i = 0; i < 5; i++) await reporter.refresh(state);
  assert.equal(sends, 1);
  assert.equal(reporter.snapshot(state).ctrip_login_status, "unknown");
  assert.equal(reporter.snapshot(state).managed_tab, true);
  assert.equal(reporter.snapshot(state).debugger_permission, true);
  // A slow info request is independent from the collector caller; refresh is never awaited in background.
  let resolve;
  const slow = environmentReporter({
    chrome,
    navigator: nav("19.0.0", "x86", "64"),
    send: () => new Promise((r) => (resolve = r)),
  });
  const pending = slow.refresh(state);
  await new Promise(setImmediate);
  assert.equal(typeof resolve, "function");
  assert.equal(slow.snapshot(state).managed_tab, true);
  resolve();
  await pending;
  fail = true;
  const broken = environmentReporter({
    chrome,
    navigator: nav("19.0.0", "x86", "64"),
    now: () => now,
    send: async () => {
      sends++;
      throw Error("offline");
    },
  });
  await broken.refresh(state);
  const count = sends;
  await broken.refresh(state);
  assert.equal(sends, count);
  now += 300001;
  await broken.refresh(state);
  assert.equal(sends, count + 1);
});
test("metadata allowlist strips credentials/accounts/URLs and static duplicates avoid D1 writes", async () => {
  const DB = database(),
    id = crypto.randomUUID(),
    hash = await sha256("a".repeat(64));
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,created_at,version) VALUES(?,?,?,?,?)",
    )
    .run(id, hash, "approved", new Date().toISOString(), "1.3.3");
  const payload = {
    ...(await collectEnvironment(
      runtime("mac", "arm"),
      nav("26.0.1", "arm", "64"),
      true,
    )),
    credential: "secret",
    cookie: "secret",
    username: "secret",
    name: "malicious",
    capabilities: { ctrip: true, meituan: false, credential: "secret" },
  };
  const safe = cleanEnvironment(payload);
  assert.ok(!JSON.stringify(safe).includes("secret"));
  assert.equal(safe.capabilities.meituan, false);
  const dynamic = cleanRuntime({
    auto: true,
    task_id: "fake",
    phase: "LIST",
    cookie: "secret",
    managed_tab_url: "https://site?token=secret",
  });
  assert.ok(!JSON.stringify(dynamic).includes("secret"));
  await saveEnvironment(DB, id, payload);
  const changes = DB.raw.prepare("SELECT total_changes() n").get().n;
  await saveEnvironment(DB, id, payload);
  assert.equal(DB.raw.prepare("SELECT total_changes() n").get().n, changes);
  assert.equal(
    DB.raw.prepare("SELECT credential_hash FROM devices WHERE id=?").get(id)
      .credential_hash,
    hash,
  );
});
test("existing identities heartbeat compatibly, supplement metadata and record only real version changes", async () => {
  const DB = database(),
    id = crypto.randomUUID(),
    credential = "a".repeat(64),
    created = "2026-09-30T00:00:00.000Z",
    approved = "2026-09-30T01:00:00.000Z";
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,name,created_at,approved_at,version) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      id,
      await sha256(credential),
      "approved",
      "原设备",
      created,
      approved,
      "1.3.3",
    );
  const call = async (
    path,
    body,
    headers = { "X-Device-ID": id, Authorization: "Bearer " + credential },
  ) =>
    worker.fetch(
      new Request("https://api.poai.cc" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
      { DB },
    );
  assert.equal((await call("/v1/device/environment", {}, {})).status, 401);
  const info = await collectEnvironment(
    runtime("mac", "arm"),
    nav("26.0.1", "arm", "64"),
    true,
  );
  assert.equal(
    (
      await call("/v1/device/environment", {
        ...info,
        name: "evil",
        credential: "secret",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/v1/device/heartbeat", { version: "1.3.3" })).status,
    200,
  );
  assert.equal(
    DB.raw.prepare("SELECT version_changed_at FROM devices WHERE id=?").get(id)
      .version_changed_at,
    null,
  );
  assert.equal(
    (
      await call("/v1/device/heartbeat", {
        version: "1.3.4",
        runtime: {
          auto: true,
          debugger_permission: true,
          side_panel: true,
          managed_tab: false,
          ctrip_login_status: "unknown",
        },
      })
    ).status,
    200,
  );
  const before = DB.raw.prepare("SELECT * FROM devices WHERE id=?").get(id);
  assert.ok(before.version_changed_at);
  assert.equal(before.name, "原设备");
  assert.equal(before.status, "approved");
  assert.equal(before.created_at, created);
  assert.equal(before.approved_at, approved);
  await call("/v1/device/heartbeat", { version: "1.3.4" });
  const after = DB.raw.prepare("SELECT * FROM devices WHERE id=?").get(id);
  assert.equal(after.runtime, before.runtime);
  assert.equal(after.version_changed_at, before.version_changed_at);
  const diagnostics = await deviceDiagnostics({ DB }, id);
  const html = diagnosticsView(diagnostics);
  assert.match(html, /macOS 26.0.1/);
  assert.match(html, /arm64/);
  assert.match(html, /快速导航成功率：—/);
  assert.ok(!html.includes("secret"));
  assert.ok(!JSON.stringify(diagnostics).includes("credential_hash"));
  const list = await worker.fetch(
    new Request("http://localhost/v1/admin/devices", {
      headers: { Authorization: "Bearer admin" },
    }),
    { DB, ENVIRONMENT: "local", LOCAL_ADMIN_TOKEN: "admin" },
  );
  const rows = await list.json();
  assert.equal(rows[0].environment.os, "macOS");
  assert.match(deviceSummary(rows[0]), /Chrome 154/);
  DB.raw.prepare("UPDATE devices SET status='pending' WHERE id=?").run(id);
  assert.equal((await call("/v1/device/environment", info)).status, 200);
  assert.equal((await call("/v1/device/claim", {})).status, 403);
  DB.raw.prepare("UPDATE devices SET status='disabled' WHERE id=?").run(id);
  assert.equal((await call("/v1/device/environment", info)).status, 403);
});

test("device health attributes tasks once to their latest owner and counts navigation attempts without duplicates", async () => {
  const DB = database(),
    id = "device",
    now = Date.now(),
    at = new Date(now - 10000).toISOString(),
    end = new Date(now + 300000).toISOString();
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,created_at) VALUES(?,?,?,?)",
    )
    .run(id, "hash", "approved", at);
  for (const [i, status] of [
    "COMPLETED",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "RUNNING",
  ].entries()) {
    DB.raw
      .prepare(
        "INSERT INTO tasks(id,platform,city,keyword,checkin,checkout,scope,collection_limit,status,created_at,due_at,window_start,window_end,task_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "task" + i,
        "ctrip",
        "咸宁",
        "中心花坛",
        "2026-10-03",
        "2026-10-04",
        "top30",
        30,
        status,
        at,
        at,
        at,
        end,
        "MARKET_LIST",
      );
    DB.raw
      .prepare(
        "INSERT INTO attempts(id,task_id,attempt_number,device_id,claimed_at,finished_at,timeout_at,lease_until,status) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "attempt" + i,
        "task" + i,
        1,
        id,
        at,
        status === "RUNNING" ? null : new Date(now - 1000).toISOString(),
        end,
        end,
        status,
      );
  }
  DB.raw
    .prepare("UPDATE attempts SET attempt_number=2 WHERE id='attempt0'")
    .run();
  DB.raw
    .prepare(
      "INSERT INTO attempts(id,task_id,attempt_number,device_id,claimed_at,finished_at,timeout_at,lease_until,status) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run("retry0", "task0", 1, id, at, at, end, end, "FAILED");
  for (const [attempt, event] of [
    ["attempt0", "FAST_NAV_START"],
    ["attempt0", "FAST_NAV_VERIFIED"],
    ["attempt0", "FAST_NAV_VERIFIED"],
    ["attempt1", "FAST_NAV_START"],
    ["attempt1", "FAST_NAV_FAILED"],
    ["attempt1", "FAST_NAV_CONTEXT_MISMATCH"],
  ])
    DB.raw
      .prepare(
        "INSERT INTO attempt_events(task_id,attempt_id,device_id,at,event) VALUES(?,?,?,?,?)",
      )
      .run(attempt === "attempt0" ? "task0" : "task1", attempt, id, at, event);
  const health = await deviceHealth(DB, id, now);
  assert.equal(health.total, 5);
  assert.equal(health.success_rate, 0.5);
  assert.equal(health.navigation.samples, 2);
  assert.equal(health.navigation.successes, 1);
  assert.equal(health.navigation.fallback_count, 1);
  assert.equal(health.navigation.success_rate, 0.5);
  assert.equal(health.current_attempt.task_id, "task4");
  assert.ok(Math.abs(health.market_average_ms - 9000) < 1);
});
