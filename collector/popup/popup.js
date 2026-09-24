(function () {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  let latest = null;

  function setPageState(name, status, good) {
    $('#page-name').textContent = name;
    $('#page-status').textContent = status;
    $('#page-status').className = good ? 'ok' : 'bad';
  }

  function showError(message) {
    $('#error').textContent = message;
    $('#error').classList.remove('hidden');
    $('#result').classList.add('hidden');
  }

  function value(value) { return value == null ? '—' : String(value); }

  function showCityResult(result, errorCode) {
    const node = $('#city-result');
    node.classList.remove('hidden', 'bad');
    if (!result) {
      node.classList.add('bad');
      node.textContent = '状态：✕ CITY_CONTROL_NO_RESPONSE';
      return;
    }
    if (errorCode || result.ok !== true) {
      node.classList.add('bad');
      node.textContent = `状态：✕ ${errorCode || result.error?.code || 'CITY_INPUT_FAILED'}${result.stage ? `　阶段：${result.stage}` : ''}`;
      return;
    }
    node.textContent = `目标：${result.requested_city}　页面：${result.actual_city}　状态：✓ 设置成功`;
  }

  function showDateResult(result, errorCode) {
    const node = $('#date-result');
    node.classList.remove('hidden', 'bad');
    if (!result) { node.classList.add('bad'); node.textContent = '状态：✕ DATE_CONTROL_NO_RESPONSE'; return; }
    if (errorCode || result.ok !== true) { node.classList.add('bad'); node.textContent = `状态：✕ ${errorCode || result.error?.code || 'DATE_CONTROL_FAILED'}${result.stage ? `　阶段：${result.stage}` : ''}`; return; }
    node.textContent = `目标：${result.requested_checkin} → ${result.requested_checkout}　页面：${result.actual_checkin} → ${result.actual_checkout}　${result.nights}晚　状态：✓ 设置成功`;
  }

  function showKeywordResult(result, errorCode) {
    const node = $('#keyword-result');
    node.classList.remove('hidden', 'bad');
    if (!result) { node.classList.add('bad'); node.textContent = '状态：✕ KEYWORD_CONTROL_NO_RESPONSE'; return; }
    if (errorCode || result.ok !== true) { node.classList.add('bad'); node.textContent = `状态：✕ ${errorCode || result.error?.code || 'KEYWORD_INPUT_FAILED'}${result.stage ? `　阶段：${result.stage}` : ''}`; return; }
    const type = result.selected_candidate?.type && result.selected_candidate.type !== 'unknown' ? `　类型：${result.selected_candidate.type}` : '';
    node.textContent = `目标：${result.requested_keyword}　页面：${result.actual_keyword}${type}　状态：✓ 设置成功`;
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

  function renderContext(result) {
    const context = result.page_context;
    $('#context').innerHTML = [
      ['平台', '携程'], ['城市', value(context.city)], ['入住', value(context.checkin)],
      ['离店', value(context.checkout)], ['关键词', value(context.keyword)]
    ].map(([label, text]) => `<div class="context-item"><span>${label}</span><b title="${text}">${text}</b></div>`).join('');
    $('#hotel-count').textContent = `${result.hotel_count}家`;
    $('#result-count').textContent = `${result.hotel_count}家`;
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

  async function readCurrentPage() {
    $('#read-page').disabled = true; $('#read-page').textContent = '读取中…';
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.url || !tab.url.startsWith('https://hotels.ctrip.com/')) {
        setPageState('未识别', '✕ 当前页面不是支持的携程酒店页面', false);
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
    finally { $('#read-page').disabled = false; $('#read-page').textContent = '读取当前页面'; }
  }

  $('#read-page').addEventListener('click', readCurrentPage);
  $('#set-city').addEventListener('click', () => { setCity().catch((error) => showCityResult(null, error?.message || 'CITY_INPUT_FAILED')); });
  $('#set-dates').addEventListener('click', () => { setDates().catch((error) => showDateResult(null, error?.message || 'DATE_CONTROL_FAILED')); });
  $('#set-keyword').addEventListener('click', () => { setKeyword().catch((error) => showKeywordResult(null, error?.message || 'KEYWORD_INPUT_FAILED')); });
  $('#toggle-json').addEventListener('click', () => { $('#json').classList.toggle('hidden'); $('#toggle-json').textContent = $('#json').classList.contains('hidden') ? '展开JSON' : '收起JSON'; });
  $('#copy-json').addEventListener('click', async () => { if (!latest) return; await navigator.clipboard.writeText(JSON.stringify(latest, null, 2)); $('#copy-json').textContent = '已复制'; setTimeout(() => $('#copy-json').textContent = '复制JSON', 1200); });
  chrome.tabs.query({active:true,currentWindow:true}).then(([tab]) => {
    if (tab?.url?.startsWith('https://hotels.ctrip.com/')) setPageState('携程酒店列表', '✓ 可读取', true);
    else setPageState('未识别', '✕ 当前不是支持的携程酒店列表页', false);
  }).catch((error) => showError(`当前页面检测失败：${error.message || '未知错误'}`));
})();
