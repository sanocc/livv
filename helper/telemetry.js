// Best-effort observability, independently fenced from task execution.
const aliases = {
  CLAIMED: "TASK_CLAIMED",
  FAST_NAV_VERIFIED: "FAST_NAV_SUCCESS",
  COMPLETED: "TASK_COMPLETED",
  PARTIAL: "TASK_PARTIAL",
  FAILED: "TASK_FAILED",
};
const events = new Set([
  "DEVICE_ONLINE",
  "TASK_CLAIMED",
  "FAST_NAV_START",
  "FAST_NAV_SUCCESS",
  "FAST_NAV_FAILED",
  "FAST_NAV_CONTEXT_MISMATCH",
  "LIST_READY",
  "LIST_PROGRESS",
  "MARKET_LOCKED",
  "UPLOAD_START",
  "UPLOAD_SUCCESS",
  "TASK_COMPLETED",
  "TASK_PARTIAL",
  "TASK_FAILED",
  "ATTEMPT_FAILED",
  "API_TIMEOUT",
  "SEARCH_CONTROL_TIMEOUT",
  "INPUT_TARGET_CHANGED",
  "PAGE_CONTEXT_MISMATCH",
  "CAPTCHA_REQUIRED",
  "LOGIN_REQUIRED",
  "HELPER_ERROR",
  "ATTEMPT_TIMEOUT",
  "UPLOAD_FAILED",
]);
export function telemetryEvent(event, active, version, at = Date.now()) {
  const event_code = aliases[event] ?? event;
  if (!events.has(event_code)) return null;
  const task = active?.task,
    attempt = active?.attempt;
  const start =
    event_code === "UPLOAD_SUCCESS"
      ? active?.upload_started_at
      : event_code === "MARKET_LOCKED"
        ? active?.list_ready_at
        : attempt?.claimed_at
          ? Date.parse(attempt.claimed_at)
          : null;
  const occurredAt =
    event_code === "TASK_CLAIMED" && attempt?.claimed_at
      ? Date.parse(attempt.claimed_at)
      : event_code === "FAST_NAV_START" && active?.navigation_started_at
        ? active.navigation_started_at
        : event_code === "LIST_READY" && active?.list_ready_at
          ? active.list_ready_at
          : event_code === "MARKET_LOCKED" && active?.market_locked_at
            ? active.market_locked_at
            : event_code === "UPLOAD_START" && active?.upload_started_at
              ? active.upload_started_at
              : at;
  return {
    event_id: crypto.randomUUID(),
    event_code,
    occurred_at: new Date(occurredAt).toISOString(),
    task_id: task?.id ?? "",
    attempt_id: attempt?.id ?? "",
    helper_version: version,
    platform: task?.platform ?? "",
    task_type: task?.task_type ?? "",
    os: /win/i.test(navigator.platform)
      ? "Windows"
      : /mac/i.test(navigator.platform)
        ? "Mac"
        : "Other",
    duration_ms:
      start != null && Number.isFinite(start)
        ? Math.max(0, occurredAt - start)
        : null,
    hotel_count: active?.market?.length ?? null,
    navigation_mode: active?.navigation_mode ?? "",
  };
}
export function telemetryQueue({
  storage,
  send,
  now = Date.now,
  schedule = setTimeout,
}) {
  let chain = Promise.resolve(),
    flushing = false,
    scheduled = false,
    nextRetry = 0;
  const serialize = (fn) => {
    chain = chain.then(fn).catch(() => {});
    return chain;
  };
  const arm = (delay) => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      void flush();
    }, delay);
  };
  async function enqueue(event) {
    if (!event) return;
    await serialize(async () => {
      const { telemetry_queue = [] } = await storage.get("telemetry_queue");
      const fresh = telemetry_queue.filter(
        (e) => now() - Date.parse(e.occurred_at) < 86400000,
      );
      await storage.set({ telemetry_queue: [...fresh, event].slice(-100) });
    });
    if (
      [
        "API_TIMEOUT",
        "SEARCH_CONTROL_TIMEOUT",
        "INPUT_TARGET_CHANGED",
        "PAGE_CONTEXT_MISMATCH",
        "TASK_FAILED",
      ].includes(event.event_code)
    )
      arm(0);
    else arm(2000);
  }
  async function flush() {
    if (flushing || now() < nextRetry) return;
    flushing = true;
    try {
      await chain;
      const { telemetry_queue = [] } = await storage.get("telemetry_queue");
      const batch = telemetry_queue
        .filter((e) => now() - Date.parse(e.occurred_at) < 86400000)
        .slice(0, 25);
      if (!batch.length) return;
      await send({ events: batch });
      const ids = new Set(batch.map((e) => e.event_id));
      await serialize(async () => {
        const { telemetry_queue = [] } = await storage.get("telemetry_queue");
        await storage.set({
          telemetry_queue: telemetry_queue.filter((e) => !ids.has(e.event_id)),
        });
      });
      if (telemetry_queue.length > batch.length) arm(2000);
    } catch {
      nextRetry = now() + 30000;
    } finally {
      flushing = false;
    }
  }
  return { enqueue, flush };
}
