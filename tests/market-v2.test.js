import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function context() {
  const c = vm.createContext({
    document: { querySelector: () => ({}), querySelectorAll: () => [] },
  });
  vm.runInContext(
    fs
      .readFileSync(new URL("../ota/public/app.js", import.meta.url), "utf8")
      .replace(/^import[\s\S]*?;\n/, "")
      .replace(/load\(\);\s*$/, ""),
    c,
  );
  return c;
}
test("market overview counts only observed finite prices, preserves zero and distinguishes missing from empty snapshots", () => {
  const c = context();
  c.data = {
    snapshot: {},
    hotels: [0, 100, null, undefined, NaN, Infinity, -1].map(
      (display_price) => ({ display_price }),
    ),
  };
  assert.deepEqual(
    JSON.parse(vm.runInContext("JSON.stringify(marketOverview(data))", c)),
    { count: 7, priced: 2, coverage: 2 / 7, mean: 50 },
  );
  c.data = { snapshot: null, hotels: [] };
  assert.deepEqual(
    JSON.parse(vm.runInContext("JSON.stringify(marketOverview(data))", c)),
    { count: null, priced: null, coverage: null, mean: null },
  );
  c.data.hotels = [{ display_price: 100 }];
  assert.equal(vm.runInContext("marketOverview(data).mean", c), null);
  c.data.hotels = [];
  c.data.snapshot = {};
  assert.deepEqual(
    JSON.parse(vm.runInContext("JSON.stringify(marketOverview(data))", c)),
    { count: 0, priced: 0, coverage: null, mean: null },
  );
  c.data.hotels = [{ display_price: null }];
  assert.equal(vm.runInContext("marketOverview(data).mean", c), null);
});
test("market change summary uses immutable supplied facts and never invents entrants or missing hotels", () => {
  const c = context();
  assert.match(vm.runInContext("marketChanges(null)", c), /历史可比样本不足/);
  assert.match(
    vm.runInContext("marketChanges({facts:{comparable:0,up:0,down:0}})", c),
    /历史可比样本不足/,
  );
  const html = vm.runInContext(
    "marketChanges({facts:{comparable:12,up:3,down:2,medianChange:-0.125}})",
    c,
  );
  assert.match(html, /<b>12<\/b>/);
  assert.match(html, /<b>3<\/b>/);
  assert.match(html, /<b>2<\/b>/);
  assert.match(html, /-12.5%/);
  assert.match(html, /同入住日期/);
  assert.doesNotMatch(html, /新出现|暂时缺失/);
  assert.match(
    vm.runInContext("marketChanges({facts:{comparable:2}})", c),
    /涨价 <b>—<\/b>/,
  );
});
test("hotel details use platform and hotel identity, preserve room gaps and escape untrusted observations", () => {
  const c = context();
  c.h = {
    platform: "ctrip",
    hotel_id: "111",
    hotel_name: "<script>",
    score: 0,
    dynamic: "<img>",
    original_price: 0,
    activity_tags: ["<svg>"],
  };
  c.rooms = [
    {
      platform: "ctrip",
      hotel_id: "111",
      room_name: "<room>",
      display_price: 0,
      original_price: null,
      availability_status: "available",
    },
    { platform: "other", hotel_id: "111", room_name: "WRONG PLATFORM" },
    { platform: "ctrip", hotel_id: "222", room_name: "WRONG HOTEL" },
  ];
  const html = vm.runInContext("hotelDetails(h,rooms)", c);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;room&gt;/);
  assert.match(html, /¥0/);
  assert.match(html, /原价 —/);
  assert.match(html, /评分 0/);
  assert.doesNotMatch(html, /WRONG|<script>|<img>|<svg>/);
  assert.match(
    vm.runInContext("hotelDetails(h)", c),
    /暂无已采集房型；不代表售罄/,
  );
});
test("trend coverage and date tooltip describe snapshot provenance while keeping missing dates as gaps", () => {
  const c = context();
  c.curve = [
    {
      checkin: "2026-10-01",
      minimum: 0,
      median: 0,
      maximum: 0,
      myPrice: 0,
      priced: 1,
      market_status: "PARTIAL",
      observed_at: "2026-10-01T00:00:00Z",
    },
    {
      checkin: "2026-10-02",
      minimum: null,
      median: null,
      maximum: null,
      myPrice: null,
    },
  ];
  const html = vm.runInContext("chart(curve)", c);
  assert.match(html, /2 个入住日期 · 1 个有价格数据 · 1 个缺失/);
  assert.match(html, /有价样本：1/);
  assert.match(html, /部分采集/);
  assert.match(html, /暂无快照/);
  assert.match(html, /采集时间/);
  assert.match(html, /周四·休/);
  assert.doesNotMatch(html, /class="price-line"/);
});
