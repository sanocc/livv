import test from "node:test";
import assert from "node:assert/strict";
import { errorSummary, registrationRetry } from "../agent/diagnostics.js";

test("registration retry is persistent, bounded and low frequency", () => {
  let retry = {};
  for (const minutes of [2, 5, 10, 15, 30, 30, 30]) {
    retry = registrationRetry(retry, 1000);
    assert.equal(retry.next_at, 1000 + minutes * 60000);
    assert.ok(retry.count <= 5);
  }
});

test("exception diagnostics redact secrets and personal local paths, retaining useful stack frames", () => {
  const result = errorSummary(
    {
      name: "TypeError",
      message: "Failed to fetch token=secret Cookie=private " + "a".repeat(64),
      stack:
        "Error\n at request (C:\\Users\\someone\\agent.js:2:3)\n at run (chrome-extension://private/background.js:10:2)\nline4\nline5",
    },
    {
      phase: "CLAIM",
      url: "https://m.ctrip.com/webapp/hotels/list?secret=private#hash",
      browser: "Chrome Windows",
    },
  );
  assert.equal(result.pathname, "/webapp/hotels/list");
  assert.equal(result.phase, "CLAIM");
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.ok(!JSON.stringify(result).includes("someone"));
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("line5"));
  assert.match(result.stack_summary, /background.js:10:2/);
  assert.equal(
    errorSummary(new Error("x".repeat(2000))).error_message.length,
    500,
  );
});

test("MV3 registration failure survives worker wakes without API hammering and retries same identity", async () => {
  const fs = await import("node:fs"),
    { pathToFileURL } = await import("node:url");
  const initial = {
    device_id: "poai_" + crypto.randomUUID(),
    credential: "a".repeat(64),
  };
  const data = { identity: { ...initial }, logs: [] },
    alarms = new Map(),
    listeners = {};
  let time = 1000000,
    requests = 0,
    succeeds = false;
  const oldChrome = globalThis.chrome,
    oldFetch = globalThis.fetch,
    oldNow = Date.now;
  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise(setImmediate);
  };
  const storage = {
    async get(keys) {
      if (typeof keys === "string") return { [keys]: data[keys] };
      return Object.fromEntries(keys.map((k) => [k, data[k]]));
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(key) {
      delete data[key];
    },
    async setAccessLevel() {},
  };
  globalThis.chrome = {
    storage: { local: storage },
    runtime: {
      getManifest: () => ({ version: "1.3.3" }),
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: {
        addListener(fn) {
          listeners.message = fn;
        },
      },
    },
    alarms: {
      async create(name, value) {
        alarms.set(name, value);
      },
      async clear(name) {
        alarms.delete(name);
      },
      async clearAll() {
        alarms.clear();
      },
      onAlarm: {
        addListener(fn) {
          listeners.alarm = fn;
        },
      },
    },
    tabs: {
      onUpdated: { addListener() {} },
      async get() {
        throw Error("No managed tab");
      },
    },
    sidePanel: { async setPanelBehavior() {} },
  };
  Date.now = () => time;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/v1/devices/register")) {
      requests++;
      const payload = JSON.parse(options.body);
      assert.equal(payload.device_id, initial.device_id);
      assert.equal(payload.credential, initial.credential);
      if (!succeeds) throw TypeError("Failed to fetch");
      return Response.json({ status: "pending" });
    }
    assert.ok(url.endsWith("/v1/device/heartbeat"));
    return Response.json({ status: "pending" });
  };
  try {
    let source = fs.readFileSync(
      new URL("../agent/background.js", import.meta.url),
      "utf8",
    );
    source = source.replace(
      /import \{ telemetryEvent, telemetryQueue \} from "\.\/telemetry.js";/,
      "const telemetryEvent = () => null; const telemetryQueue = () => ({ enqueue: async () => {}, flush: async () => {} });",
    );
    source = source.replace(
      /from "\.\/([^"\n]+)"/g,
      (_, file) =>
        'from "' + new URL("../agent/" + file, import.meta.url).href + '"',
    );
    await import(
      "data:text/javascript;base64," + Buffer.from(source).toString("base64")
    );
    await settle();
    assert.equal(requests, 1);
    assert.equal(data.registration_retry.next_at, time + 120000);
    assert.equal(data.logs.at(-1).error_summary.phase, "REGISTER");
    assert.equal(data.logs.at(-1).error_summary.error_name, "TypeError");
    assert.equal(
      data.logs.at(-1).error_summary.request_path,
      "/v1/devices/register",
    );
    for (let i = 0; i < 5; i++) {
      listeners.alarm({ name: "agent-register-retry" });
      await settle();
    }
    assert.equal(requests, 1);
    time = data.registration_retry.next_at;
    listeners.alarm({ name: "agent-register-retry" });
    await settle();
    assert.equal(requests, 2);
    assert.equal(data.registration_retry.next_at, time + 300000);
    succeeds = true;
    time = data.registration_retry.next_at;
    listeners.alarm({ name: "agent-register-retry" });
    await settle();
    assert.equal(requests, 3);
    assert.equal(data.identity.device_id, initial.device_id);
    assert.equal(data.identity.credential, initial.credential);
    assert.equal(data.identity.registered, true);
    assert.equal(data.registration_retry, undefined);
    assert.ok(!alarms.has("agent-register-retry"));
    assert.deepEqual(alarms.get("agent-heartbeat"), { periodInMinutes: 0.5 });
    assert.equal(data.cloud.status, "pending");
  } finally {
    globalThis.chrome = oldChrome;
    globalThis.fetch = oldFetch;
    Date.now = oldNow;
  }
});
