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
  $('#toggle-json').addEventListener('click', () => { $('#json').classList.toggle('hidden'); $('#toggle-json').textContent = $('#json').classList.contains('hidden') ? '展开JSON' : '收起JSON'; });
  $('#copy-json').addEventListener('click', async () => { if (!latest) return; await navigator.clipboard.writeText(JSON.stringify(latest, null, 2)); $('#copy-json').textContent = '已复制'; setTimeout(() => $('#copy-json').textContent = '复制JSON', 1200); });
  chrome.tabs.query({active:true,currentWindow:true}).then(([tab]) => {
    if (tab?.url?.startsWith('https://hotels.ctrip.com/')) setPageState('携程酒店列表', '✓ 可读取', true);
    else setPageState('未识别', '✕ 当前不是支持的携程酒店列表页', false);
  }).catch((error) => showError(`当前页面检测失败：${error.message || '未知错误'}`));
})();
