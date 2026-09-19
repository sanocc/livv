import { createApiClient } from "../shared/api-client.js";
import { createChromeAlarms } from "../shared/chrome.js";
import { createRuntime } from "../shared/runtime.js";
import { createStorage } from "../shared/storage.js";

const runtime = createRuntime({
  storage: createStorage(chrome),
  alarms: createChromeAlarms(chrome),
  apiFactory: (options) => createApiClient(options),
  executionReady: false,
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

chrome.alarms.onAlarm.addListener((alarm) => { void runtime.onAlarm(alarm.name); });
void runtime.start().catch(() => {});
