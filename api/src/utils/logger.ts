import type { AppContext } from "../env";
import { AppError } from "../errors/app-error";

export function logRequest(ctx: AppContext, status: number, error?: unknown): void {
  const url = new URL(ctx.request.url);
  const entry: Record<string, unknown> = {
    request_id: ctx.requestId,
    method: ctx.request.method,
    path: url.pathname,
    status,
    duration_ms: Date.now() - ctx.startedAt
  };

  if (error instanceof AppError) {
    entry.error_code = error.code;
    if (error.stage) entry.stage = error.stage;
  }

  console.log(JSON.stringify(entry));
}
