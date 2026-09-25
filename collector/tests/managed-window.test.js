const assert = require('assert');
const fs = require('fs');
const { createManagedWindowOrchestrator } = require('../background/managed-window.js');

const windows = new Map([[1, { id: 1, focused: true }]]);
const tabs = new Map([[10, { id: 10, windowId: 1, active: true, url: 'https://chatgpt.com/' }]]);
const removed = [];
const chromeApi = {
  windows: {
    async getLastFocused() { return windows.get(1); },
    async create(options) { assert.strictEqual(options.focused, false); const win = { id: 2, focused: false, tabs: [{ id: 20, windowId: 2, active: true, status: 'complete', url: 'https://hotels.ctrip.com/' }] }; windows.set(2, win); tabs.set(20, win.tabs[0]); return win; },
    async remove(id) { removed.push(id); windows.delete(id); }
  },
  tabs: {
    async query(query) { return query.windowId === 1 ? [tabs.get(10)] : [tabs.get(20)]; },
    async get(id) { return tabs.get(id); }
  },
  scripting: {
    async executeScript(details) {
      if (!details.func) return [{}];
      const source = details.func.toString();
      if (source.includes('setCityResult?.(city)')) return [{ result: { ok: true } }];
      return [{ result: { input_found: true, input_value: '咸宁', suggestion_count: 1, exact_candidate_count: 1, visibility_state: 'visible', has_focus: false, candidate_texts: ['咸宁'] } }];
    }
  }
};

(async () => {
  const api = createManagedWindowOrchestrator({ chromeApi });
  const result = await api.start({ city: '咸宁' });
  assert.strictEqual(result.ok, true);
  const state = api.getState();
  assert.strictEqual(state.original_window_id, 1);
  assert.strictEqual(state.managed_window_id, 2);
  assert.strictEqual(state.managed_tab_id, 20);
  assert.strictEqual(state.managed_window_focused, false);
  assert.strictEqual(state.managed_tab_active, true);
  assert.strictEqual(state.city_audit.visibility_state, 'visible');
  assert.strictEqual(state.city_audit.has_focus, false);
  assert.strictEqual(state.phase, 'CITY_VERIFIED');
  assert.deepStrictEqual(removed, [2]);
  const source = fs.readFileSync('collector/background/managed-window.js', 'utf8');
  assert.ok(source.includes("focused: false"));
  assert.ok(!source.includes('windows.update'));
  assert.ok(!source.includes('tabs.update'));
  console.log('managed window tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
