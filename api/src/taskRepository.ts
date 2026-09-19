import type { D1Database } from "@cloudflare/workers-types";
import type { BatchInput, BatchView, ClaimView, FailureCode, ProgressInput, TaskView } from "./taskTypes";

interface CandidateRow {
  id: string;
  market_id: string;
  platform: TaskView["platform"];
  check_in: string;
  check_out: string;
  target_hotels: number;
  attempt_count: number;
}

interface ClaimRow extends ClaimView {}

export function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeKeyword(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeText(value);
  return normalized.length === 0 ? null : normalized;
}

function dateAtMarket(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function id(factory?: () => string): string {
  return factory ? factory() : crypto.randomUUID();
}

export class TaskRepository {
  constructor(private readonly db: D1Database) {}

  async resolveMarket(input: BatchInput, now: string, idFactory?: () => string): Promise<{ id: string; city: string; keyword: string | null; timezone: string }> {
    const city = normalizeText(input.city);
    const keyword = normalizeKeyword(input.keyword);
    const market = { id: id(idFactory), city, keyword, timezone: "Asia/Shanghai" };
    await this.db.prepare("INSERT INTO markets (id, city, keyword, display_name, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?) ON CONFLICT DO NOTHING")
      .bind(market.id, city, keyword, keyword ? `${city} · ${keyword}` : city, market.timezone, now, now).run();
    return (await this.db.prepare("SELECT id, city, keyword, timezone FROM markets WHERE city = ? AND COALESCE(keyword, '') = COALESCE(?, '') LIMIT 1").bind(city, keyword).first<{ id: string; city: string; keyword: string | null; timezone: string }>())!;
  }

  async createBatch(input: BatchInput, now: Date, idFactory?: () => string): Promise<{ batch: BatchView; tasks: TaskView[] }> {
    const nowText = now.toISOString();
    const market = await this.resolveMarket(input, nowText, idFactory);
    const batchId = id(idFactory);
    const orderedPlatforms = ["ctrip", "meituan", "fliggy", "tongcheng"].filter((platform) => input.platforms.includes(platform as BatchInput["platforms"][number])) as BatchInput["platforms"];
    const offsets = [...input.day_offsets].sort((a, b) => a - b);
    const baseDate = dateAtMarket(now, market.timezone);
    const batch: BatchView = {
      id: batchId,
      market_id: market.id,
      city: market.city,
      keyword: market.keyword,
      timezone: market.timezone,
      platforms: orderedPlatforms,
      day_offsets: offsets,
      target_hotels: input.target_hotels,
      execution_mode: "immediate",
      status: "queued",
      created_at: nowText,
    };
    const tasks: TaskView[] = [];
    let sequence = 1;
    const statements = [this.db.prepare("INSERT INTO collection_batches (id, origin, market_id, selected_platforms, selected_offsets, target_hotels, execution_mode, status, created_at, updated_at) VALUES (?, 'user', ?, ?, ?, ?, 'immediate', 'queued', ?, ?)")
      .bind(batch.id, market.id, JSON.stringify(orderedPlatforms), JSON.stringify(offsets), input.target_hotels, nowText, nowText)];
    for (const offset of offsets) {
      for (const platform of orderedPlatforms) {
        const task: TaskView = {
          id: id(idFactory), batch_id: batch.id, market_id: market.id, platform,
          check_in: addDays(baseDate, offset), check_out: addDays(baseDate, offset + 1),
          target_hotels: input.target_hotels, priority: 0, sequence, status: "queued", attempt_count: 0, next_eligible_at: null,
        };
        tasks.push(task);
        statements.push(this.db.prepare("INSERT INTO collection_tasks (id, batch_id, market_id, platform, check_in, check_out, target_hotels, priority, sequence, status, attempt_count, next_eligible_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, NULL, ?, ?)")
          .bind(task.id, task.batch_id, task.market_id, task.platform, task.check_in, task.check_out, task.target_hotels, task.priority, task.sequence, nowText, nowText));
        sequence += 1;
      }
    }
    await this.db.batch(statements);
    return { batch, tasks };
  }

  async findCandidate(deviceId: string, now: string): Promise<CandidateRow | null> {
    return this.db.prepare(`SELECT t.id, t.market_id, t.platform, t.check_in, t.check_out, t.target_hotels, t.attempt_count
      FROM collection_tasks t INNER JOIN collection_batches b ON b.id = t.batch_id
      WHERE t.status IN ('queued', 'retry_wait')
        AND (t.next_eligible_at IS NULL OR t.next_eligible_at <= ?)
        AND t.attempt_count < 3
        AND b.status IN ('queued', 'running')
        AND NOT EXISTS (SELECT 1 FROM task_attempts a WHERE a.task_id = t.id AND a.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM task_attempts a WHERE a.device_id = ? AND a.status = 'active')
      ORDER BY t.priority DESC, b.created_at ASC, t.sequence ASC, t.id ASC LIMIT 1`).bind(now, deviceId).first<CandidateRow>();
  }

  async activeAttemptForDevice(deviceId: string): Promise<{ id: string; task_id: string } | null> {
    return this.db.prepare("SELECT id, task_id FROM task_attempts WHERE device_id = ? AND status = 'active' LIMIT 1").bind(deviceId).first<{ id: string; task_id: string }>();
  }

  async currentTask(deviceId: string): Promise<ClaimView | null> {
    const row = await this.db.prepare(`SELECT t.id AS task_id, a.id AS attempt_id, a.attempt_number, a.lease_expires_at,
      t.market_id, m.city, m.keyword, m.timezone, t.platform, t.check_in, t.check_out, t.target_hotels
      FROM task_attempts a JOIN collection_tasks t ON t.id = a.task_id
      JOIN markets m ON m.id = t.market_id
      WHERE a.device_id = ? AND a.status = 'active' LIMIT 1`).bind(deviceId).first<ClaimView>();
    return row ?? null;
  }

  async claim(candidate: CandidateRow, deviceId: string, now: string, leaseExpires: string, attemptId: string): Promise<ClaimView | null> {
    const results = await this.db.batch([
      this.db.prepare(`UPDATE collection_tasks SET status = 'leased', attempt_count = attempt_count + 1, updated_at = ?
        WHERE id = ? AND status IN ('queued', 'retry_wait')
          AND (next_eligible_at IS NULL OR next_eligible_at <= ?)
          AND attempt_count < 3
          AND NOT EXISTS (SELECT 1 FROM task_attempts WHERE task_id = collection_tasks.id AND status = 'active')`).bind(now, candidate.id, now),
      this.db.prepare(`INSERT INTO task_attempts (id, task_id, device_id, attempt_number, status, claimed_at, lease_expires_at, upload_idempotency_key)
        SELECT ?, id, ?, attempt_count, 'active', ?, ?, ? FROM collection_tasks
        WHERE id = ? AND status = 'leased' AND NOT EXISTS (SELECT 1 FROM task_attempts WHERE task_id = collection_tasks.id AND status = 'active')`).bind(attemptId, deviceId, now, leaseExpires, `claim:${attemptId}`, candidate.id),
    ]);
    const inserted = Number((results[1].meta as { changes?: number } | undefined)?.changes ?? 0);
    if (inserted !== 1) return null;
    const row = await this.db.prepare(`SELECT t.id AS task_id, a.id AS attempt_id, a.attempt_number, a.lease_expires_at,
      t.market_id, m.city, m.keyword, m.timezone, t.platform, t.check_in, t.check_out, t.target_hotels
      FROM collection_tasks t JOIN task_attempts a ON a.task_id = t.id
      JOIN markets m ON m.id = t.market_id
      WHERE a.id = ?`).bind(attemptId).first<ClaimRow>();
    return row ?? null;
  }

  async expireOverdue(now: string): Promise<void> {
    const overdue = await this.db.prepare(`SELECT a.id, a.task_id, a.attempt_number
      FROM task_attempts a WHERE a.status = 'active' AND a.lease_expires_at <= ?`).bind(now).all<{ id: string; task_id: string; attempt_number: number }>();
    for (const attempt of overdue.results) {
      const nextStatus = attempt.attempt_number >= 3 ? "failed" : attempt.attempt_number === 2 ? "retry_wait" : "queued";
      const nextTime = attempt.attempt_number === 2 ? new Date(new Date(now).getTime() + 60_000).toISOString() : null;
      await this.db.batch([
        this.db.prepare("UPDATE task_attempts SET status = 'expired', finished_at = ? WHERE id = ? AND status = 'active'").bind(now, attempt.id),
        this.db.prepare("UPDATE collection_tasks SET status = ?, next_eligible_at = ?, updated_at = ? WHERE id = ? AND status = 'leased'").bind(nextStatus, nextTime, now, attempt.task_id),
      ]);
    }
  }

  async findOwnedAttempt(taskId: string, attemptId: string, deviceId: string): Promise<{ id: string; task_id: string; attempt_number: number; lease_expires_at: string; status: string } | null> {
    return this.db.prepare("SELECT id, task_id, attempt_number, lease_expires_at, status FROM task_attempts WHERE id = ? AND task_id = ? AND device_id = ? LIMIT 1").bind(attemptId, taskId, deviceId).first();
  }

  async fail(attempt: { id: string; task_id: string; attempt_number: number }, code: FailureCode, now: string, retryable: boolean): Promise<void> {
    const nextStatus = !retryable || attempt.attempt_number >= 3 ? "failed" : attempt.attempt_number === 2 ? "retry_wait" : "queued";
    const nextTime = retryable && attempt.attempt_number === 2 ? new Date(new Date(now).getTime() + 60_000).toISOString() : null;
    await this.db.batch([
      this.db.prepare("UPDATE task_attempts SET status = 'failed', finished_at = ?, failure_code = ? WHERE id = ? AND status = 'active'").bind(now, code, attempt.id),
      this.db.prepare("UPDATE collection_tasks SET status = ?, next_eligible_at = ?, updated_at = ? WHERE id = ? AND status = 'leased'").bind(nextStatus, nextTime, now, attempt.task_id),
    ]);
  }

  async progress(attemptId: string, input: ProgressInput, now: string): Promise<void> {
    await this.db.prepare("UPDATE task_attempts SET progress_stage = ?, progress_current = ?, progress_target = ?, progress_updated_at = ? WHERE id = ? AND status = 'active'")
      .bind(input.stage, input.progress_current, input.progress_target, now, attemptId).run();
  }
}
