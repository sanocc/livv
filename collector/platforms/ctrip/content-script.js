const { ctripContextProbe, readCtripContext } = globalThis.LIVV_CTRIP_CONTEXT;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CTRIP_READ_CONTEXT") sendResponse({ context: readCtripContext(), probe: ctripContextProbe() });
  else if (message?.type === "CTRIP_CONTEXT_PROBE") sendResponse({ probe: ctripContextProbe() });
  else return false;
  return false;
});

void chrome.runtime.sendMessage({ type: "CTRIP_CONTEXT_AVAILABLE", probe: ctripContextProbe() });
