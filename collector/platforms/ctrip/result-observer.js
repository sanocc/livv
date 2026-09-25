(function (root) {
  'use strict';

  const VERSION = '1.0.32';
  const OBSERVER_KEY = '__LIVV_CTRIP_RESULT_OBSERVER__';

  function normalize(value) {
    return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  }

  function parseReportedTotal(text) {
    const match = normalize(text).match(/找到\s*([\d,]+)\s*家酒店/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  }

  function uniqueIds(cards) {
    return Array.from(new Set(cards.map((card) => normalize(card?.platform_hotel_id)).filter(Boolean)));
  }

  function diffIds(previousIds, currentIds) {
    const previous = new Set(previousIds);
    const current = new Set(currentIds);
    return {
      added_ids: currentIds.filter((id) => !previous.has(id)),
      removed_ids: previousIds.filter((id) => !current.has(id)),
      retained_ids: currentIds.filter((id) => previous.has(id))
    };
  }

  function visible(node, doc) {
    if (!node) return false;
    const style = doc?.defaultView?.getComputedStyle?.(node);
    return style ? style.display !== 'none' && style.visibility !== 'hidden' : true;
  }

  function hasLoadingIndicator(doc) {
    const nodes = Array.from(doc?.querySelectorAll?.('[aria-busy="true"], [class*="loading"], [class*="skeleton"]') || []);
    return nodes.some((node) => visible(node, doc)) || Array.from(doc?.querySelectorAll?.('body *') || [])
      .some((node) => visible(node, doc) && /加载中|正在加载|搜索中/.test(normalize(node.textContent)));
  }

  function hasLoadMoreButton(doc) {
    return Array.from(doc?.querySelectorAll?.('button, [role="button"], a') || [])
      .some((node) => visible(node, doc) && /^(?:加载更多|查看更多|下一页)$/.test(normalize(node.textContent)));
  }

  function hasPagination(doc) {
    return Boolean(doc?.querySelector?.('[class*="pagination"], [class*="page-list"], [aria-label*="下一页"], [aria-label*="上一页"]'))
      || Array.from(doc?.querySelectorAll?.('button, [role="button"], a') || [])
        .some((node) => visible(node, doc) && /^(?:上一页|下一页)$/.test(normalize(node.textContent)));
  }

  function hasResultContainer(doc, cards) {
    return cards.length > 0 || Boolean(doc?.querySelector?.('[class*="hotel-list"], [class*="hotelList"], [class*="result-list"], [class*="resultList"]'));
  }

  function createSession() {
    return { snapshot_index: 0, previous_ids: [], seen_hotel_ids: new Set() };
  }

  function createObserver({ document: doc = root.document, window: win = root } = {}) {
    const session = createSession();

    function reset() {
      session.snapshot_index = 0;
      session.previous_ids = [];
      session.seen_hotel_ids.clear();
      return { ok: true, action: 'reset_result_observer' };
    }

    function observeResultState() {
      const cards = root.LivvCtripParser?.findHotelCards?.(doc) || [];
      const ids = uniqueIds(cards);
      const changes = diffIds(session.previous_ids, ids);
      ids.forEach((id) => session.seen_hotel_ids.add(id));
      session.snapshot_index += 1;
      const snapshot = {
        snapshot_index: session.snapshot_index,
        observed_at: new Date().toISOString(),
        page_reported_total: parseReportedTotal(doc?.body?.textContent),
        discovered_unique_hotels: session.seen_hotel_ids.size,
        current_dom_hotel_count: cards.length,
        unique_hotel_ids: ids,
        first_hotel_id: ids[0] || null,
        last_hotel_id: ids[ids.length - 1] || null,
        scroll_y: Number(win.scrollY || 0),
        viewport_height: Number(win.innerHeight || doc?.documentElement?.clientHeight || 0),
        document_height: Number(doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 0),
        loading_indicator_present: hasLoadingIndicator(doc),
        load_more_button_present: hasLoadMoreButton(doc),
        pagination_present: hasPagination(doc),
        result_container_present: hasResultContainer(doc, cards),
        added_ids: changes.added_ids,
        removed_ids: changes.removed_ids,
        retained_ids: changes.retained_ids
      };
      session.previous_ids = ids;
      console.log(`[酒店助手 v${VERSION}] Result snapshot`, snapshot);
      return snapshot;
    }

    return { observeResultState, reset };
  }

  const existing = root[OBSERVER_KEY];
  if (existing?.version === VERSION && existing.api) {
    root.LivvCtripResultObserver = existing.api;
  } else {
    const api = createObserver();
    root[OBSERVER_KEY] = { version: VERSION, api };
    root.LivvCtripResultObserver = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createObserver, parseReportedTotal, diffIds };
})(typeof globalThis !== 'undefined' ? globalThis : window);
