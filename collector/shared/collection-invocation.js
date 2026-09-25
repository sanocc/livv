(function (root) {
  'use strict';

  const INJECTION_FILES = [
    'platforms/ctrip/parser.js',
    'platforms/ctrip/semantic.js',
    'platforms/ctrip/result-observer.js',
    'platforms/ctrip/completion-detector.js',
    'platforms/ctrip/scroll-collector.js'
  ];

  function createCollectionInvocation(chromeApi = root.chrome, { assertTabId = () => {} } = {}) {
    async function startCollection(tabId, { sessionKey, collectionLimit, executionMode = 'manual' } = {}) {
      assertTabId(tabId, 'collection start');
      await chromeApi.scripting.executeScript({ target: { tabId }, files: INJECTION_FILES });
      const [{ result }] = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: (session, limit, mode) => globalThis.LivvCtripScrollCollector?.start({
          sessionKey: session,
          collection_limit: limit,
          execution_mode: mode
        }) || null,
        args: [sessionKey, collectionLimit, executionMode]
      });
      return result;
    }

    return { startCollection, injectionFiles: [...INJECTION_FILES] };
  }

  const api = { createCollectionInvocation, injectionFiles: [...INJECTION_FILES] };
  root.LivvCollectionInvocation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
