import test from "node:test";
import assert from "node:assert/strict";
import worker from "../api/src/index.js";
import { database } from "./db-adapter.js";
import { CONFIG, businessDate, addDays, nowIso } from "../api/src/config.js";
import { dedupe, analyze, roomRows, retryOutcome } from "../api/src/domain.js";
import { schedule, generatePlans } from "../api/src/scheduler.js";
import { reap, failAttempt } from "../api/src/db.js";
import { verifyAccessJwt } from "../api/src/access.js";
const hotel = (id, price = 100, rank = 1, ad = false) => ({
  hotel_id: String(id),
  hotel_name: `真实名称${id}`,
  display_price: price,
  original_price: null,
  rank,
  is_ad: ad,
  score: null,
  dynamic: null,
  activity_tags: null,
});
function harness() {
  const DB = database(),
    env = { DB, ENVIRONMENT: "local", LOCAL_ADMIN_TOKEN: "test-only" };
  const admin = { Authorization: "Bearer test-only" };
  async function call(path, method = "GET", b, headers = admin) {
    const r = await worker.fetch(
      new Request("http://localhost" + path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(b !== undefined ? { body: JSON.stringify(b) } : {}),
      }),
      env,
    );
    return { status: r.status, data: await r.json() };
  }
  return { DB, env, call };
}
async function device(h) {
  const id = crypto.randomUUID(),
    secret = "a".repeat(64),
    headers = { "X-Device-ID": id, Authorization: `Bearer ${secret}` };
  assert.equal(
    (
      await h.call(
        "/v1/devices/register",
        "POST",
        { device_id: id, credential: secret },
        {},
      )
    ).status,
    201,
  );
  return { id, headers };
}
const taskInput = () => ({
  task_type: "LEGACY_MARKET_DETAIL",
  platform: "ctrip",
  city: "咸宁",
  keyword: "中心花坛",
  checkin: addDays(businessDate(), 1),
  scope: "top30",
});
async function ready(h, taskType = "LEGACY_MARKET_DETAIL") {
  const d = await device(h);
  await h.call("/v1/admin/devices/" + d.id, "PATCH", {
    status: "approved",
    name: "验收设备",
  });
  await h.call("/v1/device/heartbeat", "POST", {}, d.headers);
  const t = (
    await h.call("/v1/admin/tasks", "POST", {
      ...taskInput(),
      task_type: taskType,
    })
  ).data;
  const c = await h.call("/v1/device/claim", "POST", {}, d.headers);
  assert.equal(c.status, 200);
  assert.equal(c.data.task.id, t.id);
  await h.call(
    "/v1/device/attempts/" + c.data.attempt.id + "/start",
    "POST",
    {},
    d.headers,
  );
  return { ...d, t, a: c.data.attempt };
}
function payload(
  t,
  hotels = Array.from({ length: 30 }, (_, i) => hotel(i + 1, 100 + i, i + 1)),
) {
  return {
    source: "ctrip-dom",
    platform: t.platform,
    city: t.city,
    keyword: t.keyword,
    checkin: t.checkin,
    checkout: t.checkout,
    observed_at: nowIso(),
    exhausted: false,
    stop_reason: "TARGET_REACHED",
    hotels,
    rooms: [],
    detail_results: [],
  };
}
test("natural duplicates win, ad-only remains, unique target", () => {
  const x = dedupe(
    [
      hotel(1, 80, 1, true),
      hotel(2, 70, 2, true),
      hotel(1, 120, 4),
      hotel(1, 90, 8),
    ],
    2,
  );
  assert.equal(x.length, 2);
  assert.equal(x.find((h) => h.hotel_id === "1").display_price, 120);
  assert.equal(x.find((h) => h.hotel_id === "2").is_ad, true);
});
test("anonymous API denied and local bypass impossible in production", async () => {
  const h = harness();
  assert.equal(
    (await h.call("/v1/admin/tasks", "GET", undefined, {})).status,
    501,
  );
  h.env.ENVIRONMENT = "production";
  assert.equal((await h.call("/v1/admin/tasks")).status, 501);
});
test("registration retry preserves credential, pending cannot work, disable fences work", async () => {
  const h = harness(),
    d = await device(h);
  assert.equal(
    (await h.call("/v1/device/claim", "POST", {}, d.headers)).status,
    403,
  );
  assert.equal(
    (
      await h.call(
        "/v1/devices/register",
        "POST",
        { device_id: d.id, credential: "b".repeat(64) },
        {},
      )
    ).status,
    409,
  );
  const list = (await h.call("/v1/admin/devices")).data;
  assert.equal(list[0].display_status, "待批准");
  assert.equal(list[0].credential_hash, undefined);
  await h.call("/v1/admin/devices/" + d.id, "PATCH", { status: "approved" });
  await h.call("/v1/admin/devices/" + d.id, "PATCH", { status: "disabled" });
  assert.equal(
    (await h.call("/v1/device/tasks", "POST", taskInput(), d.headers)).status,
    403,
  );
  assert.equal(
    (await h.call("/v1/device/heartbeat", "POST", {}, d.headers)).data.status,
    "disabled",
  );
});
test("single device single task; success is atomic and idempotent; context fenced", async () => {
  const h = harness(),
    d = await ready(h);
  await h.call("/v1/admin/tasks", "POST", taskInput());
  assert.equal(
    (await h.call("/v1/device/claim", "POST", {}, d.headers)).data,
    null,
  );
  const p = payload(d.t);
  assert.equal(
    (
      await h.call(
        `/v1/device/attempts/${d.a.id}/result`,
        "POST",
        { ...p, city: "武汉" },
        d.headers,
      )
    ).status,
    400,
  );
  const r = await h.call(
    `/v1/device/attempts/${d.a.id}/result`,
    "POST",
    p,
    d.headers,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.status, "COMPLETED");
  assert.equal(
    h.DB.raw.prepare("SELECT COUNT(*) n FROM market_observations").get().n,
    30,
  );
  assert.equal(
    (await h.call(`/v1/device/attempts/${d.a.id}/result`, "POST", p, d.headers))
      .data.idempotent,
    true,
  );
  assert.equal(
    (
      await h.call(
        `/v1/device/attempts/${d.a.id}/result`,
        "POST",
        { ...p, stop_reason: "STALLED" },
        d.headers,
      )
    ).status,
    409,
  );
  assert.throws(
    () => h.DB.raw.exec("UPDATE market_observations SET hotel_name='fake'"),
    /IMMUTABLE/,
  );
});
test("late failure cannot rewrite a completed attempt or add false timeline events", async () => {
  const h = harness(),
    d = await ready(h);
  const p = payload(d.t);
  assert.equal(
    (await h.call(`/v1/device/attempts/${d.a.id}/result`, "POST", p, d.headers))
      .status,
    200,
  );
  const before = h.DB.raw
    .prepare("SELECT COUNT(*) AS n FROM attempt_events")
    .get().n;
  await failAttempt(h.DB, d.a, "UPLOAD_FAILED", "late concurrent failure");
  assert.equal(
    h.DB.raw.prepare("SELECT COUNT(*) AS n FROM attempt_events").get().n,
    before,
  );
  assert.equal(
    h.DB.raw.prepare("SELECT status FROM attempts WHERE id=?").get(d.a.id)
      .status,
    "COMPLETED",
  );
});

test("five failed attempts preserve task id and timeline", async () => {
  const h = harness(),
    d = await ready(h);
  for (let i = 1; i <= 5; i++) {
    const a =
      i === 1
        ? d.a
        : (await h.call("/v1/device/claim", "POST", {}, d.headers)).data
            .attempt;
    assert.equal(a.task_id, d.t.id);
    assert.equal(a.attempt_number, i);
    assert.equal(
      (
        await h.call(
          `/v1/device/attempts/${a.id}/fail`,
          "POST",
          { error_code: "COLLECTION_FAILED", error_message: "真实错误" },
          d.headers,
        )
      ).status,
      200,
    );
  }
  const result = (await h.call("/v1/admin/tasks/" + d.t.id)).data;
  assert.equal(result.task.status, "FAILED");
  assert.equal(result.task.error_code, "MAX_ATTEMPTS_REACHED");
  assert.equal(
    result.events.filter((x) => x.event === "RETURNED_TO_QUEUE").length,
    4,
  );
});
test("deadline and offline reaper do not cross windows or accept late upload", async () => {
  const h = harness(),
    d = await ready(h);
  h.DB.raw
    .prepare("UPDATE tasks SET window_start=?,window_end=? WHERE id=?")
    .run(nowIso(Date.now() - 10000), nowIso(Date.now() - 1000), d.t.id);
  await reap(h.DB);
  const r = (await h.call("/v1/admin/tasks/" + d.t.id)).data;
  assert.equal(r.task.error_code, "EXECUTION_WINDOW_EXPIRED");
  assert.equal(
    (
      await h.call(
        `/v1/device/attempts/${d.a.id}/result`,
        "POST",
        payload(d.t),
        d.headers,
      )
    ).status,
    409,
  );
  assert.equal(h.DB.raw.prepare("SELECT COUNT(*) n FROM snapshots").get().n, 0);
  assert.equal(
    retryOutcome(5, nowIso(Date.now() - 1000)).code,
    "EXECUTION_WINDOW_EXPIRED",
  );
});
test("partial details save full market; manual mapping and unlink preserve originals", async () => {
  const h = harness();
  const poai = (
    await h.call("/v1/admin/standard-hotels", "POST", {
      name: "我的标准名",
      category: "mine",
    })
  ).data.id;
  const at = nowIso();
  h.DB.raw
    .prepare("INSERT INTO platform_hotels VALUES(?,?,?,?,?)")
    .run("ctrip", "1", "平台原名", at, at);
  assert.equal(
    (
      await h.call("/v1/admin/mappings", "POST", {
        platform: "ctrip",
        hotel_id: "1",
        standard_hotel_id: poai,
      })
    ).status,
    400,
  );
  await h.call("/v1/admin/mappings", "POST", {
    platform: "ctrip",
    hotel_id: "1",
    standard_hotel_id: poai,
    confirm: true,
  });
  const d = await ready(h),
    p = payload(d.t);
  p.detail_results = [
    { hotel_id: "1", status: "FAILED", error_code: "DETAIL_TIMEOUT" },
  ];
  const r = await h.call(
    `/v1/device/attempts/${d.a.id}/result`,
    "POST",
    p,
    d.headers,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.status, "PARTIAL");
  assert.equal(r.data.market_count, 30);
  await h.call("/v1/admin/standard-hotels/" + poai, "PATCH", { name: "新标准名" });
  const before = h.DB.raw
    .prepare("SELECT hotel_name FROM market_observations WHERE hotel_id=?")
    .get("1").hotel_name;
  assert.equal(
    (await h.call("/v1/admin/mappings?platform=ctrip&hotel_id=1", "DELETE"))
      .status,
    200,
  );
  assert.equal(
    h.DB.raw
      .prepare("SELECT hotel_name FROM market_observations WHERE hotel_id=?")
      .get("1").hotel_name,
    before,
  );
  assert.equal(
    h.DB.raw.prepare("SELECT COUNT(*) n FROM mapping_history").get().n,
    2,
  );
  assert.equal(
    (await h.call("/v1/admin/hotels")).data.platform_hotels.length,
    30,
  );
});
test("all market is empty without exhausted all-scope snapshot; no interpolation", async () => {
  const h = harness(),
    d = await ready(h);
  await h.call(
    `/v1/device/attempts/${d.a.id}/result`,
    "POST",
    payload(d.t),
    d.headers,
  );
  const m = (await h.call("/v1/admin/market?scope=all")).data;
  assert.equal(m.hotels.length, 0);
  assert.ok(m.curve.every((x) => x.median === null));
  const top = (await h.call("/v1/admin/market")).data;
  assert.equal(top.curve.filter((x) => x.median !== null).length, 1);
  assert.equal(top.curve[0].median, null);
});
test("sold out needs evidence; missing hotel cannot be guessed sold out", () => {
  assert.throws(
    () =>
      roomRows(
        [
          {
            hotel_id: "1",
            hotel_name: "真实名称1",
            room_name: "豪华房",
            availability_status: "sold_out",
          },
        ],
        [hotel(1)],
        new Set(["1"]),
      ),
    /SOLD_OUT/,
  );
  const a = analyze([hotel(1)], [], [], []);
  assert.equal(a.facts.coreSoldOut, 0);
  assert.equal(a.recommendation, "observe");
});
test("strategy requires comparable sample; immutable prior advice", () => {
  const prev = Array.from({ length: 10 }, (_, i) => hotel(i + 1, 100, i + 1)),
    current = prev.map((h) => ({ ...h, display_price: 130, category: "core" }));
  const a = analyze(current, prev);
  assert.equal(a.recommendation, "raise");
  assert.equal(analyze(prev, current).recommendation, "lower");
  assert.equal(analyze(current).recommendation, "observe");
  assert.equal(a.facts.up, 10);
});
test("rolling 14/30 date window, tier frequencies, jitter, no 06-08, idempotent materialization", async () => {
  const now = Date.parse("2026-10-01T00:00:00+08:00"),
    plan = {
      id: "p",
      enabled: 1,
      platform: "ctrip",
      city: "咸宁",
      keyword: "中心花坛",
      scope: "top30",
      collection_limit: 30,
      horizon: 14,
    };
  const a = schedule([plan], now, 1);
  assert.equal(a.filter((x) => x.checkin === "2026-10-01").length, 10);
  assert.equal(a.filter((x) => x.checkin === "2026-10-02").length, 6);
  assert.equal(a.filter((x) => x.checkin === "2026-10-03").length, 4);
  assert.equal(a.filter((x) => x.checkin === "2026-10-05").length, 2);
  assert.ok(
    a.every((x) => x.due_at >= x.window_start && x.due_at < x.window_end),
  );
  assert.equal(new Set(a.map((x) => x.due_at)).size, a.length);
  assert.ok(
    schedule([plan], now + 86400000).every(
      (x) => x.checkin >= "2026-10-02" && x.checkin <= "2026-10-16",
    ),
  );
  assert.ok(
    schedule([{ ...plan, horizon: 30 }], now).every(
      (x) => x.checkin <= "2026-10-31",
    ),
  );
  const h = harness(),
    at = nowIso();
  h.DB.raw
    .prepare("INSERT INTO plans VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run("p", "ctrip", "咸宁", "中心花坛", "top30", 30, 14, 1, at, at);
  assert.ok((await generatePlans(h.DB, now)) > 0);
  assert.equal(await generatePlans(h.DB, now), 0);
});
test("Access signature verified and rejects wrong audience or expiration", async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  jwk.kid = "test";
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  async function verify(aud = ["aud"], exp = 200) {
    const data =
      b64({ alg: "RS256", kid: "test" }) +
      "." +
      b64({
        iss: "https://team.cloudflareaccess.com",
        aud,
        exp,
        email: "owner@example.com",
      });
    const sig = Buffer.from(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keys.privateKey,
        new TextEncoder().encode(data),
      ),
    ).toString("base64url");
    return verifyAccessJwt(
      new Request("https://api.poai.cc", {
        headers: { "CF-Access-Jwt-Assertion": data + "." + sig },
      }),
      {
        CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
        CF_ACCESS_AUD: "aud",
      },
      { now: 100, fetcher: async () => Response.json({ keys: [jwk] }) },
    );
  }
  assert.equal((await verify()).ok, true);
  assert.equal((await verify(["wrong"])).ok, false);
  assert.equal((await verify(["aud"], 99)).ok, false);
});

test("production health verifies its actual database dependency", async () => {
  const h = harness();
  assert.equal((await h.call("/health", "GET", undefined, {})).status, 200);
  const response = await worker.fetch(
    new Request("https://api.poai.cc/health"),
    {
      ENVIRONMENT: "production",
      DB: {
        prepare() {
          throw new Error("offline");
        },
      },
    },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).database, "unavailable");
});

test("market display follows later manual mappings while strategy history stays immutable", async () => {
  const h = harness(),
    d = await ready(h),
    p = payload(d.t);
  await h.call(`/v1/device/attempts/${d.a.id}/result`, "POST", p, d.headers);
  const path = `/v1/admin/market?checkin=${d.t.checkin}&horizon=30`;
  const before = (await h.call(path)).data;
  assert.equal(before.curve.length, 30);
  assert.equal(before.hotels[0].category, "other");
  assert.equal(before.hotels[0].standard_name, p.hotels[0].hotel_name);
  const poai = (
    await h.call("/v1/admin/standard-hotels", "POST", {
      name: "我的标准名",
      category: "mine",
    })
  ).data.id;
  await h.call("/v1/admin/mappings", "POST", {
    platform: "ctrip",
    hotel_id: "1",
    standard_hotel_id: poai,
    confirm: true,
  });
  const mapped = (await h.call(path)).data;
  const point = mapped.curve.find((x) => x.checkin === d.t.checkin);
  assert.equal(point.myPrice, 100);
  assert.equal(point.minimum, 100);
  assert.equal(point.median, 114.5);
  assert.equal(point.maximum, 129);
  assert.equal(mapped.hotels[0].standard_name, "我的标准名");
  assert.equal(mapped.hotels[0].hotel_name, p.hotels[0].hotel_name);
  assert.deepEqual(mapped.strategy_history, before.strategy_history);
  assert.ok(
    mapped.curve
      .filter((x) => !x.snapshot_id)
      .every((x) =>
        [x.minimum, x.median, x.maximum, x.myPrice].every((v) => v === null),
      ),
  );
  for (const category of ["core", "competitor", "watch", "other"]) {
    await h.call("/v1/admin/standard-hotels/" + poai, "PATCH", { category });
    const recategorized = (await h.call(path)).data;
    assert.equal(recategorized.hotels[0].category, category);
    assert.equal(
      recategorized.curve.find((x) => x.checkin === d.t.checkin).myPrice,
      null,
    );
    assert.deepEqual(recategorized.strategy_history, before.strategy_history);
  }
  await h.call("/v1/admin/mappings?platform=ctrip&hotel_id=1", "DELETE");
  const unlinked = (await h.call(path)).data;
  assert.equal(
    unlinked.curve.find((x) => x.checkin === d.t.checkin).myPrice,
    null,
  );
  assert.equal(unlinked.hotels[0].category, "other");
});

test("runtime is authenticated, empty-safe and read-only", async () => {
  const h = harness();
  assert.equal(
    (await h.call("/v1/admin/runtime", "GET", undefined, {})).status,
    501, // No Access configuration in the local harness; never grants anonymous access.
  );
  const r = await h.call("/v1/admin/runtime");
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 0);
  assert.equal(r.data.success_rate, null);
  assert.equal(r.data.last_success_at, null);
  assert.equal(r.data.attempts, 0);
  assert.deepEqual(r.data.online_devices, []);
});

test("runtime counts all production windows, keeps PARTIAL and retry errors, excludes acceptance/manual tasks", async () => {
  const h = harness(),
    d = await ready(h);
  await h.call(
    `/v1/device/attempts/${d.a.id}/result`,
    "POST",
    payload(d.t),
    d.headers,
  );
  const raw = h.DB.raw,
    at = nowIso(),
    day = businessDate();
  const start = new Date(day + "T00:00:00+08:00").toISOString();
  const end = new Date(addDays(day, 1) + "T00:00:00+08:00").toISOString();
  const plan = raw.prepare(
    "INSERT INTO plans VALUES(?, 'ctrip', '咸宁', '中心花坛', 'top30', 30, 14, ?, ?, ?)",
  );
  plan.run("production", 1, at, at);
  plan.run("acceptance", 0, at, at);
  raw
    .prepare(
      "UPDATE tasks SET plan_id=?,window_start=?,window_end=? WHERE id=?",
    )
    .run("production", start, end, d.t.id);
  const insert = raw.prepare(
    "INSERT INTO tasks(id,plan_id,platform,city,keyword,checkin,checkout,scope,collection_limit,status,created_at,due_at,window_start,window_end,error_code) VALUES(?,?,'ctrip','咸宁','中心花坛',?,?,'top30',30,?,?,?,?,?,?)",
  );
  function task(
    id,
    status,
    planId = "production",
    window = start,
    code = null,
  ) {
    insert.run(
      id,
      planId,
      day,
      addDays(day, 1),
      status,
      at,
      window,
      window,
      new Date(Date.parse(window) + 3600000).toISOString(),
      code,
    );
  }
  for (let i = 0; i < 205; i++) task("pending-" + i, "PENDING");
  task("partial", "PARTIAL", "production", start, "PARTIAL_COLLECTION");
  task("failed", "FAILED", "production", start, "WINDOW_EXPIRED");
  task("running", "RUNNING");
  task("manual", "FAILED", null, start, "MANUAL_ONLY");
  task("acceptance", "FAILED", "acceptance", start, "ACCEPTANCE_ONLY");
  task(
    "yesterday",
    "FAILED",
    "production",
    new Date(Date.parse(start) - 1).toISOString(),
    "OLD_DAY",
  );
  task("tomorrow", "FAILED", "production", end, "NEXT_DAY");
  const attempt = raw.prepare(
    "INSERT INTO attempts(id,task_id,attempt_number,device_id,claimed_at,timeout_at,lease_until,status,error_code) VALUES(?,?,?,?,?,?,?,'FAILED',?)",
  );
  attempt.run("retry1", d.t.id, 2, d.id, at, end, end, "ATTEMPT_TIMEOUT");
  attempt.run("retry2", "failed", 1, d.id, at, end, end, "ATTEMPT_TIMEOUT");
  const stale = await device(h),
    pending = await device(h);
  raw
    .prepare("UPDATE devices SET status='approved',last_seen_at=? WHERE id=?")
    .run(new Date(Date.parse(at) - 121000).toISOString(), stale.id);
  raw
    .prepare("UPDATE devices SET last_seen_at=? WHERE id=?")
    .run(at, pending.id);
  const before = JSON.stringify(
    raw.prepare("SELECT * FROM tasks ORDER BY id").all(),
  );
  const r = (await h.call("/v1/admin/runtime")).data;
  assert.equal(r.day, day);
  assert.equal(r.timezone, "Asia/Shanghai");
  assert.deepEqual(r.statuses, {
    PENDING: 205,
    RUNNING: 1,
    COMPLETED: 1,
    PARTIAL: 1,
    FAILED: 1,
  });
  assert.equal(r.total, 209);
  assert.equal(r.terminal, 3);
  assert.equal(r.success_rate, 1 / 3);
  assert.equal(r.attempts, 3);
  assert.deepEqual(r.errors, [
    { source: "Attempt", code: "ATTEMPT_TIMEOUT", count: 2 },
    { source: "Task", code: "PARTIAL_COLLECTION", count: 1 },
    { source: "Task", code: "WINDOW_EXPIRED", count: 1 },
  ]);
  assert.equal(r.online_devices.length, 1);
  assert.equal(r.online_devices[0].id, d.id);
  assert.equal("credential_hash" in r.online_devices[0], false);
  assert.equal(
    r.last_success_at,
    raw.prepare("SELECT received_at FROM snapshots WHERE task_id=?").get(d.t.id)
      .received_at,
  );
  assert.equal(
    JSON.stringify(raw.prepare("SELECT * FROM tasks ORDER BY id").all()),
    before,
  );
  assert.equal(
    raw.prepare("SELECT status FROM tasks WHERE id='running'").get().status,
    "RUNNING",
  );
});

test("inclusive market presentation adds endpoint dates without changing statistics or legacy clients", async () => {
  const h = harness(),
    d = await ready(h);
  await h.call(
    `/v1/device/attempts/${d.a.id}/result`,
    "POST",
    payload(d.t),
    d.headers,
  );
  const before = JSON.stringify(h.DB.raw.prepare("SELECT * FROM tasks").all());
  for (const horizon of [14, 30]) {
    const path = `/v1/admin/market?horizon=${horizon}&checkin=${d.t.checkin}`;
    const old = (await h.call(path)).data,
      inclusive = (await h.call(path + "&inclusive=1")).data;
    assert.equal(old.curve.length, horizon);
    assert.equal(inclusive.curve.length, horizon + 1);
    assert.equal(
      inclusive.curve.at(-1).checkin,
      addDays(businessDate(), horizon),
    );
    assert.deepEqual(inclusive.hotels, old.hotels);
    assert.deepEqual(inclusive.snapshot.facts, old.snapshot.facts);
    assert.deepEqual(inclusive.strategy_history, old.strategy_history);
  }
  assert.equal((await h.call("/v1/admin/market?inclusive=2")).status, 400);
  assert.equal(
    JSON.stringify(h.DB.raw.prepare("SELECT * FROM tasks").all()),
    before,
  );
  const edgeTask = (
    await h.call("/v1/admin/tasks", "POST", {
      ...taskInput(),
      checkin: addDays(businessDate(), 30),
    })
  ).data;
  const claim = (await h.call("/v1/device/claim", "POST", {}, d.headers)).data;
  await h.call(
    `/v1/device/attempts/${claim.attempt.id}/start`,
    "POST",
    {},
    d.headers,
  );
  await h.call(
    `/v1/device/attempts/${claim.attempt.id}/result`,
    "POST",
    payload(edgeTask),
    d.headers,
  );
  const edge = (
    await h.call(
      `/v1/admin/market?horizon=30&inclusive=1&checkin=${edgeTask.checkin}`,
    )
  ).data;
  assert.equal(edge.curve.at(-1).median, 114.5);
  assert.equal(edge.snapshot.task_id, edgeTask.id);
});

test("MARKET_LIST freezes no detail targets, completes a genuine list and rejects rooms/details", async () => {
  const h = harness(),
    at = new Date().toISOString();
  h.DB.raw
    .prepare(
      "INSERT INTO standard_hotels(id,name,category,created_at,updated_at) VALUES('mine','标准名','mine',?,?)",
    )
    .run(at, at);
  h.DB.raw
    .prepare("INSERT INTO platform_hotels VALUES('ctrip','1','真实名称1',?,?)")
    .run(at, at);
  h.DB.raw
    .prepare("INSERT INTO hotel_mappings VALUES('ctrip','1','mine',?,'test')")
    .run(at);
  const d = await ready(h, "MARKET_LIST");
  assert.equal(d.t.task_type, "MARKET_LIST");
  assert.deepEqual(JSON.parse(d.a.core_hotels), []);
  const invalid = payload(d.t);
  invalid.detail_results = [
    { hotel_id: "1", status: "FAILED", error_code: "DETAIL_TIMEOUT" },
  ];
  assert.equal(
    (
      await h.call(
        `/v1/device/attempts/${d.a.id}/result`,
        "POST",
        invalid,
        d.headers,
      )
    ).status,
    400,
  );
  const r = await h.call(
    `/v1/device/attempts/${d.a.id}/result`,
    "POST",
    payload(d.t),
    d.headers,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.data.status, "COMPLETED");
  assert.equal(r.data.market_count, 30);
  assert.equal(r.data.detail_total, 0);
  assert.equal(
    h.DB.raw.prepare("SELECT COUNT(*) n FROM room_observations").get().n,
    0,
  );
  assert.equal(
    h.DB.raw.prepare("SELECT status FROM tasks WHERE id=?").get(d.t.id).status,
    "COMPLETED",
  );
});
