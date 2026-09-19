export type ErrorCode =
  | "AUTH_REQUIRED"
  | "DEVICE_PENDING"
  | "DEVICE_REVOKED"
  | "DEVICE_BUSY"
  | "LEASE_EXPIRED"
  | "TASK_NOT_OWNED"
  | "WRONG_PAGE_TYPE"
  | "NAVIGATION_FAILED"
  | "CONTEXT_MISMATCH"
  | "NO_TASK"
  | "FORBIDDEN"
  | "INVALID_PAYLOAD"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
  request_id: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function requestId(): string {
  return crypto.randomUUID();
}

export function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function envelope<T>(data: T, id: string, status = 200): Response {
  return json({ data, request_id: id }, status);
}

export function errorResponse(error: unknown, id: string): Response {
  const normalized = error instanceof HttpError
    ? error
    : new HttpError(500, "INTERNAL_ERROR", "Internal server error");

  const body: ErrorBody = {
    error: {
      code: normalized.code,
      message: normalized.message,
    },
    request_id: id,
  };

  return json(body, normalized.status);
}
