import type { AppContext, DeviceIdentity } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";
import { CollectionRepository } from "../repositories/collections";
import { DeviceRepository } from "../repositories/devices";
import { parseUploadCollection } from "../schemas/collections";
import { parseRegisterDevice } from "../schemas/devices";
import { CollectionService } from "../services/collections";
import { DeviceService } from "../services/devices";
import { readJsonObject } from "../utils/json";
import { ok } from "../utils/response";

function deviceService(ctx: AppContext): DeviceService {
  return new DeviceService(new DeviceRepository(ctx.env.DB));
}

function collectionService(ctx: AppContext): CollectionService {
  return new CollectionService(new CollectionRepository(ctx.env.DB));
}

export async function registerDevice(ctx: AppContext): Promise<Response> {
  const body = await readJsonObject(ctx.request);
  const input = parseRegisterDevice(body);
  const result = await deviceService(ctx).register(input);
  return ok(result, { status: result.idempotent ? 200 : 201 });
}

export async function getOwnDevice(ctx: AppContext): Promise<Response> {
  const identity = ctx.identity as DeviceIdentity;
  const device = await deviceService(ctx).getOwnDevice(identity.deviceId);
  return ok({ device });
}

export async function heartbeat(ctx: AppContext): Promise<Response> {
  const identity = ctx.identity as DeviceIdentity;
  const body = await readJsonObject(ctx.request).catch(() => ({} as Record<string, unknown>));
  const svc = deviceService(ctx) as DeviceService & {
    heartbeat?: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  };
  if (typeof svc.heartbeat === "function") {
    const device = await svc.heartbeat(identity.deviceId, body);
    return ok({ device });
  }
  const device = await deviceService(ctx).getOwnDevice(identity.deviceId);
  return ok({ device, accepted: true });
}

export async function uploadCollections(ctx: AppContext): Promise<Response> {
  const identity = ctx.identity as DeviceIdentity;
  if (identity.status === "pending") {
    throw new AppError(ErrorCodes.DEVICE_PENDING, "Device is pending approval", 403);
  }
  if (identity.status === "revoked") {
    throw new AppError(ErrorCodes.DEVICE_REVOKED, "Device has been revoked", 403);
  }
  const body = await readJsonObject(ctx.request);
  const input = parseUploadCollection(body);
  const result = await collectionService(ctx).upload(identity, input);
  return ok(result, { status: result.idempotent ? 200 : 201 });
}

export function rejectPendingBusinessWrite(ctx: AppContext): Response {
  const identity = ctx.identity as DeviceIdentity;
  if (identity.status === "pending") {
    throw new AppError(ErrorCodes.DEVICE_PENDING, "Device is pending approval", 403);
  }
  if (identity.status === "revoked") {
    throw new AppError(ErrorCodes.DEVICE_REVOKED, "Device has been revoked", 403);
  }
  throw new AppError(ErrorCodes.NOT_IMPLEMENTED, "This Collector capability is not implemented in M03", 501);
}
