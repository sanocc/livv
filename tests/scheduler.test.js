import test from "node:test";
import assert from "node:assert/strict";
import { schedule, generatePlans, hash } from "../api/src/scheduler.js";
import { CONFIG, nowIso, addDays } from "../api/src/config.js";
import { claim, reap, failAttempt } from "../api/src/db.js";
import { database } from "./db-adapter.js";
const midnight = Date.parse("2026-10-01T00:00:00+08:00");
const plan = {
  id: "p",
  enabled: 1,
  platform: "ctrip",
  city: "咸宁",
  keyword: "中心花坛",
  scope: "top30",
  collection_limit: 30,
  horizon: 30,
};
function insertPlan(db, p = plan) {
  db.raw
    .prepare("INSERT INTO plans VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(
      p.id,
      p.platform,
      p.city,
      p.keyword,
      p.scope,
      p.collection_limit,
      p.horizon,
      p.enabled,
      nowIso(midnight),
      nowIso(midnight),
    );
}
test("controlled calendar covers every tier through D+14 and D+30, alternating far dates and Shanghai rollover", () => {
  const activeDay =
    hash(plan.id) % 2 === Math.floor(Date.parse("2026-10-01") / 86400000) % 2
      ? midnight
      : midnight + 86400000;
  const date = new Date(activeDay + 8 * 3600000).toISOString().slice(0, 10);
  const tasks = schedule([plan], activeDay);
  for (let offset = 0; offset <= 30; offset++) {
    const count =
      offset === 0
        ? 10
        : offset === 1
          ? 6
          : offset <= 3
            ? 4
            : offset <= 7
              ? 2
              : 1;
    assert.equal(
      tasks.filter((t) => t.checkin === addDays(date, offset)).length,
      count,
      `D+${offset}`,
    );
  }
  assert.equal(
    schedule([plan], activeDay + 86400000).filter(
      (t) => t.checkin >= addDays(date, 15),
    ).length,
    1,
  ); // only D+14 remains in this absolute range
  const fourteen = schedule([{ ...plan, horizon: 14 }], midnight);
  assert.equal(new Set(fourteen.map((t) => t.checkin)).size, 15);
  assert.equal(fourteen.length, 39);
  assert.ok(
    schedule([plan], midnight + 86400000 - 1).every(
      (t) => t.window_end > nowIso(midnight + 86400000 - 1),
    ),
  );
  assert.ok(
    schedule([plan], midnight + 86400000).every(
      (t) => t.checkin >= "2026-10-02",
    ),
  );
  assert.ok(
    tasks.every((t) => t.due_at >= t.window_start && t.due_at < t.window_end),
  );
  assert.ok(tasks.every((t) => !t.window_start.includes("T22:00:00"))); // 06:00 +08 has no window
});
test("jitter is repeatable and devices, busy leases and committed work affect scheduling", () => {
  const at = Date.parse("2026-10-01T12:00:00+08:00");
  const plans = Array.from({ length: 15 }, (_, i) => ({
    ...plan,
    id: `p${i}`,
    horizon: 14,
  }));
  const one = schedule(plans, at, 1, 600),
    two = schedule(plans, at, 2, 600);
  const window = nowIso(at);
  const a = one.filter((t) => t.window_start === window),
    b = two.filter((t) => t.window_start === window);
  assert.ok(a.some((t) => t.capacity_warning));
  assert.ok(
    b.filter((t) => t.capacity_warning).length <
      a.filter((t) => t.capacity_warning).length,
  );
  assert.deepEqual(schedule(plans, at, 1, 600), one);
  const busy = schedule(
    [plan],
    at,
    1,
    180,
    [],
    [{ available_at: nowIso(at + 3600000) }],
  );
  assert.ok(
    busy
      .filter((t) => t.window_start === window)
      .every((t) => t.due_at >= nowIso(at + 3600000)),
  );
  const existing = [{ ...schedule([plan], at)[0], status: "PENDING" }];
  const next = schedule([plan], at, 1, 180, existing);
  assert.ok(next.every((t) => t.schedule_key !== existing[0].schedule_key));
  assert.ok(schedule([plan], at, 0).every((t) => t.capacity_warning));
});
test("cron materialization is idempotent at later times and rolls without backfilling expired windows", async () => {
  const db = database();
  insertPlan(db);
  assert.ok((await generatePlans(db, midnight)) > 0);
  const original = db.raw.prepare("SELECT * FROM tasks ORDER BY id").all();
  assert.equal(await generatePlans(db, midnight + 60000), 0);
  assert.deepEqual(
    db.raw.prepare("SELECT * FROM tasks ORDER BY id").all(),
    original,
  );
  const next = midnight + 86400000;
  await reap(db, next);
  await generatePlans(db, next);
  assert.ok(
    db.raw
      .prepare("SELECT COUNT(*) n FROM tasks WHERE created_at=?")
      .get(nowIso(next)).n > 0,
  );
  assert.equal(
    db.raw
      .prepare(
        "SELECT COUNT(*) n FROM tasks WHERE status='PENDING' AND window_end<=?",
      )
      .get(nowIso(next)).n,
    0,
  );
  assert.equal(await generatePlans(db, next + 60000), 0);
  const late = database();
  insertPlan(late);
  const at = Date.parse("2026-10-01T23:59:59+08:00");
  await generatePlans(late, at);
  assert.ok(
    late.raw
      .prepare("SELECT * FROM tasks")
      .all()
      .every((t) => t.due_at >= nowIso(at) && t.window_end > nowIso(at)),
  );
});
test("scheduled tasks keep Plan/Task/Attempt identity, single-device exclusion and five-attempt limit", async () => {
  const db = database();
  insertPlan(db, { ...plan, horizon: 14 });
  const id = "device";
  db.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,created_at,last_seen_at) VALUES(?,?,'approved',?,?)",
    )
    .run(id, "test", nowIso(midnight), nowIso(midnight));
  await generatePlans(db, midnight);
  const due = Date.parse(
    db.raw.prepare("SELECT min(due_at) due FROM tasks").get().due,
  );
  db.raw
    .prepare("UPDATE devices SET last_seen_at=? WHERE id=?")
    .run(nowIso(due), id);
  const first = await claim(db, { id }, due);
  assert.equal(first.task.plan_id, plan.id);
  assert.notEqual(first.task.id, plan.id);
  assert.equal(first.attempt.task_id, first.task.id);
  assert.equal(await claim(db, { id }, due), null);
  for (let i = 1; i <= CONFIG.maxAttempts; i++) {
    const current = i === 1 ? first : await claim(db, { id }, due);
    assert.equal(current.task.id, first.task.id);
    assert.equal(current.attempt.attempt_number, i);
    await failAttempt(
      db,
      current.attempt,
      "TEST_FAILURE",
      "controlled failure",
      due,
    );
  }
  assert.equal(
    db.raw.prepare("SELECT error_code FROM tasks WHERE id=?").get(first.task.id)
      .error_code,
    "MAX_ATTEMPTS_REACHED",
  );
  const end = Date.parse(first.task.window_end);
  await reap(db, end);
  assert.equal(
    db.raw
      .prepare(
        "SELECT COUNT(*) n FROM tasks WHERE status='PENDING' AND window_end<=?",
      )
      .get(nowIso(end)).n,
    0,
  );
});
