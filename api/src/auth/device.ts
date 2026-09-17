import type { AppContext, DeviceIdentity } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";
import { DeviceRepository } from "../repositories/devices";
import { sha256Hex } from "../utils/hash";

export async function getDeviceIdentity(ctx: AppContext): Promise<DeviceIdentity> {
  const deviceId = ctx.request.headers.get("x-livv-device-id");
  const credential = ctx.request.headers.get("x-livv-device-credential");

  if (!deviceId || !credential) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Device credential required", 401);
  }

  const credentialHash = await sha256Hex(credential);
  const device = await new DeviceRepository(ctx.env.DB).findByCredentialHash(credentialHash);

  if (!device || device.device_id !== deviceId) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Invalid device credential", 401);
  }

  return {
    type: "device",
    deviceRowId: device.id,
    deviceId: device.device_id,
    status: device.status
  };
}
