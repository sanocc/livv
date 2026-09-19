import { describe, expect, it, vi } from "vitest";
import { createRuntime, STATES } from "../shared/runtime.js";
import { LOCAL_KEYS, SESSION_KEY, createStorage } from "../shared/storage.js";
import { createApiClient } from "../shared/api-client.js";
import { createChromeAlarms } from "../shared/chrome.js";

function fakeStorage(initial = {}, session = null) {
  const local = { ...initial };
  let current = session;
  return {
    local,
    async getLocal() { return { ...local }; },
    async setLocal(values) { Object.assign(local, values); },
    async getSession() { return current; },
    async setSession(value) { current = value; },
    async clearSession() { current = null; },
    sessionValue() { return current; },
  };
}

function fakeAlarms() {
  const calls = [];
  return { calls, async create(...args) { calls.push(["create", ...args]); }, async clear(...args) { calls.push(["clear", ...args]); } };
}

function apiMock(overrides = {}) {
  return {
    register: vi.fn(async () => ({ status: 201, data: { credential: "secret", device: { device_id: "device-1", status: "pending" } } })),
    device: vi.fn(async () => ({ status: 200, data: { device: { device_id: "device-1", status: "authorized", last_heartbeat_at: null } } })),
    heartbeat: vi.fn(async () => ({ status: 200, data: { device: { device_id: "device-1", status: "authorized" } } })),
    currentTask: vi.fn(async () => ({ status: 204, data: null })),
    claim: vi.fn(async () => ({ status: 204, data: null })),
    ...overrides,
  };
}

describe("M05 Collector runtime", () => {
  it("creates and then reuses one stable device_id, registering only without a credential", async () => {
    const storage = fakeStorage();
    const alarms = fakeAlarms();
    const api = apiMock();
    const runtime = createRuntime({ storage, alarms, apiFactory: () => api, uuid: () => "device-1" });
    await runtime.start();
    expect(storage.local.device_id).toBe("device-1");
    expect(storage.local.device_credential).toBe("secret");
    expect(api.register).toHaveBeenCalledTimes(1);
    await runtime.refresh();
    expect(api.register).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent bootstrap and claim calls", async () => {
    const storage = fakeStorage();
    const alarms = fakeAlarms();
    const api = apiMock({
      register: vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 2)); return { status: 201, data: { credential: "secret", device: { device_id: "device-1", status: "pending" } } }; }),
    });
    const runtime = createRuntime({ storage, alarms, apiFactory: () => api, uuid: () => "device-1", executionReady: false });
    await Promise.all([runtime.start(), runtime.start(), runtime.refresh()]);
    expect(api.register).toHaveBeenCalledTimes(1);

    const authorizedApi = apiMock({ claim: vi.fn(async () => ({ status: 204, data: null })) });
    const ready = createRuntime({ storage: fakeStorage({ device_id: "device-1", device_credential: "secret" }), alarms: fakeAlarms(), apiFactory: () => authorizedApi, executionReady: true });
    await ready.start();
    await Promise.all([ready.claimIfReady(), ready.claimIfReady()]);
    expect(authorizedApi.claim).toHaveBeenCalledTimes(1);
  });

  it("keeps pending devices heartbeating and prevents claim", async () => {
    const storage = fakeStorage({ device_id: "device-1", device_credential: "secret" });
    const alarms = fakeAlarms();
    const api = apiMock({ device: vi.fn(async () => ({ status: 200, data: { device: { device_id: "device-1", status: "pending" } } })) });
    const runtime = createRuntime({ storage, alarms, apiFactory: () => api, executionReady: true });
    await runtime.start();
    await runtime.claimIfReady();
    await runtime.heartbeat();
    expect(runtime.getState().state).toBe(STATES.PENDING_AUTH);
    expect(api.claim).not.toHaveBeenCalled();
    expect(api.heartbeat).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite or invent a credential when bootstrap register returns none", async () => {
    const storage = fakeStorage({ device_id: "device-1" });
    const api = apiMock({ register: vi.fn(async () => ({ status: 200, data: { device: { device_id: "device-1", status: "pending" } } })) });
    const runtime = createRuntime({ storage, alarms: fakeAlarms(), apiFactory: () => api });
    const state = await runtime.start();
    expect(state.state).toBe(STATES.FAILED);
    expect(state.error_code).toBe("CREDENTIAL_UNAVAILABLE");
    expect(storage.local.device_credential).toBeUndefined();
    expect(api.device).not.toHaveBeenCalled();
  });

  it("stops revoked devices without re-registering", async () => {
    const storage = fakeStorage({ device_id: "device-1", device_credential: "secret" });
    const alarms = fakeAlarms();
    const api = apiMock({ device: vi.fn(async () => { const error = new Error("DEVICE_REVOKED"); error.code = "DEVICE_REVOKED"; throw error; }) });
    const runtime = createRuntime({ storage, alarms, apiFactory: () => api });
    await runtime.start();
    expect(runtime.getState().state).toBe(STATES.REVOKED);
    expect(api.register).not.toHaveBeenCalled();
    await runtime.heartbeat();
    expect(api.heartbeat).not.toHaveBeenCalled();
    expect(alarms.calls).toContainEqual(["clear", "livv-heartbeat"]);
  });

  it("uses the readiness gate and fake executor for task runtime", async () => {
    const storage = fakeStorage({ device_id: "device-1", device_credential: "secret" });
    const alarms = fakeAlarms();
    const task = { task_id: "task-1", attempt_id: "attempt-1", platform: "ctrip", check_in: "2026-01-01", check_out: "2026-01-02" };
    const api = apiMock({ currentTask: vi.fn(async () => ({ status: 204, data: null })), claim: vi.fn(async () => ({ status: 200, data: { task } })) });
    const executor = { execute: vi.fn(async () => {}) };
    const runtime = createRuntime({ storage, alarms, apiFactory: () => api, executor, executionReady: false });
    await runtime.start();
    await runtime.claimIfReady();
    expect(api.claim).not.toHaveBeenCalled();
    const ready = createRuntime({ storage: fakeStorage({ device_id: "device-1", device_credential: "secret" }), alarms: fakeAlarms(), apiFactory: () => api, executor, executionReady: true });
    await ready.start();
    await ready.claimIfReady();
    expect(api.claim).toHaveBeenCalledTimes(1);
    expect(executor.execute).toHaveBeenCalledWith(task);
    expect(ready.getState().state).toBe(STATES.EXECUTING);
  });

  it("hydrates active cloud task, clears stale session, and keeps popup state transient", async () => {
    const task = { task_id: "task-1", attempt_id: "attempt-1", platform: "ctrip", check_in: "2026-01-01", check_out: "2026-01-02" };
    const storage = fakeStorage({ device_id: "device-1", device_credential: "secret" }, { task: { task_id: "stale" } });
    const api = apiMock({ currentTask: vi.fn(async () => ({ status: 200, data: { task } })) });
    const runtime = createRuntime({ storage, alarms: fakeAlarms(), apiFactory: () => api });
    await runtime.start();
    expect(runtime.getState().task).toEqual(task);
    expect(storage.sessionValue()).toMatchObject({ task });
    await runtime.setProgress({ stage: "running", current: 1, target: 2 });
    expect(storage.sessionValue()).toMatchObject({ progress: { current: 1, target: 2 } });
    api.currentTask.mockResolvedValue({ status: 204, data: null });
    await runtime.refresh();
    expect(storage.sessionValue()).toBeNull();
    expect(runtime.getState().task).toBeNull();
  });

  it("clears an expired local task without requeueing or claiming it", async () => {
    const task = { task_id: "task-1", attempt_id: "attempt-1", lease_expires_at: "2026-03-01T16:00:00.000Z" };
    const storage = fakeStorage({ device_id: "device-1", device_credential: "secret" }, { task });
    const api = apiMock({ currentTask: vi.fn(async () => ({ status: 200, data: { task } })) });
    const runtime = createRuntime({ storage, alarms: fakeAlarms(), apiFactory: () => api, clock: () => new Date("2026-03-01T16:01:00.000Z") });
    await runtime.start();
    expect(runtime.getState().task).toBeNull();
    expect(storage.sessionValue()).toBeNull();
    expect(api.claim).not.toHaveBeenCalled();
  });

  it("clears session after a fake terminal failure", async () => {
    const task = { task_id: "task-1", attempt_id: "attempt-1", lease_expires_at: "2026-03-01T17:00:00.000Z" };
    const storage = fakeStorage({ device_id: "device-1", device_credential: "secret" });
    const api = apiMock({ claim: vi.fn(async () => ({ status: 200, data: { task } })) });
    const executor = { execute: vi.fn(async () => ({ terminal: true, status: "failed" })) };
    const runtime = createRuntime({ storage, alarms: fakeAlarms(), apiFactory: () => api, executor, executionReady: true, clock: () => new Date("2026-03-01T16:01:00.000Z") });
    await runtime.start();
    await runtime.claimIfReady();
    expect(runtime.getState().state).toBe(STATES.FAILED);
    expect(storage.sessionValue()).toBeNull();
  });

  it("API client sends bearer only in the request and redacts error payloads", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(options.headers.get("authorization")).toBe("Bearer secret");
      return new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "secret" } }), { status: 401 });
    });
    const api = createApiClient({ fetchImpl, credential: "secret" });
    await expect(api.device()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    try { await api.device(); } catch (error) { expect(String(error.message)).not.toContain("secret"); }
  });

  it("uses cloud current-task recovery when storage.session is unavailable", async () => {
    const localValues = { device_id: "device-1", device_credential: "secret" };
    const storage = createStorage({
      storage: {
        local: { async get() { return localValues; }, async set() {} },
        session: { async get() { throw new Error("session unavailable"); }, async set() { throw new Error("session unavailable"); }, async remove() { throw new Error("session unavailable"); } },
      },
    });
    const task = { task_id: "task-1", attempt_id: "attempt-1", lease_expires_at: "2099-03-01T16:00:00.000Z" };
    const api = apiMock({ currentTask: vi.fn(async () => ({ status: 200, data: { task } })) });
    const runtime = createRuntime({ storage, alarms: fakeAlarms(), apiFactory: () => api });
    await runtime.start();
    expect(api.currentTask).toHaveBeenCalledTimes(1);
    expect(runtime.getState().task).toEqual(task);
    expect(localValues).not.toHaveProperty("task");
  });

  it("creates each named alarm at most once", async () => {
    const created = [];
    const existing = new Map();
    const chromeApi = { alarms: {
      async get(name) { return existing.get(name); },
      async create(name, info) { created.push([name, info]); existing.set(name, { name, ...info }); },
      async clear(name) { existing.delete(name); },
    } };
    const alarms = createChromeAlarms(chromeApi);
    await alarms.ensure("livv-heartbeat", { periodInMinutes: 0.5 });
    await alarms.ensure("livv-heartbeat", { periodInMinutes: 0.5 });
    expect(created).toHaveLength(1);
  });

  it("defines only approved persistent/session key boundaries", () => {
    expect(LOCAL_KEYS).toEqual(["device_id", "device_credential", "api_base"]);
    expect(SESSION_KEY).toBe("runtime_state");
  });
});
