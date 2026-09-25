(function (root) {
  'use strict';

  const VERSION = '1.0.34';
  const KEY = '__LIVV_CTRIP_SCROLL_COLLECTOR__';
  const DEFAULTS = {
    stepRatio: 0.8,
    pollMs: 100,
    stableMs: 350,
    settleTimeoutMs: 5000,
    maxIterations: 100,
    maxDurationMs: 5 * 60 * 1000,
    manualScrollThreshold: 0.35
  };
  const HOTEL_FIELDS = [
    'platform', 'platform_hotel_id', 'hotel_name', 'is_ad', 'score', 'review_count',
    'room_name', 'breakfast', 'cancellation', 'activity_tags', 'discount_summary',
    'original_price', 'display_price', 'latest_dynamic', 'dynamic'
  ];

  const normalize = (value) => value == null ? '' : String(value).trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeLimit(value) {
    const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
    return Number.isInteger(number) && number >= 1 && number <= 200 ? number : null;
  }

  function mergeHotel(previous, next) {
    if (!previous) return { ...next };
    const merged = { ...previous };
    HOTEL_FIELDS.forEach((field) => {
      const value = next[field];
      const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
      if (empty) return;
      if (field === 'dynamic' && previous.dynamic) return;
      merged[field] = Array.isArray(value) ? value.slice() : value;
    });
    return merged;
  }

  function createCollector({
    document: doc = root.document,
    window: win = root,
    parser = root.LivvCtripParser,
    semantic = root.LivvDynamicSemantic,
    observer = root.LivvCtripResultObserver,
    onUpdate = () => {},
    now = () => Date.now(),
    config = {},
    collectionLimit = 30,
    completionDetector = root.LivvCtripCompletionDetector?.createDetector?.({ now, config })
  } = {}) {
    const options = { ...DEFAULTS, ...config };
    const state = {
      status: 'IDLE', reason: null, iterations: 0, cumulative_unique: 0,
      current_dom_count: 0, added_count: 0, removed_count: 0,
      scroll_y: 0, document_height: 0, viewport_height: 0,
      reported_total: null, session_key: null, started_at: null,
      last_observed_at: null, completion_status: null, completion_reason: null,
      completed_at: null, duration_ms: null, collection_limit: normalizeLimit(collectionLimit) || 30,
      collected_count: 0
    };
    let hotels = new Map();
    let cancelled = false;
    let pauseRequested = false;
    let stopReason = null;
    let runPromise = null;
    let lastSettledScroll = null;

    function copyState() { return { ...state }; }

    function emit(extra = {}) {
      const snapshot = { ...copyState(), ...extra, cumulative_unique: hotels.size };
      try { onUpdate(snapshot); } catch (_) {}
      return snapshot;
    }

    function reset(sessionKey = null, limit = state.collection_limit) {
      const normalizedLimit = normalizeLimit(limit);
      cancelled = true;
      pauseRequested = false;
      stopReason = null;
      observer?.reset?.();
      completionDetector?.reset?.();
      hotels = new Map();
      runPromise = null;
      lastSettledScroll = null;
      Object.assign(state, {
        status: 'IDLE', reason: null, iterations: 0, cumulative_unique: 0,
        current_dom_count: 0, added_count: 0, removed_count: 0,
        scroll_y: Number(win.scrollY || 0),
        document_height: Number(doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 0),
        viewport_height: Number(win.innerHeight || doc?.documentElement?.clientHeight || 0),
        reported_total: null, session_key: sessionKey, started_at: null,
        last_observed_at: null, completion_status: null, completion_reason: null,
        completed_at: null, duration_ms: null, collection_limit: normalizedLimit,
        collected_count: 0
      });
      return { ok: true, action: 'reset_collection', session_key: sessionKey, collection_limit: normalizedLimit };
    }

    function readBatch() {
      const metadata = parser?.findHotelCards?.(doc) || [];
      const observedAt = new Date(now()).toISOString();
      const batch = metadata.map((item, index) => {
        const hotel = parser.parseHotelCard(item, index + 1);
        if (hotel && !hotel.dynamic && semantic?.parseDynamic) {
          hotel.dynamic = semantic.parseDynamic(hotel.latest_dynamic, observedAt);
        }
        return hotel;
      }).filter((hotel) => hotel && normalize(hotel.platform_hotel_id));
      const previousIds = new Set(hotels.keys());
      let added = 0;
      batch.forEach((hotel) => {
        const id = normalize(hotel.platform_hotel_id);
        if (!hotels.has(id) && hotels.size >= state.collection_limit) return;
        const merged = mergeHotel(hotels.get(id), hotel);
        if (!hotels.has(id)) {
          added += 1;
          merged.collection_rank = hotels.size + 1;
        }
        hotels.set(id, merged);
      });
      state.current_dom_count = batch.length;
      state.added_count = added;
      state.removed_count = Array.from(previousIds).filter((id) => !batch.some((hotel) => normalize(hotel.platform_hotel_id) === id)).length;
      state.cumulative_unique = hotels.size;
      state.collected_count = hotels.size;
      state.last_observed_at = observedAt;
      return { batch, added };
    }

    function observe() {
      let snapshot = null;
      if (observer?.observeResultState) snapshot = observer.observeResultState();
      state.scroll_y = Number(win.scrollY || 0);
      state.document_height = Number(doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 0);
      state.viewport_height = Number(win.innerHeight || doc?.documentElement?.clientHeight || 0);
      state.reported_total = snapshot?.page_reported_total ?? state.reported_total;
      const completion = completionDetector?.observe?.({
        scroll_y: state.scroll_y,
        viewport_height: state.viewport_height,
        document_height: state.document_height,
        current_dom_ids: snapshot?.unique_hotel_ids || [],
        cumulative_unique: hotels.size,
        added_count: state.added_count,
        loading_indicator_present: snapshot?.loading_indicator_present ?? hasLoading(),
        end_marker_present: false
      }) || { status: 'CONTINUE', reason: null };
      state.completion_status = completion.status;
      state.completion_reason = completion.reason;
      return { snapshot, completion };
    }

    function hasLoading() { return Boolean(observer?.hasLoadingIndicator?.(doc)); }

    function currentContextKey() {
      if (root.location?.hostname && root.location.hostname !== 'hotels.ctrip.com') return null;
      const context = parser?.parsePageContext?.(doc, root.location?.href);
      return context ? [context.city, context.checkin, context.checkout, context.keyword].map((part) => part || '').join('|') : null;
    }

    async function waitForStable() {
      const started = now();
      let stableSince = null;
      let previous = null;
      while (now() - started < options.settleTimeoutMs) {
        if (cancelled) return { ok: false, reason: pauseRequested ? 'TAB_CHANGED' : 'USER_STOPPED' };
        const ids = (parser?.findHotelCards?.(doc) || []).map((item) => normalize(parser.parseHotelCard(item, 0)?.platform_hotel_id)).filter(Boolean);
        const sample = {
          scroll: Number(win.scrollY || 0),
          height: Number(doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 0),
          ids: ids.join(',')
        };
        const same = previous && sample.scroll === previous.scroll && sample.height === previous.height && sample.ids === previous.ids;
        if (same) {
          stableSince ??= now();
          if (now() - stableSince >= options.stableMs) return { ok: true };
        } else {
          stableSince = null;
          previous = sample;
        }
        await sleep(options.pollMs);
      }
      return { ok: false, reason: 'SETTLE_TIMEOUT' };
    }

    function shouldStop(completion) { return completion?.status === 'COMPLETED'; }

    function finalize() {
      if (state.status === 'PAUSED' || !state.started_at) return;
      state.completed_at = state.completed_at || new Date(now()).toISOString();
      state.duration_ms = Math.max(0, now() - Date.parse(state.started_at));
    }

    async function run(sessionKey, { resume = false } = {}) {
      state.status = 'RUNNING';
      state.reason = null;
      state.session_key = sessionKey;
      cancelled = false;
      pauseRequested = false;
      stopReason = null;
      if (!resume) {
        state.started_at = new Date(now()).toISOString();
        let initial = readBatch();
        observe();
        state.iterations = 0;
        emit({ phase: 'initial_batch' });
        if (hotels.size >= state.collection_limit) {
          state.status = 'COMPLETED'; state.reason = 'TARGET_REACHED';
        }
      } else {
        lastSettledScroll = Number(win.scrollY || 0);
        emit({ phase: 'resumed' });
      }
      lastSettledScroll = Number(win.scrollY || 0);

      while (!cancelled && state.status === 'RUNNING') {
        if (now() - Date.parse(state.started_at) >= options.maxDurationMs) {
          state.status = 'STOPPED'; state.reason = 'SAFETY_LIMIT'; break;
        }
        if (state.iterations >= options.maxIterations) {
          state.status = 'STOPPED'; state.reason = 'SAFETY_LIMIT'; break;
        }
        if (root.location?.hostname && root.location.hostname !== 'hotels.ctrip.com') {
          state.status = 'STOPPED'; state.reason = 'PAGE_CHANGED'; break;
        }
        const liveSessionKey = currentContextKey();
        if (sessionKey && liveSessionKey !== sessionKey) {
          state.status = 'STOPPED'; state.reason = 'SESSION_CHANGED'; break;
        }
        const currentScroll = Number(win.scrollY || 0);
        if (lastSettledScroll != null && Math.abs(currentScroll - lastSettledScroll) > state.viewport_height * options.manualScrollThreshold) {
          state.status = 'STOPPED'; state.reason = 'MANUAL_SCROLL_DETECTED'; break;
        }
        const step = Math.max(1, Math.round((Number(win.innerHeight || state.viewport_height || 1)) * options.stepRatio));
        if (typeof win.scrollBy !== 'function') { state.status = 'ERROR'; state.reason = 'SCROLL_UNAVAILABLE'; break; }
        win.scrollBy({ top: step, behavior: 'smooth' });
        state.iterations += 1;
        const settled = await waitForStable();
        if (!settled.ok) {
          state.status = settled.reason === 'TAB_CHANGED' ? 'PAUSED' : (settled.reason === 'USER_STOPPED' ? 'STOPPED' : 'ERROR');
          state.reason = settled.reason === 'USER_STOPPED' ? (stopReason || 'USER_STOPPED') : settled.reason;
          break;
        }
        const result = readBatch();
        const observation = observe();
        lastSettledScroll = Number(win.scrollY || 0);
        emit({ phase: 'iteration', snapshot: observation.snapshot, completion: observation.completion });
        if (hotels.size >= state.collection_limit) { state.status = 'COMPLETED'; state.reason = 'TARGET_REACHED'; break; }
        if (shouldStop(observation.completion)) { state.status = 'COMPLETED'; state.reason = 'PAGE_EXHAUSTED'; break; }
      }
      if (cancelled && state.status === 'RUNNING') {
        state.status = pauseRequested ? 'PAUSED' : 'STOPPED';
        state.reason = pauseRequested ? 'TAB_CHANGED' : (stopReason || 'USER_STOPPED');
      }
      finalize();
      state.cumulative_unique = hotels.size;
      emit({ phase: 'finished' });
      return getResult();
    }

    function launch(sessionKey, resume = false) {
      let promise;
      promise = run(sessionKey, { resume }).finally(() => {
        if (runPromise === promise) runPromise = null;
      });
      runPromise = promise;
      return promise;
    }

    function start({ sessionKey = null, collection_limit: requestedLimit = state.collection_limit } = {}) {
      const limit = normalizeLimit(requestedLimit);
      if (!limit) {
        return { ok: false, action: 'collect_loaded_results', error: { code: 'INVALID_COLLECTION_LIMIT', message: '采集数量必须是1到200的整数' } };
      }
      if (runPromise && (state.status === 'RUNNING' || state.status === 'WAITING' || state.status === 'STOPPING')) {
        return { ok: false, action: 'collect_loaded_results', error: { code: 'COLLECTION_ALREADY_RUNNING', message: '采集已在运行' } };
      }
      reset(sessionKey, limit);
      launch(sessionKey);
      return { ok: true, action: 'collect_loaded_results', status: 'running', session_key: sessionKey, collection_limit: limit };
    }

    function pause() {
      if (!runPromise || !['RUNNING', 'WAITING', 'STOPPING'].includes(state.status)) {
        return { ok: false, status: state.status, reason: state.reason || 'NOT_RUNNING' };
      }
      pauseRequested = true;
      completionDetector?.pause?.();
      state.status = 'PAUSED';
      state.reason = 'TAB_CHANGED';
      cancelled = true;
      return { ok: true, status: 'paused', reason: 'TAB_CHANGED', cumulative_unique: hotels.size };
    }

    function resume({ sessionKey = null, collection_limit: requestedLimit = state.collection_limit } = {}) {
      const limit = normalizeLimit(requestedLimit);
      if (state.status !== 'PAUSED') {
        return { ok: false, status: state.status, error: { code: 'COLLECTION_NOT_PAUSED', message: '当前采集任务不可恢复' } };
      }
      if (!limit || sessionKey !== state.session_key || limit !== state.collection_limit) {
        state.status = 'STOPPED';
        state.reason = 'SESSION_CHANGED';
        return { ok: false, status: 'stopped', reason: 'SESSION_CHANGED', error: { code: 'SESSION_CHANGED', message: '采集任务已变化' } };
      }
      if (runPromise) {
        const previousRun = runPromise;
        state.status = 'WAITING';
        previousRun.then(() => {
          if (state.status === 'WAITING' && state.session_key === sessionKey) {
            completionDetector?.resume?.();
            launch(sessionKey, true);
          }
        });
        return { ok: true, action: 'resume_collection', status: 'waiting', session_key: sessionKey, collection_limit: limit, cumulative_unique: hotels.size };
      }
      pauseRequested = false;
      cancelled = false;
      completionDetector?.resume?.();
      launch(sessionKey, true);
      return { ok: true, action: 'resume_collection', status: 'running', session_key: sessionKey, collection_limit: limit, cumulative_unique: hotels.size };
    }

    function stop(reason = 'USER_STOPPED') {
      if (!runPromise && !['PAUSED', 'RUNNING', 'WAITING', 'STOPPING'].includes(state.status)) {
        return { ok: true, status: state.status, reason: state.reason || 'NOT_RUNNING', cumulative_unique: hotels.size };
      }
      state.status = 'STOPPING';
      pauseRequested = false;
      stopReason = reason;
      cancelled = true;
      if (!runPromise) {
        state.status = 'STOPPED';
        state.reason = reason;
      }
      return { ok: true, status: 'stopping', reason, cumulative_unique: hotels.size };
    }

    function getState() { return emit(); }
    function getResult() {
      return {
        ok: state.status === 'COMPLETED' || state.status === 'STOPPED',
        action: 'collect_loaded_results', status: state.status.toLowerCase(),
        reason: state.reason, iterations: state.iterations,
        reported_total: state.reported_total, collection_limit: state.collection_limit,
        collected_count: hotels.size, cumulative_unique: hotels.size,
        completion_reason: state.completion_reason || state.reason,
        started_at: state.started_at, completed_at: state.completed_at, duration_ms: state.duration_ms,
        hotels: Array.from(hotels.values()), state: copyState()
      };
    }

    return { start, pause, resume, stop, reset, getState, getResult };
  }

  const existing = root[KEY];
  if (existing?.version === VERSION && existing.api) root.LivvCtripScrollCollector = existing.api;
  else {
    const api = createCollector();
    root[KEY] = { version: VERSION, api };
    root.LivvCtripScrollCollector = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createCollector, mergeHotel, normalizeLimit, DEFAULTS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
