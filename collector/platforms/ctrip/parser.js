(function (root) {
  'use strict';

  function normalizeText(value) {
    return value == null ? null : String(value).replace(/\s+/g, ' ').trim() || null;
  }

  function firstText(element, selectors) {
    for (const selector of selectors) {
      const node = element && element.querySelector(selector);
      const value = normalizeText(node && (node.textContent || node.getAttribute('aria-label')));
      if (value) return value;
    }
    return null;
  }

  function firstMatch(element, selectors) {
    for (const selector of selectors) {
      const node = element && element.querySelector(selector);
      const value = normalizeText(node && (node.textContent || node.getAttribute('aria-label')));
      if (value) return { value, node, selector };
    }
    return null;
  }

  function exactTextMatch(element, values) {
    const wanted = new Set(values);
    const nodes = element && element.querySelectorAll ? Array.from(element.querySelectorAll('*')) : [];
    for (const node of nodes) {
      const value = normalizeText(node.textContent || node.getAttribute('aria-label'));
      if (value && wanted.has(value)) return { value, node, selector: `exact text node: ${value}` };
    }
    return null;
  }

  function allText(element, selectors) {
    const values = [];
    for (const selector of selectors) {
      element && element.querySelectorAll(selector).forEach((node) => {
        const value = normalizeText(node.textContent || node.getAttribute('aria-label'));
        if (value && !values.includes(value)) values.push(value);
      });
    }
    return values;
  }

  function textNodesMatching(element, pattern) {
    if (!element || !element.querySelectorAll) return [];
    return Array.from(element.querySelectorAll('*')).map((node) => normalizeText(node.textContent)).filter((value) => value && pattern.test(value));
  }

  function parsePrice(value) {
    if (value == null) return null;
    const match = String(value).replace(/,/g, '').match(/(?:¥|￥)?\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  }

  function parseCurrencyPrice(value) {
    if (value == null) return null;
    const match = String(value).replace(/,/g, '').match(/(?:¥|￥)\s*(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  }

  function parseReviewCount(value) {
    if (value == null) return null;
    const match = String(value).match(/(\d[\d,]*)\s*条点评/);
    if (!match) return null;
    const number = Number(match[1].replace(/,/g, ''));
    return Number.isInteger(number) ? number : null;
  }

  function reviewCandidates(element) {
    if (!element) return [];
    const values = [];
    const add = (value) => {
      const normalized = normalizeText(value);
      if (normalized && /\d[\d,]*\s*条点评/.test(normalized) && !values.includes(normalized)) values.push(normalized);
    };
    ['[class*="review"]', '[class*="comment"]', '[class*="点评"]'].forEach((selector) => {
      element.querySelectorAll?.(selector).forEach((node) => add(node.textContent || node.getAttribute('aria-label')));
    });
    element.querySelectorAll?.('*').forEach((node) => add(node.textContent));
    return values.sort((left, right) => left.length - right.length);
  }

  function numericId(value) {
    const normalized = normalizeText(value);
    return normalized && /^\d+$/.test(normalized) ? normalized : null;
  }

  function parseId(element) {
    const cardId = numericId(element && element.id);
    if (cardId) return cardId;
    const offline = numericId(element && element.getAttribute && element.getAttribute('data-offline-hotelid'));
    if (offline) return offline;
    const offlineNode = element && element.querySelector && element.querySelector('[data-offline-hotelid]');
    const descendantOffline = numericId(offlineNode && offlineNode.getAttribute('data-offline-hotelid'));
    if (descendantOffline) return descendantOffline;
    const ownStable = element && ['data-hotelid', 'data-hotel-id', 'data-poi-id']
      .map((name) => numericId(element.getAttribute && element.getAttribute(name))).find(Boolean);
    if (ownStable) return ownStable;
    const stable = [
      '[data-hotelid]', '[data-hotel-id]', '[data-poi-id]'
    ];
    for (const selector of stable) {
      const node = element && element.querySelector(selector);
      const value = normalizeText(node && (node.getAttribute('data-hotelid') || node.getAttribute('data-hotel-id') || node.getAttribute('data-poi-id')));
      if (value) return value;
    }
    return null;
  }

  function ownId(element) {
    if (!element || !element.getAttribute) return null;
    return numericId(element.id) || numericId(element.getAttribute('data-offline-hotelid')) || ['data-hotelid', 'data-hotel-id', 'data-poi-id']
      .map((name) => normalizeText(element.getAttribute(name))).find(Boolean) || null;
  }

  function discoveryNodeFor(element) {
    return ownId(element) ? element : element?.querySelector?.('[data-offline-hotelid], [data-hotelid], [data-hotel-id], [data-poi-id]') || null;
  }

  function nodeDescription(node) {
    if (!node) return null;
    return {
      tagName: node.tagName || null,
      className: typeof node.className === 'string' ? node.className : null,
      data_hotelid: node.getAttribute?.('data-hotelid') || null,
      data_hotel_id: node.getAttribute?.('data-hotel-id') || null,
      data_poi_id: node.getAttribute?.('data-poi-id') || null
    };
  }

  function extractDynamic(value) {
    return normalizeText(value)?.match(/热卖！.*?剩\d+间|连续\d+位住客好评|\d+(?:分钟|小时)前有人预订|比收藏时降价¥\d+/)?.[0] || null;
  }

  function isMarketingTag(value) {
    return /^(?:十亿豪补|早鸟优惠|门店首单|折扣券|新客体验钻石|满减券|优惠\d+|\d+项优惠\d+)$/.test(normalizeText(value) || '');
  }

  function parseDiscountSummary(value) {
    const text = normalizeText(value);
    if (!text) return null;
    const counted = text.match(/^(\d+)项优惠(\d+)$/);
    if (counted) return { count: Number(counted[1]), amount: Number(counted[2]), text };
    const amountOnly = text.match(/^优惠(\d+)$/);
    return amountOnly ? { count: null, amount: Number(amountOnly[1]), text } : null;
  }

  function parsePageContext(document, url) {
    const href = String(url || (document && document.location && document.location.href) || '');
    const query = new URL(href || 'https://hotels.ctrip.com/').searchParams;
    const inputs = (document && Array.from(document.querySelectorAll('input, select'))) || [];
    const readInput = (patterns) => {
      const node = inputs.find((input) => patterns.some((pattern) => pattern.test(`${input.name || ''} ${input.id || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`)));
      return normalizeText(node && node.value);
    };
    const readParam = (names) => names.map((name) => query.get(name)).find(Boolean) || null;
    const text = normalizeText(document && document.body && document.body.textContent) || '';
    return {
      platform: 'ctrip',
      city: readParam(['cityName', 'city', 'destName']) || readInput([/城市|city/i]) || null,
      checkin: readParam(['checkin', 'checkIn', 'startDate']) || readInput([/入住|check.?in/i]) || null,
      checkout: readParam(['checkout', 'checkOut', 'endDate']) || readInput([/离店|退房|check.?out/i]) || null,
      keyword: readParam(['keyword', 'kw', 'searchWord']) || readInput([/关键词|keyword|搜索/i]) || null,
      url: href,
      hasHotelListText: /酒店|住宿|房型|价格/.test(text)
    };
  }

  function parseHotelCard(input, rank) {
    const metadata = input && input.element ? input : null;
    const element = metadata ? metadata.element : input;
    const text = normalizeText(element && element.textContent) || '';
    const nameMatch = firstMatch(element, [
      '[data-testid*="hotel-name"]', '[data-test*="hotel-name"]', '[class*="hotelName"]',
      '[class*="hotel-name"]', 'h3', 'h4', 'a[href*="hotel"]'
    ]);
    const name = nameMatch?.value || null;
    const scoreMatch = firstMatch(element, ['[class*="score"]', '[class*="rating"]', '[aria-label*="评分"]']);
    const scoreText = scoreMatch?.value || textNodesMatching(element, /(?:^|\s)[1-5]\.\d(?:\s|$)/)[0] || null;
    const reviewText = reviewCandidates(element)[0] || null;
    const priceNodes = allText(element, ['[class*="price"]', '[class*="Price"]', '[class*="amount"]']);
    const originalNodes = allText(element, ['[class*="original"]', '[class*="Original"]', '[class*="oldPrice"]', '[class*="line-through"]', '[class*="delPrice"]', '[aria-label*="Original price"]', '[title*="Original price"]']);
    const currentNodes = allText(element, ['[class*="current"]', '[class*="Current"]', '[class*="displayPrice"]', '[class*="salePrice"]', '[class*="sellingPrice"]', '[aria-label*="Current price"]', '[title*="Current price"]']);
    const originalValues = originalNodes.map(parseCurrencyPrice).filter((value) => value != null);
    const currentValues = currentNodes.map(parseCurrencyPrice).filter((value) => value != null);
    const priceValues = priceNodes.map(parseCurrencyPrice).filter((value) => value != null);
    const originalPrice = originalValues[0] ?? null;
    const displayPrice = currentValues[0] ?? (priceValues.length === 1 ? priceValues[0] : null);
    const activityRawNodes = allText(element, ['[class*="tag"]', '[class*="benefit"]', '[class*="promotion"]', '[class*="coupon"]']);
    const discountSummary = activityRawNodes.find((value) => /^(?:优惠\d+|\d+项优惠\d+)$/.test(value)) || null;
    const activityTagNodes = activityRawNodes.filter((value) => value !== discountSummary);
    const activityTags = activityTagNodes.filter(isMarketingTag);
    const breakfastMatch = exactTextMatch(element, ['包早餐', '含早餐', '含早', '双早', '单份早餐']);
    const breakfast = breakfastMatch?.value || null;
    const cancellationMatch = exactTextMatch(element, ['免费取消', '不可取消']);
    const cancellation = cancellationMatch?.value || null;
    const dynamicMatch = firstMatch(element, ['[class*="dynamic"]', '[class*="flash"]']);
    const dynamicCandidates = textNodesMatching(element, /热卖！.*?剩\d+间|连续\d+位住客好评|\d+(?:分钟|小时)前有人预订|比收藏时降价¥\d+/).sort((left, right) => left.length - right.length);
    const dynamicNode = dynamicMatch?.value || dynamicCandidates[0] || null;
    const dynamic = extractDynamic(dynamicNode);
    const roomMatch = firstMatch(element, ['[class*="room"]', '[class*="Room"]', '[class*="roomName"]']);
    const roomRaw = roomMatch?.value || null;
    const roomName = roomRaw?.split(/|免费取消|不可取消|包早餐|含早餐|热卖！|连续\d+/)[0].trim() || null;
    const adMatch = exactTextMatch(element, ['广告']);
    const adNode = adMatch?.value || null;
    const discountSummaryValue = parseDiscountSummary(discountSummary);
    return {
      rank,
      platform: 'ctrip',
      platform_hotel_id: metadata?.platform_hotel_id || parseId(element),
      hotel_name: name,
      is_ad: Boolean(adNode),
      score: scoreText ? Number(scoreText.match(/[1-5]\.\d/)?.[0]) || null : null,
      review_count: parseReviewCount(reviewText),
      room_name: roomName,
      breakfast,
      cancellation,
      activity_tags: activityTags,
      discount_summary: discountSummaryValue,
      original_price: originalPrice,
      display_price: displayPrice,
      latest_dynamic: dynamic,
    };
  }

  function findHotelCards(document) {
    const selectors = [
      '[data-hotelid]', '[data-hotel-id]', '[data-poi-id]', '[data-testid*="hotel"]', '[data-test*="hotel"]',
      '[class*="hotel_item"]', '[class*="hotelItem"]', '[class*="hotel-card"]',
      '[class*="hotelCard"]', 'li[class*="hotel"]', '[role="listitem"]'
    ];
    const seen = new Set();
    const cards = [];
    selectors.forEach((selector) => document.querySelectorAll(selector).forEach((element) => {
      const text = normalizeText(element.textContent) || '';
      const hasHotelSignal = /酒店/.test(text) && (/(?:¥|￥)\s*\d+/.test(text) || /点评|评价/.test(text));
      if (!seen.has(element) && hasHotelSignal) {
        seen.add(element);
        cards.push(element);
      }
    }));
    return cards.filter((card) => !cards.some((other) => other !== card && other.contains(card))).map((element) => {
      const discoveryNode = discoveryNodeFor(element);
      return {
        element,
        platform_hotel_id: ownId(discoveryNode),
        discovery_node: discoveryNode,
        parsed_card_root: element
      };
    });
  }

  function parseHotelCards(document) {
    return findHotelCards(document).map((metadata, index) => parseHotelCard(metadata, index + 1));
  }

  const api = { normalizeText, parsePrice, parseReviewCount, parseDiscountSummary, reviewCandidates, parsePageContext, parseHotelCard, parseHotelCards, findHotelCards };
  root.LivvCtripParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
