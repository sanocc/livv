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
  assert.equal((html.match(/class="price-line"/g) ?? []).length, 0);
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
    (
      vm.runInContext("chart(curve)", context).match(/class="price-line"/g) ??
      []
    ).length,
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
        querySelector: () => null,
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
        nodes.set(s, {
          innerHTML: "",
          value: "",
          querySelector: () => null,
          querySelectorAll: () => [],
        });
      return nodes.get(s);
    };
  const curve = Array.from({ length: 31 }, (_, i) => ({
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
  assert.ok(!html.includes('class="price-line"'));
  assert.ok(!html.includes("<circle "));
  assert.equal((html.match(/class="chart-hit tip"/g) ?? []).length, 15);
  assert.ok(html.includes("我的酒店：—"));
  assert.ok(html.includes("市场最高价：—"));
  assert.ok(html.includes("市场中位价：—"));
  assert.ok(html.includes("市场最低价：—"));
  assert.ok(node("#hotel-table").innerHTML.includes("暂无真实数据"));
});

test("chart period reads inclusive 15/31 dates without changing selected market, hotel rows or category", async () => {
  const nodes = new Map(),
    node = (s) => {
      if (!nodes.has(s))
        nodes.set(s, {
          innerHTML: "",
          value: "",
          querySelector: () => null,
          querySelectorAll: () => [],
        });
      return nodes.get(s);
    };
  const buttons = [14, 30].map((n) => ({
    dataset: { horizon: String(n) },
    setAttribute(k, v) {
      this[k] = v;
    },
  }));
  const calls = [];
  const context = vm.createContext({
    document: {
      querySelector: node,
      querySelectorAll: (s) => (s === "[data-horizon]" ? buttons : []),
    },
    URLSearchParams,
    fetch: async (path, options) => {
      calls.push({ path, method: options.method });
      const u = new URL(path, "http://localhost");
      const n = Number(u.searchParams.get("horizon")) + 1;
      return {
        ok: true,
        json: async () => ({
          curve: Array.from({ length: n }, (_, i) => ({
            checkin: `2026-10-${String(i + 1).padStart(2, "0")}`,
            myPrice: null,
            maximum: null,
            median: null,
            minimum: null,
          })),
        }),
      };
    },
  });
  const source = fs.readFileSync(
    new URL("../ota/public/app.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(source.replace(/load\(\);\s*$/, ""), context);
  vm.runInContext(
    "filter={city:'咸宁',keyword:'中心花坛',scope:'all',horizon:30,inclusive:1,checkin:'2026-10-31'}; marketData={hotels:[{category:'core'}]}",
    context,
  );
  node("#hotel-table").innerHTML = "selected core rows";
  node("#view").innerHTML = "cards and filters";
  node("#checkin").value = "2026-10-31";
  node("#scope").value = "all";
  await vm.runInContext("setChartHorizon(14)", context);
  assert.equal(
    (node("#trend-chart").innerHTML.match(/class="chart-hit tip"/g) ?? [])
      .length,
    15,
  );
  assert.ok(node("#trend-chart").innerHTML.includes("2026-10-15"));
  await vm.runInContext("setChartHorizon(30)", context);
  assert.equal(
    (node("#trend-chart").innerHTML.match(/class="chart-hit tip"/g) ?? [])
      .length,
    31,
  );
  assert.ok(node("#trend-chart").innerHTML.includes("2026-10-31"));
  assert.equal(node("#hotel-table").innerHTML, "selected core rows");
  assert.equal(node("#view").innerHTML, "cards and filters");
  assert.equal(node("#checkin").value, "2026-10-31");
  assert.equal(node("#scope").value, "all");
  assert.equal(vm.runInContext("filter.checkin", context), "2026-10-31");
  assert.equal(
    vm.runInContext("marketData.hotels[0].category", context),
    "core",
  );
  assert.deepEqual(
    buttons.map((b) => b["aria-pressed"]),
    ["false", "true"],
  );
  assert.equal(calls.length, 2);
  for (const c of calls) {
    const u = new URL(c.path, "http://localhost");
    assert.equal(c.method, "GET");
    assert.equal(u.pathname, "/api/v1/admin/market");
    assert.equal(u.searchParams.get("inclusive"), "1");
    assert.equal(u.searchParams.get("checkin"), "2026-10-31");
    assert.equal(u.searchParams.get("scope"), "all");
  }
});

test("chart calendar and smooth area keep factual gaps, holiday precedence and unknown-year honesty", () => {
  const context = vm.createContext({
    document: { querySelector: () => ({}), querySelectorAll: () => [] },
  });
  const source = fs.readFileSync(
    new URL("../ota/public/app.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(source.replace(/load\(\);\s*$/, ""), context);
  assert.equal(
    vm.runInContext("dateLabel('2026-10-02','2026-10-01').color", context),
    "holiday-date",
  );
  assert.equal(
    vm.runInContext("dateLabel('2026-10-09','2026-10-01').color", context),
    "weekend-date",
  );
  assert.equal(
    vm.runInContext("dateLabel('2026-10-08','2026-10-01').color", context),
    "ordinary-date",
  );
  assert.equal(
    vm.runInContext("dateLabel('2027-01-01','2026-12-31').holiday", context),
    "节假日安排未确认",
  );
  context.curve = [100, 110, null, 120, 115].map((p, i) => ({
    checkin: `2026-10-0${i + 1}`,
    myPrice: p,
    maximum: p,
    median: p,
    minimum: p,
  }));
  const html = vm.runInContext("chart(curve)", context);
  assert.equal((html.match(/class="price-area"/g) ?? []).length, 2);
  assert.equal((html.match(/class="price-line"/g) ?? []).length, 8);
  assert.ok(html.includes("linearGradient"));
  assert.ok(html.includes(" C"));
  assert.ok(html.includes("周六 · T+2"));
  assert.ok(html.includes("国庆节假期"));
  const day3 = html.match(/data-tip="([^\"]*10\/03[^\"]*)"/)[1];
  assert.ok(day3.includes("我的酒店：—"));
});

test("late period response cannot overwrite the latest choice", async () => {
  const nodes = new Map(),
    node = (s) => {
      if (!nodes.has(s))
        nodes.set(s, {
          innerHTML: "",
          querySelector: () => null,
          querySelectorAll: () => [],
        });
      return nodes.get(s);
    };
  const pending = [];
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [] },
    URLSearchParams,
    fetch: () => new Promise((resolve) => pending.push(resolve)),
  });
  const source = fs.readFileSync(
    new URL("../ota/public/app.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(source.replace(/load\(\);\s*$/, ""), context);
  const first = vm.runInContext("setChartHorizon(14)", context),
    last = vm.runInContext("setChartHorizon(30)", context);
  const result = (n) => ({
    ok: true,
    json: async () => ({
      curve: Array.from({ length: n }, (_, i) => ({
        checkin: `2026-10-${String(i + 1).padStart(2, "0")}`,
        myPrice: null,
        maximum: null,
        median: null,
        minimum: null,
      })),
    }),
  });
  pending[1](result(31));
  await last;
  pending[0](result(15));
  await first;
  assert.equal(
    (node("#trend-chart").innerHTML.match(/class="chart-hit tip"/g) ?? [])
      .length,
    31,
  );
  assert.equal(vm.runInContext("chartHorizon", context), 30);
});

test("all 15/31 equal full date columns remain, including missing dates and workdays", () => {
  const context = vm.createContext({
    document: { querySelector: () => ({}), querySelectorAll: () => [] },
  });
  vm.runInContext(
    fs
      .readFileSync(new URL("../ota/public/app.js", import.meta.url), "utf8")
      .replace(/load\(\);\s*$/, ""),
    context,
  );
  for (const n of [15, 31]) {
    context.curve = Array.from({ length: n }, (_, i) => ({
      checkin: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
      myPrice: null,
      maximum: null,
      median: null,
      minimum: null,
    }));
    const html = vm.runInContext("chart(curve)", context);
    const hits = [
      ...html.matchAll(
        /class="chart-hit tip"[^>]*x="([\d.]+)"[^>]*width="([\d.]+)"/g,
      ),
    ];
    assert.equal(hits.length, n);
    hits.forEach((hit, i) => {
      assert.equal(Number(hit[1]), 60 + i * 64);
      assert.equal(Number(hit[2]), 64);
    });
    assert.equal((html.match(/class="date-text"/g) || []).length, n);
    assert.ok(html.includes(`min-width:${80 + n * 64}px`));
    assert.ok(html.includes(n === 31 ? "10/31" : "10/15"));
    assert.ok(!html.includes("<circle "));
    assert.ok(html.includes("我的酒店：—"));
  }
  assert.equal(
    vm.runInContext("dateLabel('2026-10-10','2026-10-01').color", context),
    "ordinary-date",
  );
  assert.equal(
    vm.runInContext("dateLabel('2026-10-10','2026-10-01').holiday", context),
    "调休上班",
  );
  assert.equal(
    vm.runInContext("dateLabel('2026-10-16','2026-10-01').holiday", context),
    "",
  );
});

test("floating tooltip follows pointer Y, flips sides, avoids the date column and stays inside plot", () => {
  const context = vm.createContext({
    document: { querySelector: () => ({}), querySelectorAll: () => [] },
  });
  vm.runInContext(
    fs
      .readFileSync(new URL("../ota/public/app.js", import.meta.url), "utf8")
      .replace(/load\(\);\s*$/, ""),
    context,
  );
  context.bounds = { left: 100, right: 1300, top: 100, bottom: 400 };
  let ys = [];
  for (const x of [200, 1200])
    for (const y of [101, 180, 399]) {
      context.pointer = { x, y };
      context.column = { left: x - 32, right: x + 32 };
      const p = vm.runInContext(
        "chartTipPosition(bounds,column,pointer,280,140)",
        context,
      );
      assert.ok(p.x >= 106 && p.x + 280 <= 1294);
      assert.ok(p.y >= 106 && p.y + 140 <= 394);
      assert.ok(x === 200 ? p.x >= 232 + 12 : p.x + 280 <= 1168 - 12);
      if (x === 200) ys.push(p.y);
    }
  assert.notEqual(ys[0], ys[1]);
  assert.notEqual(ys[1], ys[2]);
});
