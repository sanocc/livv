import { createApiClient } from "../shared/api-client.js";
import { createChromeAlarms } from "../shared/chrome.js";
import { createRuntime } from "../shared/runtime.js";
import { createStorage } from "../shared/storage.js";

const runtime = createRuntime({
  storage: createStorage(chrome),
  alarms: createChromeAlarms(chrome),
  apiFactory: (options) => createApiClient(options),
  navigationReady: true,
  collectionReady: false,
  executionReady: false,
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PROBE_CURRENT_PAGE") {
    void probeCurrentPage().then(sendResponse).catch(() => sendResponse({ kind: "error", code: "PROBE_FAILED" }));
    return true;
  }
  if (!message || !["GET_RUNTIME_STATE", "REFRESH_STATUS", "WAKE_RUNTIME"].includes(message.type)) {
    sendResponse({ error: "INVALID_MESSAGE" });
    return false;
  }
  const action = message.type === "GET_RUNTIME_STATE" ? Promise.resolve(runtime.getState())
    : message.type === "REFRESH_STATUS" ? runtime.refresh()
      : runtime.start();
  action.then(sendResponse).catch(() => sendResponse({ error: "INTERNAL_ERROR" }));
  return true;
});

async function probeCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const url = tab?.url ? new URL(tab.url) : null;
  if (url?.protocol !== "https:" || url.hostname !== "hotels.ctrip.com" || url.pathname !== "/hotels/list") {
    return { kind: "unsupported", code: "UNSUPPORTED_PAGE", source_url: tab?.url ?? null };
  }
  if (tab?.id === undefined) return { kind: "error", code: "TAB_UNAVAILABLE", source_url: tab?.url ?? null };
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "CTRIP_READ_CONTEXT" });
  } catch {
    return { kind: "error", code: "CTRIP_CONTEXT_UNAVAILABLE", source_url: tab.url ?? null };
  }
}

chrome.alarms.onAlarm.addListener((alarm) => { void runtime.onAlarm(alarm.name); });
void runtime.start().catch(() => {});
