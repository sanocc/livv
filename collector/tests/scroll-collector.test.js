const assert = require('assert');
const { createCollector, mergeHotel, normalizeLimit } = require('../platforms/ctrip/scroll-collector.js');
const { createDetector } = require('../platforms/ctrip/completion-detector.js');

function makeHarness(ids, options = {}) {
  let current = ids.slice();
  let scrollY = 0;
  const doc = { documentElement: { scrollHeight: 2400, clientHeight: 800 }, body: { scrollHeight: 2400 }, querySelectorAll() { return []; } };
  const win = { innerHeight: 800, scrollY: 0, location: { hostname: 'hotels.ctrip.com', href: 'https://hotels.ctrip.com/hotels/list' }, scrollBy({ top }) { scrollY = Math.min(scrollY + top, doc.documentElement.scrollHeight - this.innerHeight); this.scrollY = scrollY; } };
  const parser = { findHotelCards: () => current.map((id) => ({ id })), parseHotelCard: (item, rank) => ({ platform: 'ctrip', platform_hotel_id: item.id, hotel_name: `Hotel ${item.id}`, rank }) };
  const reportedTotal = options.reportedTotal ?? 99;
  const observer = { observeResultState: () => ({ page_reported_total: reportedTotal, loading_indicator_present: false }) };
  const completionDetector = createDetector({ config: { stableWindowMs: 0, nearBottomThreshold: 100 } });
  const collector = createCollector({ document: doc, window: win, parser, observer, completionDetector, config: { ...options, stableMs: 0, pollMs: 0 } });
  return { collector, setIds(next) { current = next.slice(); }, win };
}

(async () => {
  assert.strictEqual(normalizeLimit(30), 30);
  assert.strictEqual(normalizeLimit(200), 200);
  assert.strictEqual(normalizeLimit(0), null);
  assert.strictEqual(normalizeLimit(-1), null);
  assert.strictEqual(normalizeLimit(201), null);
  assert.strictEqual(normalizeLimit(30.5), null);

  const harness = makeHarness(['A', 'B']);
  const started = harness.collector.start({ sessionKey: '', collection_limit: 30 });
  assert.strictEqual(started.ok, true);
  harness.setIds(['B', 'C']);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const result = harness.collector.getResult();
  assert.deepStrictEqual(result.hotels.map((hotel) => hotel.platform_hotel_id), ['A', 'B', 'C']);
  assert.ok(['completed', 'stopped'].includes(result.status));
  assert.deepStrictEqual(result.hotels.map((hotel) => hotel.collection_rank), [1, 2, 3]);

  const limited = makeHarness(['A', 'B', 'C', 'D']);
  assert.strictEqual(limited.collector.start({ sessionKey: '', collection_limit: 3 }).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const limitedResult = limited.collector.getResult();
  assert.strictEqual(limitedResult.collection_limit, 3);
  assert.strictEqual(limitedResult.collected_count, 3);
  assert.strictEqual(limitedResult.reason, 'TARGET_REACHED');
  assert.deepStrictEqual(limitedResult.hotels.map((hotel) => hotel.platform_hotel_id), ['A', 'B', 'C']);
  assert.strictEqual(limited.collector.start({ sessionKey: '', collection_limit: 0 }).error.code, 'INVALID_COLLECTION_LIMIT');

  async function assertTargetIgnoresReportedTotal(reportedTotal, limit) {
    const ids = Array.from({ length: limit + 5 }, (_, index) => `R${index + 1}`);
    const task = makeHarness(ids, { reportedTotal });
    assert.strictEqual(task.collector.start({ sessionKey: '', collection_limit: limit }).ok, true);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const output = task.collector.getResult();
    assert.strictEqual(output.reported_total, reportedTotal);
    assert.strictEqual(output.collected_count, limit);
    assert.strictEqual(output.reason, 'TARGET_REACHED');
  }

  await assertTargetIgnoresReportedTotal(1, 30);
  await assertTargetIgnoresReportedTotal(10, 30);
  await assertTargetIgnoresReportedTotal(259, 30);
  await assertTargetIgnoresReportedTotal(2787, 30);
  await assertTargetIgnoresReportedTotal(2787, 200);

  const exhausted = makeHarness(['ONLY'], { reportedTotal: 1 });
  exhausted.collector.start({ sessionKey: '', collection_limit: 30 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.strictEqual(exhausted.collector.getResult().reason, 'PAGE_EXHAUSTED');

  const pausable = makeHarness(['P', 'Q']);
  pausable.collector.start({ sessionKey: '', collection_limit: 30 });
  const paused = pausable.collector.pause();
  assert.strictEqual(paused.status, 'paused');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const pausedResult = pausable.collector.getResult();
  assert.strictEqual(pausedResult.status, 'paused');
  const pausedIterations = pausedResult.iterations;
  pausable.setIds(['Q', 'R']);
  assert.strictEqual(pausable.collector.resume({ sessionKey: '', collection_limit: 30 }).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const resumedResult = pausable.collector.getResult();
  assert.ok(resumedResult.iterations > pausedIterations);
  assert.deepStrictEqual(resumedResult.hotels.map((hotel) => hotel.platform_hotel_id), ['P', 'Q', 'R']);

  const mismatch = makeHarness(['M']);
  mismatch.collector.start({ sessionKey: '', collection_limit: 30 });
  mismatch.collector.pause();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const mismatchResult = mismatch.collector.resume({ sessionKey: '', collection_limit: 200 });
  assert.strictEqual(mismatchResult.reason, 'SESSION_CHANGED');
  assert.strictEqual(mismatch.collector.getResult().status, 'stopped');

  const stoppable = makeHarness(['X', 'Y'], { documentHeight: 100000 });
  stoppable.collector.start({ sessionKey: '', collection_limit: 30 });
  stoppable.collector.stop();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(stoppable.collector.getResult().status, 'stopped');

  const panelClosed = makeHarness(['Z']);
  panelClosed.collector.start({ sessionKey: '', collection_limit: 30 });
  panelClosed.collector.stop('PANEL_CLOSED');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(panelClosed.collector.getResult().reason, 'PANEL_CLOSED');

  assert.deepStrictEqual(Object.keys(mergeHotel({ platform_hotel_id: '1', score: 4.5, breakfast: null }, { platform_hotel_id: '1', score: null, breakfast: '包早餐' })).sort(), ['breakfast', 'platform_hotel_id', 'score']);

  const safetyLimited = makeHarness(['A'], { maxIterations: 0 });
  safetyLimited.collector.start({ sessionKey: '', collection_limit: 30 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(safetyLimited.collector.getResult().reason, 'SAFETY_LIMIT');

  console.log('scroll collector tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
