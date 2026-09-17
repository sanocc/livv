import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new AppError(ErrorCodes.BAD_JSON, "Malformed JSON body", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppError(ErrorCodes.INVALID_PAYLOAD, "JSON body must be an object", 400);
  }

  return parsed as Record<string, unknown>;
}
