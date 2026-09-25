const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const manifest = JSON.parse(fs.readFileSync('collector/manifest.json', 'utf8'));
const popup = fs.readFileSync('collector/popup/popup.js', 'utf8');
const reader = fs.readFileSync('collector/content/ctrip-reader.js', 'utf8');

assert.strictEqual(manifest.name, '酒店助手');
assert.strictEqual(manifest.version, '1.0.34');
assert.ok(!manifest.content_scripts, 'reader must be injected on demand');
assert.deepStrictEqual(manifest.permissions, ['activeTab', 'scripting', 'sidePanel', 'tabs']);
assert.ok(popup.includes('chrome.scripting.executeScript'));
assert.ok(popup.includes("files:['platforms/ctrip/parser.js','platforms/ctrip/semantic.js','content/ctrip-reader.js']"));
assert.ok(popup.includes("files:['platforms/ctrip/controller.js']"));
assert.ok(popup.includes('CITY_CONTROL_NO_RESPONSE'));
assert.ok(popup.includes('setDatesResult'));
assert.ok(popup.includes('setKeywordResult'));
assert.ok(popup.includes('KEYWORD_CONTROL_NO_RESPONSE'));
assert.ok(popup.includes('executeSearchResult'));
assert.ok(popup.includes('SEARCH_CONTROL_NO_RESPONSE'));
assert.ok(popup.includes('LIVV_PENDING_SEARCH'));
assert.ok(popup.includes('DATE_CONTROL_NO_RESPONSE'));
assert.ok(popup.includes("args:[checkin, checkout]"));
assert.ok(popup.includes('result.ok !== true'));
assert.ok(popup.includes('await chrome.tabs.sendMessage'));
assert.ok(popup.includes('READER_INJECTION_FAILED'));
assert.ok(popup.includes('READER_EXECUTION_FAILED'));
assert.ok(reader.includes('chrome.runtime.onMessage.addListener'));
assert.ok(reader.includes('__LIVV_HOTEL_ASSISTANT_READER__'));
assert.ok(reader.includes('chrome.runtime.onMessage.removeListener(previousReader.listener)'));
assert.ok(reader.includes("const VERSION = '1.0.34'"));
assert.ok(reader.includes('Reader ready'));

const removed = [];
const added = [];
const oldListener = () => {};
const runtimeContext = {
  location: { hostname: 'hotels.ctrip.com' },
  console: { log() {}, groupCollapsed() {}, table() {}, groupEnd() {} },
  chrome: { runtime: {
    onMessage: {
      removeListener(listener) { removed.push(listener); },
      addListener(listener) { added.push(listener); }
    }
  } }
};
runtimeContext.__LIVV_HOTEL_ASSISTANT_READER__ = { version: '1.0.13', listener: oldListener };
vm.runInNewContext(reader, runtimeContext);
assert.deepStrictEqual(removed, [oldListener]);
assert.strictEqual(added.length, 1);
assert.strictEqual(runtimeContext.__LIVV_HOTEL_ASSISTANT_READER__.version, '1.0.34');
assert.strictEqual(runtimeContext.__LIVV_HOTEL_ASSISTANT_READER__.listener, added[0]);

console.log('runtime messaging mock checks passed');
