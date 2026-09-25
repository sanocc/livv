(function () {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  let latest = null;
  let observerSessionKey = null;

  function setPageState(name, status, good) {
    $('#page-name').textContent = name;
    $('#page-status').textContent = status;
    $('#page-status').className = 'page-status-tag ' + (good ? 'ok' : 'bad');
  }

  function setPageVersion() {
    const node = $('#page-version');
    if (node) node.textContent = 'v' + chrome.runtime.getManifest().version;
  }

  function setRefreshLoading(loading) {
    const button = $('#read-page');
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle('loading', loading);
    button.textContent = '↻';
  }

  function setPageFavicon(tab) {
    const image = $('#page-favicon');
    const wrapper = image?.parentElement;
    if (!image || !wrapper) return;
    wrapper.classList.remove('is-fallback');
    image.onerror = () => wrapper.classList.add('is-fallback');
    if (tab?.favIconUrl) image.src = tab.favIconUrl;
    else wrapper.classList.add('is-fallback');
  }

  async function readPageContext(tab) {
    if (!tab?.id || !tab.url?.startsWith('https://hotels.ctrip.com/')) return null;
    try {
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['platforms/ctrip/parser.js']});
      const [{result}] = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => globalThis.LivvCtripParser?.parsePageContext?.(document, location.href) || null
      });
      return result || null;
    } catch (_) { return null; }
  }

  function showError(message) {
    $('#error').textContent = message;
    $('#error').classList.remove('hidden');
    $('#result').classList.add('hidden');
  }

  function value(value) { return value == null ? '—' : String(value); }

  function formatContextDate(value) {
    const text = value == null ? '' : String(value);
    const iso = text.match(/^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
    if (iso) return iso[0].slice(5).replace('-', '/');
    const ctrip = text.match(/(\d{1,2})月(\d{1,2})日/);
    return ctrip ? `${ctrip[1].padStart(2, '0')}/${ctrip[2].padStart(2, '0')}` : '';
  }

  function compactContextText(context) {
    return context && [context.city, context.checkin && context.checkout ? `${formatContextDate(context.checkin)}–${formatContextDate(context.checkout)}` : '', context.keyword || ''].filter(Boolean).join(' · ');
  }

  function setTaskStatus(id, state) {
    const node = $(`#${id}-status`);
    if (!node) return;
    node.textContent = `${state === 'ok' ? '✓' : state === 'bad' ? '!' : '○'} ${id === 'city' ? '城市' : id === 'date' ? '日期' : '关键词'}`;
    node.className = state;
  }

  function showCityResult(result, errorCode) {
    const node = $('#city-result');
    node.classList.remove('hidden', 'bad');
    if (!result) {
      setTaskStatus('city', 'bad');
      node.classList.add('bad');
      node.textContent = '状态：✕ CITY_CONTROL_NO_RESPONSE';
      return;
    }
    if (errorCode || result.ok !== true) {
      setTaskStatus('city', 'bad');
      node.classList.add('bad');
      node.textContent = `! 未找到完全匹配的携程候选\n${errorCode || result.error?.code || 'CITY_INPUT_FAILED'}${result.stage ? ` · ${result.stage}` : ''}`;
      return;
    }
    setTaskStatus('city', 'ok');
    node.textContent = `目标：${result.requested_city}　页面：${result.actual_city}　状态：✓ 设置成功`;
  }

  function showDateResult(result, errorCode) {
    const node = $('#date-result');
    node.classList.remove('hidden', 'bad');
    if (!result) { setTaskStatus('date', 'bad'); node.classList.add('bad'); node.textContent = '状态：✕ DATE_CONTROL_NO_RESPONSE'; return; }
    if (errorCode || result.ok !== true) { setTaskStatus('date', 'bad'); node.classList.add('bad'); node.textContent = `! 日期设置未完成\n${errorCode || result.error?.code || 'DATE_CONTROL_FAILED'}${result.stage ? ` · ${result.stage}` : ''}`; return; }
    setTaskStatus('date', 'ok');
    node.textContent = `目标：${result.requested_checkin} → ${result.requested_checkout}　页面：${result.actual_checkin} → ${result.actual_checkout}　${result.nights}晚　状态：✓ 设置成功`;
  }

  function showKeywordResult(result, errorCode) {
    const node = $('#keyword-result');
    node.classList.remove('hidden', 'bad');
    if (!result) { setTaskStatus('keyword', 'bad'); node.classList.add('bad'); node.textContent = '状态：✕ KEYWORD_CONTROL_NO_RESPONSE'; return; }
    if (errorCode || result.ok !== true) { setTaskStatus('keyword', 'bad'); node.classList.add('bad'); node.textContent = `! 未找到完全匹配的携程候选\n${errorCode || result.error?.code || 'KEYWORD_INPUT_FAILED'}${result.stage ? ` · ${result.stage}` : ''}`; return; }
    setTaskStatus('keyword', 'ok');
    const type = result.selected_candidate?.type && result.selected_candidate.type !== 'unknown' ? `　类型：${result.selected_candidate.type}` : '';
    node.textContent = `目标：${result.requested_keyword}　页面：${result.actual_keyword}${type}　状态：✓ 设置成功`;
  }

  function showSearchResult(result, errorCode) {
    const node = $('#search-result');
    node.classList.remove('hidden', 'bad');
    if (!result) { node.classList.add('bad'); node.textContent = `搜索未完成\n${errorCode || 'SEARCH_CONTROL_NO_RESPONSE'}`; return; }
    if (errorCode || result.ok !== true) {
      node.classList.add('bad');
      node.textContent = `搜索未完成\n${errorCode || result.error?.code || 'SEARCH_RUNTIME_ERROR'}${result.stage ? ` · ${result.stage}` : ''}`;
      return;
    }
    setTaskStatus('city', 'ok'); setTaskStatus('date', 'ok'); setTaskStatus('keyword', 'ok');
    node.textContent = `任务：${result.request.city} · ${result.request.keyword}　日期：${result.request.checkin} → ${result.request.checkout}　页面：${result.context.city} · ${result.context.keyword}　酒店：${result.hotel_count}家已加载　状态：✓ 搜索完成`;
  }

  function showObserverResult(snapshot, errorCode) {
    const node = $('#observer-result');
    node.classList.remove('hidden', 'bad');
    if (!snapshot) { node.classList.add('bad'); node.textContent = `状态：✕ ${errorCode || 'RESULT_OBSERVER_NO_RESPONSE'}`; return; }
    node.innerHTML = `<div class="observer-metrics"><span><b>${value(snapshot.page_reported_total)}</b><small>页面结果</small></span><span><b>${snapshot.current_dom_hotel_count}</b><small>当前DOM</small></span><span><b>${snapshot.discovered_unique_hotels}</b><small>累计发现</small></span><span><b>+${snapshot.added_ids.length}</b><small>本次新增</small></span><span><b>${snapshot.removed_ids.length}</b><small>本次删除</small></span></div><div class="observer-scroll">滚动位置：${snapshot.scroll_y} / ${snapshot.document_height}</div>`;
  }

  async function injectObserver(tabId) {
    await chrome.scripting.executeScript({target:{tabId}, files:['platforms/ctrip/parser.js','platforms/ctrip/result-observer.js']});
  }

  async function syncObserverSession(tab) {
    const [{result: context}] = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => globalThis.LivvCtripParser?.parsePageContext?.(document, location.href) || null
    });
    const sessionKey = [tab.id, context?.city, context?.checkin, context?.checkout, context?.keyword].map((part) => part || '').join('|');
    if (observerSessionKey !== sessionKey) {
      await chrome.scripting.executeScript({target:{tabId:tab.id}, func:() => globalThis.LivvCtripResultObserver?.reset?.()});
      observerSessionKey = sessionKey;
    }
  }

  async function recordSnapshot() {
    const button = $('#record-snapshot');
    button.disabled = true; button.textContent = '记录中…';
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url?.startsWith('https://hotels.ctrip.com/')) { showObserverResult(null, 'UNSUPPORTED_PAGE'); return; }
      await injectObserver(tab.id);
      await syncObserverSession(tab);
      const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id}, func:() => globalThis.LivvCtripResultObserver.observeResultState()});
      showObserverResult(result);
    } catch (error) { showObserverResult(null, error?.message || 'RESULT_OBSERVER_FAILED'); }
    finally { button.disabled = false; button.textContent = '记录快照'; }
  }

  async function resetObserver() {
    const button = $('#reset-observer');
    button.disabled = true;
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url?.startsWith('https://hotels.ctrip.com/')) { showObserverResult(null, 'UNSUPPORTED_PAGE'); return; }
      await injectObserver(tab.id);
      const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id}, func:() => globalThis.LivvCtripResultObserver.reset()});
      observerSessionKey = null;
      if (result?.ok) showObserverResult(null, '观察已重置');
    } catch (error) { showObserverResult(null, error?.message || 'RESULT_OBSERVER_RESET_FAILED'); }
    finally { button.disabled = false; }
  }

  async function setCity() {
    const button = $('#set-city');
    const requested = $('#city-input').value.trim();
    button.disabled = true;
    button.textContent = '设置中…';
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url || !tab.url.startsWith('https://hotels.ctrip.com/')) {
        showCityResult(null, 'UNSUPPORTED_PAGE');
        return;
      }
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['platforms/ctrip/controller.js']});
      const [{result}] = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: (city) => globalThis.LivvCtripController.setCityResult(city),
        args: [requested]
      });
      showCityResult(result || null);
    } catch (error) {
      showCityResult(null, error?.message || 'CITY_INPUT_FAILED');
    } finally {
      button.disabled = false;
      button.textContent = '设置城市';
    }
  }

  async function setDates() {
    const button = $('#set-dates');
    const checkin = $('#checkin-input').value.trim(); const checkout = $('#checkout-input').value.trim();
    button.disabled = true; button.textContent = '设置中…';
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url || !tab.url.startsWith('https://hotels.ctrip.com/')) { showDateResult(null, 'UNSUPPORTED_PAGE'); return; }
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['platforms/ctrip/controller.js']});
      const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id}, func:(from, to) => globalThis.LivvCtripController.setDatesResult(from, to), args:[checkin, checkout]});
      showDateResult(result || null);
    } catch (error) { showDateResult(null, error?.message || 'DATE_CONTROL_FAILED'); }
    finally { button.disabled = false; button.textContent = '设置日期'; }
  }

  async function setKeyword() {
    const button = $('#set-keyword');
    const requested = $('#keyword-input').value.trim();
    button.disabled = true; button.textContent = '设置中…';
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url || !tab.url.startsWith('https://hotels.ctrip.com/')) { showKeywordResult(null, 'UNSUPPORTED_PAGE'); return; }
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['platforms/ctrip/controller.js']});
      const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id}, func:(keyword) => globalThis.LivvCtripController.setKeywordResult(keyword), args:[requested]});
      showKeywordResult(result || null);
    } catch (error) { showKeywordResult(null, error?.message || 'KEYWORD_INPUT_FAILED'); }
    finally { button.disabled = false; button.textContent = '设置关键词'; }
  }

  async function injectReader(tabId) {
    await chrome.scripting.executeScript({target:{tabId}, files:['platforms/ctrip/parser.js','platforms/ctrip/semantic.js','content/ctrip-reader.js']});
    return chrome.tabs.sendMessage(tabId, {type:'LIVV_READ_CURRENT_PAGE'});
  }

  async function readCurrentPageSnapshot(tabId) {
    const [{result}] = await chrome.scripting.executeScript({
      target: {tabId},
      func: () => {
        const page_context = globalThis.LivvCtripParser?.parsePageContext?.(document, location.href) || null;
        const metadata = globalThis.LivvCtripParser?.findHotelCards?.(document) || [];
        const observedAt = new Date().toISOString();
        const hotels = metadata.map((item, index) => {
          const hotel = globalThis.LivvCtripParser.parseHotelCard(item, index + 1);
          return {...hotel, dynamic: globalThis.LivvDynamicSemantic?.parseDynamic?.(hotel.latest_dynamic, observedAt)};
        });
        return {ok: true, page_context, hotels, hotel_count: hotels.length};
      }
    });
    return result;
  }

  function contextMatches(context, request) {
    const query = context?.url ? new URL(context.url).searchParams : null;
    const urlCity = query?.get('cityName') || query?.get('city') || query?.get('destName') || null;
    const urlCheckin = query?.get('checkin') || query?.get('checkIn') || query?.get('startDate') || null;
    const urlCheckout = query?.get('checkout') || query?.get('checkOut') || query?.get('endDate') || null;
    const urlKeyword = query?.get('searchWord') || query?.get('keyword') || query?.get('kw') || null;
    const cityMatches = context?.city === request.city || (!context?.city && urlCity === request.city);
    const checkinMatches = context?.checkin === request.checkin || urlCheckin === request.checkin;
    const checkoutMatches = context?.checkout === request.checkout || urlCheckout === request.checkout;
    const keywordMatches = context?.keyword === request.keyword
      || (!context?.keyword && urlKeyword === request.keyword);
    return context?.platform === 'ctrip'
      && cityMatches
      && checkinMatches
      && checkoutMatches
      && keywordMatches;
  }

  async function waitForTabAfterSearch(tabId, beforeUrl, timeoutMs = 15000) {
    const started = Date.now();
    let navigationObserved = false;
    let settled = false;
    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === 'loading' || (changeInfo.url && changeInfo.url !== beforeUrl)) navigationObserved = true;
      if (changeInfo.status === 'complete') settled = true;
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    try {
      while (Date.now() - started < timeoutMs) {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        const urlChanged = Boolean(tab?.url && tab.url !== beforeUrl);
        if (tab?.status === 'complete' && (settled || navigationObserved || urlChanged || Date.now() - started >= 600)) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return tab;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const error = new Error('搜索页面导航未完成');
      error.code = 'SEARCH_NAVIGATION_TIMEOUT';
      throw error;
    } finally {
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }
  }

  async function waitForSearchPage(tabId, request, beforeUrl, timeoutMs = 15000) {
    await waitForTabAfterSearch(tabId, beforeUrl, timeoutMs);
    const started = Date.now();
    let lastResult = null;
    let lastContext = null;
    while (Date.now() - started < timeoutMs) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.status && tab.status !== 'complete') {
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        try { lastResult = await injectReader(tabId); } catch (_) { lastResult = null; }
        const [{result: currentPageState}] = await chrome.scripting.executeScript({
          target: {tabId},
          func: () => ({
            context: globalThis.LivvCtripParser?.parsePageContext?.(document, location.href) || null,
            hotel_count: globalThis.LivvCtripParser?.findHotelCards?.(document)?.length || 0
          })
        });
        const currentContext = currentPageState?.context || null;
        const currentHotelCount = currentPageState?.hotel_count || 0;
        lastContext = currentContext;
        if (lastResult?.ok && contextMatches(lastResult.page_context, request) && lastResult.hotel_count > 0) return lastResult;
        if (contextMatches(currentContext, request) && currentHotelCount > 0) {
          const snapshot = await readCurrentPageSnapshot(tabId);
          if (snapshot?.ok && contextMatches(snapshot.page_context, request) && snapshot.hotel_count > 0) return snapshot;
        }
      } catch (_) {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (lastContext && !contextMatches(lastContext, request)) {
      const error = new Error('搜索完成后页面条件与任务不一致'); error.code = 'SEARCH_CONTEXT_MISMATCH'; throw error;
    }
    if (lastResult?.ok && lastResult.hotel_count === 0) {
      const error = new Error('搜索完成后没有已加载酒店'); error.code = 'SEARCH_RESULT_EMPTY'; throw error;
    }
    const error = new Error('搜索结果未在限定时间内稳定'); error.code = 'SEARCH_RESULT_TIMEOUT'; throw error;
  }

  async function executeSearch() {
    const button = $('#execute-search');
    const request = {
      city: $('#city-input').value.trim(),
      checkin: $('#checkin-input').value.trim(),
      checkout: $('#checkout-input').value.trim(),
      keyword: $('#keyword-input').value.trim()
    };
    button.disabled = true; button.textContent = '执行中…';
    $('#search-result').classList.add('hidden');
    localStorage.setItem('LIVV_PENDING_SEARCH', JSON.stringify(request));
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url || !tab.url.startsWith('https://hotels.ctrip.com/')) { localStorage.removeItem('LIVV_PENDING_SEARCH'); showSearchResult(null, 'UNSUPPORTED_PAGE'); return; }
      await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['platforms/ctrip/parser.js','platforms/ctrip/semantic.js','platforms/ctrip/controller.js']});
      let controlResult = null;
      try {
        const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id}, func:(task) => globalThis.LivvCtripController.executeSearchResult(task), args:[request]});
        controlResult = result;
      } catch (_) {
        // A full navigation can invalidate the execution context after the real button click.
      }
      if (controlResult && controlResult.ok !== true) { localStorage.removeItem('LIVV_PENDING_SEARCH'); showSearchResult(controlResult); return; }
      const result = await waitForSearchPage(tab.id, request, tab.url);
      const success = {ok:true, action:'execute_search', request, context:result.page_context, matched:true, hotel_count:result.hotel_count};
      showSearchResult(success);
      renderResult(result);
    } catch (error) {
      showSearchResult(null, error?.code || error?.message || 'SEARCH_RUNTIME_ERROR');
    } finally { button.disabled = false; button.textContent = '执行搜索'; }
  }

  async function restorePendingSearch() {
    let request;
    try { request = JSON.parse(localStorage.getItem('LIVV_PENDING_SEARCH') || 'null'); } catch (_) { request = null; }
    if (!request) return;
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url?.startsWith('https://hotels.ctrip.com/')) return;
      const result = await waitForSearchPage(tab.id, request, tab.url, 5000);
      const success = {ok:true, action:'execute_search', request, context:result.page_context, matched:true, hotel_count:result.hotel_count};
      localStorage.removeItem('LIVV_PENDING_SEARCH');
      showSearchResult(success);
      renderResult(result);
    } catch (_) {}
  }

  function renderContext(result) {
    const context = result.page_context;
    $('#context').innerHTML = [
      ['平台', '携程'], ['城市', value(context.city)], ['入住', value(context.checkin)],
      ['离店', value(context.checkout)], ['关键词', value(context.keyword)]
    ].map(([label, text]) => `<div class="context-item"><span>${label}</span><b title="${text}">${text}</b></div>`).join('');
    $('#hotel-count').textContent = `${result.hotel_count}家`;
    $('#result-count').textContent = `${result.hotel_count}家`;
    const contextText = compactContextText(context);
    const contextNode = $('#page-context');
    if (contextNode) contextNode.textContent = contextText || '当前页面 context 未读取';
  }

  function setCompactContext(context, fallbackText) {
    const node = $('#page-context');
    if (!node) return;
    const contextText = compactContextText(context);
    node.textContent = contextText || fallbackText || '当前页面 context 未读取';
  }

  function renderCoverage(hotels) {
    const fields = [['酒店名称','hotel_name'],['酒店ID','platform_hotel_id'],['实际价格','display_price'],['评分','score'],['点评','review_count'],['房型','room_name'],['早餐','breakfast'],['取消','cancellation'],['动态','latest_dynamic']];
    $('#coverage').innerHTML = fields.map(([label, key]) => {
      const count = hotels.filter((hotel) => hotel[key] != null && hotel[key] !== '').length;
      return `<div class="coverage-item"><span>${label}</span><b>${count} / ${hotels.length}</b></div>`;
    }).join('');
  }

  function renderHotels(hotels) {
    $('#hotels').innerHTML = hotels.length ? hotels.map((hotel) => `<article class="hotel-card">
      <div class="hotel-title"><span class="rank">#${hotel.rank}</span><h3>${value(hotel.hotel_name)}</h3>${hotel.is_ad?'<span class="ad">广告</span>':''}</div>
      <div class="hotel-id">ID: ${value(hotel.platform_hotel_id)}</div>
      <div class="hotel-fields">
        <div><span>评分</span><b>${value(hotel.score)}</b></div><div><span>点评</span><b>${value(hotel.review_count)}</b></div><div><span>房型</span><b>${value(hotel.room_name)}</b></div>
        <div><span>早餐</span><b>${value(hotel.breakfast)}</b></div><div><span>取消</span><b>${value(hotel.cancellation)}</b></div><div><span>价格</span><b class="price">${hotel.original_price == null ? '—' : `¥${hotel.original_price}`} → ${hotel.display_price == null ? '—' : `¥${hotel.display_price}`}</b></div>
        <div><span>活动</span><b class="tags">${hotel.activity_tags?.length ? hotel.activity_tags.map((tag) => `<i class="tag">${tag}</i>`).join('') : '—'}</b></div><div><span>优惠</span><b title="${value(hotel.discount_summary?.text)}">${hotel.discount_summary ? `${hotel.discount_summary.count == null ? '' : `${hotel.discount_summary.count}项优惠 · `}¥${hotel.discount_summary.amount}` : '—'}</b></div><div><span>动态</span><b title="${value(hotel.latest_dynamic)}">${value(hotel.latest_dynamic)}</b></div>
      </div></article>`).join('') : '<div class="hotel-card">当前页面未检测到已加载酒店列表。</div>';
  }

  function renderResult(result) {
    latest = result;
    $('#error').classList.add('hidden');
    $('#result').classList.remove('hidden');
    renderContext(result); renderCoverage(result.hotels); renderHotels(result.hotels);
    $('#json').textContent = JSON.stringify(result, null, 2);
  }

  async function refreshActiveTabState() {
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      setPageVersion();
      setPageFavicon(tab);
      const supported = Boolean(tab?.url?.startsWith('https://hotels.ctrip.com/'));
      if (supported) {
        setPageState('酒店列表页', '✓ 可读取', true);
        setCompactContext(await readPageContext(tab), '携程酒店列表');
        $('#error').classList.add('hidden');
      } else {
        setPageState('当前页面', '× 不支持', false);
        let host = '当前页面';
        try { host = new URL(tab?.url || '').hostname || host; } catch (_) {}
        setCompactContext(null, host);
        $('#result').classList.add('hidden');
        $('#search-result').classList.add('hidden');
        $('#observer-result').classList.add('hidden');
        $('#error').classList.add('hidden');
      }
    } catch (error) {
      setPageVersion();
      setPageState('当前页面', '× 不支持', false);
      setCompactContext(null, '当前页面');
      $('#error').classList.add('hidden');
    }
  }

  async function readCurrentPage() {
    setRefreshLoading(true);
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url || !tab.url.startsWith('https://hotels.ctrip.com/')) {
        setPageState('当前页面', '× 不支持', false);
        showError('请先手工打开 hotels.ctrip.com 的酒店搜索结果页。'); return;
      }
      setPageState('携程酒店列表', '✓ 可读取', true);
      try {
        await chrome.scripting.executeScript({target:{tabId:tab.id}, files:['platforms/ctrip/parser.js','platforms/ctrip/semantic.js','content/ctrip-reader.js']});
      } catch (error) {
        const injectionError = new Error(`READER_INJECTION_FAILED: ${error.message || '无法注入页面读取器'}`);
        injectionError.code = 'READER_INJECTION_FAILED';
        throw injectionError;
      }
      let result;
      try {
        result = await chrome.tabs.sendMessage(tab.id, {type:'LIVV_READ_CURRENT_PAGE'});
      } catch (error) {
        const executionError = new Error(`READER_EXECUTION_FAILED: ${error.message || '读取器未响应'}`);
        executionError.code = 'READER_EXECUTION_FAILED';
        throw executionError;
      }
      if (!result.ok) {
        showError(result.reason === 'parser_error' ? result.message : '已识别携程，但当前页面未检测到酒店列表。'); return;
      }
      renderResult(result);
    } catch (error) { setPageState('读取失败', '✕ 无法读取当前页面', false); showError(error.message || '读取失败'); }
    finally { setRefreshLoading(false); }
  }

  $('#read-page').addEventListener('click', readCurrentPage);
  $('#set-city').addEventListener('click', () => { setCity().catch((error) => showCityResult(null, error?.message || 'CITY_INPUT_FAILED')); });
  $('#set-dates').addEventListener('click', () => { setDates().catch((error) => showDateResult(null, error?.message || 'DATE_CONTROL_FAILED')); });
  $('#set-keyword').addEventListener('click', () => { setKeyword().catch((error) => showKeywordResult(null, error?.message || 'KEYWORD_INPUT_FAILED')); });
  $('#execute-search').addEventListener('click', () => { executeSearch().catch((error) => showSearchResult(null, error?.message || 'SEARCH_RUNTIME_ERROR')); });
  $('#record-snapshot').addEventListener('click', () => { recordSnapshot().catch((error) => showObserverResult(null, error?.message || 'RESULT_OBSERVER_FAILED')); });
  $('#reset-observer').addEventListener('click', () => { resetObserver().catch((error) => showObserverResult(null, error?.message || 'RESULT_OBSERVER_RESET_FAILED')); });
  $('#toggle-json').addEventListener('click', () => { $('#json').classList.toggle('hidden'); $('#toggle-json').textContent = $('#json').classList.contains('hidden') ? '展开JSON' : '收起JSON'; });
  $('#copy-json').addEventListener('click', async () => { if (!latest) return; await navigator.clipboard.writeText(JSON.stringify(latest, null, 2)); $('#copy-json').textContent = '已复制'; setTimeout(() => $('#copy-json').textContent = '复制JSON', 1200); });
  chrome.tabs.onActivated.addListener(() => { observerSessionKey = null; refreshActiveTabState(); });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') refreshActiveTabState();
  });
  refreshActiveTabState();
  restorePendingSearch();
})();
