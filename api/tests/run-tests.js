import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createApp } from '../src/index.ts';
import { canonicalRequest } from '../src/auth/device.ts';
import { hmacHex } from '../src/utils/crypto.ts';

class FakeDB {
  constructor() { this.devices = new Map(); this.nonces = new Map(); }
  prepare(sql) {
    const db = this;
    return {
      _args: [],
      bind(...args) { this._args = args; return this; },
      async first() {
        const args = this._args;
        if (/SELECT \* FROM devices WHERE device_id/.test(sql)) return db.devices.get(args[0]) || null;
        return null;
      },
      async all() {
        if (/SELECT device_id, device_name, status/.test(sql)) {
          return { results: [...db.devices.values()].map(({ device_secret_hash, ...publicRow }) => publicRow) };
        }
        return { results: [...db.devices.values()] };
      },
      async run() {
        const args = this._args;
        if (/INSERT INTO devices/.test(sql)) {
          const [device_id, device_name, device_secret_hash, extension_version, platform, browser, os, created_at] = args;
          if (db.devices.has(device_id)) throw new Error('UNIQUE constraint failed');
          db.devices.set(device_id, { device_id, device_name, device_secret_hash, status: 'pending', extension_version, platform, browser, os, created_at, approved_at: null, last_seen_at: null });
          return { success: true, meta: { changes: 1 } };
        }
        if (/UPDATE devices SET last_seen_at/.test(sql)) {
          const [last_seen_at, extension_version, device_id] = args;
          const row = db.devices.get(device_id);
          if (row) { row.last_seen_at = last_seen_at; row.extension_version = extension_version; }
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (/UPDATE devices SET status/.test(sql)) {
          const [status, device_id, timestamp] = args;
          const row = db.devices.get(device_id);
          if (row) {
            row.status = status;
            if (status === 'approved') row.approved_at = timestamp;
            if (status === 'disabled') row.disabled_at = timestamp;
            if (status === 'revoked') row.revoked_at = timestamp;
          }
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (/INSERT INTO device_nonces/.test(sql)) {
          const [device_id, nonce, created_at, expires_at] = args;
          const key = `${device_id}:${nonce}`;
          if (db.nonces.has(key)) throw new Error('UNIQUE constraint failed: device_nonces.device_id, device_nonces.nonce');
          db.nonces.set(key, { device_id, nonce, created_at, expires_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (/DELETE FROM device_nonces/.test(sql)) {
          const before = args[0];
          let changes = 0;
          for (const [key, row] of db.nonces) if (row.expires_at <= before) { db.nonces.delete(key); changes += 1; }
          return { success: true, meta: { changes } };
        }
        return { success: true, meta: { changes: 0 } };
      }
    };
  }
}

const db = new FakeDB();
const env = { DB: db };
const app = createApp({ version: '0.1.0-test' });
const adminApp = createApp({
  version: '0.1.0-test',
  accessVerifier: async (request) => {
    if (!request.headers.get('CF-Access-Jwt-Assertion')) return { ok: false, code: 'ADMIN_AUTH_REQUIRED', message: 'Cloudflare Access authentication is required', status: 401 };
    return { ok: true, claims: { email: request.headers.get('X-Test-Admin-Email') } };
  }
});
const base = 'https://api.example.test';
const device = { device_id: 'dev_fixture_001', verifier: 'verifier_fixture_very_long_random_value_001' };

async function json(response) { return response.json(); }
async function request(path, options = {}) { return app.fetch(new Request(`${base}${path}`, options), env); }
async function signed(path, { method = 'GET', body = '', nonce = `nonce_${Date.now()}_${Math.random()}` } = {}) {
  const timestamp = String(Date.now());
  const req = new Request(`${base}${path}`, { method, headers: { 'X-LIVV-Device-ID': device.device_id, 'X-LIVV-Timestamp': timestamp, 'X-LIVV-Nonce': nonce, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : body });
  const canonical = await canonicalRequest(req, timestamp, nonce, body);
  req.headers.set('X-LIVV-Signature', await hmacHex(device.verifier, canonical));
  return req;
}

(async () => {
  let response = await request('/health');
  assert.strictEqual(response.status, 200);
  assert.strictEqual((await json(response)).ok, true);

  response = await request('/v1/devices/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: device.device_id, device_secret_verifier: device.verifier, device_name: 'Fixture', extension_version: '1.0.49', platform: 'chrome-extension', browser: 'Chrome', os: 'macOS' }) });
  let payload = await json(response);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(payload.data.idempotent, false);
  assert.strictEqual(payload.data.device.status, 'pending');
  assert.ok(!JSON.stringify(payload).includes(device.verifier));

  response = await request('/v1/devices/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: device.device_id, device_secret_verifier: device.verifier, device_name: 'Fixture', extension_version: '1.0.49', platform: 'chrome-extension', browser: 'Chrome', os: 'macOS' }) });
  assert.strictEqual((await json(response)).data.idempotent, true);
  response = await request('/v1/devices/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: device.device_id, device_secret_verifier: `${device.verifier}_different`, extension_version: '1.0.49', platform: 'chrome-extension', browser: 'Chrome', os: 'macOS' }) });
  assert.strictEqual(response.status, 409);
  assert.strictEqual((await json(response)).error.code, 'DEVICE_CREDENTIAL_CONFLICT');

  response = await app.fetch(await signed('/v1/devices/me'), env);
  payload = await json(response);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(payload.data.device.status, 'pending');
  const pendingHeartbeat = await app.fetch(await signed('/v1/devices/heartbeat', { method: 'POST', body: JSON.stringify({ extension_version: '1.0.49' }), nonce: 'pending_heartbeat' }), env);
  assert.strictEqual(pendingHeartbeat.status, 403);
  assert.strictEqual((await json(pendingHeartbeat)).error.code, 'DEVICE_PENDING');
  const invalidNonceRequest = await signed('/v1/devices/me', { nonce: 'invalid_then_valid' });
  invalidNonceRequest.headers.set('X-LIVV-Signature', 'bad');
  assert.strictEqual((await app.fetch(invalidNonceRequest, env)).status, 401);
  assert.strictEqual((await app.fetch(await signed('/v1/devices/me', { nonce: 'invalid_then_valid' }), env)).status, 200);
  const expiredRequest = await signed('/v1/devices/me', { nonce: 'expired_then_valid' });
  expiredRequest.headers.set('X-LIVV-Timestamp', String(Date.now() - 10 * 60 * 1000));
  assert.strictEqual((await app.fetch(expiredRequest, env)).status, 401);
  assert.strictEqual((await app.fetch(await signed('/v1/devices/me', { nonce: 'expired_then_valid' }), env)).status, 200);
  const replayRequest = await signed('/v1/devices/me', { nonce: 'replay_nonce' });
  assert.strictEqual((await app.fetch(replayRequest, env)).status, 200);
  const replayResponse = await app.fetch(replayRequest, env);
  assert.strictEqual(replayResponse.status, 401);
  assert.strictEqual((await json(replayResponse)).error.code, 'REPLAY_DETECTED');
  assert.strictEqual(db.nonces.size > 0, true);
  db.devices.get(device.device_id).status = 'approved';
  const body = JSON.stringify({ extension_version: '1.0.49' });
  response = await app.fetch(await signed('/v1/devices/heartbeat', { method: 'POST', body }), env);
  assert.strictEqual(response.status, 200);
  assert.strictEqual((await json(response)).data.device.status, 'approved');

  response = await request('/v1/admin/devices');
  assert.strictEqual(response.status, 501);
  assert.strictEqual((await json(response)).error.code, 'ADMIN_AUTH_NOT_CONFIGURED');
  response = await app.fetch(new Request(`${base}/v1/admin/devices`, { headers: { 'CF-Access-Jwt-Assertion': 'not-a-jwt' } }), { DB: db, CF_ACCESS_TEAM_DOMAIN: 'https://team.example.cloudflareaccess.com', CF_ACCESS_AUD: 'test-audience', ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual(response.status, 401);
  assert.strictEqual((await json(response)).error.code, 'ADMIN_AUTH_INVALID');

  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices`), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual(response.status, 401);
  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices`, { headers: { 'CF-Access-Jwt-Assertion': 'test', 'X-Test-Admin-Email': 'user@example.com' } }), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual(response.status, 403);
  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices`, { headers: { 'CF-Access-Jwt-Assertion': 'test', 'X-Test-Admin-Email': 'admin@example.com' } }), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual(response.status, 200);
  const deviceList = await json(response);
  assert.ok(deviceList.data.devices.length >= 1);
  assert.ok(!Object.hasOwn(deviceList.data.devices[0], 'device_secret_hash'));
  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices/${device.device_id}/approve`, { method: 'POST', headers: { 'CF-Access-Jwt-Assertion': 'test', 'X-Test-Admin-Email': 'admin@example.com' } }), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual(response.status, 200);
  assert.strictEqual((await json(response)).data.device.status, 'approved');
  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices/${device.device_id}/approve`, { method: 'POST', headers: { 'CF-Access-Jwt-Assertion': 'test', 'X-Test-Admin-Email': 'admin@example.com' } }), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual((await json(response)).data.idempotent, true);
  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices/${device.device_id}/disable`, { method: 'POST', headers: { 'CF-Access-Jwt-Assertion': 'test', 'X-Test-Admin-Email': 'admin@example.com' } }), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual((await json(response)).data.device.status, 'disabled');
  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices/${device.device_id}/revoke`, { method: 'POST', headers: { 'CF-Access-Jwt-Assertion': 'test', 'X-Test-Admin-Email': 'admin@example.com' } }), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual((await json(response)).data.device.status, 'revoked');
  response = await adminApp.fetch(new Request(`${base}/v1/admin/devices/${device.device_id}/approve`, { method: 'POST', headers: { 'CF-Access-Jwt-Assertion': 'test', 'X-Test-Admin-Email': 'admin@example.com' } }), { DB: db, ADMIN_EMAILS: 'admin@example.com' });
  assert.strictEqual(response.status, 409);

  db.devices.get(device.device_id).status = 'disabled';
  assert.strictEqual((await app.fetch(await signed('/v1/devices/me'), env)).status, 200);
  assert.strictEqual((await app.fetch(await signed('/v1/devices/heartbeat', { method: 'POST', body: JSON.stringify({ extension_version: '1.0.49' }) }), env)).status, 403);
  assert.strictEqual(fs.readFileSync('migrations/0001_initial.sql', 'utf8').includes('CREATE TABLE IF NOT EXISTS devices'), true);
  assert.strictEqual(fs.readFileSync('migrations/0002_device_nonces.sql', 'utf8').includes('UNIQUE(device_id, nonce)'), true);
  console.log('api tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
