(function (root) {
  'use strict';

  const VERSION = '1.0.49';
  const DEFAULTS = {
    nearBottomRatio: 0.5,
    nearBottomThreshold: 240,
    stableWindowMs: 4000,
    stableScrollDelta: 2
  };

  function createDetector({ now = () => Date.now(), config = {} } = {}) {
    const options = { ...DEFAULTS, ...config };
    let stableSince = null;
    let previous = null;
    let paused = false;

    function reset() {
      stableSince = null;
      previous = null;
      paused = false;
      return { ok: true, action: 'reset_completion_detector' };
    }

    function pause() {
      paused = true;
      stableSince = null;
      return { ok: true, status: 'PAUSED' };
    }

    function resume() {
      paused = false;
      stableSince = null;
      previous = null;
      return { ok: true, status: 'RESUMED' };
    }

    function observe(input = {}) {
      const scrollY = Number(input.scroll_y || 0);
      const viewportHeight = Number(input.viewport_height || 0);
      const documentHeight = Number(input.document_height || 0);
      const distanceToBottom = Math.max(0, documentHeight - (scrollY + viewportHeight));
      const nearBottom = distanceToBottom <= Math.max(viewportHeight * options.nearBottomRatio, options.nearBottomThreshold);
      const ids = Array.from(input.current_dom_ids || []).map(String);
      const current = {
        scrollY, documentHeight, ids: ids.join(','), cumulative: Number(input.cumulative_unique || 0),
        added: Number(input.added_count || 0), loading: Boolean(input.loading_indicator_present), nearBottom
      };
      const documentHeightDelta = previous ? documentHeight - previous.documentHeight : 0;
      const scrollYDelta = previous ? scrollY - previous.scrollY : 0;
      const idsChanged = Boolean(previous && current.ids !== previous.ids);
      const newContent = current.added > 0 || current.cumulative > (previous?.cumulative || 0) || documentHeightDelta > 0 || idsChanged;
      const base = {
        status: 'CONTINUE', reason: null, near_bottom: nearBottom, distance_to_bottom: distanceToBottom,
        document_height_delta: documentHeightDelta, scroll_y_delta: scrollYDelta,
        stable_for_ms: stableSince == null ? 0 : Math.max(0, now() - stableSince),
        paused
      };

      if (!viewportHeight || !documentHeight) return { ...base, status: 'UNKNOWN', reason: 'INSUFFICIENT_LAYOUT_SIGNAL' };
      if (paused) return { ...base, status: 'WAIT', reason: 'PAUSED' };
      if (input.end_marker_present === true) {
        previous = current;
        stableSince = null;
        return { ...base, status: 'COMPLETED', reason: 'END_MARKER' };
      }
      if (!nearBottom) {
        stableSince = null;
        previous = current;
        return base;
      }
      if (current.loading || newContent || Math.abs(scrollYDelta) > options.stableScrollDelta) {
        stableSince = null;
        previous = current;
        return { ...base, status: 'WAIT', reason: current.loading ? 'LOADING' : 'BOTTOM_PROBE' };
      }
      stableSince ??= now();
      const stableFor = now() - stableSince;
      previous = current;
      if (stableFor >= options.stableWindowMs) {
        return { ...base, status: 'COMPLETED', reason: 'BOTTOM_STABLE', stable_for_ms: stableFor };
      }
      return { ...base, status: 'WAIT', reason: 'BOTTOM_PROBE', stable_for_ms: stableFor };
    }

    return { observe, reset, pause, resume };
  }

  const api = { createDetector, DEFAULTS, VERSION };
  root.LivvCtripCompletionDetector = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
