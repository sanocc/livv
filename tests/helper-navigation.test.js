import test from "node:test";
import assert from "node:assert/strict";
import {
  contextMatches,
  navigationProfile,
  fastNavigation,
  marketNavigation,
  rememberNavigation,
} from "../helper/navigation.js";
import { inspectList } from "../helper/mobile.js";
import { completeDetailResults } from "../helper/detail-state.js";
const task = {
  platform: "ctrip",
  city: "咸宁",
  keyword: "中心花坛",
  checkin: "2026-10-06",
  checkout: "2026-10-07",
};
// Native 2026-10-01 A/B observations. No guessed POI or city identifiers.
const keyword = [
  "中心花坛",
  "13|10674382",
  "13",
  "29.826196|114.3350786|中心花坛|10674382",
  "",
  "",
  "",
  1,
  "[]",
  '["SubLandmark"]',
  "",
];
const url = new URL("https://m.ctrip.com/webapp/hotels/hotelsearch/listPage");
for (const [k, v] of Object.entries({
  "d-city": "937",
  "d-name": JSON.stringify(["咸宁", "", "", "中国", "咸宁"]),
  "c-in": task.checkin,
  "c-out": task.checkout,
  "s-keyword": JSON.stringify(keyword),
  "s-filters": JSON.stringify([
    [
      "中心花坛",
      "13|10674382",
      "18",
      "29.826196|114.3350786|中心花坛|10674382|2",
    ],
  ]),
  "page-token": "opaque-native-token",
}))
  url.searchParams.set(k, v);
const result = {
  url: url.href,
  context_verified: true,
  context: task,
  platform_city_id: "937",
};
test("verified native city/POI profile changes only stay dates and preserves opaque fields", () => {
  const p = navigationProfile(result, task, 1000);
  assert.equal(p.platform_city_id, "937");
  assert.equal(p.keyword_id, "13|10674382");
  const next = { ...task, checkin: "2026-10-05", checkout: "2026-10-06" };
  const fast = fastNavigation(next, [p], 2000);
  assert.ok(fast);
  assert.equal(
    fast,
    result.url
      .replace("2026-10-06", "2026-10-05")
      .replace("2026-10-07", "2026-10-06"),
  );
  assert.equal(
    new URL(fast).searchParams.get("page-token"),
    "opaque-native-token",
  );
});
test("URL appearance never substitutes for actual card and visible keyword context", () => {
  for (const key of ["platform", "city", "checkin", "checkout", "keyword"]) {
    const wrong = { ...result, context: { ...task, [key]: "wrong" } };
    assert.equal(contextMatches(wrong, task), false);
    assert.equal(navigationProfile(wrong, task), null);
  }
  assert.equal(
    contextMatches({ ...result, context_verified: false }, task),
    false,
  );
  assert.equal(
    navigationProfile({ ...result, platform_city_id: "2" }, task),
    null,
  );
});
test("unknown city/keyword, expired metadata, date-bound cache and unsafe URLs fall back", () => {
  const p = navigationProfile(result, task, 1000);
  assert.equal(
    fastNavigation({ ...task, keyword: "未验证关键词" }, [p], 2000),
    null,
  );
  assert.equal(fastNavigation({ ...task, city: "上海" }, [p], 2000), null);
  assert.equal(fastNavigation(task, [p], 1000 + 86400001), null);
  for (const changed of [
    result.url + "&cacheKey=old-date",
    result.url.replace("m.ctrip.com", "example.com"),
  ])
    assert.equal(navigationProfile({ ...result, url: changed }, task), null);
  assert.equal(rememberNavigation([p], p).length, 1);
});
test("list-only task does not fabricate missing details from a legacy core list", () => {
  assert.deepEqual(
    completeDetailResults({
      task: { task_type: "MARKET_LIST" },
      core_hotels: [{ hotel_id: "1" }],
      market: [{ hotel_id: "1" }],
    }),
    [],
  );
  const old = { core_hotels: [{ hotel_id: "1" }], market: [{ hotel_id: "1" }] };
  assert.equal(completeDetailResults(old)[0].error_code, "DETAIL_INCOMPLETE");
});

test("real exposure shape: every card city ID and dates must match native URL", () => {
  const data = {
    cityid: "937",
    cityname: "咸宁",
    checkin: "20261006",
    checkout: "20261007",
    masterhotelid: "2114264",
    masterhotelid_rank: "0",
    hotelName: "雅斯特酒店",
  };
  const leaf = { children: [], textContent: "雅斯特酒店" };
  const cards = [data, { ...data, masterhotelid: "6955433" }].map((d) => ({
    getAttribute: () => JSON.stringify({ data: d }),
    querySelectorAll: () => [leaf],
  }));
  globalThis.location = { href: result.url };
  globalThis.getComputedStyle = () => ({ visibility: "visible" });
  globalThis.document = {
    body: { innerText: "" },
    querySelector: () => null,
    querySelectorAll: (s) =>
      s === ".hotel-card[data-exposure]"
        ? cards
        : [
            {
              children: [],
              closest: () => null,
              textContent: "中心花坛",
              getBoundingClientRect: () => ({ width: 10, height: 10 }),
            },
          ],
  };
  try {
    assert.equal(inspectList().context_verified, true);
    globalThis.getComputedStyle = () => ({ visibility: "hidden" });
    assert.equal(inspectList().context_verified, false);
    globalThis.getComputedStyle = () => ({ visibility: "visible" });
    cards[1].getAttribute = () =>
      JSON.stringify({ data: { ...data, cityid: "2" } });
    assert.equal(inspectList().context_verified, false);
    cards[1].getAttribute = () =>
      JSON.stringify({ data: { ...data, checkout: "20261008" } });
    assert.equal(inspectList().context_verified, false);
  } finally {
    delete globalThis.location;
    delete globalThis.document;
    delete globalThis.getComputedStyle;
  }
});

test("cold-start MARKET_LIST uses observed portable template, never legacy or unsupported searches", () => {
  const marketTask = { ...task, task_type: "MARKET_LIST" };
  const direct = marketNavigation(marketTask, [], Date.now());
  assert.ok(direct);
  const p = new URL(direct).searchParams;
  assert.equal(p.get("d-city"), "937");
  assert.equal(p.get("c-in"), task.checkin);
  assert.equal(p.get("c-out"), task.checkout);
  assert.equal(JSON.parse(p.get("s-keyword"))[0], task.keyword);
  assert.ok(p.get("page-token"));
  assert.ok(p.get("dplinktracelogid"));
  assert.equal(p.has("cache-key"), false);
  assert.equal(marketNavigation({ ...marketTask, keyword: "未知" }), null);
  assert.equal(marketNavigation({ ...marketTask, city: "上海" }), null);
  assert.equal(
    marketNavigation({ ...marketTask, task_type: "LEGACY_MARKET_DETAIL" }),
    null,
  );
  assert.equal(
    marketNavigation({ ...marketTask, checkout: task.checkin }),
    null,
  );
  const stale = navigationProfile(result, task, 1000);
  assert.ok(marketNavigation(marketTask, [stale], 1000 + 86400001));
  assert.ok(
    marketNavigation(marketTask, [
      { ...stale, url: "invalid", verified_at: Date.now() },
    ]),
  );
  assert.equal(
    contextMatches({ ...result, context: { ...task, city: "上海" } }, task),
    false,
  );
});
