const assert = require('assert');
const semantic = require('../platforms/ctrip/semantic.js');

const observed = '2026-09-24T18:23:00+08:00';
const booking = (raw, event, precision, value, unit) => {
  const result = semantic.parseDynamic(raw, observed);
  assert.strictEqual(result.type, 'booking');
  assert.strictEqual(result.raw_text, raw);
  assert.strictEqual(result.event_at_estimated, event);
  assert.strictEqual(result.precision, precision);
  assert.strictEqual(result.is_estimated, true);
  assert.strictEqual(result.value, value);
  assert.strictEqual(result.metadata.unit, unit);
};

booking('5分钟前有人预订', '2026-09-24T10:18:00.000Z', 'minute', 5, 'minute');
booking('57分钟前有人预订', '2026-09-24T09:26:00.000Z', 'minute', 57, 'minute');
booking('1小时前有人预订', '2026-09-24T09:23:00.000Z', 'hour', 1, 'hour');
booking('4小时前有人预订', '2026-09-24T06:23:00.000Z', 'hour', 4, 'hour');
booking('2天前有人预订', '2026-09-22T10:23:00.000Z', 'day', 2, 'day');

assert.strictEqual(semantic.parseDynamic('刚刚有人预订', observed).precision, 'immediate');
assert.deepStrictEqual(semantic.parseDynamic('热卖！低价房仅剩1间', observed), {
  type: 'scarcity', raw_text: '热卖！低价房仅剩1间', observed_at: '2026-09-24T10:23:00.000Z',
  event_at_estimated: null, precision: null, is_estimated: false, value: 1,
  metadata: { remaining_rooms: 1 }
});
assert.strictEqual(semantic.parseDynamic('连续21位住客好评', observed).metadata.positive_guest_count, 21);
assert.strictEqual(semantic.parseDynamic('新的动态文案', observed).type, 'unknown');
assert.strictEqual(semantic.parseDynamic(null, observed), null);

console.log('semantic tests passed');
