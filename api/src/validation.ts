import { HttpError } from "./response";
import type { DeviceMetadata, DeviceMetadataPatch } from "./deviceTypes";

const limits: Record<string, number> = {
  device_id: 128,
  name: 128,
  collector_version: 128,
  protocol_version: 128,
  os: 128,
  arch: 128,
  browser: 128,
  browser_version: 256,
};

async function readObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length === 0 || text.length > 16_384) {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid JSON object");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, "INVALID_PAYLOAD", "Invalid JSON object");
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_PAYLOAD", "JSON object required");
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, field: string, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > limits[field]) {
    throw new HttpError(400, "INVALID_PAYLOAD", `Invalid ${field}`);
  }
  return value;
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new HttpError(400, "INVALID_PAYLOAD", "Unknown field");
    }
  }
}

export async function parseRegistration(request: Request): Promise<DeviceMetadata> {
  const body = await readObject(request);
  const allowed = ["device_id", "name", "collector_version", "protocol_version", "os", "arch", "browser", "browser_version"] as const;
  rejectUnknown(body, allowed);
  return {
    device_id: stringField(body.device_id, "device_id", true)!,
    name: stringField(body.name, "name", false),
    collector_version: stringField(body.collector_version, "collector_version", true)!,
    protocol_version: stringField(body.protocol_version, "protocol_version", true)!,
    os: stringField(body.os, "os", true)!,
    arch: stringField(body.arch, "arch", true)!,
    browser: stringField(body.browser, "browser", true)!,
    browser_version: stringField(body.browser_version, "browser_version", true)!,
  };
}

export async function parseHeartbeat(request: Request): Promise<DeviceMetadataPatch> {
  const body = await readObject(request);
  const allowed = ["name", "collector_version", "protocol_version", "os", "arch", "browser", "browser_version"] as const;
  rejectUnknown(body, allowed);
  const patch: DeviceMetadataPatch = {};
  for (const field of allowed) {
    const value = stringField(body[field], field, false);
    if (value !== undefined) patch[field] = value;
  }
  return patch;
}
