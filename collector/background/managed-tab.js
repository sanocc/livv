(function (root) {
  'use strict';

  const VERSION = '1.0.49';
  const DEFAULT_TASK = {
    city: '咸宁', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '中心花坛', collection_limit: 30
  };

  function normalizeLimit(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 200 ? number : null;
  }

  function sessionKey(task) {
    return [task.city, task.checkin, task.checkout, task.keyword].map((part) => part || '').join('|');
  }

  function createManagedTabOrchestrator({ chromeApi = root.chrome, onUpdate = () => {}, now = () => Date.now(), timeoutMs = 120000 } = {}) {
    const state = {
      status: 'IDLE', phase: 'IDLE', reason: null, task: null, task_id: null,
      managed_tab_id: null, created_by_hotel_assistant: false, user_active_tab_id: null,
      origin_window_id: null, origin_tab_id: null, execution_mode: 'MANAGED',
      existing_tab_ids: [], result: null, error: null, city_audit: null,
      task_snapshot: null, events: [],
      bootstrap_started_at: null, bootstrap_ready_at: null,
      task_started_at: null, result_dom_ready_at: null, origin_restored_at: null,
      direct_read_at: null, failed_at: null, closed_at: null,
      direct_read_duration: null, failure_cleanup_duration: null, total_duration: null,
      direct_context_audit: null,
      foreground_started_at: null, collection_started_at: null, collection_completed_at: null, foreground_duration_ms: null,
      target_reached_at: null, collection_finalized_at: null, managed_tab_closed_at: null, task_completed_at: null,
      completion_cleanup_duration_ms: null, completion_won: false,
      foreground_bootstrap_duration: null, background_visibility_state: null,
      started_at: null, completed_at: null
    };
    let runPromise = null;
    let removedByUser = false;
    let removingOwned = false;

    function emit(extra = {}) {
      const snapshot = { ...state, ...extra, task: state.task ? { ...state.task } : null, result: state.result || null };
      try { onUpdate(snapshot); } catch (_) {}
      return snapshot;
    }

    function copyState() { return emit(); }

    function appendEvent(event, message, metadata = {}, unique = true) {
      if (unique && state.events.some((item) => item.event === event)) return;
      state.events = [...state.events, { timestamp: new Date(now()).toISOString(), event, message, metadata }].slice(-50);
      emit();
    }

    function setPhase(phase, status = 'RUNNING', extra = {}) {
      state.phase = phase; state.status = status;
      const phaseEvents = {
        SETTING_CITY: ['CITY_STARTED', '开始设置城市'], CITY_VERIFIED: ['CITY_COMPLETED', '城市设置完成'],
        SETTING_DATES: ['DATES_STARTED', '开始设置日期'], DATES_VERIFIED: ['DATES_COMPLETED', '日期设置完成'],
        SETTING_KEYWORD: ['KEYWORD_STARTED', '开始设置关键词'], KEYWORD_VERIFIED: ['KEYWORD_COMPLETED', '关键词设置完成'],
        SEARCHING: ['SEARCH_STARTED', '开始执行搜索'], RESULT_DOM_READY: ['RESULT_DOM_DETECTED', '检测到酒店结果DOM'],
        READING_RESULT: ['DIRECT_READ_STARTED', '开始Direct Read'], BOOTSTRAP_READY: ['DIRECT_READ_COMPLETED', 'Direct Read完成'],
        BACKGROUND_COLLECTING: ['COLLECTION_STARTED', '开始后台采集'], FOREGROUND_COLLECTING: ['COLLECTION_STARTED', '开始前台采集']
      };
      const mapped = phaseEvents[phase];
      if (mapped) appendEvent(mapped[0], mapped[1], { phase }, true);
      return emit(extra);
    }

    function contextAudit(task, actual) {
      const expected = { city: task?.city || null, checkin: task?.checkin || null, checkout: task?.checkout || null, keyword: task?.keyword || null };
      const observed = { city: actual?.city || null, checkin: actual?.checkin || null, checkout: actual?.checkout || null, keyword: actual?.keyword || null };
      return {
        expected,
        actual: observed,
        mismatch_fields: Object.keys(expected).filter((field) => expected[field] !== observed[field]),
        context_sources: actual?.context_sources || {
          city: 'Parser parsePageContext: DOM first, URL fallback',
          checkin: 'Parser parsePageContext: DOM first, URL fallback',
          checkout: 'Parser parsePageContext: DOM first, URL fallback',
          keyword: 'Parser parsePageContext: DOM first, URL fallback'
        }
      };
    }

    function assertManagedTabId(tabId, operation = 'managed action') {
      if (!Number.isInteger(tabId) || tabId !== state.managed_tab_id) {
        throw Object.assign(new Error(`拒绝对非Managed Tab执行${operation}`), { code: 'MANAGED_TAB_ASSERTION_FAILED' });
      }
      if (state.existing_tab_ids.includes(tabId)) {
        throw Object.assign(new Error(`拒绝将既有Tab当作Managed Tab执行${operation}`), { code: 'MANAGED_TAB_ASSERTION_FAILED' });
      }
      return tabId;
    }

    async function tabsQuery(query) { return chromeApi.tabs.query(query); }
    async function execute(tabId, files) {
      assertManagedTabId(tabId, 'script injection');
      return chromeApi.scripting.executeScript({ target: { tabId }, files });
    }
    async function executeFunction(tabId, func, args = []) {
      assertManagedTabId(tabId, 'page execution');
      const [{ result }] = await chromeApi.scripting.executeScript({ target: { tabId }, func, args });
      return result;
    }

    function directReader() {
      const invocation = root.LivvDirectReader?.createDirectReader
        ? root.LivvDirectReader.createDirectReader(chromeApi, { assertTabId: assertManagedTabId })
        : { readManagedPageOnce: async () => ({ ok: false, error: { code: 'DIRECT_EXECUTION_FAILED', message: 'Direct reader unavailable' } }) };
      return {
        ...invocation,
        readManagedPageOnce: async (tabId) => {
          assertManagedTabId(tabId, 'direct reader invocation');
          return invocation.readManagedPageOnce(tabId);
        }
      };
    }

    async function auditCityDom(tabId, requestedCity, stage, startedAt = null) {
      const audit = await executeFunction(tabId, (requested) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!node) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && rect.width > 0 && rect.height > 0;
        };
        const input = document.querySelector('#destinationInput');
        const selectors = ['[role="option"]', 'li', '[class*="suggest"]', '[class*="city"]', '[class*="destination"]'];
        const nodes = [];
        const seen = new Set();
        selectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((node) => {
            if (seen.has(node) || !isVisible(node)) return;
            const text = normalize(node.textContent);
            if (!text || text.length > 120) return;
            seen.add(node);
            nodes.push({ tag: node.tagName, class: String(node.className || ''), text, visible: true });
          });
        });
        const exact = nodes.filter((node) => node.text === normalize(requested));
        const semantic = nodes.filter((node) => node.text.includes(normalize(requested)) && /中国|省|市|区/.test(node.text));
        return {
          input_found: Boolean(input),
          input_value: input?.value || null,
          input_focused: Boolean(input && document.activeElement === input),
          visibility_state: document.visibilityState,
          has_focus: document.hasFocus(),
          suggestion_container_found: nodes.length > 0,
          suggestion_visible: nodes.length > 0,
          suggestion_count: nodes.length,
          candidate_texts: nodes.slice(0, 20).map((node) => node.text),
          exact_candidate_count: exact.length,
          semantic_candidate_count: semantic.length,
          controller_present: Boolean(globalThis.LivvCtripController),
          controller_method_present: typeof globalThis.LivvCtripController?.setCityResult === 'function'
        };
      }, [requestedCity]);
      state.city_audit = {
        stage,
        requested_city: requestedCity,
        time_to_suggestions: startedAt == null ? null : Math.max(0, now() - startedAt),
        ...(audit || {})
      };
      console.info(`[酒店助手 v${VERSION}] Managed city audit`, state.city_audit);
      state.phase = stage;
      return emit({ city_audit: state.city_audit });
    }

    async function runManagedCity(tabId, task) {
      setPhase('SETTING_CITY');
      const cityStartedAt = now();
      const before = await auditCityDom(tabId, task.city, 'CITY_INPUT_FOUND', cityStartedAt);
      if (before.city_audit?.input_found === false) {
        throw Object.assign(new Error('后台页面未找到城市输入框'), { code: 'CITY_INPUT_NOT_FOUND' });
      }
      setPhase('CITY_TEXT_ENTERED');
      await auditCityDom(tabId, task.city, 'CITY_SUGGESTIONS_WAITING', cityStartedAt);
      let result;
      try {
        result = await control(tabId, 'setCityResult', [task.city], 'SETTING_CITY');
      } catch (error) {
        await auditCityDom(tabId, task.city, 'CITY_SUGGESTIONS_VISIBLE', cityStartedAt).catch(() => {});
        throw error;
      }
      const after = await auditCityDom(tabId, task.city, 'CITY_SUGGESTIONS_VISIBLE', cityStartedAt);
      if (!result?.ok) {
        throw Object.assign(new Error(result?.error?.message || '后台城市设置失败'), {
          code: result?.error?.code || 'CITY_CONTROL_FAILED'
        });
      }
      if (after.city_audit?.exact_candidate_count > 0) setPhase('CITY_CANDIDATE_FOUND');
      setPhase('CITY_SELECTED');
      await auditCityDom(tabId, task.city, 'CITY_SETTLED', cityStartedAt);
      setPhase('CITY_VERIFIED', 'RUNNING');
      await auditCityDom(tabId, task.city, 'CITY_VERIFIED', cityStartedAt);
      return result;
    }

    async function waitForReady(tabId) {
      assertManagedTabId(tabId, 'readiness check');
      const started = now();
      while (now() - started < timeoutMs) {
        if (removedByUser) throw Object.assign(new Error('托管Tab已被用户关闭'), { code: 'TAB_CLOSED_BY_USER' });
        try {
          assertManagedTabId(tabId, 'readiness check');
          const tab = await chromeApi.tabs.get(tabId);
          if (tab?.url?.startsWith('https://hotels.ctrip.com/') && (tab.status === 'complete' || !tab.status)) {
            await execute(tabId, ['platforms/ctrip/parser.js', 'platforms/ctrip/controller.js']);
            return tab;
          }
        } catch (_) {}
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw Object.assign(new Error('托管Tab页面未就绪'), { code: 'TAB_LOAD_FAILED' });
    }

    async function control(tabId, method, args, phase) {
      setPhase(phase);
      await execute(tabId, ['platforms/ctrip/parser.js', 'platforms/ctrip/controller.js']);
      const result = await executeFunction(tabId, (name, values) => {
        const controller = globalThis.LivvCtripController;
        if (!controller || typeof controller[name] !== 'function') {
          return { ok: false, error: { code: 'CITY_CONTROLLER_UNAVAILABLE', message: '携程页面城市控制器未就绪' } };
        }
        return controller[name](...values);
      }, [method, args]);
      if (!result?.ok) throw Object.assign(new Error(result?.error?.message || `${method} failed`), { code: result?.error?.code || 'CONTROL_FAILED' });
      return result;
    }

    async function probeResultDom(tabId) {
      assertManagedTabId(tabId, 'result DOM probe');
      return executeFunction(tabId, () => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const selectors = [
          '[data-hotelid]', '[data-hotel-id]', '[data-poi-id]', '[data-testid*="hotel"]',
          '[data-test*="hotel"]', '[class*="hotel_item"]', '[class*="hotelItem"]',
          '[class*="hotel-card"]', '[class*="hotelCard"]', 'li[class*="hotel"]', '[role="listitem"]'
        ];
        const seen = new Set();
        let cardCount = 0;
        selectors.forEach((selector) => document.querySelectorAll(selector).forEach((node) => {
          if (seen.has(node)) return;
          const text = normalize(node.textContent);
          if (/酒店/.test(text) && (/价格|点评|评价|¥|￥/.test(text))) {
            seen.add(node);
            cardCount += 1;
          }
        }));
        const read = (selectorsForInput) => {
          for (const selector of selectorsForInput) {
            const node = document.querySelector(selector);
            if (node) return normalize(node.value || node.textContent);
          }
          return null;
        };
        return {
          ok: true,
          url: location.href,
          result_page: cardCount > 0,
          hotel_count: cardCount,
          page_context: {
            platform: 'ctrip',
            city: read(['#destinationInput']),
            checkin: read(['#checkInInput']),
            checkout: read(['#checkOutInput']),
            keyword: read(['input[placeholder*="位置/品牌/酒店"]', 'input[aria-label*="位置/品牌/酒店"]'])
          }
        };
      });
    }

    async function assertManagedTabActive() {
      const [active] = await tabsQuery({ active: true, currentWindow: true });
      if (active?.id !== state.managed_tab_id) {
        throw Object.assign(new Error('用户在托管任务初始化期间切换了标签页'), { code: 'USER_INTERRUPTED_BOOTSTRAP' });
      }
    }

    async function bootstrap(task) {
      state.bootstrap_started_at = new Date(now()).toISOString();
      const cityStartedAt = now();
      setPhase('SETTING_CITY');
      await assertManagedTabActive();
      const beforeCity = await auditCityDom(state.managed_tab_id, task.city, 'CITY_INPUT_FOUND', cityStartedAt);
      if (beforeCity.city_audit?.input_found === false) {
        throw Object.assign(new Error('托管页面未找到城市输入框'), { code: 'CITY_INPUT_NOT_FOUND' });
      }
      await auditCityDom(state.managed_tab_id, task.city, 'CITY_SUGGESTIONS_WAITING', cityStartedAt);
      let cityResult;
      try {
        cityResult = await control(state.managed_tab_id, 'setCityResult', [task.city], 'SETTING_CITY');
      } catch (error) {
        await auditCityDom(state.managed_tab_id, task.city, 'CITY_SUGGESTIONS_VISIBLE', cityStartedAt).catch(() => {});
        throw error;
      }
      const afterCity = await auditCityDom(state.managed_tab_id, task.city, 'CITY_SUGGESTIONS_VISIBLE', cityStartedAt);
      if (!cityResult?.ok) {
        throw Object.assign(new Error(cityResult?.error?.message || '后台城市设置失败'), {
          code: cityResult?.error?.code || 'CITY_CONTROL_FAILED'
        });
      }
      if (afterCity.city_audit?.exact_candidate_count > 0) setPhase('CITY_CANDIDATE_FOUND');
      setPhase('CITY_SELECTED');
      await auditCityDom(state.managed_tab_id, task.city, 'CITY_SETTLED', cityStartedAt);
      setPhase('CITY_VERIFIED');
      await auditCityDom(state.managed_tab_id, task.city, 'CITY_VERIFIED', cityStartedAt);
      setPhase('CITY_VERIFIED');

      await assertManagedTabActive();
      await control(state.managed_tab_id, 'setDatesResult', [task.checkin, task.checkout], 'SETTING_DATES');
      setPhase('DATES_VERIFIED');

      await assertManagedTabActive();
      await control(state.managed_tab_id, 'setKeywordResult', [task.keyword], 'SETTING_KEYWORD');
      setPhase('KEYWORD_VERIFIED');

      await assertManagedTabActive();
      assertManagedTabId(state.managed_tab_id, 'search URL read');
      const before = await chromeApi.tabs.get(state.managed_tab_id);
      setPhase('SEARCHING');
      await control(state.managed_tab_id, 'executeSearchResult', [task], 'SEARCHING');
      const snapshot = await waitForResults(state.managed_tab_id, task, before?.url);
      state.result = {
        task, managed_tab_id: state.managed_tab_id, initial_hotel_count: snapshot.hotel_count,
        page_context: snapshot.page_context, bootstrap_ready: false
      };
      state.bootstrap_ready_at = new Date(now()).toISOString();
      state.foreground_bootstrap_duration = Math.max(0, now() - Date.parse(state.bootstrap_started_at));
      setPhase('RESULT_DOM_READY');
      return snapshot;
    }

    async function waitForResults(tabId, task) {
      assertManagedTabId(tabId, 'result readiness check');
      const started = now();
      const resultReadyTimeoutMs = Math.min(timeoutMs, 20000);
      let lastError = { code: 'RESULT_DOM_TIMEOUT', message: '酒店结果DOM尚未就绪' };
      setPhase('WAITING_RESULT_DOM');
      while (now() - started < resultReadyTimeoutMs) {
        if (removedByUser) throw Object.assign(new Error('托管Tab已被用户关闭'), { code: 'TAB_CLOSED_BY_USER' });
        try {
          assertManagedTabId(tabId, 'result readiness check');
          const tab = await chromeApi.tabs.get(tabId);
          if (!tab?.url?.startsWith('https://hotels.ctrip.com/')) {
            lastError = { code: 'RESULT_DOM_TIMEOUT', message: 'Managed Tab未进入携程页面' };
          } else {
            const probe = await probeResultDom(tabId);
            if (probe?.hotel_count > 0) {
              state.result_dom_ready_at = new Date(now()).toISOString();
              setPhase('RESULT_DOM_READY', 'RUNNING', { result_dom_probe: probe });
              return { hotel_count: probe.hotel_count, hotels: [], page_context: probe.page_context, result_dom_probe: probe };
            }
            lastError = { code: 'RESULT_DOM_TIMEOUT', message: '酒店结果DOM尚未出现酒店Card' };
          }
        } catch (error) {
          lastError = { code: error?.code || 'RESULT_DOM_TIMEOUT', message: error?.message || String(error) };
          console.info(`[酒店助手 v${VERSION}] Result DOM probe`, { tab_id: tabId, error: lastError });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw Object.assign(new Error(lastError.message || '托管Tab搜索结果未就绪'), { code: lastError.code || 'RESULT_DOM_TIMEOUT' });
    }

    async function collect(tabId, task) {
      assertManagedTabId(tabId, 'collection');
      setPhase('FOREGROUND_COLLECTING');
      const key = sessionKey(task);
      const direct = directReader();
      const initial = await direct.readManagedPageOnce(tabId);
      if (!initial?.ok || !initial.hotel_count || !initial.hotels?.length) {
        throw Object.assign(new Error(initial?.error?.message || 'Managed direct read returned no hotels'), { code: initial?.error?.code || 'DIRECT_EMPTY_RESULT' });
      }
      const invocation = root.LivvCollectionInvocation?.createCollectionInvocation?.(chromeApi, {
        assertTabId: assertManagedTabId
      });
      const started = invocation
        ? await invocation.startCollection(tabId, { sessionKey: key, collectionLimit: task.collection_limit, executionMode: 'managed' })
        : await executeFunction(tabId, (session, limit) => globalThis.LivvCtripScrollCollector?.start({ sessionKey: session, collection_limit: limit, execution_mode: 'managed' }), [key, task.collection_limit]);
      if (!started?.ok) throw Object.assign(new Error('采集器启动失败'), { code: 'COLLECTION_FAILED' });
      const startedAt = now();
      let lastProgress = null;
      let lastHeartbeatEventAt = startedAt;
      let lastStallEventAt = null;
      while (now() - startedAt < timeoutMs * 5) {
        if (removedByUser) throw Object.assign(new Error('托管Tab已被用户关闭'), { code: 'TAB_CLOSED_BY_USER' });
        const current = await executeFunction(tabId, () => globalThis.LivvCtripScrollCollector?.getState?.() || null);
        if (current) {
          const collected = Number(current.collected_count || current.cumulative_unique || 0);
          const progressUnchanged = lastProgress !== null && collected === lastProgress;
          emit({ result: { ...current, task }, progress: `${collected} / ${task.collection_limit}` });
          if (collected !== lastProgress) {
            appendEvent('COLLECTION_PROGRESS', `${collected} / ${task.collection_limit}`, { collected_count: collected, collection_limit: task.collection_limit }, false);
            lastProgress = collected;
          }
          const heartbeat = current.last_heartbeat;
          if (heartbeat && now() - lastHeartbeatEventAt >= 10000 && current.status === 'RUNNING') {
            let managedTabExists = true;
            try { await chromeApi.tabs.get(tabId); } catch (_) { managedTabExists = false; }
            appendEvent('COLLECTION_HEARTBEAT', `后台采集仍在运行 · ${collected} / ${task.collection_limit}`, {
              iteration: heartbeat.iteration, scroll_y: heartbeat.scrollY_after, document_height: heartbeat.documentHeight_after,
              added_count: heartbeat.added_count, visibility_state: heartbeat.visibilityState,
              task_state: current.status, managed_tab_id: tabId, managed_tab_exists: managedTabExists,
              collector_running: ['RUNNING', 'WAITING', 'STOPPING'].includes(current.status)
            }, false);
            lastHeartbeatEventAt = now();
          }
          if (heartbeat && current.status === 'RUNNING' && progressUnchanged && now() - startedAt >= 30000
            && (!lastStallEventAt || now() - lastStallEventAt >= 30000)) {
            const classification = heartbeat.settle_result === 'SETTLE_TIMEOUT' ? 'BACKGROUND_SETTLE_STUCK'
              : heartbeat.scrollY_after === heartbeat.scrollY_before && heartbeat.distanceToBottom > heartbeat.viewportHeight * 0.5
                ? 'BACKGROUND_SCROLL_NOT_MOVING'
                : heartbeat.scrollY_after > heartbeat.scrollY_before && heartbeat.documentHeight_after <= heartbeat.documentHeight_before
                  && heartbeat.current_dom_count <= current.current_dom_count
                  ? 'BACKGROUND_LAZYLOAD_NOT_PROGRESSING' : 'BACKGROUND_COLLECTION_STALLED';
            appendEvent('BACKGROUND_COLLECTION_STALLED', classification, { classification, heartbeat, task_state: current.status, managed_tab_id: tabId, managed_tab_exists: true, collector_running: true }, false);
            lastStallEventAt = now();
          }
        }
        const collectorStatus = String(current?.status || '').toUpperCase();
        if (collectorStatus === 'COMPLETED' || collectorStatus === 'STOPPED') {
          const result = await executeFunction(tabId, () => globalThis.LivvCtripScrollCollector?.getResult?.() || null);
          if (result?.status === 'completed' && ['TARGET_REACHED', 'PAGE_EXHAUSTED'].includes(result.reason)) {
            if (result.reason === 'TARGET_REACHED') state.target_reached_at = new Date(now()).toISOString();
            state.completion_won = true;
            state.collection_finalized_at = new Date(now()).toISOString();
            appendEvent(result.reason, result.reason === 'TARGET_REACHED' ? '达到采集目标' : '页面无更多结果', { collected_count: result.collected_count || result.cumulative_unique || 0 });
            appendEvent('COLLECTION_FINALIZED', '采集结果已固化', { reason: result.reason });
            return result;
          }
          throw Object.assign(new Error(result?.reason || '采集未完成'), { code: 'COLLECTION_FAILED' });
        }
        const [activeTab] = await tabsQuery({ active: true, currentWindow: true });
        if (activeTab?.id !== tabId) {
          await executeFunction(tabId, () => globalThis.LivvCtripScrollCollector?.stop?.('USER_INTERRUPTED')).catch(() => {});
          throw Object.assign(new Error('用户切换离开Managed Tab，任务安全停止'), { code: 'USER_INTERRUPTED' });
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      throw Object.assign(new Error('托管采集超时'), { code: 'TIMEOUT' });
    }

    async function closeOwnedTab(preservePhase = false) {
      if (!state.created_by_hotel_assistant || !state.managed_tab_id) return;
      assertManagedTabId(state.managed_tab_id, 'close');
      appendEvent('MANAGED_TAB_CLOSING', `关闭 Managed Tab #${state.managed_tab_id}`, { managed_tab_id: state.managed_tab_id });
      removingOwned = true;
      await chromeApi.tabs.remove(state.managed_tab_id).catch(() => {});
      removingOwned = false;
      state.closed_at = new Date(now()).toISOString();
      state.managed_tab_closed_at = state.closed_at;
      if (state.task_started_at) state.total_duration = Math.max(0, Date.parse(state.closed_at) - Date.parse(state.task_started_at));
      if (state.failed_at) state.failure_cleanup_duration = Math.max(0, Date.parse(state.closed_at) - Date.parse(state.failed_at));
      if (!preservePhase) state.phase = 'CLOSED';
      if (state.status === 'COMPLETED') state.status = 'COMPLETED';
      appendEvent('MANAGED_TAB_CLOSED', `已关闭 Managed Tab #${state.managed_tab_id}`, { managed_tab_id: state.managed_tab_id });
      emit();
    }

    async function run(task) {
      assertManagedTabId(state.managed_tab_id, 'activation');
      await chromeApi.tabs.update(state.managed_tab_id, { active: true });
      await waitForReady(state.managed_tab_id);
      state.foreground_started_at = new Date(now()).toISOString();
      appendEvent('CTRIP_OPENED', '已打开携程页面', { managed_tab_id: state.managed_tab_id });
      setPhase('TAB_READY');
      state.execution_mode = 'MANAGED';
      await bootstrap(task);
      setPhase('READING_RESULT');
      const managedSnapshot = await readManagedPageOnce(state.managed_tab_id, task);
      state.result = { ...(state.result || {}), managed_hotel_count: managedSnapshot.hotel_count, page_context: managedSnapshot.page_context, bootstrap_ready: true };
      setPhase('BOOTSTRAP_READY');
      state.collection_started_at = new Date(now()).toISOString();
      setPhase('FOREGROUND_COLLECTING');
      state.background_visibility_state = await executeFunction(state.managed_tab_id, () => ({ visibilityState: document.visibilityState, hasFocus: document.hasFocus() })).catch(() => null);
      const collected = await collect(state.managed_tab_id, task);
      state.collection_completed_at = new Date(now()).toISOString();
      state.result = { ...(state.result || {}), ...collected, bootstrap_ready: true };
      state.reason = collected.reason || 'TARGET_REACHED';
      state.completed_at = new Date(now()).toISOString();
      state.status = 'COMPLETED';
      if (state.foreground_started_at) state.foreground_duration_ms = Math.max(0, now() - Date.parse(state.foreground_started_at));
      await closeOwnedTab(true);
      await chromeApi.tabs.update(state.origin_tab_id, { active: true });
      const [restored] = await tabsQuery({ active: true, currentWindow: true });
      if (restored?.id !== state.origin_tab_id) throw Object.assign(new Error('未能恢复用户原标签页'), { code: 'ORIGIN_TAB_RESTORE_FAILED' });
      state.origin_restored_at = new Date(now()).toISOString();
      state.task_completed_at = new Date(now()).toISOString();
      if (state.collection_finalized_at) state.completion_cleanup_duration_ms = Math.max(0, Date.parse(state.task_completed_at) - Date.parse(state.collection_finalized_at));
      appendEvent('ORIGIN_TAB_RESTORED', `已恢复 Origin Tab #${state.origin_tab_id}`, { origin_tab_id: state.origin_tab_id });
      appendEvent('TASK_COMPLETED', '后台任务完成', { reason: state.reason });
      emit({ result: state.result, origin_tab_restored: true });
      return state.result;
    }

    async function readManagedPageOnce(tabId, task) {
      const started = now();
      const reader = directReader();
      let lastError = { code: 'DIRECT_EXECUTION_FAILED', message: 'Managed direct reader did not respond' };
      let lastContextSignature = null;
      let waitingLogged = false;
      while (now() - started < timeoutMs) {
        if (removedByUser) throw Object.assign(new Error('托管Tab已被用户关闭'), { code: 'TAB_CLOSED_BY_USER' });
        const snapshot = await reader.readManagedPageOnce(tabId);
        state.direct_read_at = new Date(now()).toISOString();
        if (snapshot?.ok && snapshot.hotel_count > 0 && Array.isArray(snapshot.hotels) && snapshot.hotels.length > 0) {
          const audit = contextAudit(task, snapshot.page_context);
          state.direct_context_audit = audit;
          const contextSignature = JSON.stringify({ actual: audit.actual, mismatch_fields: audit.mismatch_fields });
          if (contextSignature !== lastContextSignature) {
            appendEvent('DIRECT_CONTEXT_OBSERVED', '已读取后台页面条件', {
              expected: audit.expected,
              actual: audit.actual,
              sources: audit.context_sources,
              mismatch_fields: audit.mismatch_fields
            }, false);
            lastContextSignature = contextSignature;
          }
          if (!audit.mismatch_fields.length) {
            state.direct_read_duration = Math.max(0, now() - started);
            return snapshot;
          }
          lastError = { code: 'DIRECT_CONTEXT_MISMATCH', message: 'Managed direct result context did not match task', context_audit: audit };
          if (!waitingLogged) {
            appendEvent('DIRECT_CONTEXT_WAITING', '页面条件尚未稳定，继续等待', { mismatch_fields: audit.mismatch_fields }, false);
            waitingLogged = true;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        lastError = snapshot?.error || { code: 'READER_EMPTY_RESULT', message: 'Managed reader returned no matching hotels' };
        if (snapshot?.ok) {
          lastError = snapshot.hotel_count > 0 && Array.isArray(snapshot.hotels) && snapshot.hotels.length > 0
            ? { code: 'DIRECT_CONTEXT_MISMATCH', message: 'Managed direct result context did not match task', context_audit: contextAudit(task, snapshot.page_context) }
            : { code: 'DIRECT_EMPTY_RESULT', message: 'Managed direct reader returned no hotel cards' };
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      state.direct_read_duration = Math.max(0, now() - started);
      appendEvent('DIRECT_CONTEXT_TIMEOUT', '页面条件校验超时', {
        expected: lastError.context_audit?.expected || contextAudit(task, {}).expected,
        actual: lastError.context_audit?.actual || null,
        sources: lastError.context_audit?.context_sources || null,
        mismatch_fields: lastError.context_audit?.mismatch_fields || []
      });
      throw Object.assign(new Error(lastError.message), { code: lastError.code, context_audit: lastError.context_audit });
    }

    async function start(input = {}) {
      if (runPromise || ['CREATING_TAB', 'RUNNING'].includes(state.status)) return { ok: false, error: { code: 'MANAGED_TASK_ALREADY_RUNNING' } };
      const task = { ...DEFAULT_TASK, ...input, collection_limit: normalizeLimit(input.collection_limit ?? DEFAULT_TASK.collection_limit) };
      if (!task.collection_limit) return { ok: false, error: { code: 'INVALID_COLLECTION_LIMIT' } };
      removedByUser = false;
      const active = (await tabsQuery({ active: true, currentWindow: true }))[0];
      const existing = await tabsQuery({});
      Object.assign(state, {
        status: 'CREATING_TAB', phase: 'CREATING_TAB', reason: null, error: null, result: null,
        task, task_snapshot: { city: task.city, checkin: task.checkin, checkout: task.checkout, keyword: task.keyword, collection_limit: task.collection_limit },
        task_id: `managed-${now()}`, managed_tab_id: null, created_by_hotel_assistant: false, city_audit: null, events: [],
        user_active_tab_id: active?.id || null, origin_window_id: active?.windowId || null, origin_tab_id: active?.id || null,
        execution_mode: 'MANAGED', existing_tab_ids: existing.map((tab) => tab.id),
        bootstrap_started_at: null, bootstrap_ready_at: null, task_started_at: new Date(now()).toISOString(),
        result_dom_ready_at: null, origin_restored_at: null, direct_read_at: null, failed_at: null, closed_at: null,
        direct_read_duration: null, failure_cleanup_duration: null, total_duration: null,
        direct_context_audit: null, foreground_started_at: null, collection_started_at: null, collection_completed_at: null,
        foreground_duration_ms: null, foreground_bootstrap_duration: null, background_visibility_state: null,
        target_reached_at: null, collection_finalized_at: null, managed_tab_closed_at: null, task_completed_at: null,
        completion_cleanup_duration_ms: null, completion_won: false,
        started_at: new Date(now()).toISOString(), completed_at: null
      });
      appendEvent('TASK_CREATED', '新建后台任务', { task_id: state.task_id });
      appendEvent('TASK_SNAPSHOT_CREATED', '已冻结任务参数', { task_snapshot: state.task_snapshot });
      emit();
      const created = await chromeApi.tabs.create({ url: 'https://hotels.ctrip.com/', active: false });
      if (!created?.id || state.existing_tab_ids.includes(created.id)) {
        throw Object.assign(new Error('Managed Tab ID不唯一'), { code: 'MANAGED_TAB_ASSERTION_FAILED' });
      }
      state.managed_tab_id = created.id;
      state.created_by_hotel_assistant = true;
      appendEvent('MANAGED_TAB_CREATED', `已创建 Managed Tab #${created.id}`, { managed_tab_id: created.id, origin_tab_id: state.origin_tab_id });
      const after = (await tabsQuery({ active: true, currentWindow: true }))[0];
      if (after?.id !== state.user_active_tab_id) {
        await chromeApi.tabs.remove(created.id).catch(() => {});
        state.status = 'FAILED'; state.phase = 'CLOSED'; state.reason = 'ACTIVE_TAB_CHANGED';
        emit();
        return { ok: false, error: { code: 'ACTIVE_TAB_CHANGED', message: 'Managed Tab改变了用户焦点' } };
      }
      emit({ managed_tab_id: created.id, created_by_hotel_assistant: true });
      runPromise = run(task).catch(async (error) => {
        const code = removedByUser ? 'TAB_CLOSED_BY_USER' : (error.code || 'ERROR');
        state.status = ['TAB_CLOSED_BY_USER', 'USER_INTERRUPTED'].includes(code) ? 'STOPPED' : 'FAILED';
        if (state.status === 'FAILED' && !state.phase.includes('BOOTSTRAP')) state.phase = state.phase || 'SETTING_CITY';
        state.reason = code;
        state.failed_at = new Date(now()).toISOString();
        state.error = { code, message: error.message, stage: state.phase, city_audit: state.city_audit, context_audit: error.context_audit || state.direct_context_audit };
        appendEvent('TASK_FAILED', error.message || code, {
          stage: state.phase, error_code: code, human_message: error.message,
          expected_context: state.error.context_audit?.expected, actual_context: state.error.context_audit?.actual,
          mismatch_fields: state.error.context_audit?.mismatch_fields
        });
        emit();
        const [activeNow] = await tabsQuery({ active: true, currentWindow: true }).catch(() => []);
        if (code !== 'USER_INTERRUPTED' && code !== 'TAB_CLOSED_BY_USER' && activeNow?.id === state.managed_tab_id) {
          await closeOwnedTab();
          await chromeApi.tabs.update(state.origin_tab_id, { active: true }).catch(() => {});
          const [restored] = await tabsQuery({ active: true, currentWindow: true }).catch(() => []);
          if (restored?.id === state.origin_tab_id) {
            state.origin_restored_at = new Date(now()).toISOString();
            appendEvent('ORIGIN_TAB_RESTORED', `已恢复 Origin Tab #${state.origin_tab_id}`, { origin_tab_id: state.origin_tab_id });
          }
        } else if (code === 'USER_INTERRUPTED') {
          await closeOwnedTab();
        }
        return null;
      }).finally(() => { runPromise = null; });
      return { ok: true, task_id: state.task_id, managed_tab_id: created.id, status: 'CREATING_TAB' };
    }

    function handleRemoved(tabId) {
      if (tabId !== state.managed_tab_id || !runPromise || removingOwned) return;
      if (state.completion_won) return;
      removedByUser = true;
      state.status = 'STOPPED'; state.reason = 'TAB_CLOSED_BY_USER';
      emit();
    }

    function getState() { return copyState(); }
    if (chromeApi?.tabs?.onRemoved?.addListener) chromeApi.tabs.onRemoved.addListener(handleRemoved);
    return { start, getState, handleRemoved, normalizeLimit };
  }

  function install(chromeApi = root.chrome) {
    const api = createManagedTabOrchestrator({ chromeApi, onUpdate: (state) => chromeApi.runtime?.sendMessage?.({ type: 'LIVV_MANAGED_TASK_UPDATE', state }).catch?.(() => {}) });
    chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'LIVV_START_MANAGED_TASK') { api.start(message.task).then(sendResponse).catch((error) => sendResponse({ ok: false, error: { code: error.code || 'MANAGED_TASK_FAILED', message: error.message } })); return true; }
      if (message?.type === 'LIVV_GET_MANAGED_TASK_STATE') { sendResponse(api.getState()); return false; }
      return false;
    });
    return api;
  }

  const api = { createManagedTabOrchestrator, install, normalizeLimit, DEFAULT_TASK, VERSION };
  root.LivvManagedTab = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
