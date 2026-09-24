(function () {
  'use strict';
  const VERSION = '1.0.11';
  const READER_KEY = '__LIVV_HOTEL_ASSISTANT_READER__';
  const supported = location.hostname === 'hotels.ctrip.com';

  const previousReader = globalThis[READER_KEY];
  if (previousReader?.listener) {
    chrome.runtime.onMessage.removeListener(previousReader.listener);
    if (previousReader.version !== VERSION) {
      console.log(`[酒店助手 v${VERSION}] Replaced previous reader: v${previousReader.version}`);
    }
  }

  function coverage(hotels) {
    return ['hotel_name','platform_hotel_id','display_price','score','review_count','room_name','breakfast','cancellation','activity_tags','discount_summary','original_price','latest_dynamic']
      .reduce((result, key) => {
        result[key] = hotels.filter((hotel) => {
          if (key === 'review_count') return Number.isInteger(hotel[key]) && hotel[key] >= 0;
          if (key === 'activity_tags') return Array.isArray(hotel[key]) && hotel[key].length > 0;
          return hotel[key] != null && hotel[key] !== '';
        }).length;
        return result;
      }, {});
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
      hotels.forEach((hotel) => {
        console.groupCollapsed(`[酒店助手 v${VERSION}] #${hotel.rank} ${hotel.hotel_name || '未命名酒店'}`);
        console.table({
          rank: hotel.rank, platform_hotel_id: hotel.platform_hotel_id, hotel_name: hotel.hotel_name,
          is_ad: hotel.is_ad, score: hotel.score, review_count: hotel.review_count, room_name: hotel.room_name,
          breakfast: hotel.breakfast, cancellation: hotel.cancellation, activity_tags: hotel.activity_tags?.join(' / '),
          discount_summary: hotel.discount_summary, original_price: hotel.original_price, display_price: hotel.display_price, latest_dynamic: hotel.latest_dynamic, dynamic: hotel.dynamic
        });
        console.groupEnd();
      });
      const fieldCoverage = coverage(hotels);
      console.log(`[酒店助手 v${VERSION}] Parse complete`, { hotel_count: hotels.length });
      console.table(fieldCoverage);
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
