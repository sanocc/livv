const assert = require('assert');
const observer = require('../platforms/ctrip/result-observer.js');

function card(id) { return { platform_hotel_id: id }; }
function makeDocument(ids, text = '找到909家酒店') {
  const cards = ids.map(card);
  return {
    body: { textContent: text, scrollHeight: 1800 },
    documentElement: { scrollHeight: 1800, clientHeight: 800 },
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    querySelectorAll(selector) {
      if (selector.includes('button') || selector.includes('[role="button"]') || selector === 'a') return [];
      if (selector === 'body *') return [];
      return [];
    },
    querySelector() { return null; },
    _cards: cards
  };
}

const root = { scrollY: 0, innerHeight: 800 };
const first = makeDocument(['1', '2', '3']);
global.LivvCtripParser = { findHotelCards: () => first._cards };
const api = observer.createObserver({ document: first, window: root });
let snapshot = api.observeResultState();
assert.strictEqual(snapshot.page_reported_total, 909);
assert.strictEqual(snapshot.current_dom_hotel_count, 3);
assert.strictEqual(snapshot.discovered_unique_hotels, 3);
assert.deepStrictEqual(snapshot.added_ids, ['1', '2', '3']);

const second = makeDocument(['2', '3', '4', '5']);
global.LivvCtripParser.findHotelCards = () => second._cards;
root.scrollY = 600;
snapshot = api.observeResultState();
assert.strictEqual(snapshot.discovered_unique_hotels, 5);
assert.deepStrictEqual(snapshot.added_ids, ['4', '5']);
assert.deepStrictEqual(snapshot.removed_ids, ['1']);
assert.deepStrictEqual(snapshot.retained_ids, ['2', '3']);
assert.strictEqual(snapshot.scroll_y, 600);

api.reset();
global.LivvCtripParser.findHotelCards = () => second._cards;
snapshot = api.observeResultState();
assert.strictEqual(snapshot.snapshot_index, 1);
assert.strictEqual(snapshot.discovered_unique_hotels, 4);
assert.deepStrictEqual(snapshot.added_ids, ['2', '3', '4', '5']);
assert.strictEqual(observer.parseReportedTotal('找到1,209家酒店'), 1209);
assert.strictEqual(observer.parseReportedTotal('暂无酒店'), null);
console.log('result observer tests passed');
