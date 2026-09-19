import type { Env, AccessIdentity } from "./env";
import { DeviceRepository } from "./deviceRepository";
import { generateCredential, hashCredential } from "./credential";
import type { DeviceMetadata, DeviceMetadataPatch, DeviceView } from "./deviceTypes";
import { HttpError } from "./response";

function repository(env: Env): DeviceRepository {
  if (!env.DB) throw new HttpError(500, "INTERNAL_ERROR", "Database unavailable");
  return new DeviceRepository(env.DB);
}

function now(): string {
  return new Date().toISOString();
}

export async function register(env: Env, input: DeviceMetadata): Promise<{ device: DeviceView; credential?: string; created: boolean }> {
  const repo = repository(env);
  const existing = await repo.findById(input.device_id);
  if (existing) {
    await repo.updateMetadata(input.device_id, input, now());
    return { device: (await repo.findById(input.device_id))!, created: false };
  }

  const credential = await generateCredential();
  try {
    await repo.create(input, await hashCredential(credential), now());
  } catch {
    // A concurrent first registration wins; retrying it must not mint another credential.
    const raced = await repo.findById(input.device_id);
    if (!raced) throw new HttpError(500, "INTERNAL_ERROR", "Registration failed");
    await repo.updateMetadata(input.device_id, input, now());
    return { device: (await repo.findById(input.device_id))!, created: false };
  }
  return { device: (await repo.findById(input.device_id))!, credential, created: true };
}

export async function heartbeat(env: Env, deviceId: string, patch: DeviceMetadataPatch): Promise<DeviceView> {
  const repo = repository(env);
  await repo.heartbeat(deviceId, patch, now());
  return (await repo.findById(deviceId))!;
}

export async function listDevices(env: Env): Promise<DeviceView[]> {
  return repository(env).list();
}

export async function getDevice(env: Env, deviceId: string): Promise<DeviceView> {
  const device = await repository(env).findById(deviceId);
  if (!device) throw new HttpError(404, "NOT_FOUND", "Device not found");
  return device;
}

export async function authorizeDevice(env: Env, deviceId: string, actor: AccessIdentity): Promise<DeviceView> {
  const repo = repository(env);
  const device = await repo.findById(deviceId);
  if (!device) throw new HttpError(404, "NOT_FOUND", "Device not found");
  if (device.status === "revoked") throw new HttpError(409, "CONFLICT", "Revoked device cannot be reauthorized");
  if (device.status === "pending") await repo.authorize(deviceId, actor.subject, now());
  return (await repo.findById(deviceId))!;
}

export async function revokeDevice(env: Env, deviceId: string, actor: AccessIdentity): Promise<DeviceView> {
  const repo = repository(env);
  const device = await repo.findById(deviceId);
  if (!device) throw new HttpError(404, "NOT_FOUND", "Device not found");
  if (device.status !== "revoked") await repo.revoke(deviceId, actor.subject, now());
  return (await repo.findById(deviceId))!;
}
