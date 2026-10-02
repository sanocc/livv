import { ingestTelemetry, deviceDiagnostics } from "./telemetry.js";
import { CONFIG, nowIso, businessDate, addDays } from "./config.js";
import {
  HttpError,
  requireThat,
  text,
  target,
  deviceStatus,
} from "./domain.js";
import { human, deviceAuth, credential, sha256 } from "./auth.js";
import { stmt, first, rows, event, reap, claim, failAttempt } from "./db.js";
import { upload } from "./upload.js";
import { generatePlans } from "./scheduler.js";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function body(req) {
  requireThat(
    Number(req.headers.get("content-length") ?? 0) <= CONFIG.maxBodyBytes,
    "BODY_TOO_LARGE",
    413,
  );
  const reader = req.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CONFIG.maxBodyBytes) {
      await reader.cancel();
      throw new HttpError(413, "BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let i = 0;
  for (const c of chunks) {
    bytes.set(c, i);
    i += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "INVALID_JSON");
  }
}
async function newTask(db, b, device = null, now = Date.now()) {
  const t = target(b, { now }),
    id = crypto.randomUUID(),
    at = nowIso(now);
  const taskType = b.task_type ?? "MARKET_LIST";
  requireThat(
    ["MARKET_LIST", "LEGACY_MARKET_DETAIL"].includes(taskType),
    "INVALID_TASK_TYPE",
  );
  await stmt(
    db,
    `INSERT INTO tasks(id,platform,city,keyword,scope,collection_limit,checkin,checkout,preferred_device_id,created_at,due_at,window_start,window_end,task_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    t.platform,
    t.city,
    t.keyword,
    t.scope,
    t.collection_limit,
    t.checkin,
    t.checkout,
    device,
    at,
    at,
    at,
    nowIso(now + CONFIG.immediateWindowMinutes * 60000),
    taskType,
  ).run();
  return first(db, "SELECT * FROM tasks WHERE id=?", id);
}
async function activeAttempt(db, d, id) {
  const a = await first(
    db,
    "SELECT * FROM attempts WHERE id=? AND device_id=?",
    id,
    d.id,
  );
  requireThat(a, "ATTEMPT_NOT_FOUND", 404);
  return a;
}
async function market(db, u) {
  const platform = u.searchParams.get("platform") ?? "ctrip",
    city = u.searchParams.get("city") ?? "咸宁",
    keyword = u.searchParams.get("keyword") ?? "中心花坛",
    scope = u.searchParams.get("scope") ?? "top30",
    horizon = Number(u.searchParams.get("horizon") ?? 14),
    inclusive = u.searchParams.get("inclusive") ?? "0",
    limit =
      scope === "custom"
        ? Number(u.searchParams.get("limit"))
        : scope === "top30"
          ? 30
          : null;
  requireThat(
    ["top30", "custom", "all"].includes(scope) &&
      [14, 30].includes(horizon) &&
      ["0", "1"].includes(inclusive),
    "INVALID_MARKET_QUERY",
  );
  const today = businessDate();
  const points = horizon + (inclusive === "1" ? 1 : 0);
  const snapshots = await rows(
    db,
    `SELECT * FROM (SELECT s.*,t.platform,t.city,t.keyword,t.checkin,t.checkout,t.scope,t.collection_limit,a.recommendation,a.reason,a.facts,a.algorithm_version,ROW_NUMBER() OVER(PARTITION BY t.checkin ORDER BY s.observed_at DESC) rn FROM snapshots s JOIN tasks t ON t.id=s.task_id JOIN market_analyses a ON a.snapshot_id=s.id WHERE t.platform=? AND t.city=? AND t.keyword=? AND t.scope=? AND t.collection_limit IS ? AND t.checkin>=? AND t.checkin<?) WHERE rn=1 ORDER BY checkin`,
    platform,
    city,
    keyword,
    scope,
    limit,
    today,
    addDays(today, points),
  );
  const requested = u.searchParams.get("checkin") ?? today,
    selected = snapshots.find((x) => x.checkin === requested);
  const hotels = selected
    ? await rows(
        db,
        `SELECT o.*,coalesce(h.name,o.hotel_name) standard_name,coalesce(h.category,'other') category,h.id standard_hotel_id FROM market_observations o LEFT JOIN hotel_mappings m ON m.platform=o.platform AND m.hotel_id=o.hotel_id LEFT JOIN standard_hotels h ON h.id=m.standard_hotel_id WHERE o.snapshot_id=? ORDER BY o.rank`,
        selected.id,
      )
    : [];
  // Display uses current human mapping; immutable strategy facts retain their original context.
  const minePrices = snapshots.length
    ? await rows(
        db,
        `SELECT o.snapshot_id,o.display_price FROM market_observations o
     JOIN hotel_mappings m ON m.platform=o.platform AND m.hotel_id=o.hotel_id
     JOIN standard_hotels h ON h.id=m.standard_hotel_id AND h.category='mine'
     WHERE o.snapshot_id IN (SELECT value FROM json_each(?))`,
        JSON.stringify(snapshots.map((s) => s.id)),
      )
    : [];
  const mineBy = new Map(
    minePrices.map((o) => [o.snapshot_id, o.display_price]),
  );
  const by = new Map(snapshots.map((s) => [s.checkin, s]));
  const curve = Array.from({ length: points }, (_, i) => {
    const checkin = addDays(today, i),
      s = by.get(checkin);
    return {
      checkin,
      snapshot_id: s?.id ?? null,
      observed_at: s?.observed_at ?? null,
      market_status: s?.market_status ?? null,
      ...(s
        ? JSON.parse(s.facts)
        : { minimum: null, median: null, maximum: null }),
      myPrice: s ? (mineBy.get(s.id) ?? null) : null,
    };
  });
  const history = selected
    ? await rows(
        db,
        `SELECT a.*,s.observed_at,t.collection_limit FROM market_analyses a JOIN snapshots s ON s.id=a.snapshot_id JOIN tasks t ON t.id=s.task_id WHERE t.platform=? AND t.city=? AND t.keyword=? AND t.checkin=? AND t.scope=? AND t.collection_limit IS ? ORDER BY a.created_at DESC LIMIT 50`,
        platform,
        city,
        keyword,
        requested,
        scope,
        limit,
      )
    : [];
  return {
    platform,
    city,
    keyword,
    scope,
    limit,
    horizon,
    checkin: requested,
    curve,
    snapshot: selected
      ? { ...selected, facts: JSON.parse(selected.facts) }
      : null,
    hotels: hotels.map((x) => ({
      ...x,
      activity_tags: x.activity_tags ? JSON.parse(x.activity_tags) : null,
    })),
    rooms: selected
      ? await rows(
          db,
          "SELECT * FROM room_observations WHERE snapshot_id=?",
          selected.id,
        )
      : [],
    strategy_history: history,
  };
}
export async function handle(req, env) {
  const u = new URL(req.url),
    p = u.pathname,
    method = req.method,
    db = env.DB;
  if (p === "/health" && method === "GET") {
    try {
      await first(db, "SELECT 1 AS ok");
      return json({
        ok: true,
        service: "poai-api",
        version: "1.0.0",
        database: "ok",
      });
    } catch {
      return json(
        { ok: false, service: "poai-api", database: "unavailable" },
        503,
      );
    }
  }
  requireThat(p.startsWith("/v1/"), "NOT_FOUND", 404);
  if (p === "/v1/devices/register" && method === "POST") {
    if (env.REGISTRATION_LIMITER) {
      const { success } = await env.REGISTRATION_LIMITER.limit({
        key: req.headers.get("cf-connecting-ip") ?? "local",
      });
      requireThat(success, "REGISTRATION_RATE_LIMITED", 429);
    }
    const b = await body(req),
      id = text(b.device_id, 41),
      uuid = id.startsWith("poai_") ? id.slice(5) : id;
    requireThat(
      id === b.device_id &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          uuid,
        ),
      "INVALID_DEVICE_ID",
    );
    const secret = text(b.credential, 64);
    requireThat(/^[a-f0-9]{64}$/.test(secret), "INVALID_CREDENTIAL");
    const hash = await sha256(secret),
      existing = await first(db, "SELECT * FROM devices WHERE id=?", id);
    if (existing) {
      requireThat(
        existing.credential_hash === hash,
        "DEVICE_ID_ALREADY_REGISTERED",
        409,
      );
      return json({
        device_id: id,
        status: existing.status,
        name: existing.name,
      });
    }
    await stmt(
      db,
      "INSERT INTO devices(id,credential_hash,created_at,version) VALUES(?,?,?,?)",
      id,
      hash,
      nowIso(),
      text(b.version ?? "1.0.0", 40),
    ).run();
    return json({ device_id: id, status: "pending", name: null }, 201);
  }
  if (p.startsWith("/v1/device/")) {
    const d = await deviceAuth(req, db, p !== "/v1/device/heartbeat");
    const b = method === "POST" ? await body(req) : {};
    if (p === "/v1/device/heartbeat" && method === "POST") {
      await stmt(
        db,
        "UPDATE devices SET last_seen_at=?,version=?,last_error=? WHERE id=?",
        nowIso(),
        text(b.version ?? "1.0.0", 40),
        b.error_code ? text(b.error_code, 80) : null,
        d.id,
      ).run();
      if (d.status === "approved")
        await stmt(
          db,
          `UPDATE attempts SET lease_until=min(timeout_at,?) WHERE device_id=? AND status='RUNNING' AND lease_until>? AND timeout_at>?`,
          nowIso(Date.now() + CONFIG.leaseSeconds * 1000),
          d.id,
          nowIso(),
          nowIso(),
        ).run();
      const active = await first(
        db,
        "SELECT * FROM attempts WHERE device_id=? AND status='RUNNING'",
        d.id,
      );
      return json({
        device_id: d.id,
        name: d.name,
        status: d.status,
        active_attempt: active,
        heartbeat_seconds: CONFIG.heartbeatSeconds,
        server_time: nowIso(),
      });
    }
    if (p === "/v1/device/telemetry" && method === "POST")
      return json(await ingestTelemetry(env, d, b));
    if (p === "/v1/device/tasks" && method === "POST")
      return json(await newTask(db, b, d.id), 201);
    if (p === "/v1/device/claim" && method === "POST")
      return json(await claim(db, d));
    const match = p.match(
      /^\/v1\/device\/attempts\/([^/]+)\/(start|events|fail|result)$/,
    );
    if (match && method === "POST") {
      const a = await activeAttempt(db, d, match[1]),
        action = match[2];
      if (action === "result") return json(await upload(db, d, a, b));
      requireThat(
        a.status === "RUNNING" &&
          a.lease_until > nowIso() &&
          a.timeout_at > nowIso(),
        "ATTEMPT_EXPIRED",
        409,
      );
      if (action === "start") {
        if (!a.started_at)
          await db.batch([
            stmt(
              db,
              "UPDATE attempts SET started_at=? WHERE id=? AND started_at IS NULL AND status='RUNNING'",
              nowIso(),
              a.id,
            ),
            event(
              db,
              a,
              "STARTED",
              nowIso(),
              null,
              JSON.stringify({ app_version: d.version ?? null }),
            ),
          ]);
        return json({ ok: true });
      }
      if (action === "events") {
        requireThat(a.started_at, "ATTEMPT_NOT_STARTED", 409);
        const count = await first(
          db,
          "SELECT COUNT(*) n FROM attempt_events WHERE attempt_id=?",
          a.id,
        );
        requireThat(count.n < 100, "TOO_MANY_EVENTS", 429);
        await event(
          db,
          a,
          text(b.event, 80),
          nowIso(),
          b.code ? text(b.code, 80) : null,
          b.message ? text(b.message, 500) : null,
        ).run();
        return json({ ok: true });
      }
      if (action === "fail") {
        await failAttempt(
          db,
          a,
          text(b.error_code, 80),
          text(b.error_message, 500),
        );
        return json({ ok: true });
      }
    }
    throw new HttpError(404, "NOT_FOUND");
  }
  if (p.startsWith("/v1/admin/")) {
    const actor = await human(req, env);
    const b = ["POST", "PATCH", "PUT"].includes(method) ? await body(req) : {};
    if (method !== "GET") {
      requireThat(
        !req.headers.get("origin") ||
          [
            "https://ota.poai.cc",
            ...(env.ENVIRONMENT === "local"
              ? ["http://localhost:8788", "http://127.0.0.1:8788"]
              : []),
          ].includes(req.headers.get("origin")),
        "INVALID_ORIGIN",
        403,
      );
      requireThat(
        (req.headers.get("content-type") ?? "").includes("application/json"),
        "JSON_REQUIRED",
        415,
      );
    }
    if (p === "/v1/admin/session" && method === "GET")
      return json({ email: actor });
    if (p === "/v1/admin/runtime" && method === "GET") {
      const at = nowIso(),
        day = businessDate(Date.parse(at)),
        start = new Date(day + "T00:00:00+08:00").toISOString(),
        end = new Date(addDays(day, 1) + "T00:00:00+08:00").toISOString();
      // Read-only totals over today's windows of currently enabled plans.
      // Disabled acceptance plans and manual tasks stay in history, outside this view.
      const cohort =
        "t.plan_id IN (SELECT id FROM plans WHERE enabled=1) AND t.window_start>=? AND t.window_start<?";
      const counts = await rows(
        db,
        `SELECT t.status,count(*) count FROM tasks t WHERE ${cohort} GROUP BY t.status`,
        start,
        end,
      );
      const statuses = Object.fromEntries(
        ["PENDING", "RUNNING", "COMPLETED", "PARTIAL", "FAILED"].map((s) => [
          s,
          counts.find((x) => x.status === s)?.count ?? 0,
        ]),
      );
      const terminal = statuses.COMPLETED + statuses.PARTIAL + statuses.FAILED;
      const attempts = await first(
        db,
        `SELECT count(*) count FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE ${cohort}`,
        start,
        end,
      );
      const errors = await rows(
        db,
        `SELECT 'Attempt' source,a.error_code code,count(*) count FROM attempts a JOIN tasks t ON t.id=a.task_id WHERE ${cohort} AND a.error_code IS NOT NULL GROUP BY a.error_code UNION ALL SELECT 'Task' source,t.error_code code,count(*) count FROM tasks t WHERE ${cohort} AND t.error_code IS NOT NULL GROUP BY t.error_code ORDER BY count DESC,source,code`,
        start,
        end,
        start,
        end,
      );
      const devices = await rows(
        db,
        "SELECT d.id,d.name,d.status,d.last_seen_at,d.last_error,EXISTS(SELECT 1 FROM attempts a WHERE a.device_id=d.id AND a.status='RUNNING') running FROM devices d WHERE d.status='approved' AND d.last_seen_at>? ORDER BY d.id",
        nowIso(Date.parse(at) - CONFIG.offlineSeconds * 1000),
      );
      const last = await first(
        db,
        "SELECT max(s.received_at) at FROM snapshots s JOIN tasks t ON t.id=s.task_id WHERE t.status='COMPLETED' AND t.plan_id IN (SELECT id FROM plans WHERE enabled=1)",
      );
      return json({
        at,
        day,
        timezone: CONFIG.timezone,
        statuses,
        total: Object.values(statuses).reduce((n, x) => n + x, 0),
        terminal,
        success_rate: terminal ? statuses.COMPLETED / terminal : null,
        attempts: attempts.count,
        errors,
        online_devices: devices,
        last_success_at: last.at,
      });
    }
    if (p === "/v1/admin/devices" && method === "GET") {
      await reap(db);
      const list = await rows(
        db,
        `SELECT d.id,d.name,d.status,d.created_at,d.approved_at,d.last_seen_at,d.last_error,d.version,EXISTS(SELECT 1 FROM attempts a WHERE a.device_id=d.id AND a.status='RUNNING') running FROM devices d ORDER BY created_at DESC`,
      );
      return json(
        list.map((d) => ({ ...d, display_status: deviceStatus(d, d.running) })),
      );
    }
    const diagnostics = p.match(/^\/v1\/admin\/devices\/([^/]+)\/diagnostics$/);
    if (diagnostics && method === "GET")
      return json(await deviceDiagnostics(env, diagnostics[1]));
    const dm = p.match(/^\/v1\/admin\/devices\/([^/]+)$/);
    if (dm && method === "PATCH") {
      requireThat(
        await first(db, "SELECT id FROM devices WHERE id=?", dm[1]),
        "DEVICE_NOT_FOUND",
        404,
      );
      if (b.name !== undefined)
        await stmt(
          db,
          "UPDATE devices SET name=? WHERE id=?",
          text(b.name, 100),
          dm[1],
        ).run();
      if (b.status !== undefined) {
        requireThat(
          ["approved", "disabled"].includes(b.status),
          "INVALID_DEVICE_STATUS",
        );
        await stmt(
          db,
          "UPDATE devices SET status=?,approved_at=coalesce(approved_at,?) WHERE id=?",
          b.status,
          b.status === "approved" ? nowIso() : null,
          dm[1],
        ).run();
        if (b.status === "disabled") await reap(db);
      }
      return json({ ok: true });
    }
    if (p === "/v1/admin/tasks" && method === "POST")
      return json(await newTask(db, b), 201);
    if (p === "/v1/admin/tasks" && method === "GET") {
      await reap(db);
      return json(
        await rows(
          db,
          `SELECT t.*,(SELECT COUNT(*) FROM attempts a WHERE a.task_id=t.id) attempts FROM tasks t ORDER BY t.created_at DESC LIMIT 200`,
        ),
      );
    }
    const tm = p.match(/^\/v1\/admin\/tasks\/([^/]+)$/);
    if (tm && method === "GET") {
      const t = await first(db, "SELECT * FROM tasks WHERE id=?", tm[1]);
      requireThat(t, "TASK_NOT_FOUND", 404);
      return json({
        task: t,
        attempts: await rows(
          db,
          "SELECT * FROM attempts WHERE task_id=? ORDER BY attempt_number",
          t.id,
        ),
        events: await rows(
          db,
          "SELECT * FROM attempt_events WHERE task_id=? ORDER BY id",
          t.id,
        ),
      });
    }
    if (p === "/v1/admin/plans" && method === "GET")
      return json(
        await rows(db, "SELECT * FROM plans ORDER BY created_at DESC"),
      );
    if (p === "/v1/admin/plans" && method === "POST") {
      const t = target(b, { plan: true }),
        id = crypto.randomUUID(),
        at = nowIso();
      await stmt(
        db,
        "INSERT INTO plans VALUES(?,?,?,?,?,?,?,?,?,?)",
        id,
        t.platform,
        t.city,
        t.keyword,
        t.scope,
        t.collection_limit,
        t.horizon,
        t.enabled ? 1 : 0,
        at,
        at,
      ).run();
      await generatePlans(db);
      return json({ id }, 201);
    }
    const pm = p.match(/^\/v1\/admin\/plans\/([^/]+)$/);
    if (pm && method === "PATCH") {
      requireThat(typeof b.enabled === "boolean", "INVALID_ENABLED");
      await db.batch([
        stmt(
          db,
          "UPDATE plans SET enabled=?,updated_at=? WHERE id=?",
          b.enabled ? 1 : 0,
          nowIso(),
          pm[1],
        ),
        ...(!b.enabled
          ? [
              stmt(
                db,
                "UPDATE tasks SET status='FAILED',error_code='PLAN_DISABLED',finished_at=? WHERE plan_id=? AND status='PENDING'",
                nowIso(),
                pm[1],
              ),
            ]
          : []),
      ]);
      return json({ ok: true });
    }
    if (p === "/v1/admin/hotels" && method === "GET")
      return json({
        platform_hotels: await rows(
          db,
          `SELECT p.*,m.standard_hotel_id,h.name standard_name,h.category FROM platform_hotels p LEFT JOIN hotel_mappings m ON m.platform=p.platform AND m.hotel_id=p.hotel_id LEFT JOIN standard_hotels h ON h.id=m.standard_hotel_id ORDER BY p.original_name`,
        ),
        standard_hotels: await rows(db, "SELECT * FROM standard_hotels"),
      });
    if (p === "/v1/admin/standard-hotels" && method === "POST") {
      const id = crypto.randomUUID(),
        at = nowIso(),
        category = b.category ?? "other";
      requireThat(
        ["mine", "core", "competitor", "watch", "other"].includes(category),
        "INVALID_CATEGORY",
      );
      await stmt(
        db,
        "INSERT INTO standard_hotels VALUES(?,?,?,?,?)",
        id,
        text(b.name),
        category,
        at,
        at,
      ).run();
      return json({ id }, 201);
    }
    const hm = p.match(/^\/v1\/admin\/standard-hotels\/([^/]+)$/);
    if (hm && method === "PATCH") {
      const h = await first(db, "SELECT * FROM standard_hotels WHERE id=?", hm[1]);
      requireThat(h, "HOTEL_NOT_FOUND", 404);
      const category = b.category ?? h.category;
      requireThat(
        ["mine", "core", "competitor", "watch", "other"].includes(category),
        "INVALID_CATEGORY",
      );
      await stmt(
        db,
        "UPDATE standard_hotels SET name=?,category=?,updated_at=? WHERE id=?",
        b.name === undefined ? h.name : text(b.name),
        category,
        nowIso(),
        h.id,
      ).run();
      return json({ ok: true });
    }
    if (p === "/v1/admin/mappings" && method === "POST") {
      requireThat(b.confirm === true, "MANUAL_CONFIRMATION_REQUIRED");
      requireThat(
        await first(
          db,
          "SELECT id FROM standard_hotels WHERE id=?",
          b.standard_hotel_id,
        ),
        "HOTEL_NOT_FOUND",
        404,
      );
      requireThat(
        await first(
          db,
          "SELECT hotel_id FROM platform_hotels WHERE platform=? AND hotel_id=?",
          b.platform,
          b.hotel_id,
        ),
        "PLATFORM_HOTEL_NOT_FOUND",
        404,
      );
      await db.batch([
        stmt(
          db,
          "INSERT INTO hotel_mappings VALUES(?,?,?,?,?)",
          b.platform,
          b.hotel_id,
          b.standard_hotel_id,
          nowIso(),
          actor,
        ),
        stmt(
          db,
          "INSERT INTO mapping_history(platform,hotel_id,standard_hotel_id,action,at,actor) VALUES(?,?,?,'link',?,?)",
          b.platform,
          b.hotel_id,
          b.standard_hotel_id,
          nowIso(),
          actor,
        ),
      ]);
      return json({ ok: true }, 201);
    }
    if (p === "/v1/admin/mappings" && method === "DELETE") {
      const platform = u.searchParams.get("platform"),
        id = u.searchParams.get("hotel_id"),
        m = await first(
          db,
          "SELECT * FROM hotel_mappings WHERE platform=? AND hotel_id=?",
          platform,
          id,
        );
      requireThat(m, "MAPPING_NOT_FOUND", 404);
      await db.batch([
        stmt(
          db,
          "INSERT INTO mapping_history(platform,hotel_id,standard_hotel_id,action,at,actor) VALUES(?,?,?,'unlink',?,?)",
          platform,
          id,
          m.standard_hotel_id,
          nowIso(),
          actor,
        ),
        stmt(
          db,
          "DELETE FROM hotel_mappings WHERE platform=? AND hotel_id=?",
          platform,
          id,
        ),
      ]);
      return json({ ok: true });
    }
    if (p === "/v1/admin/market" && method === "GET")
      return json(await market(db, u));
    throw new HttpError(404, "NOT_FOUND");
  }
  throw new HttpError(404, "NOT_FOUND");
}
export default {
  async fetch(req, env) {
    try {
      return await handle(req, env);
    } catch (e) {
      if (e instanceof HttpError)
        return json({ error: { code: e.code, message: e.message } }, e.status);
      if (/UNIQUE constraint/.test(e.message))
        return json(
          {
            error: {
              code: "CONFLICT",
              message: "Resource or unique classification already exists",
            },
          },
          409,
        );
      if (/UPLOAD_FENCE_REJECTED/.test(e.message))
        return json({ error: { code: "ATTEMPT_EXPIRED" } }, 409);
      console.error(
        JSON.stringify({
          event: "api_error",
          path: new URL(req.url).pathname,
          message: e.message,
        }),
      );
      return json(
        { error: { code: "INTERNAL_ERROR", message: "请查看服务日志" } },
        500,
      );
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await reap(env.DB, event.scheduledTime);
        await generatePlans(env.DB, event.scheduledTime);
      })(),
    );
  },
};
