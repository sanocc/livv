import test from "node:test";
import assert from "node:assert/strict";
import { detailLink } from "../helper/mobile.js";

function fixture(ids, mode = "exposure", nested = false) {
  const clicks = [];
  const cards = ids.map((id) => ({
    nodeType: 1,
    tagName: "DIV",
    parentElement: null,
    getAttribute: (key) =>
      key === "data-exposure" && mode === "exposure"
        ? JSON.stringify({ data: { masterhotelid: id } })
        : key === "data-hotelid" && mode === "attribute"
          ? id
          : null,
    querySelector: (selector) =>
      mode === "image" && selector.includes(`=${id}&`) ? {} : null,
    scrollIntoView: () => clicks.push(id),
    getBoundingClientRect: () => ({ x: 10, y: 20, width: 100, height: 60 }),
  }));
  const root = { scrollTop: 0, scrollHeight: 5000, clientHeight: 800 };
  const inner = { scrollTop: 0, scrollHeight: 4000, clientHeight: 600 };
  globalThis.document = {
    readyState: "complete",
    scrollingElement: root,
    querySelectorAll: (selector) =>
      selector === "div" ? (nested ? [inner] : []) : cards,
  };
  globalThis.getComputedStyle = () => ({ overflowY: "auto" });
  return { cards, root, inner, clicks };
}

test("return list first batch omits Vienna: restore entry, then click only frozen ID", () => {
  const f = fixture(["2114264", "6422421"]);
  const r = detailLink("6955433", 2000);
  assert.equal(r.pending, true);
  assert.deepEqual(r.diagnostic, {
    hotel_id: "6955433",
    ready_state: "complete",
    cards: 2,
  });
  assert.equal(f.root.scrollTop, 640);
  assert.deepEqual(f.clicks, []);
  const loaded = fixture(["2114264", "6422421", "6955433"]);
  const action = detailLink("6955433", 4000);
  assert.equal(action.action.type, "click");
  assert.deepEqual(loaded.clicks, ["6955433"]);
  assert.equal(loaded.root.scrollTop, 0);
});

test("missing entry scrolls nested list but terminates at 45 seconds", () => {
  const f = fixture(["69554330"], "exposure", true);
  assert.equal(detailLink("6955433", 44999).pending, true);
  assert.equal(f.inner.scrollTop, 500);
  assert.equal(f.root.scrollTop, 0);
  const r = detailLink("6955433", 45000);
  assert.equal(r.error, "DETAIL_CARD_NOT_FOUND");
  assert.equal(r.pending, undefined);
  assert.equal(f.inner.scrollTop, 500);
  assert.deepEqual(f.clicks, []);
});

test("existing mine/core and legacy identity paths still open immediately", () => {
  for (const mode of ["exposure", "attribute", "image"])
    for (const id of ["2114264", "6422421", "6955433"]) {
      const f = fixture([id], mode);
      assert.deepEqual(detailLink(id, 0).action, {
        type: "click",
        selector: "div:nth-of-type(1)",
        x: 60,
        y: 50,
      });
      assert.deepEqual(f.clicks, [id]);
      assert.equal(f.root.scrollTop, 0);
    }
});
