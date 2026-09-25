const assert = require('assert');
const fs = require('fs');

const manifest = JSON.parse(fs.readFileSync('collector/manifest.json', 'utf8'));
const html = fs.readFileSync('collector/sidepanel/sidepanel.html', 'utf8');
const css = fs.readFileSync('collector/sidepanel/sidepanel.css', 'utf8');
const background = fs.readFileSync('collector/background.js', 'utf8');
const popup = fs.readFileSync('collector/popup/popup.js', 'utf8');

assert.strictEqual(manifest.version, '1.0.34');
assert.deepStrictEqual(manifest.icons, {
  '16': 'assets/icons/icon-16.png', '32': 'assets/icons/icon-32.png', '48': 'assets/icons/icon-48.png', '128': 'assets/icons/icon-128.png'
});
assert.deepStrictEqual(manifest.action.default_icon, manifest.icons);
assert.strictEqual(manifest.action.default_popup, undefined);
assert.strictEqual(manifest.side_panel.default_path, 'sidepanel/sidepanel.html');
assert.strictEqual(manifest.background.service_worker, 'background.js');
assert.ok(manifest.permissions.includes('sidePanel'));
assert.ok(html.includes('../popup/popup.js'), 'side panel reuses the existing UI bridge');
assert.ok(html.includes('record-snapshot'));
assert.ok(html.includes('reset-observer'));
assert.ok(html.includes('collection-limit'));
assert.ok(html.includes('30家 · 默认'));
assert.ok(html.includes('200家 · 市场'));
assert.ok(html.includes('collection-limit-custom'));
assert.ok(html.includes('collection-progress'));
assert.strictEqual((html.match(/class="control-line"/g) || []).length, 3);
assert.ok(html.includes('城市：'));
assert.ok(html.includes('日期：'));
assert.ok(html.includes('关键词：'));
assert.ok(html.includes('设置时间'));
assert.ok(!html.includes('task-status'));
assert.ok(!html.includes('高级控制'));
assert.ok(css.includes('min-width:320px'));
assert.ok(css.includes('max-width:359px'));
assert.ok(css.includes('observer-metrics'));
assert.ok(background.includes('openPanelOnActionClick'));
assert.ok(popup.includes('chrome.tabs.onActivated'));
assert.ok(popup.includes('syncObserverSession'));
assert.ok(popup.includes('pauseCollectionForTabChange'));
assert.ok(popup.includes('resumeButtonForActiveTab'));
assert.ok(popup.includes("stop?.('PANEL_CLOSED')"));
assert.ok(popup.includes("stop?.('USER_STOPPED')"));
assert.ok(popup.includes('platforms/ctrip/completion-detector.js'));

console.log('side panel checks passed');
