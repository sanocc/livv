(function (root) {
  'use strict';

  const VERSION = '1.0.49';
  const DEFAULT_TASK = { city: '咸宁' };

  function createManagedWindowOrchestrator({ chromeApi = root.chrome, onUpdate = () => {}, now = () => Date.now(), timeoutMs = 30000 } = {}) {
    const state = {
      status: 'IDLE', phase: 'IDLE', reason: null, task: null, error: null,
      original_window_id: null, original_active_tab_id: null, original_tab_ids: [],
      managed_window_id: null, managed_tab_id: null, managed_window_focused: null,
      managed_tab_active: null, actual_url: null, city_audit: null,
      result: null, started_at: null, completed_at: null
    };
    let running = false;

    function emit(extra = {}) {
      const snapshot = { ...state, ...extra, task: state.task ? { ...state.task } : null };
      try { onUpdate(snapshot); } catch (_) {}
      return snapshot;
    }

    async function execute(tabId, files) {
      return chromeApi.scripting.executeScript({ target: { tabId }, files });
    }

    async function executeFunction(tabId, func, args = []) {
      const [{ result }] = await chromeApi.scripting.executeScript({ target: { tabId }, func, args });
      return result;
    }

    async function auditCity(tabId, requestedCity, stage, startedAt) {
      const audit = await executeFunction(tabId, (requested) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const visible = (node) => {
          if (!node) return false;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const input = document.querySelector('#destinationInput');
        const selectors = ['[role="option"]', 'li', '[class*="suggest"]', '[class*="city"]', '[class*="destination"]'];
        const nodes = [];
        const seen = new Set();
        selectors.forEach((selector) => document.querySelectorAll(selector).forEach((node) => {
          if (seen.has(node) || !visible(node)) return;
          const text = normalize(node.textContent);
          if (!text || text.length > 120) return;
          seen.add(node);
          nodes.push({ tag: node.tagName, class: String(node.className || ''), text });
        }));
        const exact = nodes.filter((node) => node.text === normalize(requested));
        return {
          input_found: Boolean(input), input_value: input?.value || null,
          input_focused: Boolean(input && document.activeElement === input),
          visibility_state: document.visibilityState, has_focus: document.hasFocus(),
          suggestion_container_found: nodes.length > 0, suggestion_count: nodes.length,
          candidate_texts: nodes.slice(0, 20).map((node) => node.text),
          exact_candidate_count: exact.length,
          controller_present: Boolean(globalThis.LivvCtripController),
          controller_method_present: typeof globalThis.LivvCtripController?.setCityResult === 'function'
        };
      }, [requestedCity]);
      state.city_audit = {
        stage, requested_city: requestedCity,
        time_to_suggestions: Math.max(0, now() - startedAt), ...(audit || {})
      };
      console.info(`[酒店助手 v${VERSION}] Managed window city audit`, state.city_audit);
      state.phase = stage;
      return emit({ city_audit: state.city_audit });
    }

    async function waitForReady(windowId, tabId) {
      const started = now();
      while (now() - started < timeoutMs) {
        const tab = await chromeApi.tabs.get(tabId);
        if (tab?.windowId === windowId && tab.url?.startsWith('https://hotels.ctrip.com/')) {
          state.actual_url = tab.url;
          if (tab.status === 'complete' || !tab.status) {
            await execute(tabId, ['platforms/ctrip/parser.js', 'platforms/ctrip/controller.js']);
            return tab;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw Object.assign(new Error('托管窗口携程页面未就绪'), { code: 'MANAGED_WINDOW_TAB_LOAD_FAILED' });
    }

    async function runCity(windowId, tabId, task) {
      const startedAt = now();
      state.phase = 'SETTING_CITY'; state.status = 'RUNNING'; emit();
      const before = await auditCity(tabId, task.city, 'CITY_INPUT_FOUND', startedAt);
      if (before.city_audit?.input_found === false) throw Object.assign(new Error('未找到城市输入框'), { code: 'CITY_INPUT_NOT_FOUND' });
      state.phase = 'CITY_TEXT_ENTERED'; emit();
      await auditCity(tabId, task.city, 'CITY_SUGGESTIONS_WAITING', startedAt);
      const result = await executeFunction(tabId, (city) => globalThis.LivvCtripController?.setCityResult?.(city) || null, [task.city]);
      const after = await auditCity(tabId, task.city, 'CITY_SUGGESTIONS_VISIBLE', startedAt);
      if (!result?.ok) throw Object.assign(new Error(result?.error?.message || '城市设置失败'), { code: result?.error?.code || 'CITY_CONTROL_FAILED' });
      if (after.city_audit?.exact_candidate_count > 0) { state.phase = 'CITY_CANDIDATE_FOUND'; emit(); }
      state.phase = 'CITY_SELECTED'; emit();
      await auditCity(tabId, task.city, 'CITY_SETTLED', startedAt);
      state.phase = 'CITY_VERIFIED'; emit();
      await auditCity(tabId, task.city, 'CITY_VERIFIED', startedAt);
      return result;
    }

    async function closeManagedWindow() {
      if (!state.managed_window_id) return;
      await chromeApi.windows.remove(state.managed_window_id).catch(() => {});
      emit({ managed_window_closed: true });
    }

    async function start(input = {}) {
      if (running) return { ok: false, error: { code: 'MANAGED_WINDOW_TASK_ALREADY_RUNNING' } };
      const task = { ...DEFAULT_TASK, ...input };
      const originalWindow = await chromeApi.windows.getLastFocused({ windowTypes: ['normal'] });
      const originalTabs = await chromeApi.tabs.query({ windowId: originalWindow.id });
      const originalActive = originalTabs.find((tab) => tab.active) || (await chromeApi.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      Object.assign(state, {
        status: 'CREATING_WINDOW', phase: 'CREATING_WINDOW', reason: null, error: null, result: null,
        task, original_window_id: originalWindow.id, original_active_tab_id: originalActive?.id || null,
        original_tab_ids: originalTabs.map((tab) => tab.id), managed_window_id: null, managed_tab_id: null,
        managed_window_focused: null, managed_tab_active: null, actual_url: null, city_audit: null,
        started_at: new Date(now()).toISOString(), completed_at: null
      });
      running = true; emit();
      try {
        const created = await chromeApi.windows.create({ url: 'https://hotels.ctrip.com/', type: 'normal', focused: false });
        state.managed_window_id = created.id;
        const managedTabs = created.tabs || await chromeApi.tabs.query({ windowId: created.id });
        const managedTab = managedTabs.find((tab) => tab.active) || managedTabs[0];
        state.managed_tab_id = managedTab?.id || null;
        state.managed_window_focused = Boolean(created.focused);
        state.managed_tab_active = Boolean(managedTab?.active);
        const focused = await chromeApi.windows.getLastFocused({ windowTypes: ['normal'] });
        if (!state.managed_tab_id) throw Object.assign(new Error('托管窗口没有活动Tab'), { code: 'MANAGED_WINDOW_TAB_NOT_FOUND' });
        if (focused.id !== state.original_window_id) throw Object.assign(new Error('用户窗口焦点发生变化'), { code: 'ORIGINAL_WINDOW_FOCUS_LOST' });
        emit({ managed_window_id: state.managed_window_id, managed_tab_id: state.managed_tab_id });
        const ready = await waitForReady(state.managed_window_id, state.managed_tab_id);
        state.actual_url = ready.url || state.actual_url;
        await runCity(state.managed_window_id, state.managed_tab_id, task);
        state.status = 'COMPLETED'; state.reason = 'CITY_VERIFIED';
        state.result = { city_verified: true, actual_url: state.actual_url };
        state.completed_at = new Date(now()).toISOString(); emit();
        await closeManagedWindow();
        return { ok: true, state: emit() };
      } catch (error) {
        state.status = 'FAILED'; state.phase = 'SETTING_CITY'; state.reason = error.code || 'ERROR';
        state.error = { code: error.code || 'ERROR', message: error.message, stage: 'SETTING_CITY', city_audit: state.city_audit };
        emit();
        await closeManagedWindow();
        return { ok: false, error: state.error, state: emit() };
      } finally { running = false; }
    }

    return { start, getState: () => emit() };
  }

  function install(chromeApi = root.chrome) {
    const api = createManagedWindowOrchestrator({ chromeApi, onUpdate: (state) => chromeApi.runtime?.sendMessage?.({ type: 'LIVV_MANAGED_WINDOW_UPDATE', state }).catch?.(() => {}) });
    chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'LIVV_START_MANAGED_WINDOW_TASK') { api.start(message.task).then(sendResponse).catch((error) => sendResponse({ ok: false, error: { code: error.code || 'MANAGED_WINDOW_FAILED', message: error.message } })); return true; }
      if (message?.type === 'LIVV_GET_MANAGED_WINDOW_STATE') { sendResponse(api.getState()); return false; }
      return false;
    });
    return api;
  }

  const api = { createManagedWindowOrchestrator, install, VERSION };
  root.LivvManagedWindow = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
