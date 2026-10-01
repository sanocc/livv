import { CONFIG, businessDate, addDays, nowIso } from "./config.js";
export function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function schedule(
  plans,
  now = Date.now(),
  onlineDevices = 1,
  estimatedSeconds = CONFIG.estimatedTaskSeconds,
  existingTasks = [],
  busyDevices = [],
) {
  const today = businessDate(now);
  const tasks = [];
  const existingKeys = new Set(existingTasks.map((t) => t.schedule_key));
  for (const plan of plans) {
    if (!plan.enabled) continue;
    for (let offset = 0; offset <= plan.horizon; offset++) {
      const tier = CONFIG.frequencies.find(
        (x) => offset >= x.from && offset <= x.to,
      );
      const checkin = addDays(today, offset);
      if (
        tier.everyDays &&
        Math.floor(Date.parse(today) / 86400000) % tier.everyDays !==
          hash(plan.id) % tier.everyDays
      )
        continue;
      for (const w of tier.windows) {
        const [start, end] = CONFIG.windows[w];
        const a = Date.parse(today + "T00:00:00+08:00") + start * 3600000,
          b = Date.parse(today + "T00:00:00+08:00") + end * 3600000;
        if (b <= now) continue;
        const key = `${plan.id}/${today}/${checkin}/${w}`;
        if (existingKeys.has(key)) continue;
        tasks.push({
          ...plan,
          id: undefined,
          plan_id: plan.id,
          schedule_key: key,
          checkin,
          checkout: addDays(checkin, 1),
          window_start: nowIso(a),
          window_end: nowIso(b),
        });
      }
    }
  }
  const groups = Map.groupBy(tasks, (t) => t.window_start);
  for (const group of groups.values()) {
    group.sort((a, b) => hash(a.schedule_key) - hash(b.schedule_key));
    const a = Math.max(now, Date.parse(group[0].window_start)),
      b = Date.parse(group[0].window_end),
      duration = estimatedSeconds * 1000,
      lanes = Array.from({ length: Math.max(1, onlineDevices) }, (_, i) =>
        Math.max(a, Math.min(b, Date.parse(busyDevices[i]?.available_at) || a)),
      );
    // Reserve previously committed pending work; repeated cron runs never move it.
    for (const task of existingTasks
      .filter(
        (t) =>
          t.status === "PENDING" &&
          Date.parse(t.window_start) < b &&
          Date.parse(t.window_end) > a,
      )
      .sort((x, y) => x.due_at.localeCompare(y.due_at))) {
      const lane = lanes.indexOf(Math.min(...lanes));
      lanes[lane] = Math.max(lanes[lane], Date.parse(task.due_at)) + duration;
    }
    const reserve = Math.min(duration, (b - a) / 4),
      spacing = (b - a - reserve) / group.length;
    group.forEach((t, i) => {
      const jitter = (hash(t.schedule_key + "jitter") % 1000) / 1000;
      const lane = lanes.indexOf(Math.min(...lanes));
      const due = Math.max(
        lanes[lane],
        a + Math.floor(spacing * (i + 0.2 + jitter * 0.6)),
      );
      t.due_at = nowIso(Math.min(due, b - 1));
      t.capacity_warning = onlineDevices === 0 || due + duration > b;
      lanes[lane] = due + duration;
    });
  }
  return tasks;
}
export async function generatePlans(db, now = Date.now()) {
  const plans = (
    await db.prepare("SELECT * FROM plans WHERE enabled=1").bind().all()
  ).results;
  const devices = await db
    .prepare(
      "SELECT COUNT(*) n FROM devices WHERE status='approved' AND last_seen_at>?",
    )
    .bind(nowIso(now - CONFIG.offlineSeconds * 1000))
    .first();
  const existing = (
    await db
      .prepare(
        "SELECT schedule_key,status,due_at,window_start,window_end FROM tasks WHERE window_end>?",
      )
      .bind(nowIso(now))
      .all()
  ).results;
  const busy = (
    await db
      .prepare(
        "SELECT a.device_id,min(a.timeout_at,t.window_end) available_at FROM attempts a JOIN tasks t ON t.id=a.task_id JOIN devices d ON d.id=a.device_id WHERE a.status='RUNNING' AND d.status='approved' AND d.last_seen_at>? ORDER BY available_at DESC",
      )
      .bind(nowIso(now - CONFIG.offlineSeconds * 1000))
      .all()
  ).results;
  const generated = schedule(
    plans,
    now,
    devices.n,
    CONFIG.estimatedTaskSeconds,
    existing,
    busy,
  );
  if (!generated.length) return 0;
  // JSON bulk insert keeps even a 30-day plan below D1 per-invocation query limits.
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO tasks(id,plan_id,schedule_key,platform,city,keyword,scope,collection_limit,checkin,checkout,status,created_at,due_at,window_start,window_end,capacity_warning,task_type)
 SELECT lower(hex(randomblob(16))),json_extract(value,'$.plan_id'),json_extract(value,'$.schedule_key'),json_extract(value,'$.platform'),json_extract(value,'$.city'),json_extract(value,'$.keyword'),json_extract(value,'$.scope'),json_extract(value,'$.collection_limit'),json_extract(value,'$.checkin'),json_extract(value,'$.checkout'),'PENDING',?,json_extract(value,'$.due_at'),json_extract(value,'$.window_start'),json_extract(value,'$.window_end'),json_extract(value,'$.capacity_warning'),'MARKET_LIST' FROM json_each(?)`,
    )
    .bind(nowIso(now), JSON.stringify(generated))
    .run();
  return r.meta.changes;
}
