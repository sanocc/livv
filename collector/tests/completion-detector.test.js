const assert = require('assert');
const { createDetector } = require('../platforms/ctrip/completion-detector.js');

function sample(overrides = {}) {
  return {
    scroll_y: 1000, viewport_height: 800, document_height: 1800,
    current_dom_ids: ['A', 'B'], cumulative_unique: 20, added_count: 0,
    loading_indicator_present: false, ...overrides
  };
}

let clock = 0;
const detector = createDetector({ now: () => clock, config: { stableWindowMs: 3000, nearBottomThreshold: 100 } });
let result = detector.observe(sample());
assert.strictEqual(result.status, 'WAIT');
assert.strictEqual(result.reason, 'BOTTOM_PROBE');

clock = 1000;
result = detector.observe(sample({ document_height: 2200, current_dom_ids: ['A', 'B', 'C'], cumulative_unique: 21, added_count: 1 }));
assert.strictEqual(result.status, 'WAIT');
assert.strictEqual(result.reason, 'BOTTOM_PROBE');

clock = 1200;
result = detector.observe(sample({ document_height: 2200, current_dom_ids: ['B', 'C'], cumulative_unique: 21 }));
assert.strictEqual(result.status, 'WAIT');
clock = 2500;
result = detector.observe(sample({ document_height: 2200, current_dom_ids: ['B', 'C'], cumulative_unique: 21 }));
assert.strictEqual(result.status, 'WAIT');
clock = 5500;
result = detector.observe(sample({ document_height: 2200, current_dom_ids: ['B', 'C'], cumulative_unique: 21 }));
assert.strictEqual(result.status, 'COMPLETED');
assert.strictEqual(result.reason, 'BOTTOM_STABLE');

detector.reset();
clock = 0;
assert.strictEqual(detector.observe(sample({ loading_indicator_present: true })).status, 'WAIT');
assert.strictEqual(detector.observe(sample({ end_marker_present: true })).reason, 'END_MARKER');

detector.reset();
detector.observe(sample());
detector.pause();
clock = 10000;
assert.strictEqual(detector.observe(sample()).reason, 'PAUSED');
detector.resume();
assert.strictEqual(detector.observe(sample()).status, 'WAIT');
assert.ok(detector.observe(sample()).stable_for_ms < 3000);

console.log('completion detector tests passed');
