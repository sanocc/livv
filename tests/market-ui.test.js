import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("price chart preserves gaps, all four series and decimal medians", () => {
  const source = fs.readFileSync(
    new URL("../ota/public/app.js", import.meta.url),
    "utf8",
  );
  const context = vm.createContext({
    document: { querySelector: () => ({}), querySelectorAll: () => [] },
  });
  vm.runInContext(source.replace(/load\(\);\s*$/, ""), context);
  const curve = [100, null, 120].map((v, i) => ({
    checkin: `2026-10-0${i + 1}`,
    minimum: v,
    median: v,
    maximum: v,
    myPrice: v,
  }));
  context.curve = curve;
  const html = vm.runInContext("chart(curve)", context);
  assert.equal((html.match(/<circle /g) ?? []).length, 8);
  assert.equal((html.match(/<polyline /g) ?? []).length, 0);
  for (const label of [
    "市场最低价",
    "市场中位价",
    "市场最高价",
    "我的酒店起售价",
  ])
    assert.ok(html.includes(label));
  assert.equal(vm.runInContext("money(114.5)", context), "¥114.5");
  assert.equal(vm.runInContext("money(null)", context), "—");
  context.curve = curve.map((x) => ({ ...x, minimum: 100 }));
  assert.equal(
    (vm.runInContext("chart(curve)", context).match(/<polyline /g) ?? [])
      .length,
    1,
  );
});

test("market cards and horizontal platform table use supplied facts and original hover identity", async () => {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector))
      nodes.set(selector, {
        innerHTML: "",
        value: "",
        querySelectorAll: () => [],
      });
    return nodes.get(selector);
  };
  const calls = [];
  const data = {
    platform: "ctrip",
    city: "咸宁",
    keyword: "中心花坛",
    scope: "top30",
    horizon: 14,
    checkin: "2026-10-01",
    curve: [
      {
        checkin: "2026-10-01",
        snapshot_id: "real-snapshot",
        myPrice: 0,
        minimum: 0,
        median: 50.5,
        maximum: 101,
      },
    ],
    snapshot: {
      facts: { minimum: 0, median: 50.5, maximum: 101, priced: 2 },
      market_count: 2,
      market_status: "SUCCESS",
      detail_success: 1,
      detail_total: 1,
      recommendation: "observe",
      reason: "可比样本不足",
    },
    hotels: [
      {
        platform: "ctrip",
        hotel_id: "111",
        hotel_name: "平台原名",
        standard_name: "LIVV标准名",
        livv_hotel_id: "permanent-id",
        category: "mine",
        rank: 1,
        display_price: 0,
        original_price: 50,
        activity_tags: ["优惠"],
        is_ad: false,
      },
      {
        platform: "ctrip",
        hotel_id: "222",
        hotel_name: "未映射原名",
        standard_name: "未映射原名",
        category: "other",
        rank: 2,
        display_price: 101,
      },
    ],
    strategy_history: [],
  };
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [] },
    URLSearchParams,
    fetch: async (path, options) => {
      calls.push({ path, method: options.method });
      return {
        ok: true,
        json: async () =>
          path.includes("runtime")
            ? { online_devices: [], last_success_at: null }
            : data,
      };
    },
  });
  const source = fs.readFileSync(
    new URL("../ota/public/app.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(source.replace(/load\(\);\s*$/, ""), context);
  await vm.runInContext("market()", context);
  const view = node("#view").innerHTML,
    table = node("#hotel-table").innerHTML;
  assert.ok(view.includes("¥0"));
  assert.ok(view.includes("¥50.5"));
  assert.ok(view.includes("¥101"));
  assert.ok(view.includes("2家有价样本"));
  assert.ok(view.includes("LIVV标准名"));
  assert.ok(table.includes('rowspan="2"'));
  assert.ok(table.includes("携程排名"));
  assert.ok(table.includes("携程起售价"));
  assert.ok(table.includes("Hotel ID: 111"));
  assert.ok(table.includes("平台原名"));
  assert.ok(table.includes("划线价: ¥50"));
  assert.ok(table.includes("活动: 优惠"));
  for (const label of ["美团", "飞猪", "酒店类型", "价格趋势", "导出"])
    assert.ok(!table.includes(label));
  assert.ok(calls.every((c) => c.method === "GET"));
  assert.ok(
    calls.every(
      (c) =>
        c.path.startsWith("/api/v1/admin/market?") ||
        c.path === "/api/v1/admin/runtime",
    ),
  );
});

test("empty market and missing date hover show gaps, not invented prices or strategy", async () => {
  const nodes = new Map(),
    node = (s) => {
      if (!nodes.has(s))
        nodes.set(s, { innerHTML: "", value: "", querySelectorAll: () => [] });
      return nodes.get(s);
    };
  const curve = Array.from({ length: 30 }, (_, i) => ({
    checkin: `2026-10-${String(i + 1).padStart(2, "0")}`,
    snapshot_id: null,
    myPrice: null,
    minimum: null,
    median: null,
    maximum: null,
  }));
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [] },
    URLSearchParams,
    fetch: async (path) => ({
      ok: true,
      json: async () =>
        path.includes("runtime")
          ? { online_devices: [], last_success_at: null }
          : {
              platform: "ctrip",
              city: "咸宁",
              keyword: "中心花坛",
              scope: "all",
              horizon: 30,
              checkin: curve[0].checkin,
              curve,
              snapshot: null,
              hotels: [],
              strategy_history: [],
            },
    }),
  });
  const source = fs.readFileSync(
    new URL("../ota/public/app.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(source.replace(/load\(\);\s*$/, ""), context);
  await vm.runInContext("market()", context);
  const html = node("#view").innerHTML;
  assert.ok(html.includes("暂无真实价格数据"));
  assert.ok(html.includes("— 暂无建议"));
  assert.ok(!html.includes("<polyline "));
  assert.ok(!html.includes("<circle "));
  assert.equal((html.match(/class="chart-hit tip"/g) ?? []).length, 30);
  assert.ok(html.includes("我的酒店起售价：—"));
  assert.ok(html.includes("市场最高价：—"));
  assert.ok(html.includes("市场中位价：—"));
  assert.ok(html.includes("市场最低价：—"));
  assert.ok(node("#hotel-table").innerHTML.includes("暂无真实数据"));
});
