(function () {
  'use strict';
  const VERSION = '1.0.30';
  const READER_KEY = '__LIVV_HOTEL_ASSISTANT_READER__';
  const supported = location.hostname === 'hotels.ctrip.com';

  const previousReader = globalThis[READER_KEY];
  if (previousReader?.listener) {
    chrome.runtime.onMessage.removeListener(previousReader.listener);
    if (previousReader.version !== VERSION) {
      console.log(`[酒店助手 v${VERSION}] Replaced previous reader: v${previousReader.version}`);
    }
  }

  function readerListener(message, _sender, sendResponse) {
    if (message?.type !== 'LIVV_READ_CURRENT_PAGE') return false;
    if (!supported) {
      sendResponse({ ok: false, reason: 'unsupported_host' });
      return false;
    }
    try {
      const pageContext = LivvCtripParser.parsePageContext(document, location.href);
      console.log(`[酒店助手 v${VERSION}] Page detected`, { platform: 'ctrip', page_type: 'hotel_list' });
      console.log(`[酒店助手 v${VERSION}] Page context`, {
        city: pageContext.city, checkin: pageContext.checkin, checkout: pageContext.checkout,
        keyword: pageContext.keyword, url: pageContext.url
      });
      const cardMetadata = LivvCtripParser.findHotelCards(document);
      const observedAt = new Date().toISOString();
      const hotels = cardMetadata.map((metadata, index) => {
        const hotel = LivvCtripParser.parseHotelCard(metadata, index + 1);
        return { ...hotel, dynamic: LivvDynamicSemantic.parseDynamic(hotel.latest_dynamic, observedAt) };
      });
      console.log(`[酒店助手 v${VERSION}] Hotel cards detected: ${hotels.length}`);
      console.log(`[酒店助手 v${VERSION}] Parse complete`, { hotel_count: hotels.length });
      sendResponse({ ok: true, page_context: pageContext, hotels, hotel_count: hotels.length });
    } catch (error) {
      sendResponse({ ok: false, reason: 'parser_error', message: error?.message || '解析失败' });
    }
    return true;
  }

  chrome.runtime.onMessage.addListener(readerListener);
  globalThis[READER_KEY] = { version: VERSION, listener: readerListener };
  console.log(`[酒店助手 v${VERSION}] Reader ready`);

})();
