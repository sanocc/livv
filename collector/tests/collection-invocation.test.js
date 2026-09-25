const assert = require('assert');
const { createCollectionInvocation } = require('../shared/collection-invocation.js');

const calls = [];
const chromeApi = {
  scripting: {
    async executeScript(details) {
      calls.push(details);
      if (details.func) return [{ result: { ok: true, status: 'running' } }];
      return [{}];
    }
  }
};

(async () => {
  const invocation = createCollectionInvocation(chromeApi, {
    assertTabId(tabId) { assert.strictEqual(tabId, 77); }
  });
  const result = await invocation.startCollection(77, {
    sessionKey: '咸宁|2026-10-01|2026-10-02|中心花坛',
    collectionLimit: 30,
    executionMode: 'managed'
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(calls[0].files, invocation.injectionFiles);
  assert.deepStrictEqual(calls[1].args, ['咸宁|2026-10-01|2026-10-02|中心花坛', 30, 'managed']);
  console.log('collection invocation tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
