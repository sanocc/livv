import type { AccessIdentity, AppContext, Role } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

const roles = new Set<Role>(["owner", "admin", "manager", "viewer"]);

export function getMockAccessIdentity(ctx: AppContext): AccessIdentity {
  const sub = ctx.request.headers.get("x-livv-mock-access-sub");
  const email = ctx.request.headers.get("x-livv-mock-access-email");
  const role = ctx.request.headers.get("x-livv-mock-access-role");

  if (!sub || !email || !role || !roles.has(role as Role)) {
    throw new AppError(ErrorCodes.ACCESS_REQUIRED, "Verified Access identity required", 401);
  }

  return {
    type: "access_user",
    sub,
    email,
    role: role as Role
  };
}
