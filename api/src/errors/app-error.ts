import type { ErrorCode } from "./codes";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown | undefined;
  readonly stage: string | undefined;

  constructor(code: ErrorCode, message: string, status: number, options?: { details?: unknown; stage?: string }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = options?.details;
    this.stage = options?.stage;
  }
}
