(function (root) {
  'use strict';

  const INJECTION_FILES = [
    'platforms/ctrip/parser.js',
    'platforms/ctrip/semantic.js',
    'content/ctrip-reader.js'
  ];

  function classifyError(error, fallback = 'READER_EXECUTION_FAILED') {
    const message = String(error?.message || error || '');
    if (/Receiving end does not exist|Could not establish connection|message port closed|No tab with id/i.test(message)) {
      return { code: 'READER_NO_RESPONSE', message: message || 'Reader did not respond' };
    }
    return { code: fallback, message: message || fallback };
  }

  function createReaderInvocation(chromeApi = root.chrome) {
    async function readCurrentPage(tabId) {
      if (!Number.isInteger(tabId)) {
        return { ok: false, error: { code: 'READER_INJECTION_FAILED', message: 'A concrete tabId is required' } };
      }
      let tab;
      try {
        tab = await chromeApi.tabs.get(tabId);
        if (!tab?.url?.startsWith('https://hotels.ctrip.com/')) {
          return { ok: false, error: { code: 'READER_INJECTION_FAILED', message: 'Unsupported or unavailable Ctrip tab' } };
        }
        await chromeApi.scripting.executeScript({ target: { tabId }, files: INJECTION_FILES });
      } catch (error) {
        const classified = classifyError(error, 'INJECTION_FAILED');
        return { ok: false, error: { ...classified, code: 'READER_INJECTION_FAILED' } };
      }
      let response;
      try {
        response = await chromeApi.tabs.sendMessage(tabId, { type: 'LIVV_READ_CURRENT_PAGE' });
      } catch (error) {
        const classified = classifyError(error, 'READER_EXECUTION_FAILED');
        return { ok: false, error: classified.code === 'READER_NO_RESPONSE' ? classified : { ...classified, code: 'READER_EXECUTION_FAILED' } };
      }
      if (!response) return { ok: false, error: { code: 'READER_NO_RESPONSE', message: 'Reader returned no response' } };
      if (!response.ok) return { ok: false, error: { code: 'READER_EXECUTION_FAILED', message: response.error || 'Reader returned a failure' } };
      if (!Number.isInteger(response.hotel_count) || response.hotel_count <= 0
        || !Array.isArray(response.hotels) || response.hotels.length <= 0) {
        return { ok: false, error: { code: 'READER_EMPTY_RESULT', message: 'Reader returned no hotel cards' }, snapshot: response };
      }
      return response;
    }

    return { readCurrentPage, injectionFiles: [...INJECTION_FILES] };
  }

  const api = { createReaderInvocation, classifyError, injectionFiles: [...INJECTION_FILES] };
  root.LivvReaderInvocation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
