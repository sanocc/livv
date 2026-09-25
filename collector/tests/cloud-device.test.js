const assert = require('assert');
global.LivvDeviceIdentity = require('../shared/device-identity.js');
const cloud = require('../shared/cloud-device.js');

const values = {};
const calls = [];
const chromeApi = {
  runtime: { getManifest: () => ({ version: '1.0.50' }) },
  storage: { local: { async get(key) { return { [key]: values[key] }; }, async set(payload) { Object.assign(values, payload); } } },
  alarms: { onAlarm: { addListener(listener) { chromeApi.alarmListener = listener; } }, create(name, options) { chromeApi.alarm = { name, options }; } }
};

global.fetch = async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith('/v1/devices/register')) return new Response(JSON.stringify({ ok: true, data: { device: { status: 'pending' } } }), { status: 200 });
  if (url.endsWith('/v1/devices/me')) return new Response(JSON.stringify({ ok: true, data: { device: { status: 'approved' } } }), { status: 200 });
  if (url.endsWith('/v1/devices/heartbeat')) return new Response(JSON.stringify({ ok: true, data: { device: { status: 'approved' } } }), { status: 200 });
  return new Response(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }), { status: 404 });
};

(async () => {
  const registered = await cloud.register(chromeApi);
  assert.strictEqual(registered.status, 'pending');
  assert.strictEqual(calls[0].url, 'https://api.livv.cc/v1/devices/register');
  const registerBody = JSON.parse(calls[0].options.body);
  assert.strictEqual(registerBody.extension_version, '1.0.50');
  assert.ok(registerBody.device_secret_verifier);
  assert.ok(!registerBody.device_secret);
  const approved = await cloud.getStatus(chromeApi);
  assert.strictEqual(approved.status, 'approved');
  await cloud.heartbeat(chromeApi);
  assert.strictEqual(calls.at(-1).url, 'https://api.livv.cc/v1/devices/heartbeat');
  cloud.install(chromeApi);
  assert.deepStrictEqual(chromeApi.alarm, { name: 'livv-device-heartbeat', options: { periodInMinutes: 5 } });
  console.log('cloud device tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
