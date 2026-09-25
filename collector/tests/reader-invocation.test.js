const assert = require('assert');
const { createReaderInvocation } = require('../shared/reader-invocation.js');

const calls = [];
const tabs = new Map([[7, { id: 7, url: 'https://hotels.ctrip.com/hotels/list', status: 'complete' }]]);
const chromeApi = {
  tabs: {
    async get(id) { return tabs.get(id); },
    async sendMessage(id, message) {
      calls.push({ id, message });
      assert.strictEqual(id, 7);
      assert.strictEqual(message.type, 'LIVV_READ_CURRENT_PAGE');
      return { ok: true, hotel_count: 13, hotels: [{}], page_context: { city: '咸宁' } };
    }
  },
  scripting: {
    async executeScript(details) {
      assert.strictEqual(details.target.tabId, 7);
      assert.deepStrictEqual(details.files, [
        'platforms/ctrip/parser.js',
        'platforms/ctrip/semantic.js',
        'content/ctrip-reader.js'
      ]);
      return [{}];
    }
  }
};

(async () => {
  const reader = createReaderInvocation(chromeApi);
  const result = await reader.readCurrentPage(7);
  assert.strictEqual(result.hotel_count, 13);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].message.type, 'LIVV_READ_CURRENT_PAGE');

  const empty = await createReaderInvocation({
    tabs: { async get() { return tabs.get(7); }, async sendMessage() { return { ok: true, hotel_count: 13, hotels: [] }; } },
    scripting: { async executeScript() { return [{}]; } }
  }).readCurrentPage(7);
  assert.strictEqual(empty.error.code, 'READER_EMPTY_RESULT');

  const injection = await createReaderInvocation({
    tabs: { async get() { throw new Error('No tab with id: 7'); } },
    scripting: { async executeScript() { return [{}]; } }
  }).readCurrentPage(7);
  assert.strictEqual(injection.error.code, 'READER_INJECTION_FAILED');

  const noResponse = await createReaderInvocation({
    tabs: { async get() { return tabs.get(7); }, async sendMessage() { throw new Error('Could not establish connection. Receiving end does not exist.'); } },
    scripting: { async executeScript() { return [{}]; } }
  }).readCurrentPage(7);
  assert.strictEqual(noResponse.error.code, 'READER_NO_RESPONSE');
  console.log('reader invocation tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
