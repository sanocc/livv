import type { AccessIdentity } from "./env";
import { HttpError } from "./response";

const rank = { viewer: 1, manager: 2, admin: 3, owner: 4 } as const;

export function can(role: AccessIdentity["role"], minimum: AccessIdentity["role"]): boolean {
  return rank[role] >= rank[minimum];
}

export function requireRole(identity: AccessIdentity | undefined, minimum: AccessIdentity["role"]): AccessIdentity {
  if (!identity) throw new HttpError(401, "AUTH_REQUIRED", "Access identity required");
  if (!can(identity.role, minimum)) throw new HttpError(403, "FORBIDDEN", "Insufficient role");
  return identity;
}
