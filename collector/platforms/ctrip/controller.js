(function (root) {
  'use strict';

  const VERSION = '1.0.20';

  class CityControlError extends Error {
    constructor(code, message, stage) { super(message || code); this.name = 'CityControlError'; this.code = code; this.stage = stage; }
  }

  class DateControlError extends Error {
    constructor(code, message, stage) { super(message || code); this.name = 'DateControlError'; this.code = code; this.stage = stage; }
  }

  class KeywordControlError extends Error {
    constructor(code, message, stage) { super(message || code); this.name = 'KeywordControlError'; this.code = code; this.stage = stage; }
  }

  function normalize(value) { return value == null ? '' : String(value).replace(/\s+/g, ' ').trim(); }

  function findCityInput(doc = root.document) {
    if (!doc?.querySelector) return null;
    return doc.querySelector('#destinationInput')
      || doc.querySelector('input[aria-label*="城市"], input[placeholder*="城市"], input[name*="city" i]')
      || doc.querySelector('input[id*="destination" i]');
  }

  function isVisible(node, doc) {
    if (!node) return false;
    const style = doc?.defaultView?.getComputedStyle ? doc.defaultView.getComputedStyle(node) : null;
    return !style || (style.display !== 'none' && style.visibility !== 'hidden');
  }

  function findCitySuggestions(doc, requested, input) {
    const selectors = ['[role="option"]', 'li', '[class*="suggest"]', '[class*="city"]', '[class*="destination"]'];
    const seen = new Set();
    const candidates = [];
    selectors.forEach((selector) => (doc?.querySelectorAll?.(selector) || []).forEach((node) => {
      if (seen.has(node) || node === input || node.contains?.(input)) return;
      seen.add(node);
      if (isVisible(node, doc) && normalize(node.textContent) === requested) candidates.push(node);
    }));
    [input?.parentElement, input?.parentElement?.parentElement, input?.parentElement?.parentElement?.parentElement]
      .filter(Boolean)
      .forEach((scope) => Array.from(scope.querySelectorAll?.('*') || []).forEach((node) => {
        if (seen.has(node) || node === input || node.contains?.(input)) return;
        seen.add(node);
        if (isVisible(node, doc) && normalize(node.textContent) === requested) candidates.push(node);
      }));
    return candidates;
  }

  function describeCandidate(node, requested) {
    const parentText = normalize(node.parentElement?.textContent);
    const subtitle = parentText && parentText !== requested ? parentText.replace(requested, '').trim() : '';
    return { name: requested, subtitle, type: 'city' };
  }

  function hasSimilarCitySuggestion(doc, requested, input) {
    const selectors = ['[role="option"]', 'li', '[class*="suggest"]', '[class*="city"]', '[class*="destination"]'];
    const matches = selectors.some((selector) => Array.from(doc?.querySelectorAll?.(selector) || []).some((node) => {
      if (node === input || node.contains?.(input) || !isVisible(node, doc)) return false;
      const text = normalize(node.textContent);
      return text && text !== requested && text.includes(requested);
    }));
    if (matches) return true;
    return [input?.parentElement, input?.parentElement?.parentElement, input?.parentElement?.parentElement?.parentElement]
      .filter(Boolean)
      .some((scope) => Array.from(scope.querySelectorAll?.('*') || []).some((node) => {
        if (node === input || node.contains?.(input) || !isVisible(node, doc)) return false;
        const text = normalize(node.textContent);
        return text && text !== requested && text.includes(requested);
      }));
  }

  function waitForCitySuggestions(doc, requested, input, timeoutMs = 5000) {
    const started = Date.now();
    let similarFound = false;
    return new Promise((resolve, reject) => {
      const check = () => {
        const candidates = findCitySuggestions(doc, requested, input);
        if (candidates.length) return resolve(candidates);
        similarFound = similarFound || hasSimilarCitySuggestion(doc, requested, input);
        if (Date.now() - started >= timeoutMs) return reject(new CityControlError(similarFound ? 'CITY_SUGGESTION_NOT_FOUND' : 'CITY_SUGGESTION_TIMEOUT'));
        root.setTimeout(check, 50);
      };
      check();
    });
  }

  function updateInput(input, value) {
    const InputCtor = root.HTMLInputElement;
    const prototype = InputCtor && input instanceof InputCtor ? InputCtor.prototype : Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor?.set) throw new CityControlError('CITY_INPUT_FAILED');
    descriptor.set.call(input, value);
    const InputEventCtor = root.InputEvent || root.Event || function SyntheticEvent(type) { this.type = type; };
    input.dispatchEvent(new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: value }));
    const EventCtor = root.Event || function SyntheticEvent(type) { this.type = type; };
    input.dispatchEvent(new EventCtor('change', { bubbles: true }));
  }

  function readCurrentCity(doc = root.document) { return normalize(findCityInput(doc)?.value); }

  function waitForCityValue(doc, expected, timeoutMs = 2000) {
    const started = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const actual = readCurrentCity(doc);
        if (actual === expected || Date.now() - started >= timeoutMs) return resolve(actual);
        root.setTimeout(check, 50);
      };
      check();
    });
  }

  async function setCity(requested, doc = root.document) {
    const city = normalize(requested);
    console.log(`[酒店助手 v${VERSION}] City control start`, { requested_city: city });
    if (!city) throw new CityControlError('CITY_INPUT_FAILED', '城市不能为空', 'START');
    const input = findCityInput(doc);
    if (!input) throw new CityControlError('CITY_INPUT_NOT_FOUND', '未找到城市输入控件', 'START');
    try {
      input.focus();
      updateInput(input, city);
      const entered = readCurrentCity(doc);
      if (entered !== city) throw new CityControlError('CITY_INPUT_FAILED', '城市文字未写入输入控件', 'TEXT_ENTERED');
    } catch (error) {
      if (error instanceof CityControlError) throw error;
      throw new CityControlError('CITY_INPUT_FAILED', error.message, 'TEXT_ENTERED');
    }
    let candidates;
    try {
      candidates = await waitForCitySuggestions(doc, city, input);
    } catch (error) {
      if (error instanceof CityControlError && !error.stage) error.stage = 'SUGGESTIONS_VISIBLE';
      throw error;
    }
    const selectedCandidate = describeCandidate(candidates[0], city);
    try { candidates[0].click(); } catch (error) { throw new CityControlError('CITY_SELECTION_FAILED', error.message, 'CITY_CANDIDATE_FOUND'); }
    console.log(`[酒店助手 v${VERSION}] City suggestion selected`, selectedCandidate);
    const actual = await waitForCityValue(doc, city);
    const result = { requested_city: city, actual_city: actual, matched: actual === city };
    if (!result.matched) throw new CityControlError('CITY_SELECTION_MISMATCH', '候选选择后城市不一致', 'CITY_SELECTED');
    console.log(`[酒店助手 v${VERSION}] City verification`, result);
    return { ...result, selected_candidate: selectedCandidate };
  }

  async function setCityResult(requested, doc = root.document) {
    try {
      const result = await setCity(requested, doc);
      const success = { ok: true, action: 'set_city', ...result };
      console.log(`[酒店助手 v${VERSION}] City control result`, success);
      return success;
    } catch (error) {
      const failure = {
        ok: false,
        action: 'set_city',
        stage: error?.stage || 'START',
        error: { code: error?.code || 'CITY_INPUT_FAILED', message: error?.message || '城市设置失败' }
      };
      console.log(`[酒店助手 v${VERSION}] City control result`, failure);
      return failure;
    }
  }

  function findKeywordInput(doc = root.document) {
    if (!doc?.querySelector) return null;
    return doc.querySelector('input[placeholder="位置/品牌/酒店 (选填)"]')
      || doc.querySelector('input[placeholder*="位置/品牌/酒店"]')
      || doc.querySelector('input[aria-label*="位置/品牌/酒店"]');
  }

  function keywordScopes(input) {
    const scopes = [];
    for (let node = input?.parentElement, depth = 0; node && depth < 7; node = node.parentElement, depth += 1) scopes.push(node);
    return scopes;
  }

  function keywordCandidateRoot(node, input) {
    for (let current = node, depth = 0; current && depth < 6; current = current.parentElement, depth += 1) {
      if (current === input || current.contains?.(input)) continue;
      if (current.getAttribute?.('role') === 'option' || current.getAttribute?.('tabindex') === '-1' || current.hasAttribute?.('data-value')) return current;
    }
    return null;
  }

  function findKeywordSuggestions(doc, requested, input) {
    const seen = new Set();
    const candidates = [];
    keywordScopes(input).forEach((scope) => {
      Array.from(scope.querySelectorAll?.('*') || []).forEach((node) => {
        if (seen.has(node) || node === input || node.contains?.(input) || !isVisible(node, doc)) return;
        if (normalize(node.textContent) !== requested) return;
        const candidate = keywordCandidateRoot(node, input);
        if (candidate && !seen.has(candidate) && isVisible(candidate, doc)) { seen.add(candidate); candidates.push(candidate); }
      });
    });
    return candidates;
  }

  function hasSimilarKeywordSuggestion(doc, requested, input) {
    return keywordScopes(input).some((scope) => Array.from(scope.querySelectorAll?.('*') || []).some((node) => {
      if (node === input || node.contains?.(input) || !isVisible(node, doc)) return false;
      const text = normalize(node.textContent);
      const isCandidateLike = node.getAttribute?.('role') === 'option'
        || node.getAttribute?.('tabindex') === '-1'
        || node.hasAttribute?.('data-value');
      return isCandidateLike && text && text !== requested;
    }));
  }

  function keywordType(node, subtitle) {
    const explicit = normalize(node?.getAttribute?.('data-type') || node?.getAttribute?.('aria-label-type') || node?.getAttribute?.('data-category'));
    if (explicit) return explicit;
    const role = normalize(node?.getAttribute?.('role'));
    if (role && role !== 'option') return role;
    return 'unknown';
  }

  function describeKeywordCandidate(node, requested) {
    const text = normalize(node?.textContent);
    const subtitle = text.replace(requested, '').trim();
    return { name: requested, subtitle, type: keywordType(node, subtitle) };
  }

  function waitForKeywordSuggestions(doc, requested, input, timeoutMs = 5000) {
    const started = Date.now();
    let similarFound = false;
    return new Promise((resolve, reject) => {
      const check = () => {
        const candidates = findKeywordSuggestions(doc, requested, input);
        if (candidates.length) return resolve(candidates);
        similarFound = similarFound || hasSimilarKeywordSuggestion(doc, requested, input);
        if (Date.now() - started >= timeoutMs) return reject(new KeywordControlError(similarFound ? 'KEYWORD_SUGGESTION_NOT_FOUND' : 'KEYWORD_SUGGESTION_TIMEOUT', '未找到精确关键词候选', 'SUGGESTIONS_VISIBLE'));
        root.setTimeout(check, 50);
      };
      check();
    });
  }

  function updateKeywordInput(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor?.set) throw new KeywordControlError('KEYWORD_INPUT_FAILED', '关键词文字未写入输入控件', 'TEXT_ENTERED');
    descriptor.set.call(input, value);
    const InputEventCtor = root.InputEvent || root.Event || function SyntheticEvent(type) { this.type = type; };
    input.dispatchEvent(new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: value }));
    const EventCtor = root.Event || function SyntheticEvent(type) { this.type = type; };
    input.dispatchEvent(new EventCtor('change', { bubbles: true }));
  }

  function readCurrentKeyword(doc = root.document) { return normalize(findKeywordInput(doc)?.value); }

  function waitForKeywordValue(doc, expected, timeoutMs = 3000) {
    const started = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const actual = readCurrentKeyword(doc);
        if (actual === expected || Date.now() - started >= timeoutMs) return resolve(actual);
        root.setTimeout(check, 50);
      };
      check();
    });
  }

  async function setKeyword(requested, doc = root.document) {
    const keyword = normalize(requested);
    console.log(`[酒店助手 v${VERSION}] Keyword control start`, { requested_keyword: keyword });
    if (!keyword) throw new KeywordControlError('KEYWORD_INPUT_FAILED', '关键词不能为空', 'START');
    const input = findKeywordInput(doc);
    if (!input) throw new KeywordControlError('KEYWORD_INPUT_NOT_FOUND', '未找到关键词输入控件', 'START');
    try {
      input.focus();
      updateKeywordInput(input, keyword);
      if (readCurrentKeyword(doc) !== keyword) throw new KeywordControlError('KEYWORD_INPUT_FAILED', '关键词文字未写入输入控件', 'TEXT_ENTERED');
    } catch (error) {
      if (error instanceof KeywordControlError) throw error;
      throw new KeywordControlError('KEYWORD_INPUT_FAILED', error.message, 'TEXT_ENTERED');
    }
    let candidates;
    try { candidates = await waitForKeywordSuggestions(doc, keyword, input); }
    catch (error) { throw error; }
    const selectedCandidate = describeKeywordCandidate(candidates[0], keyword);
    try { candidates[0].click(); } catch (error) { throw new KeywordControlError('KEYWORD_SELECTION_FAILED', error.message, 'CANDIDATE_FOUND'); }
    console.log(`[酒店助手 v${VERSION}] Keyword candidate selected`, selectedCandidate);
    const actual = await waitForKeywordValue(doc, keyword);
    const result = { requested_keyword: keyword, actual_keyword: actual, matched: actual === keyword, selected_candidate: selectedCandidate };
    if (!result.matched) throw new KeywordControlError('KEYWORD_SELECTION_MISMATCH', '候选选择后关键词不一致', 'CANDIDATE_SELECTED');
    console.log(`[酒店助手 v${VERSION}] Keyword verified`, result);
    return result;
  }

  async function setKeywordResult(requested, doc = root.document) {
    try {
      const result = await setKeyword(requested, doc);
      const success = { ok: true, action: 'set_keyword', ...result };
      console.log(`[酒店助手 v${VERSION}] Keyword control result`, success);
      return success;
    } catch (error) {
      const failure = { ok: false, action: 'set_keyword', stage: error?.stage || 'START', error: { code: error?.code || 'KEYWORD_INPUT_FAILED', message: error?.message || '关键词设置失败' } };
      console.log(`[酒店助手 v${VERSION}] Keyword control result`, failure);
      return failure;
    }
  }

  function parseISODate(value) {
    const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(normalize(value));
    if (!match) return null;
    const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}` };
  }

  function compareDates(left, right) { return left.iso.localeCompare(right.iso); }

  function nightsBetween(checkin, checkout) {
    return Math.round((Date.UTC(checkout.year, checkout.month - 1, checkout.day) - Date.UTC(checkin.year, checkin.month - 1, checkin.day)) / 86400000);
  }

  function findDateTrigger(doc = root.document) {
    return doc?.querySelector?.('#checkInInput') || doc?.querySelector?.('#checkOutInput') || null;
  }

  function visible(node, doc) {
    if (!node) return false;
    if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') return false;
    const style = doc?.defaultView?.getComputedStyle ? doc.defaultView.getComputedStyle(node) : null;
    return !style || (style.display !== 'none' && style.visibility !== 'hidden');
  }

  function dateLabel(date) { return `${date.year}年${date.month}月${date.day}日`; }

  function hasDateLabel(node, date) {
    const label = normalize(node?.getAttribute?.('aria-label') || node?.getAttribute?.('title') || '');
    return label.includes(dateLabel(date));
  }

  function isDisabledDate(node) {
    if (!node) return true;
    if (node.disabled || node.getAttribute?.('disabled') != null || node.getAttribute?.('aria-disabled') === 'true') return true;
    const cell = node.closest?.('[role="gridcell"], td');
    return !!(cell && (cell.disabled || cell.getAttribute?.('aria-disabled') === 'true' || cell.getAttribute?.('disabled') != null));
  }

  function findDateNodes(doc, date) {
    const nodes = Array.from(doc?.querySelectorAll?.('[aria-label], [title]') || []);
    return nodes.filter((node) => visible(node, doc) && hasDateLabel(node, date));
  }

  function readVisibleMonths(doc) {
    const nodes = Array.from(doc?.querySelectorAll?.('*') || []);
    return nodes.filter((node) => visible(node, doc) && /^\d{4}年\d{1,2}月$/.test(normalize(node.textContent))).map((node) => {
      const match = /^(\d{4})年(\d{1,2})月$/.exec(normalize(node.textContent));
      return { year: Number(match[1]), month: Number(match[2]), node };
    });
  }

  function findNextMonthButton(doc) {
    return Array.from(doc?.querySelectorAll?.('button, [role="button"]') || []).find((node) => {
      if (!visible(node, doc)) return false;
      const text = normalize(node.textContent); const label = normalize(node.getAttribute?.('aria-label') || node.getAttribute?.('title'));
      return /next month|下个月|下一月/.test(`${label} ${text}`) && !isDisabledDate(node);
    });
  }

  function waitForCalendar(doc, timeoutMs = 3000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (readVisibleMonths(doc).length && findDateNodes(doc, { year: 2099, month: 1, day: 1 }).length === 0) return resolve(true);
        if (Date.now() - started >= timeoutMs) return reject(new DateControlError('CALENDAR_OPEN_FAILED', '未检测到携程日期选择器', 'INPUT_FOUND'));
        root.setTimeout(check, 50);
      };
      check();
    });
  }

  async function openDatePicker(doc) {
    const trigger = findDateTrigger(doc);
    if (!trigger) throw new DateControlError('DATE_TRIGGER_NOT_FOUND', '未找到日期控件', 'START');
    try { trigger.click(); } catch (error) { throw new DateControlError('CALENDAR_OPEN_FAILED', error.message, 'START'); }
    await waitForCalendar(doc);
  }

  async function navigateToMonth(doc, target) {
    for (let attempt = 0; attempt <= 24; attempt += 1) {
      if (readVisibleMonths(doc).some((month) => month.year === target.year && month.month === target.month)) return;
      const next = findNextMonthButton(doc);
      if (!next) throw new DateControlError('TARGET_MONTH_NOT_FOUND', `未找到${target.year}年${target.month}月`, 'CALENDAR_OPEN');
      try { next.click(); } catch (error) { throw new DateControlError('TARGET_MONTH_NOT_FOUND', error.message, 'CALENDAR_OPEN'); }
      await new Promise((resolve) => root.setTimeout(resolve, 50));
    }
    throw new DateControlError('TARGET_MONTH_NOT_FOUND', `未找到${target.year}年${target.month}月`, 'CALENDAR_OPEN');
  }

  function selectDate(doc, date, stage, notFoundCode, disabledCode, selectionCode) {
    const nodes = findDateNodes(doc, date);
    if (!nodes.length) throw new DateControlError(notFoundCode, `未找到${date.iso}`, stage);
    const enabled = nodes.find((node) => !isDisabledDate(node));
    if (!enabled) throw new DateControlError(disabledCode, `${date.iso}不可选择`, stage);
    const target = enabled.closest?.('[role="gridcell"], td') || enabled;
    try { (target.click ? target : enabled).click(); } catch (error) { throw new DateControlError(selectionCode, error.message, stage); }
  }

  function readDisplayedDate(input) {
    const match = /(^|\D)(\d{1,2})月(\d{1,2})日/.exec(normalize(input?.value));
    return match ? { month: Number(match[2]), day: Number(match[3]), raw: normalize(input.value) } : null;
  }

  function readCurrentDates(doc, requestedCheckin, requestedCheckout) {
    const checkin = readDisplayedDate(doc?.querySelector?.('#checkInInput'));
    const checkout = readDisplayedDate(doc?.querySelector?.('#checkOutInput'));
    return {
      checkin,
      checkout,
      actual_checkin: checkin ? `${requestedCheckin.year}-${String(checkin.month).padStart(2, '0')}-${String(checkin.day).padStart(2, '0')}` : null,
      actual_checkout: checkout ? `${requestedCheckout.year}-${String(checkout.month).padStart(2, '0')}-${String(checkout.day).padStart(2, '0')}` : null
    };
  }

  function waitForDisplayedDates(doc, checkin, checkout, timeoutMs = 3000) {
    const started = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const actual = readCurrentDates(doc, checkin, checkout);
        const matched = actual.checkin?.month === checkin.month && actual.checkin?.day === checkin.day
          && actual.checkout?.month === checkout.month && actual.checkout?.day === checkout.day;
        if (matched || Date.now() - started >= timeoutMs) return resolve({ ...actual, matched });
        root.setTimeout(check, 50);
      };
      check();
    });
  }

  async function setDates(checkinValue, checkoutValue, doc = root.document) {
    const checkin = parseISODate(checkinValue); const checkout = parseISODate(checkoutValue);
    console.log(`[酒店助手 v${VERSION}] Date control start`, { requested_checkin: checkinValue, requested_checkout: checkoutValue });
    if (!checkin || !checkout) throw new DateControlError('INVALID_DATE_FORMAT', '日期格式必须为YYYY-MM-DD', 'START');
    if (compareDates(checkin, checkout) >= 0) throw new DateControlError('INVALID_DATE_RANGE', '离店日期必须晚于入住日期', 'START');
    await openDatePicker(doc);
    await navigateToMonth(doc, checkin);
    selectDate(doc, checkin, 'CHECKIN_MONTH', 'CHECKIN_NOT_FOUND', 'CHECKIN_NOT_SELECTABLE', 'CHECKIN_SELECTION_FAILED');
    console.log(`[酒店助手 v${VERSION}] Checkin selected`, { checkin: checkin.iso });
    await navigateToMonth(doc, checkout);
    selectDate(doc, checkout, 'CHECKOUT_MONTH', 'CHECKOUT_NOT_FOUND', 'CHECKOUT_NOT_SELECTABLE', 'CHECKOUT_SELECTION_FAILED');
    console.log(`[酒店助手 v${VERSION}] Checkout selected`, { checkout: checkout.iso });
    const actual = await waitForDisplayedDates(doc, checkin, checkout);
    if (!actual.matched) throw new DateControlError('DATE_SELECTION_MISMATCH', '页面日期与目标日期不一致', 'CHECKOUT_SELECTED');
    const result = { requested_checkin: checkin.iso, requested_checkout: checkout.iso, actual_checkin: actual.actual_checkin, actual_checkout: actual.actual_checkout, nights: nightsBetween(checkin, checkout), matched: true };
    console.log(`[酒店助手 v${VERSION}] Dates verified`, result);
    return result;
  }

  async function setDatesResult(checkin, checkout, doc = root.document) {
    try {
      const result = await setDates(checkin, checkout, doc);
      const success = { ok: true, action: 'set_dates', ...result };
      console.log(`[酒店助手 v${VERSION}] Date control result`, success);
      return success;
    } catch (error) {
      const failure = { ok: false, action: 'set_dates', stage: error?.stage || 'START', error: { code: error?.code || 'DATE_CONTROL_FAILED', message: error?.message || '日期设置失败' } };
      console.log(`[酒店助手 v${VERSION}] Date control result`, failure);
      return failure;
    }
  }

  const api = { findCityInput, findCitySuggestions, waitForCitySuggestions, readCurrentCity, setCity, setCityResult, CityControlError, findKeywordInput, findKeywordSuggestions, waitForKeywordSuggestions, readCurrentKeyword, setKeyword, setKeywordResult, KeywordControlError, parseISODate, nightsBetween, findDateTrigger, readVisibleMonths, findDateNodes, readCurrentDates, setDates, setDatesResult, DateControlError };
  root.LivvCtripController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
