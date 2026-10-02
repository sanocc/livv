import test from "node:test";
import assert from "node:assert/strict";
import worker from "../api/src/index.js";
import { database } from "./db-adapter.js";
import { sha256 } from "../api/src/auth.js";
import {
  ingestTelemetry,
  analyticsEvents,
  deviceDiagnostics,
} from "../api/src/telemetry.js";
import { telemetryQueue, telemetryEvent } from "../agent/telemetry.js";
import { updateHTML, updateText } from "../agent/sidepanel-view.js";
import { diagnosticsView } from "../ota/public/device-diagnostics.js";
async function fixture() {
  const DB = database(),
    id = crypto.randomUUID(),
    credential = "a".repeat(64),
    now = Date.now();
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,name,created_at,last_seen_at,version) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      id,
      await sha256(credential),
      "approved",
      "测试设备",
      new Date(now).toISOString(),
      new Date(now).toISOString(),
      "1.3.0",
    );
  return { DB, id, credential, now };
}
const event = () => ({
  event_id: crypto.randomUUID(),
  event_code: "DEVICE_ONLINE",
  occurred_at: new Date().toISOString(),
  helper_version: "1.3.0",
  os: "Mac",
});
test("authenticated analytics ingestion never writes high frequency events to D1 and strips sensitive payloads", async () => {
  const f = await fixture(),
    points = [],
    env = {
      DB: f.DB,
      HELPER_EVENTS: { writeDataPoint: (p) => points.push(p) },
    };
  const input = {
    ...event(),
    Authorization: "secret",
    Cookie: "secret",
    url: "https://site?token=secret",
    html: "secret",
    message: "secret",
  };
  const headers = {
    "X-Device-ID": f.id,
    Authorization: `Bearer ${f.credential}`,
  };
  const req = () =>
    new Request("https://api.poai.cc/v1/device/telemetry", {
      method: "POST",
      headers,
      body: JSON.stringify({ events: [input] }),
    });
  const before = f.DB.raw
    .prepare("SELECT count(*) n FROM attempt_events")
    .get().n;
  assert.equal((await worker.fetch(req(), env)).status, 200);
  assert.equal(points.length, 1);
  assert.equal(points[0].blobs[0], f.id);
  assert.ok(!JSON.stringify(points).includes("secret"));
  assert.equal(
    f.DB.raw.prepare("SELECT count(*) n FROM attempt_events").get().n,
    before,
  );
  const r = await worker.fetch(
    new Request("https://api.poai.cc/v1/device/telemetry", {
      method: "POST",
      body: "{}",
    }),
    env,
  );
  assert.equal(r.status, 401);
  await assert.rejects(
    ingestTelemetry(
      env,
      { id: f.id },
      { events: [{ ...event(), task_id: "foreign", attempt_id: "foreign" }] },
    ),
    /TELEMETRY_ATTEMPT_MISMATCH/,
  );
  await assert.rejects(
    ingestTelemetry(
      env,
      { id: f.id },
      { events: [{ ...event(), event_code: "ARBITRARY" }] },
    ),
    /INVALID_TELEMETRY/,
  );
  env.HELPER_EVENTS.writeDataPoint = () => {
    throw Error("offline");
  };
  assert.equal(
    (await ingestTelemetry(env, { id: f.id }, { events: [event()] })).available,
    false,
  );
});
test("telemetry retry cannot fail collection, is bounded and never discards newly queued events while acknowledging an older batch", async () => {
  let value = [],
    now = Date.now(),
    failure = true,
    resolveSend;
  const storage = {
    get: async () => ({ telemetry_queue: structuredClone(value) }),
    set: async (x) => {
      value = structuredClone(x.telemetry_queue);
    },
  };
  const q = telemetryQueue({
    storage,
    now: () => now,
    schedule: () => {},
    send: async () => {
      if (failure) throw Error("offline");
      await new Promise((r) => (resolveSend = r));
    },
  });
  const first = event();
  await q.enqueue(first);
  await q.flush();
  assert.equal(value.length, 1);
  failure = false;
  now += 30001;
  const flushing = q.flush();
  await new Promise((r) => setImmediate(r));
  const second = event();
  await q.enqueue(second);
  resolveSend();
  await flushing;
  assert.deepEqual(
    value.map((e) => e.event_id),
    [second.event_id],
  );
  for (let i = 0; i < 110; i++) await q.enqueue(event());
  assert.equal(value.length, 100);
  assert.equal(telemetryEvent("PHASE", null, "1.3.0"), null);
});
test("read-only remote diagnosis preserves separate task/attempt results and degrades honestly if analytics credentials unavailable", async () => {
  const f = await fixture(),
    env = { DB: f.DB, ENVIRONMENT: "local", LOCAL_ADMIN_TOKEN: "test" };
  const d = await deviceDiagnostics(env, f.id);
  assert.equal(d.device.online, true);
  assert.equal(d.analytics.available, false);
  assert.equal(d.timing.average_ms, null);
  assert.doesNotMatch(JSON.stringify(d), /credential_hash/);
  const html = diagnosticsView(d);
  assert.match(html, /Analytics 查询暂不可用/);
  assert.match(html, /市场列表平均耗时/);
  assert.doesNotMatch(html, /NaN|undefined/);
  const req = new Request(
    `http://localhost/v1/admin/devices/${f.id}/diagnostics`,
    { headers: { Authorization: "Bearer test" } },
  );
  assert.equal((await worker.fetch(req, env)).status, 200);
  assert.equal(
    (
      await worker.fetch(
        new Request(`https://api.poai.cc/v1/admin/devices/${f.id}/diagnostics`),
        env,
      )
    ).status,
    501,
  );
});
test("Analytics query is fixed, bounded, deduplicates event_id and preserves absent numeric metrics", async () => {
  let call;
  const env = { CF_ACCOUNT_ID: "account", CF_ANALYTICS_READ_TOKEN: "private" };
  const e = { event_id: "id", duration_ms: -1, hotel_count: -1 };
  const result = await analyticsEvents(env, "device", async (u, o) => {
    call = { u, o };
    return Response.json({ data: [e, e] });
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].duration_ms, null);
  assert.match(call.o.body, /LIMIT 100/);
  assert.match(call.o.body, /INTERVAL '1' DAY/);
  assert.equal(
    (
      await analyticsEvents(env, "x' OR 1=1", () => {
        throw Error("must not call");
      })
    ).available,
    false,
  );
});
test("unchanged panel HTML/text preserve node identity, expanded details and user selection", () => {
  let writes = 0,
    textWrites = 0;
  const node = {
    dataset: {},
    get innerHTML() {
      return "expanded DOM";
    },
    set innerHTML(x) {
      writes++;
    },
    get textContent() {
      return "same";
    },
    set textContent(x) {
      textWrites++;
    },
  };
  assert.equal(updateHTML(node, "markup"), true);
  assert.equal(updateHTML(node, "markup"), false);
  assert.equal(writes, 1);
  updateText(node, "same");
  assert.equal(textWrites, 0);
  updateText(node, "new");
  assert.equal(textWrites, 1);
});

test("telemetry stage timestamps use business occurrence rather than delayed log delivery", () => {
  const claimed = Date.parse("2026-10-01T18:00:00Z"),
    a = {
      task: { id: "task", task_type: "MARKET_LIST" },
      attempt: { id: "attempt", claimed_at: new Date(claimed).toISOString() },
      navigation_started_at: claimed + 500,
      list_ready_at: claimed + 5000,
      market_locked_at: claimed + 30000,
      market: Array.from({ length: 30 }, () => ({})),
    };
  const observed = claimed + 32000;
  const c = telemetryEvent("CLAIMED", a, "1.3.0", observed);
  assert.equal(c.occurred_at, a.attempt.claimed_at);
  assert.equal(c.duration_ms, 0);
  const n = telemetryEvent("FAST_NAV_START", a, "1.3.0", observed);
  assert.equal(n.duration_ms, 500);
  const locked = telemetryEvent("MARKET_LOCKED", a, "1.3.0", observed);
  assert.equal(locked.duration_ms, 25000);
  assert.equal(locked.hotel_count, 30);
});

test("an acknowledged failed Attempt does not fabricate a FAILED Task analytics event", async () => {
  const f = await fixture(),
    task = crypto.randomUUID(),
    attempt = crypto.randomUUID(),
    at = new Date(f.now).toISOString(),
    end = new Date(f.now + 60000).toISOString(),
    points = [];
  f.DB.raw
    .prepare(
      `INSERT INTO tasks(id,platform,city,keyword,checkin,checkout,scope,collection_limit,created_at,due_at,window_start,window_end,task_type,status) VALUES(?,'ctrip','咸宁','中心花坛','2026-10-03','2026-10-04','top30',30,?,?,?,?,'MARKET_LIST','PENDING')`,
    )
    .run(task, at, at, at, end);
  f.DB.raw
    .prepare(
      `INSERT INTO attempts(id,task_id,attempt_number,device_id,claimed_at,finished_at,timeout_at,lease_until,status) VALUES(?,?,1,?,?,?,?,?,'FAILED')`,
    )
    .run(attempt, task, f.id, at, at, end, end);
  const env = {
    DB: f.DB,
    HELPER_EVENTS: { writeDataPoint: (p) => points.push(p) },
  };
  const e = {
    ...event(),
    event_code: "ATTEMPT_FAILED",
    task_id: task,
    attempt_id: attempt,
  };
  await ingestTelemetry(env, { id: f.id }, { events: [e] });
  assert.equal(points[0].blobs[4], "ATTEMPT_FAILED");
  await assert.rejects(
    ingestTelemetry(
      env,
      { id: f.id },
      { events: [{ ...e, event_code: "TASK_FAILED" }] },
    ),
    /TELEMETRY_STATE_MISMATCH/,
  );
  f.DB.raw.prepare("UPDATE tasks SET status='FAILED' WHERE id=?").run(task);
  await ingestTelemetry(env, { id: f.id }, { events: [e] });
  assert.equal(points[1].blobs[4], "TASK_FAILED");
});

test("prefixed Agent IDs remain queryable without accepting SQL control characters", async () => {
  const env = { CF_ANALYTICS_READ_TOKEN: "fixture", CF_ACCOUNT_ID: "fixture" };
  let requests = 0;
  const fetcher = async (_, options) => {
    requests++;
    assert.match(
      options.body,
      /FROM agent_events WHERE index1 = 'poai_[a-z0-9-]+'/,
    );
    return Response.json({ data: [] });
  };
  const result = await analyticsEvents(
    env,
    "poai_" + crypto.randomUUID(),
    fetcher,
  );
  assert.equal(result.available, true);
  const denied = await analyticsEvents(env, "poai_' OR 1=1 --", fetcher);
  assert.equal(denied.reason, "INVALID_DEVICE");
  assert.equal(requests, 1);
});

test("exception summaries persist sanitized evidence in D1 and Analytics without schema changes", async () => {
  const f = await fixture(),
    points = [];
  const input = {
    ...event(),
    event_code: "HELPER_ERROR",
    os: "Windows",
    error_summary: {
      error_name: "TypeError",
      error_message:
        "Failed to fetch https://api.poai.cc/v1/device/heartbeat?token=hidden Bearer private-value credential=private-value",
      phase: "HEARTBEAT",
      pathname: "/webapp/hotels/list",
      request_path: "/v1/device/heartbeat",
      browser: "Chrome/141 Windows",
      stack_summary:
        "TypeError: Failed to fetch\n at request (chrome-extension://private-id/background.js:123:4)",
    },
  };
  const env = {
    DB: f.DB,
    HELPER_EVENTS: { writeDataPoint: (p) => points.push(p) },
  };
  await ingestTelemetry(env, { id: f.id }, { events: [input] }, f.now);
  const row = f.DB.raw
    .prepare("SELECT metadata FROM agent_logs WHERE device_id=?")
    .get(f.id);
  const summary = JSON.parse(row.metadata).error_summary;
  assert.equal(summary.error_name, "TypeError");
  assert.equal(summary.phase, "HEARTBEAT");
  assert.equal(summary.request_path, "/v1/device/heartbeat");
  assert.equal(summary.pathname, "/webapp/hotels/list");
  assert.equal(summary.browser, "Chrome/141 Windows");
  assert.match(summary.error_message, /Failed to fetch/);
  assert.match(summary.stack_summary, /background.js:123:4/);
  assert.ok(!JSON.stringify([row, points]).includes("private-value"));
  assert.ok(!JSON.stringify([row, points]).includes("hidden"));
  assert.ok(!JSON.stringify([row, points]).includes("private-id"));
  assert.equal(JSON.parse(points[0].blobs[13]).phase, "HEARTBEAT");
});
