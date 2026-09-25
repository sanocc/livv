(function (root) {
  'use strict';

  const API_BASE_URL = 'https://api.livv.cc';
  const STATE_KEY = 'LIVV_CLOUD_DEVICE_STATE';
  const HEARTBEAT_ALARM = 'livv-device-heartbeat';

  function storageFor(chromeApi) { return chromeApi?.storage?.local || null; }

  async function state(chromeApi) {
    const storage = storageFor(chromeApi);
    if (!storage) throw new Error('CHROME_STORAGE_UNAVAILABLE');
    return (await storage.get(STATE_KEY))?.[STATE_KEY] || { registered: false, status: 'unregistered' };
  }

  async function saveState(chromeApi, value) {
    await storageFor(chromeApi).set({ [STATE_KEY]: value });
    return value;
  }

  function metadata(chromeApi) {
    const manifest = chromeApi.runtime.getManifest();
    return {
      device_name: 'LIVV Hotel Assistant',
      extension_version: manifest.version,
      platform: 'chrome-extension',
      browser: 'Chrome',
      os: navigator.userAgentData?.platform || navigator.platform || 'unknown'
    };
  }

  async function request(chromeApi, identity, path, method, body) {
    const bodyText = body ? JSON.stringify(body) : '';
    const timestamp = String(Date.now());
    const nonce = root.LivvDeviceIdentity.randomToken(18);
    const signed = await root.LivvDeviceIdentity.signRequest({ identity, method, pathname: path, timestamp, nonce, body: bodyText });
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-LIVV-Device-ID': identity.device_id,
        'X-LIVV-Timestamp': timestamp,
        'X-LIVV-Nonce': nonce,
        'X-LIVV-Signature': signed.signature
      },
      body: method === 'GET' ? undefined : bodyText
    });
    const payload = await response.json();
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error?.message || `HTTP_${response.status}`);
      error.code = payload.error?.code || `HTTP_${response.status}`;
      throw error;
    }
    return payload.data;
  }

  async function register(chromeApi = root.chrome) {
    const identity = await root.LivvDeviceIdentity.getOrCreate(chromeApi);
    const verifier = await root.LivvDeviceIdentity.sha256Hex(identity.device_secret);
    const data = await request(chromeApi, identity, '/v1/devices/register', 'POST', { ...metadata(chromeApi), device_id: identity.device_id, device_secret_verifier: verifier });
    return saveState(chromeApi, { registered: true, status: data.device.status, device_id: identity.device_id, registered_at: new Date().toISOString() });
  }

  async function ensureRegistered(chromeApi = root.chrome) {
    const current = await state(chromeApi);
    if (current.registered) return current;
    return register(chromeApi);
  }

  async function getStatus(chromeApi = root.chrome) {
    const identity = await root.LivvDeviceIdentity.getOrCreate(chromeApi);
    const data = await request(chromeApi, identity, '/v1/devices/me', 'GET');
    return saveState(chromeApi, { ...(await state(chromeApi)), registered: true, status: data.device.status, device_id: identity.device_id, checked_at: new Date().toISOString() });
  }

  async function heartbeat(chromeApi = root.chrome) {
    const current = await state(chromeApi);
    if (!current.registered || current.status !== 'approved') return current;
    const identity = await root.LivvDeviceIdentity.getOrCreate(chromeApi);
    const data = await request(chromeApi, identity, '/v1/devices/heartbeat', 'POST', { extension_version: chromeApi.runtime.getManifest().version });
    return saveState(chromeApi, { ...current, status: data.device.status, heartbeat_at: new Date().toISOString() });
  }

  function install(chromeApi = root.chrome) {
    if (!chromeApi?.alarms?.onAlarm) return;
    chromeApi.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === HEARTBEAT_ALARM) heartbeat(chromeApi).catch(() => {});
    });
    chromeApi.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 5 });
  }

  root.LivvCloudDevice = { API_BASE_URL, STATE_KEY, HEARTBEAT_ALARM, state, register, ensureRegistered, getStatus, heartbeat, install };
  if (typeof module !== 'undefined') module.exports = root.LivvCloudDevice;
})(typeof globalThis !== 'undefined' ? globalThis : this);
