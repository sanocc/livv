(function () {
  'use strict';

  importScripts('background/managed-tab.js');
  importScripts('background/managed-window.js');
  importScripts('shared/reader-invocation.js');
  importScripts('shared/direct-reader.js');
  importScripts('shared/collection-invocation.js');

  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  });

  chrome.runtime.onStartup.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  globalThis.LivvManagedTab?.install?.(chrome);
  globalThis.LivvManagedWindow?.install?.(chrome);
})();
