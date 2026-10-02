import { requireThat } from "./domain.js";
import { rows, first, stmt } from "./db.js";
import { CONFIG, nowIso } from "./config.js";
import { businessLog, errorLabels } from "../../agent/i18n.js";
const EVENTS = new Set([
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
const dim = (x, max = 80) =>
  typeof x === "string" && x.length <= max && /^[A-Za-z0-9_.:-]*$/.test(x)
    ? x
    : "";
const number = (x, max) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? x : null;
const durable = (code) =>
  /^TASK_(COMPLETED|PARTIAL|FAILED)$/.test(code) ||
  code === "ATTEMPT_FAILED" ||
  Object.hasOwn(errorLabels, code);
const level = (code) =>
  /PARTIAL|FAST_NAV_FAILED|FAST_NAV_CONTEXT_MISMATCH/.test(code)
    ? "warn"
    : /FAILED|TIMEOUT|MISMATCH|REQUIRED|CHANGED|ERROR/.test(code)
      ? "error"
      : "info";
const logMessage = (e) =>
  e.diagnostic === "API_RESPONSE_NOT_JSON"
    ? "接口返回了非JSON响应"
    : e.diagnostic === "NETWORK_FETCH_FAILED"
      ? "网络连接失败"
      : businessLog({
          event: e.error_code || e.event_code,
          message: JSON.stringify({ count: e.hotel_count }),
        });
const metadata = (e) => ({
  attempt_id: e.attempt_id,
  platform: e.platform,
  task_type: e.task_type,
  os: e.os,
  navigation_mode: e.navigation_mode,
  duration_ms: e.duration_ms,
  hotel_count: e.hotel_count,
  diagnostic: e.diagnostic || null,
});
export async function ingestTelemetry(env, device, body, now = Date.now()) {
  requireThat(
    Array.isArray(body.events) && body.events.length <= 25,
    "INVALID_TELEMETRY",
  );
  const parsed = body.events.map((e) => {
    requireThat(e && EVENTS.has(e.event_code), "INVALID_TELEMETRY");
    const at = Date.parse(e.occurred_at);
    requireThat(
      Number.isFinite(at) && at >= now - 86400000 && at <= now + 60000,
      "INVALID_TELEMETRY",
    );
    requireThat(
      typeof e.event_id === "string" && /^[a-f0-9-]{36}$/.test(e.event_id),
      "INVALID_TELEMETRY",
    );
    const task_id = dim(e.task_id),
      attempt_id = dim(e.attempt_id);
    requireThat(
      (!task_id && !attempt_id) || (task_id && attempt_id),
      "INVALID_TELEMETRY",
    );
    return {
      event_id: dim(e.event_id),
      device_id: device.id,
      task_id,
      attempt_id,
      event_code: e.event_code,
      helper_version: /^\d+\.\d+\.\d+$/.test(e.helper_version ?? "")
        ? e.helper_version
        : "",
      platform: e.platform === "ctrip" ? "ctrip" : "",
      task_type: ["MARKET_LIST", "LEGACY_MARKET_DETAIL"].includes(e.task_type)
        ? e.task_type
        : "",
      os: ["Mac", "Windows", "Other"].includes(e.os) ? e.os : "Other",
      navigation_mode: ["FAST_NAVIGATION", "UI_FALLBACK"].includes(
        e.navigation_mode,
      )
        ? e.navigation_mode
        : "",
      occurred_at: nowIso(at),
      duration_ms: number(e.duration_ms, 86400000),
      hotel_count: number(e.hotel_count, 2000),
      diagnostic: ["API_RESPONSE_NOT_JSON", "NETWORK_FETCH_FAILED"].includes(
        e.diagnostic,
      )
        ? e.diagnostic
        : "",
      error_code: Object.hasOwn(errorLabels, e.error_code)
        ? e.error_code
        : Object.hasOwn(errorLabels, e.event_code)
          ? e.event_code
          : "",
    };
  });
  const owned = await rows(
    env.DB,
    "SELECT a.id,a.task_id,a.status attempt_status,t.status task_status FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE a.device_id=? AND a.id IN (SELECT value FROM json_each(?))",
    device.id,
    JSON.stringify(parsed.map((e) => e.attempt_id).filter(Boolean)),
  );
  for (const e of parsed)
    requireThat(
      !e.attempt_id ||
        owned.some((a) => a.id === e.attempt_id && a.task_id === e.task_id),
      "TELEMETRY_ATTEMPT_MISMATCH",
      403,
    );
  for (const e of parsed) {
    const attempt = owned.find((a) => a.id === e.attempt_id);
    if (/^TASK_(COMPLETED|PARTIAL|FAILED)$/.test(e.event_code))
      requireThat(
        attempt?.task_status === e.event_code.slice(5),
        "TELEMETRY_STATE_MISMATCH",
        403,
      );
    if (e.event_code === "ATTEMPT_FAILED") {
      requireThat(
        attempt?.attempt_status === "FAILED",
        "TELEMETRY_STATE_MISMATCH",
        403,
      );
      if (attempt.task_status === "FAILED") e.event_code = "TASK_FAILED";
    }
  }
  // Critical history is durable and idempotent; progress/heartbeat never add high-frequency D1 rows.
  const critical = parsed.filter((e) => durable(e.event_code));
  if (critical.length)
    await env.DB.batch(
      critical.map((e) =>
        stmt(
          env.DB,
          "INSERT OR IGNORE INTO agent_logs(id,device_id,app_version,task_id,attempt_id,level,event,message,error_code,metadata,created_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          e.event_id,
          e.device_id,
          e.helper_version || null,
          e.task_id || null,
          e.attempt_id || null,
          level(e.event_code),
          e.event_code,
          logMessage(e),
          e.error_code || null,
          JSON.stringify(metadata(e)),
          e.occurred_at,
          nowIso(now),
        ),
      ),
    );
  if (!env.HELPER_EVENTS)
    return {
      accepted: critical.length,
      available: critical.length === parsed.length,
      analytics_available: false,
    };
  try {
    for (const e of parsed)
      env.HELPER_EVENTS.writeDataPoint({
        indexes: [device.id],
        blobs: [
          e.device_id,
          e.task_id,
          e.attempt_id,
          e.helper_version,
          e.event_code,
          e.platform,
          e.task_type,
          e.os,
          e.navigation_mode,
          e.event_id,
          e.occurred_at,
          e.error_code,
          e.diagnostic,
        ],
        doubles: [e.duration_ms ?? -1, e.hotel_count ?? -1],
      });
    return { accepted: parsed.length, available: true };
  } catch {
    console.warn(JSON.stringify({ event: "helper_analytics_unavailable" }));
    return { accepted: 0, available: false };
  }
}
export async function analyticsEvents(env, deviceId, fetcher = fetch) {
  if (!env.CF_ANALYTICS_READ_TOKEN || !env.CF_ACCOUNT_ID)
    return { available: false, reason: "NOT_CONFIGURED", events: [] };
  // Fixed query, identifier validated independently; no caller SQL or URL is accepted.
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(deviceId))
    return { available: false, reason: "INVALID_DEVICE", events: [] };
  try {
    const sql = `SELECT timestamp, blob2 AS task_id, blob3 AS attempt_id, blob4 AS helper_version, blob5 AS event_code, blob6 AS platform, blob7 AS task_type, blob8 AS os, blob9 AS navigation_mode, blob10 AS event_id, blob11 AS occurred_at, blob12 AS error_code, double1 AS duration_ms, double2 AS hotel_count, _sample_interval AS sample_interval FROM agent_events WHERE index1 = '${deviceId}' AND timestamp >= NOW() - INTERVAL '1' DAY ORDER BY timestamp DESC LIMIT 100`;
    const r = await fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CF_ANALYTICS_READ_TOKEN}` },
        body: sql,
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!r.ok)
      return { available: false, reason: "QUERY_UNAVAILABLE", events: [] };
    const data = await r.json();
    if (!Array.isArray(data.data)) throw Error("invalid response");
    const seen = new Set();
    const events = data.data
      .filter((e) => {
        if (seen.has(e.event_id)) return false;
        seen.add(e.event_id);
        return true;
      })
      .map((e) => ({
        ...e,
        duration_ms: e.duration_ms < 0 ? null : e.duration_ms,
        hotel_count: e.hotel_count < 0 ? null : e.hotel_count,
        device_id: deviceId,
        app_version: e.helper_version || null,
        level: /FAILED|TIMEOUT|MISMATCH|REQUIRED|CHANGED|ERROR/.test(
          e.event_code,
        )
          ? "error"
          : "info",
        event: e.event_code,
        message: businessLog({
          event: e.error_code || e.event_code,
          message: JSON.stringify({ count: e.hotel_count }),
        }),
        metadata: {
          attempt_id: e.attempt_id,
          platform: e.platform,
          task_type: e.task_type,
          os: e.os,
          navigation_mode: e.navigation_mode,
          duration_ms: e.duration_ms < 0 ? null : e.duration_ms,
          hotel_count: e.hotel_count < 0 ? null : e.hotel_count,
        },
        created_at: e.occurred_at || e.timestamp,
      }));
    return { available: true, events };
  } catch {
    return { available: false, reason: "QUERY_UNAVAILABLE", events: [] };
  }
}
export async function deviceDiagnostics(env, id, now = Date.now()) {
  const device = await first(
    env.DB,
    "SELECT id,name,status,version,last_seen_at,last_error FROM devices WHERE id=?",
    id,
  );
  requireThat(device, "DEVICE_NOT_FOUND", 404);
  const at = nowIso(now),
    since = nowIso(now - 86400000);
  const recent = await rows(
    env.DB,
    `SELECT a.id attempt_id,a.task_id,a.status attempt_status,a.error_code,a.claimed_at,a.started_at,a.finished_at,t.status task_status,t.task_type,t.city,t.keyword,t.checkin,t.checkout,s.market_count,s.id snapshot_id FROM attempts a JOIN tasks t ON t.id=a.task_id LEFT JOIN snapshots s ON s.attempt_id=a.id WHERE a.device_id=? ORDER BY a.claimed_at DESC LIMIT 20`,
    id,
  );
  const results = await rows(
    env.DB,
    `SELECT a.status,count(*) count FROM attempts a WHERE device_id=? AND claimed_at>=? GROUP BY status`,
    id,
    since,
  );
  const tasks = await rows(
    env.DB,
    `SELECT t.status,count(*) count FROM tasks t WHERE EXISTS(SELECT 1 FROM attempts a WHERE a.task_id=t.id AND a.device_id=? AND a.claimed_at>=?) GROUP BY t.status`,
    id,
    since,
  );
  const timing = await first(
    env.DB,
    `SELECT avg((julianday(a.finished_at)-julianday(a.claimed_at))*86400000) average_ms,count(*) samples FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE a.device_id=? AND a.claimed_at>=? AND t.task_type='MARKET_LIST' AND a.status='COMPLETED' AND a.finished_at IS NOT NULL`,
    id,
    since,
  );
  const errors = await rows(
    env.DB,
    `SELECT error_code,count(*) count FROM attempts WHERE device_id=? AND claimed_at>=? AND error_code IS NOT NULL GROUP BY error_code ORDER BY count DESC LIMIT 10`,
    id,
    since,
  );
  return {
    at,
    since,
    device: {
      ...device,
      online:
        device.status === "approved" &&
        device.last_seen_at > nowIso(now - CONFIG.offlineSeconds * 1000),
    },
    recent,
    task_results: tasks,
    attempt_results: results,
    timing,
    errors,
    agent_logs: (
      await rows(
        env.DB,
        "SELECT device_id,app_version,task_id,attempt_id,level,event,message,error_code,metadata,created_at FROM agent_logs WHERE device_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
        id,
      )
    ).map((e) => ({ ...e, metadata: JSON.parse(e.metadata), source: "D1" })),
    // Authoritative task history stays in D1; old app versions are not inferred from the current device.
    logs: (
      await rows(
        env.DB,
        `SELECT e.device_id,e.task_id,e.attempt_id,e.event,e.code AS error_code,e.message,e.at AS created_at,(SELECT json_extract(v.message,'$.app_version') FROM attempt_events v WHERE v.attempt_id=e.attempt_id AND v.event='STARTED' AND json_valid(v.message) ORDER BY v.id LIMIT 1) AS app_version FROM attempt_events e WHERE e.device_id=? ORDER BY e.at DESC,e.id DESC LIMIT 100`,
        id,
      )
    ).map((e) => ({
      ...e,
      level: e.error_code ? "error" : "info",
      message:
        e.message ||
        businessLog({ event: e.error_code || e.event, message: "" }),
      metadata: { attempt_id: e.attempt_id },
      source: "D1",
    })),
    analytics: await analyticsEvents(env, id),
  };
}
