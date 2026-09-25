const assert = require('assert');
const { createDirectReader } = require('../shared/direct-reader.js');

(async () => {
  const calls = [];
  let injected = false;
  const chromeApi = { scripting: { async executeScript(details) {
    calls.push(details);
    if (details.files) { injected = true; return [{}]; }
    assert.strictEqual(injected, true);
    return [{ result: { ok: true, context: { city: '咸宁' }, page_context: { city: '咸宁' }, hotel_count: 1, hotels: [{ hotel_name: '测试酒店' }] } }];
  } } };
  const ids = [];
  const reader = createDirectReader(chromeApi, { assertTabId(tabId) { ids.push(tabId); if (tabId !== 17) throw new Error('wrong tab'); } });
  const result = await reader.readManagedPageOnce(17);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.hotel_count, 1);
  assert.deepStrictEqual(result.context, result.page_context);
  assert.deepStrictEqual(ids, [17]);
  assert.deepStrictEqual(calls[0].files, ['platforms/ctrip/parser.js', 'platforms/ctrip/semantic.js']);
  assert.strictEqual(calls.some((call) => call.method === 'sendMessage'), false);

  const emptyReader = createDirectReader({ scripting: { async executeScript(details) {
    if (details.files) return [{}];
    return [{ result: { ok: true, hotel_count: 0, hotels: [], page_context: {} } }];
  } } });
  const empty = await emptyReader.readManagedPageOnce(17);
  assert.strictEqual(empty.error.code, 'DIRECT_EMPTY_RESULT');

  const failed = createDirectReader({ scripting: { async executeScript() { throw new Error('blocked'); } } });
  const failure = await failed.readManagedPageOnce(17);
  assert.strictEqual(failure.error.code, 'DIRECT_INJECTION_FAILED');
  await assert.rejects(() => reader.readManagedPageOnce(18), /wrong tab/);
  console.log('direct reader tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
