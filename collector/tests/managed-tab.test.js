const assert = require('assert');
const fs = require('fs');
global.LivvDirectReader = require('../shared/direct-reader.js');
global.LivvCollectionInvocation = require('../shared/collection-invocation.js');
const { createManagedTabOrchestrator, normalizeLimit, DEFAULT_TASK } = require('../background/managed-tab.js');

assert.deepStrictEqual(DEFAULT_TASK, { city: '咸宁', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '中心花坛', collection_limit: 30 });
assert.strictEqual(normalizeLimit(30), 30);
assert.strictEqual(normalizeLimit(0), null);
assert.strictEqual(normalizeLimit(201), null);

const created = [];
const removed = [];
const executedTargets = [];
let activeTabId = 1;
const tabs = new Map([
  [1, { id: 1, url: 'https://chatgpt.com/', status: 'complete' }],
  [2, { id: 2, url: 'https://example.com/', status: 'complete' }],
  [3, { id: 3, url: 'https://example.org/', status: 'complete' }]
]);
const onRemoved = [];
const chromeApi = {
  tabs: {
    onRemoved: { addListener(listener) { onRemoved.push(listener); } },
    async query(query) { return query?.active ? [tabs.get(activeTabId)] : Array.from(tabs.values()); },
    async create(options) { assert.strictEqual(options.active, false); const tab = { id: 4, url: options.url, status: 'complete' }; tabs.set(4, tab); created.push(options); return tab; },
    async update(id, changes) { if (changes.active) activeTabId = id; return tabs.get(id); },
    async get(id) { return tabs.get(id); },
    async remove(id) { removed.push(id); tabs.delete(id); },
    async sendMessage() { return { ok: true, hotel_count: 1, hotels: [{}], page_context: { platform: 'ctrip', city: '咸宁', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '中心花坛' } }; }
  },
  scripting: {
    async executeScript(details) {
      executedTargets.push(details.target.tabId);
      if (!details.func) return [{}];
      const source = details.func.toString();
      if (source.includes('CtripController')) return [{ result: { ok: true } }];
      if (source.includes('hotel-card') || source.includes('result_page')) return [{ result: { ok: true, result_page: true, hotel_count: 1, page_context: { city: '咸宁', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '中心花坛' } } }];
      if (source.includes('LivvCtripParser') || source.includes('parsePageContext')) return [{ result: { ok: true, context: { city: '咸宁', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '中心花坛' }, page_context: { city: '咸宁', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '中心花坛' }, hotel_count: 1, hotels: [{}] } }];
      if (source.includes('ScrollCollector.start')) return [{ result: { ok: true } }];
      if (source.includes('ScrollCollector?.getState')) return [{ result: { status: 'COMPLETED', collected_count: 30, cumulative_unique: 30, collection_limit: 30 } }];
      if (source.includes('ScrollCollector?.getResult')) return [{ result: { ok: true, status: 'completed', reason: 'TARGET_REACHED', collected_count: 30, hotels: [] } }];
      return [{ result: { ok: true } }];
    }
  },
  runtime: { sendMessage() { return Promise.resolve(); } }
};

(async () => {
  const updates = [];
  const orchestrator = createManagedTabOrchestrator({ chromeApi, onUpdate: (state) => updates.push(state) });
  const start = await orchestrator.start(DEFAULT_TASK);
  assert.strictEqual(start.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const state = orchestrator.getState();
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].url, 'https://hotels.ctrip.com/');
  assert.strictEqual(state.user_active_tab_id, 1);
  assert.strictEqual(state.managed_tab_id, 4);
  assert.strictEqual(state.created_by_hotel_assistant, true);
  assert.strictEqual(state.phase, 'FOREGROUND_COLLECTING');
  assert.strictEqual(state.reason, 'TARGET_REACHED');
  assert.strictEqual(state.result.bootstrap_ready, true);
  assert.strictEqual(state.result.collected_count, 30);
  assert.strictEqual(state.origin_tab_id, 1);
  assert.ok(state.foreground_started_at);
  assert.ok(state.collection_started_at);
  assert.ok(state.collection_completed_at);
  assert.ok(state.foreground_duration_ms >= 0);
  assert.strictEqual(state.completion_won, true);
  assert.ok(state.target_reached_at);
  assert.ok(state.collection_finalized_at);
  assert.ok(state.task_completed_at);
  assert.deepStrictEqual(state.task_snapshot, DEFAULT_TASK);
  assert.ok(state.events.length <= 50);
  assert.ok(state.events.some((event) => event.event === 'TASK_SNAPSHOT_CREATED'));
  assert.ok(state.events.some((event) => event.event === 'MANAGED_TAB_CREATED'));
  assert.ok(state.events.some((event) => event.event === 'COLLECTION_PROGRESS'));
  assert.ok(state.events.some((event) => event.event === 'TASK_COMPLETED'));
  assert.strictEqual(state.foreground_bootstrap_duration >= 0, true);
  assert.deepStrictEqual(removed, [4]);
  assert.ok(executedTargets.length > 0 && executedTargets.every((id) => id === 4));
  assert.deepStrictEqual(state.existing_tab_ids, [1, 2, 3]);
  assert.strictEqual(onRemoved.length, 1);

  const source = fs.readFileSync('collector/background/managed-tab.js', 'utf8');
  assert.ok(source.includes('active: false'));
  assert.ok(source.includes('TAB_CLOSED_BY_USER'));
  assert.ok(source.includes('CITY_SUGGESTIONS_WAITING'));
  assert.ok(source.includes('visibility_state'));
  assert.ok(source.includes('candidate_texts'));
  assert.ok(source.includes('time_to_suggestions'));
  assert.ok(source.includes('CITY_INPUT_FOUND'));
  assert.ok(source.includes('CITY_SETTLED'));
  assert.ok(source.includes('CITY_CONTROLLER_UNAVAILABLE'));
  assert.ok(source.includes('DIRECT_CONTEXT_MISMATCH'));
  assert.ok(source.includes('RESULT_DOM_READY'));
  assert.ok(source.includes('WAITING_RESULT_DOM'));
  assert.ok(source.includes('RESULT_DOM_TIMEOUT'));
  assert.ok(source.includes('READING_RESULT'));
  assert.ok(source.includes('mismatch_fields'));
  assert.ok(source.includes('direct_context_audit'));
  assert.ok(source.includes('direct_read_duration'));
  assert.ok(source.includes('failure_cleanup_duration'));
  assert.ok(source.includes('DIRECT_CONTEXT_OBSERVED'));
  assert.ok(source.includes('DIRECT_CONTEXT_WAITING'));
  assert.ok(source.includes('DIRECT_CONTEXT_TIMEOUT'));
  assert.ok(source.includes('FOREGROUND_COLLECTING'));
  assert.ok(source.includes('USER_INTERRUPTED'));
  assert.ok(source.includes('assertManagedTabId'));
  assert.ok(source.includes('MANAGED_TAB_ASSERTION_FAILED'));
  assert.ok(source.includes('tabs.update(state.managed_tab_id, { active: true })'));
  assert.ok(source.includes('tabs.update(state.origin_tab_id, { active: true })'));
  console.log('managed tab tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
