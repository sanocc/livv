import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export function ok(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) }
  });
}

export function fail(error: unknown, requestId: string): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(ErrorCodes.INTERNAL_ERROR, "Internal server error", 500);

  const body: Record<string, unknown> = {
    ok: false,
    error: {
      code: appError.code,
      message: appError.message,
      request_id: requestId
    }
  };

  if (appError.details !== undefined) {
    body.error = { ...(body.error as Record<string, unknown>), details: appError.details };
  }

  return new Response(JSON.stringify(body), {
    status: appError.status,
    headers: jsonHeaders
  });
}
