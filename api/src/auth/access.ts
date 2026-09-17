import type { AccessIdentity, AppContext, Role } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

const roles = new Set<Role>(["owner", "admin", "manager", "viewer"]);

interface LivvUserRow {
  sub: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
}

export async function getAccessIdentity(
  ctx: AppContext
): Promise<AccessIdentity> {
  const accessIdentity = await ctx.executionCtx.access?.getIdentity();

  if (!accessIdentity) {
    throw new AppError(
      ErrorCodes.ACCESS_REQUIRED,
      "Verified Cloudflare Access identity required",
      401
    );
  }

  const userUuid = accessIdentity.user_uuid;
  const email = accessIdentity.email;

  if (!userUuid || !email) {
    throw new AppError(
      ErrorCodes.ACCESS_REQUIRED,
      "Cloudflare Access identity is incomplete",
      401
    );
  }

  const user = await ctx.env.DB.prepare(
    `SELECT sub, email, display_name, role, status
     FROM livv_users
     WHERE sub = ?
     LIMIT 1`
  )
    .bind(userUuid)
    .first<LivvUserRow>();

  if (!user) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "LIVV user is not authorized",
      403
    );
  }

  if (user.status !== "active") {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "LIVV user is inactive",
      403
    );
  }

  if (!roles.has(user.role as Role)) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "Invalid LIVV user role",
      403
    );
  }

  if (user.email.toLowerCase() !== email.toLowerCase()) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "Cloudflare Access identity does not match LIVV user",
      403
    );
  }

  return {
    type: "access_user",
    sub: user.sub,
    email: user.email,
    role: user.role as Role
  };
}
