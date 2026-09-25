const assert = require('assert');
const { createCollector, mergeHotel } = require('../platforms/ctrip/scroll-collector.js');

function makeHarness(ids, options = {}) {
  let current = ids.slice();
  let scrollY = 0;
  const doc = { documentElement: { scrollHeight: 2400, clientHeight: 800 }, body: { scrollHeight: 2400 }, querySelectorAll() { return []; } };
  const win = { innerHeight: 800, scrollY: 0, location: { hostname: 'hotels.ctrip.com', href: 'https://hotels.ctrip.com/hotels/list' }, scrollBy({ top }) { scrollY += top; this.scrollY = scrollY; } };
  const parser = { findHotelCards: () => current.map((id) => ({ id })), parseHotelCard: (item, rank) => ({ platform: 'ctrip', platform_hotel_id: item.id, hotel_name: `Hotel ${item.id}`, rank }) };
  const observer = { observeResultState: () => ({ page_reported_total: 99, loading_indicator_present: false }) };
  const collector = createCollector({ document: doc, window: win, parser, observer, config: { ...options, stableMs: 0, pollMs: 0, zeroNewStreakLimit: 3 } });
  return { collector, setIds(next) { current = next.slice(); }, win };
}

(async () => {
  const harness = makeHarness(['A', 'B']);
  const started = harness.collector.start({ sessionKey: '' });
  assert.strictEqual(started.ok, true);
  harness.setIds(['B', 'C']);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const result = harness.collector.getResult();
  assert.deepStrictEqual(result.hotels.map((hotel) => hotel.platform_hotel_id), ['A', 'B', 'C']);
  assert.ok(['completed', 'stopped'].includes(result.status));

  const pausable = makeHarness(['P', 'Q']);
  pausable.collector.start({ sessionKey: '' });
  const paused = pausable.collector.pause();
  assert.strictEqual(paused.status, 'paused');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const pausedResult = pausable.collector.getResult();
  assert.strictEqual(pausedResult.status, 'paused');
  const pausedIterations = pausedResult.iterations;
  pausable.setIds(['Q', 'R']);
  assert.strictEqual(pausable.collector.resume({ sessionKey: '' }).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const resumedResult = pausable.collector.getResult();
  assert.ok(resumedResult.iterations > pausedIterations);
  assert.deepStrictEqual(resumedResult.hotels.map((hotel) => hotel.platform_hotel_id), ['P', 'Q', 'R']);

  const mismatch = makeHarness(['M']);
  mismatch.collector.start({ sessionKey: '' });
  mismatch.collector.pause();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const mismatchResult = mismatch.collector.resume({ sessionKey: 'changed' });
  assert.strictEqual(mismatchResult.reason, 'SESSION_CHANGED');
  assert.strictEqual(mismatch.collector.getResult().status, 'stopped');

  const stoppable = makeHarness(['X', 'Y'], { documentHeight: 100000 });
  stoppable.collector.start({ sessionKey: '' });
  stoppable.collector.stop();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(stoppable.collector.getResult().status, 'stopped');

  const panelClosed = makeHarness(['Z']);
  panelClosed.collector.start({ sessionKey: '' });
  panelClosed.collector.stop('PANEL_CLOSED');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(panelClosed.collector.getResult().reason, 'PANEL_CLOSED');

  assert.deepStrictEqual(Object.keys(mergeHotel({ platform_hotel_id: '1', score: 4.5, breakfast: null }, { platform_hotel_id: '1', score: null, breakfast: '包早餐' })).sort(), ['breakfast', 'platform_hotel_id', 'score']);

  const limited = makeHarness(['A'], { maxIterations: 0 });
  limited.collector.start({ sessionKey: '' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(limited.collector.getResult().reason, 'SAFETY_LIMIT');

  console.log('scroll collector tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
