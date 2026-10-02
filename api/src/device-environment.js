import { first, stmt } from "./db.js";
const member = (value, allowed) => (allowed.includes(value) ? value : null);
const bounded = (value, pattern, length = 60) =>
  typeof value === "string" && value.length <= length && pattern.test(value)
    ? value
    : null;
export function cleanEnvironment(input = {}) {
  const capabilities = {};
  for (const [key, value] of Object.entries(input.capabilities ?? {}).slice(
    0,
    24,
  ))
    if (
      /^[a-z][a-z0-9_]{1,39}$/.test(key) &&
      typeof value === "boolean" &&
      !/token|cookie|secret|credential|password/.test(key)
    )
      capabilities[key] = value;
  return {
    os: member(input.os, ["Windows", "macOS", "Linux"]),
    os_version: bounded(input.os_version, /^\d+(?:\.\d+){0,3}\+?$/),
    platform_version: bounded(input.platform_version, /^\d+(?:\.\d+){0,3}$/),
    os_version_source: member(input.os_version_source, ["client_hints"]),
    architecture: member(input.architecture, [
      "x64",
      "x86",
      "arm64",
      "arm",
      "mips",
      "mips64",
    ]),
    browser_name: member(input.browser_name, ["Chrome", "Edge", "Chromium"]),
    browser_version: bounded(input.browser_version, /^\d+(?:\.\d+){1,3}$/),
    browser_major_version:
      Number.isInteger(input.browser_major_version) &&
      input.browser_major_version > 0 &&
      input.browser_major_version < 10000
        ? input.browser_major_version
        : null,
    browser_language: bounded(
      input.browser_language,
      /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/,
      35,
    ),
    manifest_version: input.manifest_version === 3 ? 3 : null,
    environment: input.environment === "production" ? "production" : null,
    api_endpoint:
      input.api_endpoint === "https://api.poai.cc" ? input.api_endpoint : null,
    capabilities,
  };
}
export function cleanRuntime(input) {
  if (!input || typeof input !== "object") return null;
  const boolean = (value) => (typeof value === "boolean" ? value : null);
  return {
    auto: boolean(input.auto),
    debugger_permission: boolean(input.debugger_permission),
    side_panel: boolean(input.side_panel),
    managed_tab: boolean(input.managed_tab),
    ctrip_page_status: member(input.ctrip_page_status, [
      "normal",
      "not_open",
      "abnormal",
      "unknown",
    ]),
    ctrip_login_status: member(input.ctrip_login_status, [
      "logged_in",
      "logged_out",
      "unknown",
    ]),
    task_id: bounded(input.task_id, /^[a-zA-Z0-9_-]+$/, 80),
    attempt_id: bounded(input.attempt_id, /^[a-zA-Z0-9_-]+$/, 80),
    phase: bounded(input.phase, /^[A-Z][A-Z0-9_]*$/, 80),
    platform: bounded(input.platform, /^[a-z][a-z0-9_]*$/, 40),
  };
}
export async function saveEnvironment(db, id, input) {
  const serialized = JSON.stringify(cleanEnvironment(input));
  await stmt(
    db,
    "UPDATE devices SET environment=? WHERE id=? AND environment IS NOT ?",
    serialized,
    id,
    serialized,
  ).run();
  return { ok: true };
}
export const parseInfo = (value) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};
export async function deviceHealth(db, id, now = Date.now()) {
  const since = new Date(now - 86400000).toISOString();
  const summary = await first(
    db,
    `SELECT
    (SELECT max(finished_at) FROM attempts WHERE device_id=?1 AND status='COMPLETED') last_success_at,
    (SELECT max(finished_at) FROM attempts WHERE device_id=?1 AND status='FAILED') last_failed_at,
    (SELECT (julianday(finished_at)-julianday(claimed_at))*86400000 FROM attempts WHERE device_id=?1 AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) last_duration_ms,
    (SELECT json_object('task_id',a.task_id,'attempt_id',a.id,'task_type',t.task_type) FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE a.device_id=?1 AND a.status='RUNNING' LIMIT 1) current_attempt,
    (SELECT json_group_array(json_object('status',status,'count',count)) FROM (SELECT t.status,count(*) count FROM tasks t JOIN attempts a ON a.task_id=t.id WHERE a.device_id=?1 AND a.claimed_at>=?2 AND a.attempt_number=(SELECT max(attempt_number) FROM attempts WHERE task_id=t.id) GROUP BY t.status)) results,
    (SELECT avg((julianday(a.finished_at)-julianday(a.claimed_at))*86400000) FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE a.device_id=?1 AND a.claimed_at>=?2 AND a.status='COMPLETED' AND t.task_type='MARKET_LIST') market_average_ms`,
    id,
    since,
  );
  const results = parseInfo(summary.results) ?? [],
    total = results.reduce((n, r) => n + r.count, 0),
    completed = results.find((r) => r.status === "COMPLETED")?.count ?? 0,
    settled = results
      .filter((r) => ["COMPLETED", "PARTIAL", "FAILED"].includes(r.status))
      .reduce((n, r) => n + r.count, 0);
  const navigation = await first(
    db,
    `SELECT count(*) samples,
    sum(EXISTS(SELECT 1 FROM attempt_events e WHERE e.attempt_id=a.id AND e.event IN('FAST_NAV_VERIFIED','FAST_NAV_SUCCESS'))) successes,
    sum(EXISTS(SELECT 1 FROM attempt_events e WHERE e.attempt_id=a.id AND e.event IN('FAST_NAV_FAILED','FAST_NAV_CONTEXT_MISMATCH'))) fallback_count
    FROM attempts a WHERE a.device_id=? AND a.claimed_at>=? AND EXISTS(SELECT 1 FROM attempt_events e WHERE e.attempt_id=a.id AND e.event IN('FAST_NAV_START','FAST_NAV_FAILED','FAST_NAV_CONTEXT_MISMATCH','FAST_NAV_VERIFIED','FAST_NAV_SUCCESS'))`,
    id,
    since,
  );
  return {
    last_success_at: summary.last_success_at,
    last_failed_at: summary.last_failed_at,
    last_duration_ms: summary.last_duration_ms,
    current_attempt: parseInfo(summary.current_attempt),
    task_results: results,
    total,
    success_rate: settled ? completed / settled : null,
    market_average_ms: summary.market_average_ms,
    navigation: {
      ...navigation,
      success_rate: navigation.samples
        ? navigation.successes / navigation.samples
        : null,
    },
  };
}
