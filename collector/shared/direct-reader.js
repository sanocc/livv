(function (root) {
  'use strict';

  const INJECTION_FILES = [
    'platforms/ctrip/parser.js',
    'platforms/ctrip/semantic.js'
  ];

  function errorResult(code, error) {
    return { ok: false, error: { code, message: String(error?.message || error || code) } };
  }

  function createDirectReader(chromeApi = root.chrome, { assertTabId = () => {} } = {}) {
    async function readManagedPageOnce(tabId) {
      assertTabId(tabId, 'direct reader');
      try {
        await chromeApi.scripting.executeScript({ target: { tabId }, files: INJECTION_FILES });
      } catch (error) {
        return errorResult('DIRECT_INJECTION_FAILED', error);
      }
      try {
        const [{ result }] = await chromeApi.scripting.executeScript({
          target: { tabId },
          func: () => {
            try {
              const parser = globalThis.LivvCtripParser;
              const semantic = globalThis.LivvDynamicSemantic;
              if (!parser || !semantic) throw new Error('Ctrip parser or semantic layer unavailable');
              const page_context = parser.parsePageContext(document, location.href);
              const metadata = parser.findHotelCards(document);
              const observedAt = new Date().toISOString();
              const hotels = metadata.map((item, index) => {
                const hotel = parser.parseHotelCard(item, index + 1);
                return { ...hotel, dynamic: semantic.parseDynamic(hotel.latest_dynamic, observedAt) };
              });
              return { ok: true, context: page_context, page_context, hotels, hotel_count: hotels.length };
            } catch (error) {
              return { ok: false, error: { code: 'DIRECT_EXECUTION_FAILED', message: String(error?.message || error) } };
            }
          }
        });
        if (!result || result.ok === false) return result || errorResult('DIRECT_EXECUTION_FAILED', 'No direct read result');
        if (!Number.isInteger(result.hotel_count) || result.hotel_count <= 0 || !Array.isArray(result.hotels) || result.hotels.length <= 0) {
          return { ...result, ok: false, error: { code: 'DIRECT_EMPTY_RESULT', message: 'Direct read returned no hotel cards' } };
        }
        return result;
      } catch (error) {
        return errorResult('DIRECT_EXECUTION_FAILED', error);
      }
    }

    return { readManagedPageOnce, injectionFiles: [...INJECTION_FILES] };
  }

  const api = { createDirectReader, injectionFiles: [...INJECTION_FILES] };
  root.LivvDirectReader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
