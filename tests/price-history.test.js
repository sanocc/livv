import test from "node:test";
import assert from "node:assert/strict";
import worker from "../api/src/index.js";
import { upload } from "../api/src/upload.js";
import { database } from "./db-adapter.js";
import {
  historyChart,
  historyTooltip,
  changeSummary,
  timeLabel,
} from "../ota/public/price-history.js";

const stay = {
  platform: "ctrip",
  city: "咸宁",
  keyword: "中心花坛",
  checkin: "2026-10-05",
  checkout: "2026-10-06",
  scope: "top30",
  collection_limit: 30,
};
function fixture() {
  const DB = database();
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,created_at) VALUES('device','fixture','approved','2026-10-01T00:00:00Z')",
    )
    .run();
  DB.raw
    .prepare("INSERT INTO platforms VALUES('fixture-platform','隔离平台')")
    .run();
  let sequence = 0;
  async function snapshot(observed, prices, overrides = {}) {
    const context = { ...stay, ...overrides };
    const id = `task-${++sequence}`,
      attempt = `attempt-${sequence}`;
    const start = new Date(Date.parse(observed) - 60000).toISOString(),
      end = new Date(Date.parse(observed) + 3600000).toISOString(),
      received = new Date(Date.parse(observed) + 1000 + sequence).toISOString();
    DB.raw
      .prepare(
        "INSERT INTO tasks(id,platform,city,keyword,checkin,checkout,scope,collection_limit,status,created_at,due_at,window_start,window_end,task_type) VALUES(?,?,?,?,?,?,?,?,'RUNNING',?,?,?,?,'MARKET_LIST')",
      )
      .run(
        id,
        context.platform,
        context.city,
        context.keyword,
        context.checkin,
        context.checkout,
        context.scope,
        context.collection_limit,
        start,
        start,
        start,
        end,
      );
    DB.raw
      .prepare(
        "INSERT INTO attempts(id,task_id,attempt_number,device_id,claimed_at,started_at,timeout_at,lease_until,status) VALUES(?,?,1,'device',?,?,?,?,'RUNNING')",
      )
      .run(attempt, id, start, start, end, end);
    const a = DB.raw.prepare("SELECT * FROM attempts WHERE id=?").get(attempt);
    const input = {
      source: "ctrip-dom",
      ...context,
      observed_at: observed,
      exhausted: context.scope === "all",
      stop_reason: context.scope === "all" ? "NATURAL_END" : "TARGET_REACHED",
      hotels: Object.entries(prices).map(([hotel_id, display_price], i) => ({
        hotel_id,
        hotel_name: `原始酒店${hotel_id}`,
        rank: i + 1,
        is_ad: false,
        display_price,
        original_price: null,
      })),
      rooms: [],
      detail_results: [],
    };
    return upload(DB, { id: "device" }, a, input, Date.parse(received));
  }
  async function query(
    overrides = {},
    headers = { Authorization: "Bearer fixture" },
  ) {
    const params = new URLSearchParams({
      observation_date: "2026-10-02",
      ...stay,
      hotel_ids: "1,2,3",
      ...overrides,
    });
    const response = await worker.fetch(
      new Request("http://localhost/v1/admin/market/price-history?" + params, {
        headers,
      }),
      {
        DB,
        ENVIRONMENT: "local",
        LOCAL_ADMIN_TOKEN: "fixture",
        CF_ACCESS_TEAM_DOMAIN: "fixture.cloudflareaccess.com",
        CF_ACCESS_AUD: "fixture-aud",
      },
    );
    return { status: response.status, data: await response.json() };
  }
  return { DB, snapshot, query };
}

test("intraday API retains all observations, genuine zero/null/absent prices, prior valid baselines and PARTIAL status without writes", async () => {
  const f = fixture();
  await f.snapshot("2026-10-01T15:59:59.999Z", { 1: 90, 2: 0, 3: 80 }); // Shanghai previous day
  await f.snapshot("2026-10-02T02:00:00Z", { 1: null, 2: 10 }); // insert out of chronological order
  await f.snapshot("2026-10-01T16:00:00.000Z", { 1: 100, 2: 0, 3: 80 }); // inclusive start
  const later = await f.snapshot("2026-10-02T04:00:00Z", {
    1: 120,
    2: 0,
    3: null,
  });
  await f.snapshot("2026-10-02T05:00:00Z", { 9: 150 }); // selected hotels all absent; retain gap
  await f.snapshot("2026-10-02T06:00:00Z", { 1: 120, 2: 20, 3: 70 });
  await f.snapshot("2026-10-02T16:00:00Z", { 1: 999 }); // exclusive end
  const before = f.DB.raw.prepare("SELECT total_changes() n").get().n;
  const response = await f.query();
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(f.DB.raw.prepare("SELECT total_changes() n").get().n, before);
  const { observations } = response.data;
  assert.equal(observations.length, 5);
  assert.deepEqual(
    observations.map((o) => o.observed_at),
    [
      "2026-10-01T16:00:00.000Z",
      "2026-10-02T02:00:00.000Z",
      "2026-10-02T04:00:00.000Z",
      "2026-10-02T05:00:00.000Z",
      "2026-10-02T06:00:00.000Z",
    ],
  );
  const price = (i, id) =>
    observations[i].prices.find((p) => p.hotel_id === id);
  assert.equal(price(0, "1").change, 10);
  assert.equal(price(0, "1").previous_price, 90);
  assert.equal(price(0, "1").previous_observed_at, "2026-10-01T15:59:59.999Z");
  assert.equal(price(0, "2").display_price, 0);
  assert.equal(price(0, "2").change, 0);
  assert.equal(price(0, "2").change_ratio, null);
  assert.equal(price(1, "1").missing_reason, "PRICE_MISSING");
  assert.equal(price(1, "1").display_price, null);
  assert.equal(price(1, "1").change, null);
  assert.equal(price(1, "3").missing_reason, "OBSERVATION_MISSING");
  assert.equal(price(1, "3").display_price, null);
  assert.equal(price(1, "2").change, 10);
  assert.equal(price(1, "2").change_ratio, null);
  assert.equal(price(2, "1").previous_price, 100);
  assert.equal(price(2, "1").change, 20);
  assert.equal(price(2, "1").change_ratio, 0.2);
  assert.equal(observations[2].snapshot_id, later.snapshot_id);
  assert.equal(observations[2].market_status, "PARTIAL");
  assert.equal(observations[2].task_status, "PARTIAL");
  assert.ok(
    observations[3].prices.every(
      (p) =>
        p.display_price === null && p.missing_reason === "OBSERVATION_MISSING",
    ),
  );
  assert.equal(price(4, "1").change, 0);
  assert.equal(price(4, "3").previous_price, 80);
  assert.equal(price(4, "3").change, -10);
  assert.equal(price(4, "2").change_ratio, null);
  assert.deepEqual(observations[4].summary, {
    up: 1,
    down: 1,
    unchanged: 1,
    unavailable: 0,
  });
});

test("history strictly isolates platform, city, keyword, stay dates and scope/limit; preserves raw identity plus current mapping", async () => {
  const f = fixture();
  await f.snapshot("2026-10-01T17:00:00Z", { 1: 100 });
  for (const context of [
    { platform: "fixture-platform" },
    { city: "武汉" },
    { keyword: "另一个市场" },
    { checkin: "2026-10-06", checkout: "2026-10-07" },
    { checkout: "2026-10-07" },
    { scope: "all", collection_limit: null },
    { scope: "custom", collection_limit: 1 },
  ])
    await f.snapshot("2026-10-01T18:00:00Z", { 1: 999 }, context);
  f.DB.raw
    .prepare(
      "INSERT INTO standard_hotels VALUES('permanent','当前标准名','core','2026-10-01','2026-10-01')",
    )
    .run();
  f.DB.raw
    .prepare(
      "INSERT INTO hotel_mappings VALUES('ctrip','1','permanent','2026-10-03','fixture')",
    )
    .run();
  const r = await f.query({ hotel_ids: "1" });
  assert.equal(r.status, 200);
  assert.equal(r.data.observations.length, 1);
  const p = r.data.observations[0].prices[0];
  assert.equal(p.platform, "ctrip");
  assert.equal(p.hotel_id, "1");
  assert.equal(p.hotel_name, "原始酒店1");
  assert.equal(p.standard_hotel_id, "permanent");
  assert.equal(p.standard_name, "当前标准名");
  assert.equal(p.display_price, 100);
  assert.equal(p.previous_price, null);
  assert.equal(p.change_ratio, null);
  assert.equal(r.data.mapping_context, "CURRENT");
  const other = await f.query({ platform: "fixture-platform", hotel_ids: "1" });
  assert.equal(other.data.observations[0].prices[0].display_price, 999);
  assert.equal(other.data.hotels[0].standard_hotel_id, null);
  const custom = await f.query({
    scope: "custom",
    collection_limit: "1",
    hotel_ids: "1",
  });
  assert.equal(custom.data.observations.length, 1);
  assert.equal(custom.data.observations[0].prices[0].previous_price, null);
  assert.equal(
    (await f.query({ scope: "all", collection_limit: "null", hotel_ids: "1" }))
      .data.observations.length,
    1,
  );
});

test("history uses observed date rather than receipt date, preserves equal-time snapshots, and supports historical stays", async () => {
  const f = fixture();
  await f.snapshot("2026-10-02T15:59:59.500Z", { 1: 100 }); // received next Shanghai day
  await f.snapshot("2026-10-02T15:59:59.500Z", { 1: 110 });
  const r = await f.query({ hotel_ids: "1" });
  assert.equal(r.data.observations.length, 2);
  assert.equal(r.data.observations[1].prices[0].change, 10);
  assert.equal(
    r.data.observations[0].observed_at,
    r.data.observations[1].observed_at,
  );
  assert.equal(
    (await f.query({ observation_date: "2026-10-03", hotel_ids: "1" })).data
      .observations.length,
    0,
  );
});

test("history authentication, input bounds and all-empty results; no change to existing market contract", async () => {
  const f = fixture();
  assert.equal((await f.query({}, {})).status, 401);
  const route = "http://localhost/v1/admin/market/price-history";
  const denied = await worker.fetch(
    new Request(route, { headers: { Authorization: "Bearer fixture" } }),
    {
      DB: f.DB,
      ENVIRONMENT: "production",
      LOCAL_ADMIN_TOKEN: "fixture",
      CF_ACCESS_TEAM_DOMAIN: "fixture.cloudflareaccess.com",
      CF_ACCESS_AUD: "fixture-aud",
    },
  );
  assert.equal(denied.status, 401);
  const post = await worker.fetch(
    new Request(route, {
      method: "POST",
      headers: {
        Authorization: "Bearer fixture",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    { DB: f.DB, ENVIRONMENT: "local", LOCAL_ADMIN_TOKEN: "fixture" },
  );
  assert.equal(post.status, 404);

  for (const overrides of [
    { observation_date: "2026-02-30" },
    { checkin: "bad" },
    { checkout: stay.checkin },
    { scope: "invented" },
    { scope: "custom", collection_limit: "0" },
    { scope: "top30", collection_limit: "31" },
    { scope: "all", collection_limit: "30" },
    { hotel_ids: "" },
    { hotel_ids: Array.from({ length: 12 }, (_, i) => String(i)).join(",") },
    { platform: "unknown" },
  ])
    assert.equal(
      (await f.query(overrides)).status,
      400,
      JSON.stringify(overrides),
    );
  const result = await f.query();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.observations, []);
  assert.equal(result.data.hotels.length, 3);
  const params = new URLSearchParams({
    scope: "top30",
    horizon: "14",
    inclusive: "1",
  });
  const r = await worker.fetch(
    new Request("http://localhost/v1/admin/market?" + params, {
      headers: { Authorization: "Bearer fixture" },
    }),
    { DB: f.DB, ENVIRONMENT: "local", LOCAL_ADMIN_TOKEN: "fixture" },
  );
  const old = await r.json();
  assert.equal(r.status, 200);
  assert.equal(old.curve.length, 15);
  assert.ok(!("observations" in old));
});

test("ten competitors may include a separately mapped mine; eleven competitors alone are rejected", async () => {
  const f = fixture();
  const ids = Array.from({ length: 11 }, (_, i) => String(i + 1));
  await f.snapshot(
    "2026-10-01T17:00:00Z",
    Object.fromEntries(ids.map((id) => [id, 100])),
  );
  assert.equal((await f.query({ hotel_ids: ids.join(",") })).status, 400);
  f.DB.raw
    .prepare(
      "INSERT INTO standard_hotels VALUES('mine','我的酒店','mine','2026-10-01','2026-10-01')",
    )
    .run();
  f.DB.raw
    .prepare(
      "INSERT INTO hotel_mappings VALUES('ctrip','11','mine','2026-10-01','fixture')",
    )
    .run();
  assert.equal((await f.query({ hotel_ids: ids.join(",") })).status, 200);
});

test("chart retains real intervals and breaks paths at both absent/null observations; tooltip preserves baseline and summaries", async () => {
  const f = fixture();
  await f.snapshot("2026-10-01T16:00:00Z", { 1: 0, 2: 100 });
  await f.snapshot("2026-10-01T17:00:00Z", { 1: null, 2: 110 });
  await f.snapshot("2026-10-02T04:00:00Z", { 1: 10, 2: 100 });
  await f.snapshot("2026-10-02T06:00:00Z", { 1: 20, 2: null });
  const { data } = await f.query({ hotel_ids: "1,2" });
  const html = historyChart(data);
  assert.equal((html.match(/class="history-dot"/g) ?? []).length, 6);
  assert.equal((html.match(/class="history-line"/g) ?? []).length, 2);
  assert.ok(html.includes("M495,"));
  assert.ok(html.includes("L567.5,"));
  assert.ok(html.includes('cx="96.25"'));
  assert.doesNotMatch(html, / NaN|undefined| C/);
  assert.equal(timeLabel("2026-10-01T16:00:00Z"), "00:00:00");
  assert.match(changeSummary(data.observations[2]), /1 家涨价 · 1 家降价/);
  const tip = historyTooltip(data.observations[2], data.hotels);
  assert.match(tip, /Hotel ID: 1/);
  assert.match(tip, /前价 ¥0/);
  assert.match(tip, /基准 2026-10-02 00:00:00/);
  assert.match(tip, /-9.1%/);
  assert.match(tip, /列表部分采集/);
  data.observations[0].prices[0].standard_name = "<script>";
  assert.match(
    historyTooltip(data.observations[0], data.hotels),
    /&lt;script&gt;/,
  );
  assert.doesNotMatch(
    historyTooltip(data.observations[0], data.hotels),
    /<script>/,
  );
  assert.match(historyChart({ ...data, observations: [] }), /暂无真实价格数据/);
});

test("tasks without snapshots break lines without fabricating observation timestamps or replacing valid comparison baselines", async () => {
  const f = fixture();
  await f.snapshot("2026-10-01T17:00:00Z", { 1: 100 });
  await f.snapshot("2026-10-01T19:00:00Z", { 1: 120 });
  f.DB.raw
    .prepare(
      "INSERT INTO tasks(id,platform,city,keyword,checkin,checkout,scope,collection_limit,status,created_at,due_at,window_start,window_end,error_code,task_type) VALUES('missing-task','ctrip','咸宁','中心花坛','2026-10-05','2026-10-06','top30',30,'FAILED','2026-10-01T17:30:00Z','2026-10-01T18:00:00Z','2026-10-01T17:30:00Z','2026-10-01T18:30:00Z','MAX_ATTEMPTS_REACHED','MARKET_LIST')",
    )
    .run();
  const response = await f.query({ hotel_ids: "1" });
  assert.equal(response.status, 200);
  assert.equal(response.data.observations.length, 2);
  assert.equal(response.data.unobserved_tasks.length, 1);
  assert.equal(response.data.unobserved_tasks[0].task_status, "FAILED");
  assert.ok(!("observed_at" in response.data.unobserved_tasks[0]));
  assert.equal(response.data.observations[1].prices[0].change, 20);
  const html = historyChart(response.data);
  assert.equal((html.match(/class="history-dot"/g) ?? []).length, 2);
  assert.equal((html.match(/class="intraday-hit"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /class="history-line"/);
  assert.equal(
    (await f.query({ observation_date: "2026-10-03", hotel_ids: "1" })).data
      .unobserved_tasks.length,
    0,
  );
});
