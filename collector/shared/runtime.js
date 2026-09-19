export const STATES = Object.freeze({
  BOOTING: "BOOTING", REGISTERING: "REGISTERING", PENDING_AUTH: "PENDING_AUTH",
  IDLE: "IDLE", CLAIMING: "CLAIMING", ASSIGNED: "ASSIGNED", EXECUTING: "EXECUTING",
  REPORTING: "REPORTING", FAILED: "FAILED", REVOKED: "REVOKED",
});

const HEARTBEAT_ALARM = "livv-heartbeat";
const POLL_ALARM = "livv-poll";

function metadata() {
  const userAgent = globalThis.navigator?.userAgent ?? "unknown";
  return {
    name: "LIVV Collector",
    collector_version: "0.1.0",
    protocol_version: "1",
    os: globalThis.navigator?.platform ?? "unknown",
    arch: "unknown",
    browser: "Chrome",
    browser_version: userAgent.match(/Chrome\/([\d.]+)/u)?.[1] ?? "unknown",
  };
}

function publicState(state) {
  return {
    device_id: state.local_device_id ?? state.device?.device_id ?? null,
    local_device_initialized: Boolean(state.local_device_id),
    state: state.state,
    device: state.device ? {
      device_id: state.device.device_id,
      status: state.device.status,
      collector_version: state.device.collector_version,
      protocol_version: state.device.protocol_version,
      os: state.device.os,
      arch: state.device.arch,
      browser: state.device.browser,
      browser_version: state.device.browser_version,
      last_heartbeat_at: state.device.last_heartbeat_at,
    } : null,
    task: state.task,
    progress: state.progress,
    task_execution_ready: state.task_execution_ready,
    navigation_ready: state.navigation_ready,
    collection_ready: state.collection_ready,
    error_code: state.error_code ?? null,
  };
}

export function createRuntime({ storage, apiFactory, alarms, executor = { async execute() {} }, executionReady = false, navigationReady = executionReady, collectionReady = executionReady, metadataFactory = metadata, uuid = () => crypto.randomUUID(), logger = console, clock = () => new Date() }) {
  let state = { state: STATES.BOOTING, local_device_id: null, device: null, task: null, progress: null, task_execution_ready: executionReady, navigation_ready: navigationReady, collection_ready: collectionReady, error_code: null };
  let api = null;
  let startPromise = null;
  let refreshPromise = null;
  let heartbeatPromise = null;
  let claimPromise = null;

  async function ensureAlarm(name, info) {
    if (alarms.ensure) return alarms.ensure(name, info);
    return alarms.create(name, info);
  }

  async function saveTask(task) {
    state.task = task;
    state.progress = null;
    if (task) await storage.setSession({ task, state: STATES.ASSIGNED, progress: null });
    else await storage.clearSession();
  }

  async function setRevoked() {
    state.state = STATES.REVOKED;
    state.task = null;
    await storage.clearSession();
    await alarms.clear(HEARTBEAT_ALARM);
    await alarms.clear(POLL_ALARM);
  }

  async function syncStatus() {
    try {
      const result = await api.device();
      state.device = result.data.device;
      state.error_code = null;
      if (state.device.status === "revoked") return setRevoked();
      if (state.device.status === "pending") state.state = STATES.PENDING_AUTH;
      else state.state = state.task ? STATES.ASSIGNED : STATES.IDLE;
    } catch (error) {
      state.error_code = error.code ?? "INTERNAL_ERROR";
      if (error.code === "DEVICE_REVOKED") return setRevoked();
      throw error;
    }
  }

  async function hydrateTask() {
    const localTask = await storage.getSession();
    const cloud = await api.currentTask();
    const cloudTask = cloud.status === 204 ? null : cloud.data.task;
    if (!cloudTask) {
      await saveTask(null);
      state.state = STATES.IDLE;
      return;
    }
    if (new Date(cloudTask.lease_expires_at).getTime() <= clock().getTime()) {
      await saveTask(null);
      state.state = STATES.IDLE;
      return;
    }
    if (localTask?.task?.task_id !== cloudTask.task_id || localTask?.task?.attempt_id !== cloudTask.attempt_id) {
      await saveTask(cloudTask);
    } else {
      state.task = localTask.task;
      state.progress = localTask.progress ?? null;
    }
    state.state = STATES.ASSIGNED;
  }

  async function bootstrap() {
    if (api) return publicState(state);
    state.state = STATES.BOOTING;
    const local = await storage.getLocal();
    const deviceId = local.device_id ?? uuid();
    state.local_device_id = deviceId;
    if (!local.device_id) await storage.setLocal({ device_id: deviceId });
    if (!local.device_credential) {
      state.state = STATES.REGISTERING;
      api = apiFactory({ baseUrl: local.api_base, credential: null });
      const result = await api.register({ device_id: deviceId, ...metadataFactory() });
      if (!result.data?.credential) {
        state.state = STATES.FAILED;
        state.error_code = "CREDENTIAL_UNAVAILABLE";
        return publicState(state);
      }
      await storage.setLocal({ device_credential: result.data.credential });
      api = apiFactory({ baseUrl: local.api_base, credential: result.data.credential });
    } else {
      api = apiFactory({ baseUrl: local.api_base, credential: local.device_credential });
    }
    await syncStatus();
    if (state.device?.status === "authorized") await hydrateTask();
    if (state.state !== STATES.REVOKED) {
      await ensureAlarm(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
      if (executionReady) await ensureAlarm(POLL_ALARM, { periodInMinutes: 1 });
    }
    return publicState(state);
  }

  function start() {
    if (!startPromise) startPromise = bootstrap().finally(() => { startPromise = null; });
    return startPromise;
  }

  async function heartbeatWork() {
    if (!api || state.state === STATES.REVOKED) return publicState(state);
    try {
      const result = await api.heartbeat(metadataFactory());
      state.device = result.data.device;
      if (state.device.status === "revoked") await setRevoked();
    } catch (error) {
      state.error_code = error.code ?? "INTERNAL_ERROR";
      if (error.code === "DEVICE_REVOKED") await setRevoked();
      else logger.warn?.("LIVV heartbeat failed", state.error_code);
    }
    return publicState(state);
  }

  function heartbeat() {
    if (!heartbeatPromise) heartbeatPromise = heartbeatWork().finally(() => { heartbeatPromise = null; });
    return heartbeatPromise;
  }

  async function claimWork() {
    if (!executionReady || state.state === STATES.REVOKED || state.device?.status !== "authorized" || state.task) return publicState(state);
    state.state = STATES.CLAIMING;
    const result = await api.claim();
    if (result.status === 204) state.state = STATES.IDLE;
    else {
      await saveTask(result.data.task);
      state.state = STATES.ASSIGNED;
      state.state = STATES.EXECUTING;
      const outcome = await executor.execute(result.data.task);
      if (outcome?.terminal) {
        await saveTask(null);
        state.state = outcome.status === "failed" ? STATES.FAILED : STATES.IDLE;
      }
    }
    return publicState(state);
  }

  function claimIfReady() {
    if (!claimPromise) claimPromise = claimWork().finally(() => { claimPromise = null; });
    return claimPromise;
  }

  async function refreshWork() {
    if (!api) return start();
    await syncStatus();
    if (state.device?.status === "authorized") await hydrateTask();
    return publicState(state);
  }

  function refresh() {
    if (!refreshPromise) refreshPromise = refreshWork().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function setProgress(progress) {
    if (!state.task) return publicState(state);
    state.progress = progress;
    await storage.setSession({ task: state.task, state: state.state, progress });
    return publicState(state);
  }

  async function onAlarm(name) {
    if (name === HEARTBEAT_ALARM) return heartbeat();
    if (name === POLL_ALARM) return claimIfReady();
    return publicState(state);
  }

  return {
    start,
    heartbeat,
    refresh,
    claimIfReady,
    onAlarm,
    setProgress,
    getState: () => publicState(state),
    constants: { HEARTBEAT_ALARM, POLL_ALARM },
  };
}
