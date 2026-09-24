const assert = require('assert');
const { formatRelativeDynamicTime } = require('../platforms/ctrip/semantic.js');

const event = '2026-09-24T10:18:00Z';
assert.strictEqual(formatRelativeDynamicTime(event, '2026-09-24T10:18:30Z'), '刚刚有人预订');
assert.strictEqual(formatRelativeDynamicTime(event, '2026-09-24T10:23:00Z'), '5分钟前有人预订');
assert.strictEqual(formatRelativeDynamicTime(event, '2026-09-24T11:17:00Z'), '59分钟前有人预订');
assert.strictEqual(formatRelativeDynamicTime(event, '2026-09-24T11:18:00Z'), '1小时前有人预订');
assert.strictEqual(formatRelativeDynamicTime(event, '2026-09-25T10:17:00Z'), '23小时前有人预订');
assert.strictEqual(formatRelativeDynamicTime(event, '2026-09-25T10:18:00Z'), '1天前有人预订');
assert.strictEqual(formatRelativeDynamicTime(event, '2026-09-26T10:18:00Z'), '2天前有人预订');

console.log('relative time tests passed');
