import type { Env } from "./env";
import { HttpError } from "./response";
import { TaskRepository, normalizeKeyword, normalizeText } from "./taskRepository";
import type { BatchInput, BatchView, ClaimView, FailureCode, ProgressInput, TaskView } from "./taskTypes";

function repo(env: Env): TaskRepository {
  if (!env.DB) throw new HttpError(500, "INTERNAL_ERROR", "Database unavailable");
  return new TaskRepository(env.DB);
}

function current(env: Env): Date {
  return env.clock ? env.clock() : new Date();
}

function nextId(env: Env): string {
  return env.idFactory ? env.idFactory() : crypto.randomUUID();
}

export async function createBatch(env: Env, input: BatchInput): Promise<{ batch: BatchView; tasks: TaskView[] }> {
  const city = normalizeText(input.city);
  const keyword = normalizeKeyword(input.keyword);
  return repo(env).createBatch({ ...input, city, keyword }, current(env), env.idFactory);
}

export async function claimTask(env: Env, deviceId: string): Promise<ClaimView | null> {
  const repository = repo(env);
  const now = current(env);
  const nowText = now.toISOString();
  await repository.expireOverdue(nowText);
  if (await repository.activeAttemptForDevice(deviceId)) {
    throw new HttpError(409, "DEVICE_BUSY", "Device already has an active Task");
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await repository.findCandidate(deviceId, nowText);
    if (!candidate) return null;
    const leaseExpires = new Date(now.getTime() + 10 * 60_000).toISOString();
    try {
      const claimed = await repository.claim(candidate, deviceId, nowText, leaseExpires, nextId(env));
      if (claimed) return claimed;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  return null;
}

export async function currentTask(env: Env, deviceId: string): Promise<ClaimView | null> {
  return repo(env).currentTask(deviceId);
}

function isRetryable(code: FailureCode): boolean {
  return code === "NAVIGATION_FAILED" || code === "ADAPTER_ERROR" || code === "TIMEOUT";
}

async function ownedActiveAttempt(env: Env, taskId: string, attemptId: string, deviceId: string) {
  const attempt = await repo(env).findOwnedAttempt(taskId, attemptId, deviceId);
  if (!attempt) throw new HttpError(409, "TASK_NOT_OWNED", "Task Attempt is not owned by this device");
  if (attempt.status !== "active") throw new HttpError(409, "CONFLICT", "Attempt is not active");
  if (attempt.lease_expires_at <= current(env).toISOString()) throw new HttpError(409, "LEASE_EXPIRED", "Attempt lease has expired");
  return attempt;
}

export async function failTask(env: Env, taskId: string, deviceId: string, attemptId: string, code: FailureCode): Promise<void> {
  const attempt = await ownedActiveAttempt(env, taskId, attemptId, deviceId);
  await repo(env).fail(attempt, code, current(env).toISOString(), isRetryable(code));
}

export async function updateProgress(env: Env, taskId: string, deviceId: string, attemptId: string, input: ProgressInput): Promise<void> {
  await ownedActiveAttempt(env, taskId, attemptId, deviceId);
  await repo(env).progress(attemptId, input, current(env).toISOString());
}
