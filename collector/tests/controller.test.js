const assert = require('assert');
const controller = require('../platforms/ctrip/controller.js');

class FakeInput {
  constructor(value = '') { this._value = value; this.events = []; this.focused = false; }
  get value() { return this._value; }
  set value(value) { this._value = value; }
  focus() { this.focused = true; }
  dispatchEvent(event) { this.events.push(event.type || 'event'); }
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

  console.log('controller tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
