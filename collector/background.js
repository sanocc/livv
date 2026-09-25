(function () {
  'use strict';

  importScripts('background/managed-tab.js');
  importScripts('background/managed-window.js');
  importScripts('shared/reader-invocation.js');
  importScripts('shared/direct-reader.js');
  importScripts('shared/collection-invocation.js');
  importScripts('shared/device-identity.js');
  importScripts('shared/cloud-device.js');

  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  });

  chrome.runtime.onStartup.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'LIVV_GET_CLOUD_DEVICE_STATUS' && message?.type !== 'LIVV_REFRESH_CLOUD_DEVICE_STATUS') return false;
    const read = message.type === 'LIVV_REFRESH_CLOUD_DEVICE_STATUS'
      ? globalThis.LivvCloudDevice?.state?.(chrome).then((current) => current.registered
        ? globalThis.LivvCloudDevice.getStatus(chrome)
        : current)
      : globalThis.LivvCloudDevice?.state?.(chrome);
    read.then(sendResponse).catch(() => sendResponse({ registered: false, status: 'unavailable' }));
    return true;
  });
  globalThis.LivvManagedTab?.install?.(chrome);
  globalThis.LivvManagedWindow?.install?.(chrome);
  globalThis.LivvDeviceIdentity?.initialize?.(chrome).catch(() => {});
  globalThis.LivvCloudDevice?.install?.(chrome);
  globalThis.LivvCloudDevice?.ensureRegistered?.(chrome).catch(() => {});
})();
