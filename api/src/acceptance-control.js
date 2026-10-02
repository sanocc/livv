import {
  verifyAcceptanceCapability,
  validControlContext,
  controlInputKeys,
} from "./acceptance-capability.js";
import { createAcceptance, acceptanceReport } from "./acceptance.js";
import { first, rows } from "./db.js";
import { requireThat } from "./domain.js";
const stages = new Set([
  "FAST_NAV_START",
  "FAST_NAV_VERIFIED",
  "FAST_NAV_FAILED",
  "FAST_NAV_CONTEXT_MISMATCH",
  "LIST_READY",
  "MARKET_LOCKED",
  "UPLOAD_START",
]);
// Return facts, never raw event messages/DOM/URLs/secrets, nor missing-as-success.
export async function controlReport(db, task, environment) {
  const report = await acceptanceReport(db, task.id, environment);
  const id = report.snapshot?.attempt_id ?? report.attempts.at(-1)?.attempt_id;
  const events = id
    ? await rows(
        db,
        "SELECT event,message FROM attempt_events WHERE attempt_id=? ORDER BY id",
        id,
      )
    : [];
  const seen = new Set(events.map((e) => e.event));
  let cards = null;
  for (const e of events.filter((e) => e.event === "MARKET_LOCKED")) {
    try {
      const n = JSON.parse(e.message)?.count;
      if (Number.isInteger(n) && n >= 0 && n <= 2000) cards = n;
    } catch {}
  }
  const navigation = [...seen].filter(
    (e) => stages.has(e) && e.startsWith("FAST_NAV_"),
  );
  const presence = (field) =>
    report.snapshot
      ? report.observations.filter((h) => h[field] != null).length
      : null;
  return {
    ...report,
    purpose: "PLATFORM_ACCEPTANCE",
    execution: {
      execution_id: id ?? null,
      task_id: task.id,
      attempt_id: id ?? null,
      snapshot_id: report.snapshot?.snapshot_id ?? null,
      navigation: navigation.length ? navigation : null,
      // LIST_READY is emitted only after the native parser verifies page/search context.
      page_reached: seen.has("LIST_READY") ? true : null,
      page_context_verified: seen.has("LIST_READY") ? true : null,
      card_count: cards,
      card_count_basis:
        cards === null ? null : "agent_market_locked_unique_cards",
      uploaded_card_count: report.snapshot ? report.observations.length : null,
      parsed_fields: Object.fromEntries(
        [
          "hotel_id",
          "hotel_name",
          "rank",
          "is_ad",
          "display_price",
          "original_price",
        ].map((k) => [k, presence(k)]),
      ),
      parsed_fields_basis: report.snapshot
        ? "uploaded_non_null_field_counts"
        : null,
      upload_result: report.snapshot
        ? {
            status: report.snapshot.market_status,
            snapshot_id: report.snapshot.snapshot_id,
            received_at: report.snapshot.received_at,
          }
        : null,
      error_code:
        report.blocker ??
        report.attempts.at(-1)?.error_code ??
        ([
          "EXECUTION_WINDOW_EXPIRED",
          "MAX_ATTEMPTS_REACHED",
          "ADMIN_CANCELLED",
        ].includes(task.error_code)
          ? task.error_code
          : task.error_code
            ? "UNKNOWN_ERROR"
            : null),
      sanitized_diagnostics: report.diagnostics,
      observed_at: report.snapshot?.observed_at ?? null,
    },
  };
}
export async function acceptanceControl(req, env, makeTask, readBody) {
  const url = new URL(req.url),
    path = url.pathname;
  // Auth always precedes route/DB access. These credentials have no delegation to other routes.
  const grant = await verifyAcceptanceCapability(req, env);
  requireThat(url.search === "", "ACCEPTANCE_CONTROL_DENIED", 400);
  const key = `acceptance:v1:${grant.os}:${grant.jti}`;
  if (path === "/v1/acceptance-control/tasks" && req.method === "POST") {
    requireThat(!req.headers.get("Origin"), "ACCEPTANCE_CONTROL_DENIED", 403);
    requireThat(
      (req.headers.get("Content-Type") ?? "").split(";")[0].trim() ===
        "application/json",
      "JSON_REQUIRED",
      415,
    );
    const input = await readBody(req);
    requireThat(validControlContext(input), "INVALID_ACCEPTANCE_INPUT");
    requireThat(
      controlInputKeys.every((k) => input[k] === grant.context[k]),
      "ACCEPTANCE_CONTROL_DENIED",
      403,
    );
    const { purpose, ...context } = input;
    const result = await createAcceptance(
      env.DB,
      { ...context, os: grant.os, request_id: grant.jti },
      makeTask,
    );
    return {
      status: result.idempotent ? 200 : 201,
      body: {
        task_id: result.task.id,
        purpose,
        task_status: result.task.status,
        idempotent: result.idempotent,
        result_path: "/v1/acceptance-control/result",
      },
    };
  }
  if (path === "/v1/acceptance-control/result" && req.method === "GET") {
    const task = await first(
      env.DB,
      "SELECT * FROM tasks WHERE schedule_key=?",
      key,
    );
    if (task)
      requireThat(
        controlInputKeys
          .filter((k) => k !== "purpose")
          .every((k) => task[k] === grant.context[k]),
        "ACCEPTANCE_CONTROL_DENIED",
        403,
      );
    return {
      status: 200,
      body: task
        ? await controlReport(env.DB, task, env.ENVIRONMENT)
        : {
            status: "NOT_CREATED",
            purpose: "PLATFORM_ACCEPTANCE",
            execution: null,
            snapshot: null,
          },
    };
  }
  requireThat(false, "NOT_FOUND", 404);
}
