import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/index";
import type { AccessIdentity, Env } from "../src/env";
import { d1Env, TestD1 } from "./localD1";

const manager: AccessIdentity = { subject: "manager@example.test", role: "manager" };
const admin: AccessIdentity = { subject: "admin@example.test", role: "admin" };
const owner: AccessIdentity = { subject: "owner@example.test", role: "owner" };
const viewer: AccessIdentity = { subject: "viewer@example.test", role: "viewer" };

function makeClock() {
  let value = new Date("2026-03-01T16:01:00.000Z");
  return { now: () => new Date(value), advance: (milliseconds: number) => { value = new Date(value.getTime() + milliseconds); } };
}

async function call(database: TestD1, path: string, init: RequestInit = {}, identity?: AccessIdentity, clock?: ReturnType<typeof makeClock>) {
  const env: Env = { ...d1Env(database), ...(clock ? { clock: clock.now } : {}) };
  const response = await handleRequest(new Request(`https://example.test${path}`, init), env, identity);
  const body: any = response.status === 204 ? null : await response.json();
  return { response, body };
}

const deviceInput = (device_id: string) => ({
  device_id, name: device_id, collector_version: "collector-1", protocol_version: "1",
  os: "macOS", arch: "arm64", browser: "Chrome", browser_version: "140",
});

async function register(database: TestD1, device_id: string, clock?: ReturnType<typeof makeClock>) {
  const result = await call(database, "/api/v1/collector/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(deviceInput(device_id)),
  }, undefined, clock);
  expect(result.response.status).toBe(201);
  return result.body.data.credential as string;
}

async function authorize(database: TestD1, device_id: string, clock?: ReturnType<typeof makeClock>) {
  const result = await call(database, `/api/v1/devices/${device_id}/authorize`, { method: "POST" }, admin, clock);
  expect(result.response.status).toBe(200);
}

async function createBatch(database: TestD1, body: unknown, clock?: ReturnType<typeof makeClock>, identity: AccessIdentity = manager) {
  return call(database, "/api/v1/batches", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }, identity, clock);
}

function auth(credential: string): HeadersInit { return { authorization: `Bearer ${credential}` }; }

describe("M04 batch, task, claim, lease, retry", () => {
  it("normalizes and reuses Markets, freezes dates, and creates 60 date-first tasks", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const input = { city: " 上海\u3000 酒店 ", keyword: " 迪士尼\t度假区 ", platforms: ["tongcheng", "ctrip", "fliggy", "meituan"], day_offsets: [14, 0, 1], target_hotels: 30 };
    const first = await createBatch(database, input, clock);
    expect(first.response.status).toBe(201);
    expect(first.body.data.batch.city).toBe("上海 酒店");
    expect(first.body.data.batch.keyword).toBe("迪士尼 度假区");
    expect(first.body.data.tasks).toHaveLength(12);
    expect(first.body.data.tasks.slice(0, 4).map((task: any) => `${task.platform}:${task.check_in}`)).toEqual([
      "ctrip:2026-03-02", "meituan:2026-03-02", "fliggy:2026-03-02", "tongcheng:2026-03-02",
    ]);
    const blank = await createBatch(database, { city: "上海", keyword: " \t ", platforms: ["ctrip"], day_offsets: [0], target_hotels: 30 }, clock);
    expect(blank.response.status).toBe(201);
    expect(blank.body.data.batch.keyword).toBeNull();
    const equivalent = await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, clock);
    expect(equivalent.response.status).toBe(201);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM markets").get()).toMatchObject({ count: 2 });

    const sixty = await createBatch(database, { city: "宁波", keyword: null, platforms: ["ctrip", "meituan", "fliggy", "tongcheng"], day_offsets: Array.from({ length: 15 }, (_, index) => index) }, clock);
    expect(sixty.body.data.tasks).toHaveLength(60);
    expect(sixty.body.data.tasks[59]).toMatchObject({ sequence: 60, platform: "tongcheng", check_in: "2026-03-16", check_out: "2026-03-17" });
    expect(sixty.body.data.tasks.every((task: any) => task.priority === 0)).toBe(true);
    const task = database.sqlite.prepare("SELECT check_in, check_out FROM collection_tasks WHERE sequence = 1 AND batch_id = ?").get(sixty.body.data.batch.id) as { check_in: string; check_out: string };
    expect(task).toEqual({ check_in: "2026-03-02", check_out: "2026-03-03" });
  });

  it("enforces Batch RBAC and rejects manual Market creation and invalid inputs", async () => {
    const database = new TestD1();
    const viewerResult = await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, undefined, viewer);
    expect(viewerResult.response.status).toBe(403);
    const manualMarket = await call(database, "/api/v1/markets", { method: "POST", body: "{}" }, manager);
    expect(manualMarket.response.status).toBe(404);
    for (const body of [
      { city: "上海", keyword: null, platforms: ["bad"], day_offsets: [0] },
      { city: "上海", keyword: null, platforms: ["ctrip", "ctrip"], day_offsets: [0] },
      { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [15] },
      { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0, 0] },
      { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0], target_hotels: 0 },
      { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0], target_hotels: 201 },
    ]) {
      expect((await createBatch(database, body)).response.status).toBe(400);
    }
    expect((await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0] })).body.data.batch.target_hotels).toBe(30);
    expect((await createBatch(database, { city: "广州", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, undefined, admin)).response.status).toBe(201);
    expect((await createBatch(database, { city: "深圳", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, undefined, owner)).response.status).toBe(201);
  });

  it("claims atomically, returns context, enforces one active Task, and returns 204 when empty", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const firstCredential = await register(database, "device-1", clock);
    const secondCredential = await register(database, "device-2", clock);
    const thirdCredential = await register(database, "device-3", clock);
    await authorize(database, "device-1", clock);
    await authorize(database, "device-2", clock);
    await authorize(database, "device-3", clock);
    const batch = await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0, 1] }, clock);
    const claim = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(firstCredential) }, undefined, clock);
    expect(claim.response.status).toBe(200);
    expect(claim.body.data.task).toMatchObject({ attempt_number: 1, platform: "ctrip", check_in: "2026-03-02", check_out: "2026-03-03", market_id: batch.body.data.batch.market_id });
    expect(new Date(claim.body.data.task.lease_expires_at).getTime() - clock.now().getTime()).toBe(600000);
    const busy = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(firstCredential) }, undefined, clock);
    expect(busy.response.status).toBe(409);
    expect(busy.body.error.code).toBe("DEVICE_BUSY");
    const second = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(secondCredential) }, undefined, clock);
    expect(second.response.status).toBe(200);
    expect(second.body.data.task.task_id).not.toBe(claim.body.data.task.task_id);
    const empty = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(thirdCredential) }, undefined, clock);
    expect(empty.response.status).toBe(204);
  });

  it("allows only authorized devices to claim and proves a concurrent single-task race has one winner", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const pending = await register(database, "pending", clock);
    const one = await register(database, "one", clock);
    const two = await register(database, "two", clock);
    await authorize(database, "one", clock);
    await authorize(database, "two", clock);
    await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, clock);
    const pendingClaim = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(pending) }, undefined, clock);
    expect(pendingClaim.response.status).toBe(403);
    expect(pendingClaim.body.error.code).toBe("DEVICE_PENDING");
    const results = await Promise.all([
      call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(one) }, undefined, clock),
      call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(two) }, undefined, clock),
    ]);
    expect(results.filter((result) => result.response.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.response.status === 204)).toHaveLength(1);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM task_attempts WHERE status = 'active'").get()).toMatchObject({ count: 1 });
  });

  it("orders equal-priority Tasks by Batch creation before Batch-local sequence", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const credentials = await Promise.all(["a", "b", "c"].map((id) => register(database, id, clock)));
    for (const id of ["a", "b", "c"]) await authorize(database, id, clock);
    const batchA = await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0, 1] }, clock);
    const batchB = await createBatch(database, { city: "北京", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, clock);
    database.sqlite.prepare("UPDATE collection_batches SET created_at = ? WHERE id = ?").run("2026-03-01T10:00:00Z", batchA.body.data.batch.id);
    database.sqlite.prepare("UPDATE collection_batches SET created_at = ? WHERE id = ?").run("2026-03-01T10:10:00Z", batchB.body.data.batch.id);
    const first = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credentials[0]) }, undefined, clock);
    const second = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credentials[1]) }, undefined, clock);
    const third = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credentials[2]) }, undefined, clock);
    expect([first, second, third].map((result) => result.body.data.task.task_id)).toEqual([
      batchA.body.data.tasks[0].id,
      batchA.body.data.tasks[1].id,
      batchB.body.data.tasks[0].id,
    ]);
  });

  it("lets higher priority override cross-Batch FIFO", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const oldCredential = await register(database, "old", clock);
    const newCredential = await register(database, "new", clock);
    await authorize(database, "old", clock);
    await authorize(database, "new", clock);
    const oldBatch = await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, clock);
    const newBatch = await createBatch(database, { city: "北京", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, clock);
    database.sqlite.prepare("UPDATE collection_batches SET created_at = ? WHERE id = ?").run("2026-03-01T10:00:00Z", oldBatch.body.data.batch.id);
    database.sqlite.prepare("UPDATE collection_batches SET created_at = ? WHERE id = ?").run("2026-03-01T10:10:00Z", newBatch.body.data.batch.id);
    database.sqlite.prepare("UPDATE collection_tasks SET priority = 10 WHERE batch_id = ?").run(newBatch.body.data.batch.id);
    const claim = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(oldCredential) }, undefined, clock);
    expect(claim.body.data.task.task_id).toBe(newBatch.body.data.tasks[0].id);
    const next = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(newCredential) }, undefined, clock);
    expect(next.body.data.task.task_id).toBe(oldBatch.body.data.tasks[0].id);
  });

  it("keeps a retrying Task in its Batch order after cooldown without blocking its successor", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const firstCredential = await register(database, "first", clock);
    const secondCredential = await register(database, "second", clock);
    await authorize(database, "first", clock);
    await authorize(database, "second", clock);
    const batch = await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0, 1] }, clock);
    const first = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(firstCredential) }, undefined, clock);
    clock.advance(600000);
    const secondAttempt = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(firstCredential) }, undefined, clock);
    const failed = await call(database, `/api/v1/collector/tasks/${secondAttempt.body.data.task.task_id}/fail`, {
      method: "POST", headers: { ...auth(firstCredential), "content-type": "application/json" },
      body: JSON.stringify({ attempt_id: secondAttempt.body.data.task.attempt_id, failure_code: "TIMEOUT", retryable: false }),
    }, undefined, clock);
    expect(failed.response.status).toBe(200);
    const successor = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(secondCredential) }, undefined, clock);
    expect(successor.body.data.task.task_id).toBe(batch.body.data.tasks[1].id);
    const duringCooldown = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(firstCredential) }, undefined, clock);
    expect(duringCooldown.response.status).toBe(204);
    clock.advance(60000);
    const reeligible = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(firstCredential) }, undefined, clock);
    expect(reeligible.body.data.task.task_id).toBe(first.body.data.task.task_id);
    expect(reeligible.body.data.task.attempt_number).toBe(3);
    expect(database.sqlite.prepare("SELECT batch_id, sequence, priority FROM collection_tasks WHERE id = ?").get(first.body.data.task.task_id)).toMatchObject({ batch_id: batch.body.data.batch.id, sequence: 1, priority: 0 });
  });

  it("rejects revoked devices before claim", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const credential = await register(database, "revoked", clock);
    await authorize(database, "revoked", clock);
    const revoke = await call(database, "/api/v1/devices/revoked/revoke", { method: "POST" }, admin, clock);
    expect(revoke.response.status).toBe(200);
    await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, clock);
    const claim = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credential) }, undefined, clock);
    expect(claim.response.status).toBe(403);
    expect(claim.body.error.code).toBe("DEVICE_REVOKED");
  });

  it("expires leases, retries without starvation, preserves order, and fails after Attempt 3", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const credential = await register(database, "device-1", clock);
    const secondCredential = await register(database, "device-2", clock);
    await authorize(database, "device-1", clock);
    await authorize(database, "device-2", clock);
    await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip", "meituan"], day_offsets: [0] }, clock);
    const first = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credential) }, undefined, clock);
    clock.advance(600000);
    const second = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credential) }, undefined, clock);
    expect(second.response.status).toBe(200);
    expect(second.body.data.task.attempt_number).toBe(2);
    expect(second.body.data.task.platform).toBe("ctrip");
    expect(database.sqlite.prepare("SELECT status FROM task_attempts WHERE attempt_number = 1").get()).toMatchObject({ status: "expired" });
    const fail2 = await call(database, `/api/v1/collector/tasks/${second.body.data.task.task_id}/fail`, {
      method: "POST", headers: { ...auth(credential), "content-type": "application/json" },
      body: JSON.stringify({ attempt_id: second.body.data.task.attempt_id, failure_code: "TIMEOUT", retryable: false }),
    }, undefined, clock);
    expect(fail2.response.status).toBe(200);
    const laterTask = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(secondCredential) }, undefined, clock);
    expect(laterTask.response.status).toBe(200);
    expect(laterTask.body.data.task.platform).toBe("meituan");
    const failLater = await call(database, `/api/v1/collector/tasks/${laterTask.body.data.task.task_id}/fail`, {
      method: "POST", headers: { ...auth(secondCredential), "content-type": "application/json" },
      body: JSON.stringify({ attempt_id: laterTask.body.data.task.attempt_id, failure_code: "CONTEXT_MISMATCH", retryable: true }),
    }, undefined, clock);
    expect(failLater.response.status).toBe(200);
    const cooldown = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credential) }, undefined, clock);
    expect(cooldown.response.status).toBe(204);
    const retry = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credential) }, undefined, clock);
    expect(retry.response.status).toBe(204);
    const task = database.sqlite.prepare("SELECT status, attempt_count, priority, sequence FROM collection_tasks WHERE platform = 'ctrip'").get() as any;
    expect(task).toMatchObject({ status: "retry_wait", attempt_count: 2, priority: 0, sequence: 1 });
    clock.advance(60000);
    const thirdAttempt = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(credential) }, undefined, clock);
    expect(thirdAttempt.response.status).toBe(200);
    const finalFail = await call(database, `/api/v1/collector/tasks/${thirdAttempt.body.data.task.task_id}/fail`, {
      method: "POST", headers: { ...auth(credential), "content-type": "application/json" },
      body: JSON.stringify({ attempt_id: thirdAttempt.body.data.task.attempt_id, failure_code: "ADAPTER_ERROR", retryable: true }),
    }, undefined, clock);
    expect(finalFail.response.status).toBe(200);
    expect(database.sqlite.prepare("SELECT status, attempt_count FROM collection_tasks WHERE platform = 'ctrip'").get()).toMatchObject({ status: "failed", attempt_count: 3 });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM task_attempts WHERE task_id = (SELECT id FROM collection_tasks WHERE platform = 'ctrip')").get()).toMatchObject({ count: 3 });
  });

  it("protects failure and progress ownership and keeps progress out of audit", async () => {
    const database = new TestD1();
    const clock = makeClock();
    const one = await register(database, "one", clock);
    const two = await register(database, "two", clock);
    await authorize(database, "one", clock);
    await authorize(database, "two", clock);
    await createBatch(database, { city: "上海", keyword: null, platforms: ["ctrip"], day_offsets: [0] }, clock);
    const claim = await call(database, "/api/v1/collector/tasks/claim", { method: "POST", headers: auth(one) }, undefined, clock);
    const task = claim.body.data.task;
    const wrong = await call(database, `/api/v1/collector/tasks/${task.task_id}/progress`, { method: "POST", headers: { ...auth(two), "content-type": "application/json" }, body: JSON.stringify({ attempt_id: task.attempt_id, stage: "x", progress_current: 1, progress_target: 2 }) }, undefined, clock);
    expect(wrong.response.status).toBe(409);
    expect(wrong.body.error.code).toBe("TASK_NOT_OWNED");
    const wrongAttempt = await call(database, `/api/v1/collector/tasks/${task.task_id}/progress`, { method: "POST", headers: { ...auth(one), "content-type": "application/json" }, body: JSON.stringify({ attempt_id: "wrong-attempt", stage: "x", progress_current: 1, progress_target: 2 }) }, undefined, clock);
    expect(wrongAttempt.response.status).toBe(409);
    expect(wrongAttempt.body.error.code).toBe("TASK_NOT_OWNED");
    const invalid = await call(database, `/api/v1/collector/tasks/${task.task_id}/fail`, { method: "POST", headers: { ...auth(one), "content-type": "application/json" }, body: JSON.stringify({ attempt_id: task.attempt_id, failure_code: "NOPE" }) }, undefined, clock);
    expect(invalid.response.status).toBe(400);
    const auditBeforeProgress = database.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get();
    const progress = await call(database, `/api/v1/collector/tasks/${task.task_id}/progress`, { method: "POST", headers: { ...auth(one), "content-type": "application/json" }, body: JSON.stringify({ attempt_id: task.attempt_id, stage: "collecting", progress_current: 1, progress_target: 2 }) }, undefined, clock);
    expect(progress.response.status).toBe(200);
    expect(database.sqlite.prepare("SELECT progress_stage, progress_current, progress_target FROM task_attempts WHERE id = ?").get(task.attempt_id)).toMatchObject({ progress_stage: "collecting", progress_current: 1, progress_target: 2 });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get()).toEqual(auditBeforeProgress);
  });
});
