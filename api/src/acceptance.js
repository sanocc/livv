import { CONFIG, nowIso } from "./config.js";
import { requireThat, target, text } from "./domain.js";
import { first, rows } from "./db.js";
import {
  acceptanceOS,
  acceptanceDeviceSQL,
  isAcceptanceTask,
} from "./acceptance-policy.js";
export function acceptanceReadiness() {
  return {
    execution: "existing_approved_chrome_agent",
    platforms: [
      {
        platform: "ctrip",
        supported: true,
        blocker: null,
        task_type: "MARKET_LIST",
        required_os: ["macOS", "Windows"],
      },
      ...["meituan", "fliggy", "tongcheng", "elong"].map((platform) => ({
        platform,
        supported: false,
        blocker: "AGENT_HOST_PERMISSION_REVIEW_REQUIRED",
      })),
    ],
  };
}
export async function createAcceptance(db, input, makeTask, now = Date.now()) {
  requireThat(
    input && typeof input === "object" && !Array.isArray(input),
    "INVALID_ACCEPTANCE_INPUT",
  );
  const keys = [
    "platform",
    "os",
    "device_id",
    "city",
    "keyword",
    "checkin",
    "checkout",
    "request_id",
  ];
  requireThat(
    Object.keys(input).every((k) => keys.includes(k)),
    "INVALID_ACCEPTANCE_INPUT",
  );
  requireThat(
    input.platform === "ctrip",
    "AGENT_HOST_PERMISSION_REVIEW_REQUIRED",
    409,
  );
  requireThat(["macOS", "Windows"].includes(input.os), "INVALID_ACCEPTANCE_OS");
  const t = target({ ...input, scope: "custom", limit: 3 });
  const requestID = input.request_id ?? crypto.randomUUID();
  requireThat(
    typeof requestID === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        requestID,
      ),
    "INVALID_ACCEPTANCE_REQUEST_ID",
  );
  const key = `acceptance:v1:${input.os}:${requestID.toLowerCase()}`;
  const compatible = (task) => {
    requireThat(
      isAcceptanceTask(task) &&
        ["platform", "city", "keyword", "checkin", "checkout"].every(
          (k) => t[k] === task[k],
        ) &&
        (!input.device_id || input.device_id === task.preferred_device_id),
      "ACCEPTANCE_IDEMPOTENCY_CONFLICT",
      409,
    );
    return { task, idempotent: true };
  };
  const existing = await first(
    db,
    "SELECT * FROM tasks WHERE schedule_key=?",
    key,
  );
  if (existing) return compatible(existing);
  if (input.device_id != null) text(input.device_id, 100);
  const device = await first(
    db,
    `SELECT d.id FROM devices d WHERE d.status='approved' AND 'ctrip' IN (SELECT value FROM json_each(d.supported_platforms)) AND d.last_seen_at>? AND json_extract(CASE WHEN json_valid(d.environment) THEN d.environment ELSE '{}' END,'$.os')=? AND ${acceptanceDeviceSQL("d")} AND (? IS NULL OR d.id=?) AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.device_id=d.id AND a.status='RUNNING') AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.preferred_device_id=d.id AND t.status IN ('PENDING','RUNNING') AND t.schedule_key LIKE 'acceptance:v1:%') ORDER BY d.last_seen_at DESC,d.id LIMIT 1`,
    nowIso(now - CONFIG.offlineSeconds * 1000),
    input.os,
    input.device_id ?? null,
    input.device_id ?? null,
  );
  requireThat(device, "NO_READY_APPROVED_CHROME_AGENT", 409);
  try {
    return {
      task: await makeTask(
        db,
        { ...input, scope: "custom", limit: 3, task_type: "MARKET_LIST" },
        device.id,
        now,
        key,
      ),
      idempotent: false,
    };
  } catch (error) {
    if (!/UNIQUE/.test(error.message)) throw error;
    const raced = await first(
      db,
      "SELECT * FROM tasks WHERE schedule_key=?",
      key,
    );
    if (!raced) throw error;
    return compatible(raced);
  }
}
const parse = (v) => {
  try {
    return JSON.parse(v ?? "{}");
  } catch {
    return {};
  }
};
const version = (v) =>
  typeof v === "string" && /^\d+\.\d+\.\d+(?:\.[0-9]+)?$/.test(v) ? v : null;
const codes = new Set([
  "CAPTCHA_REQUIRED",
  "LOGIN_REQUIRED",
  "PARSER_SCHEMA_CHANGED",
  "PAGE_CONTEXT_MISMATCH",
  "SEARCH_CONTROL_TIMEOUT",
  "ATTEMPT_TIMEOUT",
  "DEVICE_OFFLINE",
  "DEVICE_DISABLED",
  "EXECUTION_WINDOW_EXPIRED",
  "MAX_ATTEMPTS_REACHED",
  "INPUT_PERMISSION_REQUIRED",
  "MANAGED_TAB_NAVIGATED",
  "PARTIAL_COLLECTION",
  "ADMIN_CANCELLED",
  "SAFETY_LIMIT",
  "STALLED",
]);
const safeCode = (v) => (v == null ? null : codes.has(v) ? v : "UNKNOWN_ERROR");
export async function acceptanceReport(db, id, environment) {
  const t = await first(db, "SELECT * FROM tasks WHERE id=?", id);
  requireThat(t && isAcceptanceTask(t), "ACCEPTANCE_TASK_NOT_FOUND", 404);
  const attempts = await rows(
    db,
    "SELECT * FROM attempts WHERE task_id=? ORDER BY attempt_number",
    id,
  );
  const events = await rows(
    db,
    "SELECT attempt_id,event,at,code,message FROM attempt_events WHERE task_id=? ORDER BY id",
    id,
  );
  const snapshot = await first(
    db,
    "SELECT * FROM snapshots WHERE task_id=?",
    id,
  );
  const observations = snapshot
    ? await rows(
        db,
        "SELECT platform,hotel_id,hotel_name,rank,is_ad,display_price,original_price FROM market_observations WHERE snapshot_id=? ORDER BY rank",
        snapshot.id,
      )
    : [];
  const winning = snapshot
    ? attempts.find(
        (a) =>
          a.id === snapshot.attempt_id && a.device_id === snapshot.device_id,
      )
    : null;
  const timeline = winning
    ? events.filter((e) => e.attempt_id === winning.id)
    : [];
  const start = parse(timeline.find((e) => e.event === "STARTED")?.message);
  const device = start.acceptance_device ?? {};
  const ready = timeline.find(
    (e) =>
      e.event === "LIST_READY" &&
      e.at >= winning.started_at &&
      e.at <= snapshot.received_at,
  );
  const locked = timeline.some(
    (e) =>
      e.event === "MARKET_LOCKED" &&
      ready &&
      e.at >= ready.at &&
      e.at <= snapshot.received_at,
  );
  const priced = observations.filter(
    (h) =>
      typeof h.display_price === "number" &&
      Number.isFinite(h.display_price) &&
      h.display_price >= 0,
  ).length;
  const checks = Object.fromEntries(
    Object.entries({
      completed:
        t.status === "COMPLETED" &&
        winning?.status === "COMPLETED" &&
        snapshot?.market_status === "SUCCESS",
      approved_agent:
        device.approved_at_start === true &&
        winning?.device_id === t.preferred_device_id,
      requested_os: device.os === acceptanceOS(t),
      chrome_mv3:
        device.browser_name === "Chrome" && device.manifest_version === 3,
      version_known: version(start.app_version) !== null,
      context_ready_event: ready,
      market_locked_event: locked,
      snapshot_observations:
        observations.length >= 3 &&
        snapshot?.market_count === observations.length &&
        observations.every(
          (h) => h.platform === t.platform && h.hotel_id && h.hotel_name,
        ),
      observed_price: priced > 0,
    }).map(([key, value]) => [key, Boolean(value)]),
  );
  const last = attempts.at(-1);
  const blocker = ["CAPTCHA_REQUIRED", "LOGIN_REQUIRED"].includes(t.error_code)
    ? t.error_code
    : ["CAPTCHA_REQUIRED", "LOGIN_REQUIRED"].includes(last?.error_code)
      ? last.error_code
      : null;
  const verified = Object.values(checks).every((v) => v === true);
  const simulation = environment !== "production";
  const status = blocker
    ? "BLOCKED"
    : verified
      ? simulation
        ? "SIMULATED_PASS"
        : "VERIFIED"
      : ["PENDING", "RUNNING"].includes(t.status)
        ? "AWAITING_REAL_AGENT"
        : t.status === "CANCELLED"
          ? "CANCELLED"
          : "INCONCLUSIVE";
  return {
    task_id: t.id,
    platform: t.platform,
    os: acceptanceOS(t),
    status,
    task_status: t.status,
    simulation,
    evidence_trust: "approved_agent_report_not_hardware_attestation",
    task_type: t.task_type,
    context: {
      city: t.city,
      keyword: t.keyword,
      checkin: t.checkin,
      checkout: t.checkout,
      scope: t.scope,
      collection_limit: t.collection_limit,
    },
    checks,
    blocker,
    automatic_repair_count: 0,
    retry_count: Math.max(0, attempts.length - 1),
    snapshot: snapshot
      ? {
          snapshot_id: snapshot.id,
          attempt_id: snapshot.attempt_id,
          device_id: snapshot.device_id,
          observed_at: snapshot.observed_at,
          received_at: snapshot.received_at,
          market_status: snapshot.market_status,
          exhausted: !!snapshot.exhausted,
          stop_reason: snapshot.stop_reason,
          price_count: priced,
        }
      : null,
    device_at_start: {
      os: ["macOS", "Windows"].includes(device.os) ? device.os : null,
      browser_name: device.browser_name === "Chrome" ? "Chrome" : null,
      browser_version:
        typeof device.browser_version === "string" &&
        /^[0-9.]{1,32}$/.test(device.browser_version)
          ? device.browser_version
          : null,
      agent_version: version(start.app_version),
    },
    observations,
    attempts: attempts.map((a) => ({
      attempt_id: a.id,
      device_id: a.device_id,
      attempt_number: a.attempt_number,
      status: a.status,
      claimed_at: a.claimed_at,
      started_at: a.started_at,
      finished_at: a.finished_at,
      error_code: safeCode(a.error_code),
    })),
    diagnostics: events
      .filter((e) =>
        [
          "CLAIMED",
          "STARTED",
          "FAST_NAV_START",
          "FAST_NAV_VERIFIED",
          "FAST_NAV_FAILED",
          "FAST_NAV_CONTEXT_MISMATCH",
          "LIST_READY",
          "MARKET_LOCKED",
        "UPLOAD_START",
          "COMPLETED",
          "PARTIAL",
          "FAILED",
          "RETURNED_TO_QUEUE",
          "CANCELLED",
        ].includes(e.event),
      )
      .map((e) => ({
        attempt_id: e.attempt_id,
        event: e.event,
        at: e.at,
        code: safeCode(e.code),
      })),
  };
}
