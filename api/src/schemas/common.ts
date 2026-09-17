import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

export function assertNoUnknownKeys(body: Record<string, unknown>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, "Unknown fields are not allowed", 400, {
      details: { fields: unknown }
    });
  }
}

export function requiredString(body: Record<string, unknown>, key: string, options?: { max?: number }): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, `${key} is required`, 400);
  }
  const trimmed = value.trim();
  if (options?.max && trimmed.length > options.max) {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, `${key} is too long`, 400);
  }
  return trimmed;
}

export function optionalString(body: Record<string, unknown>, key: string, options?: { max?: number }): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, `${key} must be a string`, 400);
  }
  const trimmed = value.trim();
  if (options?.max && trimmed.length > options.max) {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, `${key} is too long`, 400);
  }
  return trimmed;
}

export function parsePage(url: URL): { page: number; pageSize: number } {
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("page_size") ?? "20");
  if (!Number.isInteger(page) || page < 1) {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, "page must be a positive integer", 400);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, "page_size must be between 1 and 100", 400);
  }
  return { page, pageSize };
}
