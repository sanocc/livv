(function (root) {
  'use strict';

  const STORAGE_KEY = 'LIVV_DEVICE_IDENTITY';
  const encoder = new TextEncoder();

  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function randomToken(byteLength = 32) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return bytesToBase64(bytes);
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(value) {
    return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
  }

  async function hmacHex(key, value) {
    const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(String(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return bytesToHex(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(String(value))));
  }

  async function signRequest({ identity, method, pathname, timestamp, nonce, body = '' }) {
    const verifier = await sha256Hex(identity.device_secret);
    const bodyHash = await sha256Hex(body);
    const canonical = [String(method).toUpperCase(), pathname, timestamp, nonce, bodyHash].join('\n');
    return { signature: await hmacHex(verifier, canonical), canonical };
  }

  function storageFor(chromeApi) {
    return chromeApi?.storage?.local || null;
  }

  function validIdentity(value) {
    return Boolean(value && typeof value.device_id === 'string' && value.device_id &&
      typeof value.device_secret === 'string' && value.device_secret &&
      typeof value.created_at === 'string' && value.created_at);
  }

  async function getOrCreate(chromeApi = root.chrome, now = () => new Date().toISOString()) {
    const storage = storageFor(chromeApi);
    if (!storage) throw new Error('CHROME_STORAGE_UNAVAILABLE');
    const saved = (await storage.get(STORAGE_KEY))?.[STORAGE_KEY];
    if (validIdentity(saved)) return saved;
    const identity = { device_id: `dev_${randomToken(18)}`, device_secret: randomToken(32), created_at: now() };
    await storage.set({ [STORAGE_KEY]: identity });
    return identity;
  }

  async function initialize(chromeApi = root.chrome) {
    return getOrCreate(chromeApi);
  }

  root.LivvDeviceIdentity = { STORAGE_KEY, getOrCreate, initialize, randomToken, sha256Hex, hmacHex, signRequest };
  if (typeof module !== 'undefined') module.exports = root.LivvDeviceIdentity;
})(typeof globalThis !== 'undefined' ? globalThis : this);
