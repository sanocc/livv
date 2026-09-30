import { CONFIG, nowIso } from "./config.js";
import { retryOutcome } from "./domain.js";
export const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
export const rows = async (db, sql, ...args) =>
  (await stmt(db, sql, ...args).all()).results;
export const first = (db, sql, ...args) => stmt(db, sql, ...args).first();
export function event(db, a, event, at, code = null, message = null) {
  return stmt(
    db,
    "INSERT INTO attempt_events(task_id,attempt_id,device_id,at,event,code,message) VALUES(?,?,?,?,?,?,?)",
    a.task_id,
    a.id,
    a.device_id,
    at,
    event,
    code,
    message,
  );
}
export async function reap(db, now = Date.now()) {
  const at = nowIso(now);
  // Atomic SQL state transition and timeline, including retries. No read/update race with a successful upload.
  await db.batch([
    stmt(
      db,
      `INSERT INTO attempt_events(task_id,attempt_id,device_id,at,event,code,message) SELECT a.task_id,a.id,a.device_id,?,'FAILED',CASE WHEN t.window_end<=? THEN 'EXECUTION_WINDOW_EXPIRED' WHEN d.status!='approved' THEN 'DEVICE_DISABLED' WHEN a.timeout_at<=? THEN 'ATTEMPT_TIMEOUT' ELSE 'DEVICE_OFFLINE' END,'Lease, execution deadline, or approval expired' FROM attempts a JOIN tasks t ON t.id=a.task_id JOIN devices d ON d.id=a.device_id WHERE a.status='RUNNING' AND (a.lease_until<=? OR a.timeout_at<=? OR t.window_end<=? OR d.status!='approved')`,
      at,
      at,
      at,
      at,
      at,
      at,
    ),
    stmt(
      db,
      `UPDATE attempts SET status='FAILED',finished_at=?,error_code=CASE WHEN (SELECT window_end FROM tasks WHERE id=task_id)<=? THEN 'EXECUTION_WINDOW_EXPIRED' WHEN (SELECT status FROM devices WHERE id=device_id)!='approved' THEN 'DEVICE_DISABLED' WHEN timeout_at<=? THEN 'ATTEMPT_TIMEOUT' ELSE 'DEVICE_OFFLINE' END,error_message='Lease, execution deadline, or approval expired',returned_to_queue_at=CASE WHEN attempt_number<5 AND (SELECT window_end FROM tasks WHERE id=task_id)>? THEN ? ELSE NULL END WHERE status='RUNNING' AND (lease_until<=? OR timeout_at<=? OR (SELECT window_end FROM tasks WHERE id=task_id)<=? OR (SELECT status FROM devices WHERE id=device_id)!='approved')`,
      at,
      at,
      at,
      at,
      at,
      at,
      at,
      at,
    ),
    stmt(
      db,
      `UPDATE tasks SET status=CASE WHEN window_end<=? OR (SELECT COUNT(*) FROM attempts WHERE task_id=tasks.id)>=5 THEN 'FAILED' ELSE 'PENDING' END,error_code=CASE WHEN window_end<=? THEN 'EXECUTION_WINDOW_EXPIRED' WHEN (SELECT COUNT(*) FROM attempts WHERE task_id=tasks.id)>=5 THEN 'MAX_ATTEMPTS_REACHED' ELSE NULL END,finished_at=CASE WHEN window_end<=? OR (SELECT COUNT(*) FROM attempts WHERE task_id=tasks.id)>=5 THEN ? ELSE NULL END WHERE status IN('RUNNING','PENDING') AND NOT EXISTS(SELECT 1 FROM attempts WHERE task_id=tasks.id AND status='RUNNING')`,
      at,
      at,
      at,
      at,
    ),
    stmt(
      db,
      `INSERT INTO attempt_events(task_id,attempt_id,device_id,at,event) SELECT a.task_id,a.id,a.device_id,?,'RETURNED_TO_QUEUE' FROM attempts a WHERE a.returned_to_queue_at=? AND NOT EXISTS(SELECT 1 FROM attempt_events e WHERE e.attempt_id=a.id AND e.event='RETURNED_TO_QUEUE')`,
      at,
      at,
    ),
  ]);
}
export async function failAttempt(db, a, code, message, now = Date.now()) {
  const t = await first(db, "SELECT * FROM tasks WHERE id=?", a.task_id);
  const outcome = retryOutcome(a.attempt_number, t.window_end, now);
  const at = nowIso(now);
  await db.batch([
    stmt(
      db,
      `INSERT INTO attempt_events(task_id,attempt_id,device_id,at,event,code,message)
      SELECT task_id,id,device_id,?,'FAILED',?,? FROM attempts WHERE id=? AND status='RUNNING'`,
      at,
      code,
      message,
      a.id,
    ),
    stmt(
      db,
      `UPDATE attempts SET status='FAILED',finished_at=?,error_code=?,error_message=?,returned_to_queue_at=? WHERE id=? AND status='RUNNING'`,
      at,
      code,
      message,
      outcome.status === "PENDING" ? at : null,
      a.id,
    ),
    stmt(
      db,
      `UPDATE tasks SET status=?,error_code=?,error_message=?,finished_at=? WHERE id=? AND status='RUNNING' AND EXISTS(SELECT 1 FROM attempts WHERE id=? AND status='FAILED' AND finished_at=?)`,
      outcome.status,
      outcome.code,
      message,
      outcome.status === "FAILED" ? at : null,
      t.id,
      a.id,
      at,
    ),
    ...(outcome.status === "PENDING"
      ? [
          stmt(
            db,
            `INSERT INTO attempt_events(task_id,attempt_id,device_id,at,event)
          SELECT task_id,id,device_id,?,'RETURNED_TO_QUEUE' FROM attempts
          WHERE id=? AND status='FAILED' AND returned_to_queue_at=?
          AND NOT EXISTS(SELECT 1 FROM attempt_events WHERE attempt_id=? AND event='RETURNED_TO_QUEUE')`,
            at,
            a.id,
            at,
            a.id,
          ),
        ]
      : []),
  ]);
}
export async function claim(db, device, now = Date.now()) {
  await reap(db, now);
  const at = nowIso(now),
    id = crypto.randomUUID();
  const core = JSON.stringify(
    await rows(
      db,
      `SELECT m.hotel_id FROM hotel_mappings m JOIN livv_hotels h ON h.id=m.livv_hotel_id WHERE m.platform='ctrip' AND h.category IN('mine','core')`,
    ),
  );
  try {
    await db.batch([
      stmt(
        db,
        `INSERT INTO attempts(id,task_id,attempt_number,device_id,claimed_at,timeout_at,lease_until,status,core_hotels)
 SELECT ?,t.id,(SELECT COUNT(*)+1 FROM attempts WHERE task_id=t.id),?,?,min(t.window_end,?),min(t.window_end,?),'RUNNING',? FROM tasks t
 WHERE t.status='PENDING' AND t.due_at<=? AND t.window_start<=? AND t.window_end>? AND (t.preferred_device_id IS NULL OR t.preferred_device_id=?) AND t.platform IN(SELECT value FROM json_each((SELECT supported_platforms FROM devices WHERE id=?))) AND (SELECT status FROM devices WHERE id=?)='approved' AND (SELECT last_seen_at FROM devices WHERE id=?)>? AND NOT EXISTS(SELECT 1 FROM attempts WHERE device_id=? AND status='RUNNING') AND (SELECT COUNT(*) FROM attempts WHERE task_id=t.id)<5 ORDER BY t.due_at,t.created_at LIMIT 1`,
        id,
        device.id,
        at,
        nowIso(now + CONFIG.attemptMinutes * 60000),
        nowIso(now + CONFIG.leaseSeconds * 1000),
        core,
        at,
        at,
        at,
        device.id,
        device.id,
        device.id,
        device.id,
        nowIso(now - CONFIG.offlineSeconds * 1000),
        device.id,
      ),
      stmt(
        db,
        `UPDATE tasks SET status='RUNNING' WHERE id=(SELECT task_id FROM attempts WHERE id=?)`,
        id,
      ),
      stmt(
        db,
        `INSERT INTO attempt_events(task_id,attempt_id,device_id,at,event) SELECT task_id,id,device_id,?,'CLAIMED' FROM attempts WHERE id=?`,
        at,
        id,
      ),
    ]);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return null;
    throw e;
  }
  const a = await first(db, "SELECT * FROM attempts WHERE id=?", id);
  if (!a) return null;
  return {
    attempt: a,
    task: await first(db, "SELECT * FROM tasks WHERE id=?", a.task_id),
    core_hotels: JSON.parse(a.core_hotels),
  };
}
