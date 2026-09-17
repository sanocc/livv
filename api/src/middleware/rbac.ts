import type { Role } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

const rank: Record<Role, number> = {
  viewer: 1,
  manager: 2,
  admin: 3,
  owner: 4
};

export function can(role: Role, minimum: Role): boolean {
  return rank[role] >= rank[minimum];
}

export function requireRole(role: Role, minimum: Role): void {
  if (!can(role, minimum)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Insufficient permission", 403);
  }
}
