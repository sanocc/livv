(function (root) {
  'use strict';

  function toDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function iso(value) {
    const date = toDate(value);
    return date ? date.toISOString() : null;
  }

  function parseDynamic(rawText, observedAt) {
    const raw = rawText == null ? null : String(rawText).trim();
    if (!raw) return null;
    const observed = toDate(observedAt) || new Date();
    const observedIso = observed.toISOString();
    let match = raw.match(/^刚刚有人预订$/);
    if (match) return booking(raw, observed, 0, 'immediate', 'immediate', observedIso);
    match = raw.match(/^(\d+)分钟前有人预订$/);
    if (match) return booking(raw, observed, Number(match[1]), 'minute', 'minute');
    match = raw.match(/^(\d+)小时前有人预订$/);
    if (match) return booking(raw, observed, Number(match[1]), 'hour', 'hour');
    match = raw.match(/^(\d+)天前有人预订$/);
    if (match) return booking(raw, observed, Number(match[1]), 'day', 'day');
    match = raw.match(/^热卖！低价房仅剩(\d+)间$/);
    if (match) return {
      type: 'scarcity', raw_text: raw, observed_at: observedIso, event_at_estimated: null,
      precision: null, is_estimated: false, value: Number(match[1]),
      metadata: { remaining_rooms: Number(match[1]) }
    };
    match = raw.match(/^连续(\d+)位住客好评$/);
    if (match) return {
      type: 'review_streak', raw_text: raw, observed_at: observedIso, event_at_estimated: null,
      precision: null, is_estimated: false, value: Number(match[1]),
      metadata: { positive_guest_count: Number(match[1]) }
    };
    return {
      type: 'unknown', raw_text: raw, observed_at: observedIso, event_at_estimated: null,
      precision: null, is_estimated: false, value: null, metadata: {}
    };
  }

  function booking(raw, observed, value, precision, unit, eventIso) {
    const event = eventIso ? observed : new Date(observed.getTime() - value * ({ minute: 60000, hour: 3600000, day: 86400000 }[unit]));
    return {
      type: 'booking', raw_text: raw, observed_at: observed.toISOString(), event_at_estimated: event.toISOString(),
      precision, is_estimated: true, value, metadata: { unit }
    };
  }

  function formatRelativeDynamicTime(eventAt, currentTime) {
    const event = toDate(eventAt);
    const current = toDate(currentTime);
    if (!event || !current) return null;
    const diff = Math.max(0, current.getTime() - event.getTime());
    const minute = 60000;
    const hour = 3600000;
    const day = 86400000;
    if (diff < minute) return '刚刚有人预订';
    if (diff < hour) return `${Math.floor(diff / minute)}分钟前有人预订`;
    if (diff < day) return `${Math.floor(diff / hour)}小时前有人预订`;
    return `${Math.floor(diff / day)}天前有人预订`;
  }

  const api = { parseDynamic, formatRelativeDynamicTime };
  root.LivvDynamicSemantic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
