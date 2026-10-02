import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function fixture(hotels) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector))
      nodes.set(selector, {
        innerHTML: "",
        textContent: "",
        hidden: false,
        querySelectorAll: () => [],
        querySelector: () => null,
      });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [] },
    fetch: () => {
      throw Error("Local list search must not fetch");
    },
  });
  const source = fs
    .readFileSync(new URL("../ota/public/app.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\n/, "")
    .replace(/load\(\);\s*$/, "");
  vm.runInContext(source, context);
  context.data = { platform: "ctrip", hotels };
  vm.runInContext("marketData = data", context);
  const render = (query, category) => {
    context.query = query;
    vm.runInContext("marketHotelQuery = query", context);
    if (category !== undefined) {
      context.category = category;
      vm.runInContext("renderMarketHotels(category)", context);
    } else vm.runInContext("renderMarketHotels()", context);
    return node("#hotel-table").innerHTML;
  };
  return { render, node };
}

const hotels = [
  {
    platform: "ctrip",
    hotel_id: "111",
    hotel_name: "平台原名",
    standard_name: "Alpha Hotel",
    standard_hotel_id: "mapped",
    category: "mine",
    rank: 1,
    display_price: 0,
  },
  {
    platform: "fixture",
    hotel_id: "ABC222",
    hotel_name: "第二平台原名",
    standard_name: "Alpha Hotel",
    standard_hotel_id: "mapped",
    category: "mine",
    rank: 2,
    display_price: null,
  },
  {
    platform: "ctrip",
    hotel_id: "333",
    hotel_name: "竞品原名",
    standard_name: "竞品酒店",
    category: "core",
    rank: 3,
    display_price: 100,
  },
];

test("market search matches names and IDs without fetching, keeps mapped platform cells, real zero and missing prices", () => {
  const before = JSON.stringify(hotels);
  const f = fixture(hotels);
  for (const query of [" alpha ", "平台原名", "abc222", "111"]) {
    const html = f.render(query);
    assert.match(html, /Alpha Hotel/);
    assert.doesNotMatch(html, /竞品酒店/);
    assert.match(html, /Hotel ID: 111/);
    assert.match(html, /Hotel ID: ABC222/);
    assert.match(html, /¥0/);
    assert.match(html, /起售价: —/);
    assert.equal(
      f.node("#hotel-result-count").textContent,
      "显示 1 / 2 家酒店",
    );
  }
  assert.equal(JSON.stringify(hotels), before);
});

test("market search composes with category, treats special characters literally and distinguishes empty snapshots", () => {
  const f = fixture(hotels);
  assert.match(f.render("333", "mine"), /没有匹配的酒店/);
  assert.equal(f.node("#hotel-result-count").textContent, "显示 0 / 1 家酒店");
  assert.match(f.render("Alpha"), /Alpha Hotel/); // retains selected category
  assert.match(f.render("<script>"), /没有匹配的酒店/);
  assert.equal(f.node("#hotel-search-clear").hidden, false);
  assert.match(f.render("", ""), /竞品酒店/);
  assert.equal(f.node("#hotel-result-count").textContent, "显示 2 / 2 家酒店");
  assert.equal(f.node("#hotel-search-clear").hidden, true);
  assert.match(fixture([]).render("anything"), /暂无真实数据/);
});
