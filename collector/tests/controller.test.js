const assert = require('assert');
const controller = require('../platforms/ctrip/controller.js');

class FakeInput {
  constructor(value = '') { this._value = value; this.events = []; this.focused = false; }
  get value() { return this._value; }
  set value(value) { this._value = value; }
  focus() { this.focused = true; }
  click() {}
  dispatchEvent(event) { this.events.push(event.type || 'event'); }
}

function keywordFixture({input = new FakeInput(''), suggestions = [], rerender = null} = {}) {
  input.parentElement = {querySelectorAll: () => suggestions};
  return {
    defaultView: { getComputedStyle: () => ({display: 'block', visibility: 'visible'}) },
    querySelector(selector) {
      if (selector === 'input[placeholder="位置/品牌/酒店 (选填)"]' || selector === 'input[placeholder*="位置/品牌/酒店"]') return rerender ? rerender.current : input;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.startsWith('input[')) return [rerender ? rerender.current : input];
      return [];
    }
  };
}

function fixture({input = new FakeInput('武汉'), suggestions = []} = {}) {
  return {
    defaultView: { getComputedStyle: () => ({display: 'block', visibility: 'visible'}) },
    querySelector(selector) { return selector === '#destinationInput' ? input : null; },
    querySelectorAll() { return suggestions; }
  };
}

(async () => {
  const input = new FakeInput('武汉');
  const selected = {textContent: '咸宁', contains: () => false, click: () => {} };
  const doc = fixture({input, suggestions: [selected]});
  assert.strictEqual(controller.findCityInput(doc), input);
  assert.deepStrictEqual(controller.findCitySuggestions(doc, '咸宁', input), [selected]);
  const result = await controller.setCity('咸宁', doc);
  assert.deepStrictEqual(result, {requested_city: '咸宁', actual_city: '咸宁', matched: true, selected_candidate: {name: '咸宁', subtitle: '', type: 'city'}});
  assert.deepStrictEqual(await controller.setCityResult('咸宁', doc), {ok: true, action: 'set_city', requested_city: '咸宁', actual_city: '咸宁', matched: true, selected_candidate: {name: '咸宁', subtitle: '', type: 'city'}});
  assert.deepStrictEqual(input.events, ['input', 'change', 'input', 'change']);

  assert.deepStrictEqual(controller.findCitySuggestions(doc, '咸宁', input), [selected]);
  const similar = fixture({input: new FakeInput('武汉'), suggestions: [{textContent: '咸宁市', contains: () => false}]});
  assert.deepStrictEqual(controller.findCitySuggestions(similar, '咸宁', similar.querySelector('#destinationInput')), []);
  assert.strictEqual(controller.findCityInput({querySelector: () => null}), null);
  assert.deepStrictEqual(await controller.setCityResult('咸宁', {querySelector: () => null}), {
    ok: false, action: 'set_city', stage: 'START', error: {code: 'CITY_INPUT_NOT_FOUND', message: '未找到城市输入控件'}
  });

  await assert.rejects(() => controller.waitForCitySuggestions(similar, '咸宁', similar.querySelector('#destinationInput'), 1), (error) => error.code === 'CITY_SUGGESTION_NOT_FOUND');
  const nodeListSimilarCandidate = {textContent: '咸宁市', contains: () => false};
  const nodeList = {0: nodeListSimilarCandidate, length: 1, forEach(callback) { callback(nodeListSimilarCandidate, 0, this); }};
  const nodeListDoc = {
    defaultView: { getComputedStyle: () => ({display: 'block', visibility: 'visible'}) },
    querySelector(selector) { return selector === '#destinationInput' ? new FakeInput('武汉') : null; },
    querySelectorAll() { return nodeList; }
  };
  await assert.rejects(() => controller.waitForCitySuggestions(nodeListDoc, '咸宁', nodeListDoc.querySelector('#destinationInput'), 1), (error) => error.code === 'CITY_SUGGESTION_NOT_FOUND');
  const compoundInput = new FakeInput('武汉');
  const compoundCandidate = {textContent: '长沙', parentElement: {textContent: '长沙 中国-湖南'}, contains: () => false, click: () => {}};
  compoundInput.parentElement = {querySelectorAll: () => [compoundCandidate]};
  const compoundDoc = {
    defaultView: { getComputedStyle: () => ({display: 'block', visibility: 'visible'}) },
    querySelector(selector) { return selector === '#destinationInput' ? compoundInput : null; },
    querySelectorAll() { return []; }
  };
  const compoundResult = await controller.setCityResult('长沙', compoundDoc);
  assert.strictEqual(compoundResult.ok, true);
  assert.deepStrictEqual(compoundResult.selected_candidate, {name: '长沙', subtitle: '中国-湖南', type: 'city'});
  const empty = fixture({input: new FakeInput('武汉'), suggestions: []});
  await assert.rejects(() => controller.waitForCitySuggestions(empty, '咸宁', empty.querySelector('#destinationInput'), 1), (error) => error.code === 'CITY_SUGGESTION_TIMEOUT');

  const mismatchInput = new FakeInput('武汉');
  const mismatch = fixture({input: mismatchInput, suggestions: [{textContent: '咸宁', contains: () => false, click: () => { mismatchInput.value = '武汉'; }}]});
  await assert.rejects(() => controller.setCity('咸宁', mismatch), (error) => error.code === 'CITY_SELECTION_MISMATCH');

  let rerenderedInput = new FakeInput('武汉');
  const rerenderedCandidate = {textContent: '长沙', parentElement: {textContent: '长沙 中国-湖南'}, contains: () => false, click: () => { rerenderedInput = new FakeInput('长沙'); }};
  const rerendered = {
    defaultView: { getComputedStyle: () => ({display: 'block', visibility: 'visible'}) },
    querySelector(selector) { return selector === '#destinationInput' ? rerenderedInput : null; },
    querySelectorAll() { return [rerenderedCandidate]; }
  };
  const rerenderedResult = await controller.setCityResult('长沙', rerendered);
  assert.strictEqual(rerenderedResult.ok, true);
  assert.deepStrictEqual(rerenderedResult.selected_candidate, {name: '长沙', subtitle: '中国-湖南', type: 'city'});

  const keywordInput = new FakeInput('');
  const keywordCandidate = {textContent: '玄武湖风景区', getAttribute: (name) => name === 'tabindex' ? '-1' : null, contains: () => false, click: () => { keywordInput.value = '玄武湖风景区'; }};
  const keywordDoc = keywordFixture({input: keywordInput, suggestions: [keywordCandidate]});
  assert.strictEqual(controller.findKeywordInput(keywordDoc), keywordInput);
  assert.deepStrictEqual(controller.findKeywordSuggestions(keywordDoc, '玄武湖风景区', keywordInput), [keywordCandidate]);
  const keywordResult = await controller.setKeywordResult('玄武湖风景区', keywordDoc);
  assert.strictEqual(keywordResult.ok, true);
  assert.deepStrictEqual(keywordResult.selected_candidate, {name: '玄武湖风景区', subtitle: '', type: 'unknown'});

  const similarKeyword = keywordFixture({input: new FakeInput(''), suggestions: [{textContent: '玄武湖景区', getAttribute: (name) => name === 'tabindex' ? '-1' : null, contains: () => false}]});
  assert.deepStrictEqual(controller.findKeywordSuggestions(similarKeyword, '玄武湖风景区', similarKeyword.querySelector('input[placeholder="位置/品牌/酒店 (选填)"]')), []);
  assert.strictEqual((await controller.setKeywordResult('玄武湖风景区', similarKeyword)).error.code, 'KEYWORD_SUGGESTION_NOT_FOUND');
  assert.strictEqual((await controller.setKeywordResult('玄武湖风景区', keywordFixture({input: new FakeInput('')}))).error.code, 'KEYWORD_SUGGESTION_TIMEOUT');
  assert.strictEqual((await controller.setKeywordResult('玄武湖风景区', {querySelector: () => null})).error.code, 'KEYWORD_INPUT_NOT_FOUND');

  let rerenderKeywordInput = new FakeInput('');
  const keywordRerender = {current: rerenderKeywordInput};
  const rerenderKeywordCandidate = {textContent: '武汉站', getAttribute: (name) => name === 'tabindex' ? '-1' : null, contains: () => false, click: () => { rerenderKeywordInput = new FakeInput('武汉站'); keywordRerender.current = rerenderKeywordInput; }};
  const rerenderKeywordDoc = keywordFixture({input: rerenderKeywordInput, suggestions: [rerenderKeywordCandidate], rerender: keywordRerender});
  assert.strictEqual((await controller.setKeywordResult('武汉站', rerenderKeywordDoc)).ok, true);
  const mismatchKeywordInput = new FakeInput('');
  const mismatchKeyword = keywordFixture({input: mismatchKeywordInput, suggestions: [{textContent: '武汉站', getAttribute: (name) => name === 'tabindex' ? '-1' : null, contains: () => false, click: () => { mismatchKeywordInput.value = '武汉'; }}]});
  assert.strictEqual((await controller.setKeywordResult('武汉站', mismatchKeyword)).error.code, 'KEYWORD_SELECTION_MISMATCH');

  assert.deepStrictEqual(controller.parseISODate('2026-10-01'), {year: 2026, month: 10, day: 1, iso: '2026-10-01'});
  assert.strictEqual(controller.parseISODate('2026-02-30'), null);
  assert.strictEqual(controller.nightsBetween(controller.parseISODate('2026-10-01'), controller.parseISODate('2026-10-02')), 1);
  assert.strictEqual((await controller.setDatesResult('2026-10-01', '2026-10-01', {})).error.code, 'INVALID_DATE_RANGE');

  const dateInputs = {checkin: new FakeInput('10月1日(周四)'), checkout: new FakeInput('10月2日(周五)')};
  const month = {textContent: '2026年10月', hidden: false, getAttribute: () => null};
  const dateCell = (day, input, weekday) => ({textContent: String(day), hidden: false, getAttribute: (name) => name === 'aria-label' ? `2026年10月${day}日(${weekday}), Select the date` : null, click: () => { input.value = `10月${day}日(${weekday})`; }});
  const checkinCell = dateCell(1, dateInputs.checkin, '周四');
  const checkoutCell = dateCell(2, dateInputs.checkout, '周五');
  const dateDoc = {
    defaultView: {getComputedStyle: () => ({display: 'block', visibility: 'visible'})},
    querySelector(selector) { if (selector === '#checkInInput') return dateInputs.checkin; if (selector === '#checkOutInput') return dateInputs.checkout; return null; },
    querySelectorAll(selector) { if (selector === '*') return [month]; if (selector === '[aria-label], [title]') return [checkinCell, checkoutCell]; if (selector === 'button, [role="button"]') return []; return []; }
  };
  assert.strictEqual((await controller.setDatesResult('2026-10-01', '2026-10-02', dateDoc)).ok, true);
  const disabledCell = {...checkinCell, disabled: true};
  const disabledDoc = {...dateDoc, querySelectorAll(selector) { if (selector === '*') return [month]; if (selector === '[aria-label], [title]') return [disabledCell]; if (selector === 'button, [role="button"]') return []; return []; }};
  assert.strictEqual((await controller.setDatesResult('2026-10-01', '2026-10-02', disabledDoc)).error.code, 'CHECKIN_NOT_SELECTABLE');

  const searchCity = new FakeInput('南京');
  const searchCheckin = new FakeInput('10月1日(周四)');
  const searchCheckout = new FakeInput('10月2日(周五)');
  const searchKeyword = new FakeInput('玄武湖景区');
  const searchButton = {textContent: '搜索', disabled: false, click() { this.clicked = true; }};
  const searchScope = {
    parentElement: null,
    querySelector(selector) {
      if (selector === '#destinationInput') return searchCity;
      if (selector === '#checkInInput') return searchCheckin;
      if (selector === '[placeholder*="位置/品牌/酒店"]') return searchKeyword;
      return null;
    }
  };
  searchButton.parentElement = searchScope;
  const searchDoc = {
    defaultView: {getComputedStyle: () => ({display: 'block', visibility: 'visible'})},
    querySelector(selector) {
      if (selector === '#destinationInput') return searchCity;
      if (selector === '#checkInInput') return searchCheckin;
      if (selector === '#checkOutInput') return searchCheckout;
      if (selector === 'input[placeholder="位置/品牌/酒店 (选填)"]' || selector === 'input[placeholder*="位置/品牌/酒店"]') return searchKeyword;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button, [role="button"]') return [searchButton];
      if (selector.startsWith('input[')) return [searchKeyword];
      return [];
    }
  };
  assert.deepStrictEqual(controller.readSearchContext({checkin: '2026-10-01', checkout: '2026-10-02'}, searchDoc), {city: '南京', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '玄武湖景区'});
  assert.strictEqual(controller.verifySearchPreflight({city: '南京', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '玄武湖景区'}, searchDoc).matched, true);
  assert.throws(() => controller.verifySearchPreflight({city: '武汉', checkin: '2026-10-01', checkout: '2026-10-02', keyword: '玄武湖景区'}, searchDoc), (error) => error.code === 'SEARCH_PREFLIGHT_MISMATCH');
  assert.strictEqual(controller.findSearchButton(searchDoc), searchButton);
  assert.strictEqual(controller.findSearchButton({querySelectorAll: () => [], body: {}}), null);

  let loaded = 0;
  const resultButton = {textContent: '搜索', disabled: false, parentElement: searchScope};
  const resultDoc = {
    body: {},
    defaultView: {getComputedStyle: () => ({display: 'block', visibility: 'visible'})},
    querySelectorAll(selector) {
      if (selector === 'button, [role="button"]') return [resultButton];
      if (selector === '[data-offline-hotelid], [data-hotelid], [data-hotel-id]') return loaded ? [{}] : [];
      return [];
    }
  };
  loaded = 1;
  assert.strictEqual((await controller.waitForSearchResult(resultDoc, '', 1000, 0)).hotel_count, 1);
  const emptyResultDoc = {...resultDoc, querySelectorAll(selector) { if (selector === 'button, [role="button"]') return [resultButton]; if (selector === '[data-offline-hotelid], [data-hotelid], [data-hotel-id]') return []; return []; }};
  await assert.rejects(() => controller.waitForSearchResult(emptyResultDoc, '', 350, 0), (error) => error.code === 'SEARCH_RESULT_TIMEOUT');

  console.log('controller tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
