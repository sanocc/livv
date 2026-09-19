import { HttpError } from "./response";
import { FAILURE_CODES, PLATFORMS, type BatchInput, type FailureCode, type ProgressInput } from "./taskTypes";

const platformSet = new Set<string>(PLATFORMS);
const failureSet = new Set<string>(FAILURE_CODES);

async function objectBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(await request.text());
  } catch {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid JSON object");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_PAYLOAD", "JSON object required");
  }
  return value as Record<string, unknown>;
}

function exactKeys(body: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(body).some((key) => !keys.includes(key))) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Unknown field");
  }
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new HttpError(400, "INVALID_PAYLOAD", `Invalid ${field}`);
  }
  return value;
}

export async function parseBatch(request: Request): Promise<BatchInput> {
  const body = await objectBody(request);
  exactKeys(body, ["city", "keyword", "platforms", "day_offsets", "target_hotels"]);
  const city = nonEmptyString(body.city, "city");
  const keyword = body.keyword === null || body.keyword === undefined
    ? null
    : typeof body.keyword === "string" && body.keyword.trim().length === 0
      ? null
      : nonEmptyString(body.keyword, "keyword");
  if (!Array.isArray(body.platforms) || body.platforms.length < 1 || body.platforms.some((value) => typeof value !== "string" || !platformSet.has(value))) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid platforms");
  }
  const platforms = body.platforms as BatchInput["platforms"];
  if (new Set(platforms).size !== platforms.length) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Duplicate platform");
  }
  if (!Array.isArray(body.day_offsets) || body.day_offsets.length < 1 || body.day_offsets.some((value) => !Number.isInteger(value) || value < 0 || value > 14)) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid day_offsets");
  }
  const day_offsets = body.day_offsets as number[];
  if (new Set(day_offsets).size !== day_offsets.length) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Duplicate day_offset");
  }
  const target_hotels = body.target_hotels === undefined ? 30 : body.target_hotels;
  if (!Number.isInteger(target_hotels) || (target_hotels as number) < 1 || (target_hotels as number) > 200) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid target_hotels");
  }
  return { city, keyword, platforms, day_offsets, target_hotels: target_hotels as number };
}

export async function parseFailure(request: Request): Promise<{ attempt_id: string; failure_code: FailureCode; retryable?: boolean; details?: string }> {
  const body = await objectBody(request);
  exactKeys(body, ["attempt_id", "failure_code", "retryable", "details"]);
  const attempt_id = nonEmptyString(body.attempt_id, "attempt_id");
  if (typeof body.failure_code !== "string" || !failureSet.has(body.failure_code)) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid failure_code");
  }
  if (body.retryable !== undefined && typeof body.retryable !== "boolean") {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid retryable");
  }
  if (body.details !== undefined && (typeof body.details !== "string" || body.details.length > 1000)) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid details");
  }
  return { attempt_id, failure_code: body.failure_code as FailureCode, retryable: body.retryable as boolean | undefined, details: body.details as string | undefined };
}

export async function parseProgress(request: Request): Promise<ProgressInput> {
  const body = await objectBody(request);
  exactKeys(body, ["attempt_id", "stage", "progress_current", "progress_target"]);
  const attempt_id = nonEmptyString(body.attempt_id, "attempt_id");
  const stage = nonEmptyString(body.stage, "stage");
  if (!Number.isInteger(body.progress_current) || (body.progress_current as number) < 0 || !Number.isInteger(body.progress_target) || (body.progress_target as number) <= 0 || (body.progress_current as number) > (body.progress_target as number)) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid progress");
  }
  return { attempt_id, stage, progress_current: body.progress_current as number, progress_target: body.progress_target as number };
}
