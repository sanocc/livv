const DEFAULT_API = "https://api.livv.cc";

async function settings() {
  return chrome.storage.local.get({
    apiBase: DEFAULT_API,
    deviceId: "",
    credential: "",
    deviceRowId: "",
    lastResults: [],
    lastDevice: null,
  });
}

async function save(patch) {
  await chrome.storage.local.set(patch);
}

async function ensureDevice() {
  const cfg = await settings();
  let deviceId = cfg.deviceId;
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await save({ deviceId });
  }
  if (!cfg.credential) {
    const body = {
      device_id: deviceId,
      name: "Collector " + deviceId.slice(0, 8),
      collector_version: "0.3.0",
      protocol_version: "m03",
      os: navigator.userAgentData?.platform || "macOS",
      arch: "arm64",
      browser: "chrome",
      browser_version: (navigator.userAgent.match(/Chrome\/([\d.]+)/) || ["", "0"])[1].slice(0, 32),
    };
    const res = await fetch(`${cfg.apiBase}/api/v1/collector/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "register failed");
    const data = json.data ?? json;
    await save({
      credential: data.credential || data.device_credential || data.credential_plain || "",
      deviceRowId: data.device?.id || data.id || "",
      lastDevice: data.device || data,
    });
  }
  return settings();
}

async function api(path, { method = "GET", body } = {}) {
  const cfg = await ensureDevice();
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-livv-device-id": cfg.deviceId,
      "x-livv-device-credential": cfg.credential,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.json = json;
    throw err;
  }
  return json.data ?? json;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDevice().catch((err) => console.warn("register failed", err));
});

chrome.runtime.onStartup.addListener(() => {
  ensureDevice().catch((err) => console.warn("register failed", err));
});

chrome.alarms.create("livv-heartbeat", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "livv-heartbeat") return;
  api("/api/v1/collector/heartbeat", { method: "POST", body: { state: "idle" } }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "ENSURE") {
      sendResponse({ ok: true, cfg: await ensureDevice() });
      return;
    }
    if (message.type === "STATUS") {
      const device = await api("/api/v1/collector/device");
      await save({ lastDevice: device.device || device });
      sendResponse({ ok: true, device: device.device || device });
      return;
    }
    if (message.type === "SAVE_LOCAL") {
      const cfg = await settings();
      const lastResults = [message.payload, ...(cfg.lastResults || [])].slice(0, 20);
      await save({ lastResults });
      sendResponse({ ok: true, lastResults });
      return;
    }
    if (message.type === "UPLOAD") {
      const result = await api("/api/v1/collector/collections", {
        method: "POST",
        body: message.payload,
      });
      sendResponse({ ok: true, result });
      return;
    }
    sendResponse({ ok: false, error: "unknown message" });
  })().catch((err) => sendResponse({ ok: false, error: err.message, json: err.json }));
  return true;
});
