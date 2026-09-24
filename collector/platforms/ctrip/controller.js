(function (root) {
  'use strict';

  const VERSION = '1.0.18';

  class CityControlError extends Error {
    constructor(code, message, stage) { super(message || code); this.name = 'CityControlError'; this.code = code; this.stage = stage; }
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

  const api = { findCityInput, findCitySuggestions, waitForCitySuggestions, readCurrentCity, setCity, setCityResult, CityControlError };
  root.LivvCtripController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
