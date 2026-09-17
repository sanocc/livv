import type { AppContext, InternalIdentity } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

export function getInternalIdentity(ctx: AppContext): InternalIdentity {
  const secret = ctx.request.headers.get("x-livv-internal-scheduler-secret");
  if (!ctx.env.INTERNAL_SCHEDULER_SECRET || secret !== ctx.env.INTERNAL_SCHEDULER_SECRET) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Internal authentication required", 401);
  }
  return { type: "internal", name: "scheduler" };
}
