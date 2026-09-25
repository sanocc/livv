const assert = require('assert');
const identity = require('../shared/device-identity.js');

const values = {};
const chromeApi = {
  storage: {
    local: {
      async get(key) { return { [key]: values[key] }; },
      async set(payload) { Object.assign(values, payload); }
    }
  }
};

(async () => {
  const first = await identity.getOrCreate(chromeApi, () => '2026-09-25T00:00:00.000Z');
  const second = await identity.getOrCreate(chromeApi, () => 'different');
  assert.strictEqual(first.device_id, second.device_id);
  assert.strictEqual(first.device_secret, second.device_secret);
  assert.strictEqual(first.created_at, second.created_at);
  assert.match(first.device_id, /^dev_/);
  assert.ok(first.device_secret.length >= 40);
  assert.deepStrictEqual(Object.keys(values), [identity.STORAGE_KEY]);
  const signed = await identity.signRequest({ identity: first, method: 'POST', pathname: '/v1/devices/heartbeat', timestamp: '1000', nonce: 'n1', body: '{}' });
  assert.match(signed.signature, /^[0-9a-f]{64}$/);
  assert.ok(signed.canonical.includes('/v1/devices/heartbeat'));
  console.log('device identity tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
