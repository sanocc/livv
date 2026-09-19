import type { Env } from "./env";
import { DeviceRepository } from "./deviceRepository";
import type { AuthenticatedDevice } from "./deviceTypes";
import { hashCredential } from "./credential";
import { HttpError } from "./response";

export async function authenticateDevice(request: Request, env: Env): Promise<AuthenticatedDevice> {
  const authorization = request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "AUTH_REQUIRED", "Device credential required");
  }
  const credential = authorization.slice("Bearer ".length).trim();
  if (credential.length === 0 || credential.length > 256) {
    throw new HttpError(401, "AUTH_REQUIRED", "Device credential required");
  }

  const db = env.DB;
  if (!db) throw new HttpError(500, "INTERNAL_ERROR", "Database unavailable");
  const device = await new DeviceRepository(db).findByCredentialHash(await hashCredential(credential));
  if (!device) throw new HttpError(401, "AUTH_REQUIRED", "Invalid device credential");
  if (device.status === "revoked" || device.credential_status === "revoked") {
    throw new HttpError(403, "DEVICE_REVOKED", "Device is revoked");
  }
  return device;
}

export function requireAuthorizedDevice(device: AuthenticatedDevice): void {
  if (device.status === "pending") {
    throw new HttpError(403, "DEVICE_PENDING", "Device is pending authorization");
  }
}
