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
