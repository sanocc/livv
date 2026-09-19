export type ErrorCode = "NOT_FOUND" | "INTERNAL_ERROR";

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
