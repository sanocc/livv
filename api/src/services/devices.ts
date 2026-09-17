import { DeviceRepository } from "../repositories/devices";
import type { RegisterDeviceInput } from "../schemas/devices";
import { newCredential, sha256Hex } from "../utils/hash";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";

export class DeviceService {
  constructor(private readonly devices: DeviceRepository) {}

  async register(input: RegisterDeviceInput) {
    const now = nowIso();
    const existing = await this.devices.findByDeviceId(input.deviceId);

    if (existing) {
      await this.devices.touchRegistration(existing.id, {
        collectorVersion: input.collectorVersion,
        os: input.os,
        arch: input.arch,
        browser: input.browser,
        browserVersion: input.browserVersion,
        now
      });

      return {
        device: sanitizeDevice({ ...existing, last_seen_at: now }),
        credential: null,
        idempotent: true
      };
    }

    const id = newId();
    const credential = newCredential();
    const credentialHash = await sha256Hex(credential);

    await this.devices.createPending({
      id,
      deviceId: input.deviceId,
      ...(input.name ? { name: input.name } : {}),
      collectorVersion: input.collectorVersion,
      protocolVersion: input.protocolVersion,
      os: input.os,
      arch: input.arch,
      browser: input.browser,
      browserVersion: input.browserVersion,
      now
    });
    await this.devices.createCredential(newId(), id, credentialHash, now);

    const created = await this.devices.findByDeviceId(input.deviceId);

    return {
      device: sanitizeDevice(created!),
      credential,
      idempotent: false
    };
  }

  async getOwnDevice(deviceId: string) {
    const device = await this.devices.findByDeviceId(deviceId);
    return device ? sanitizeDevice(device) : null;
  }
}

function sanitizeDevice(device: {
  id: string;
  device_id: string;
  name: string | null;
  status: "pending" | "authorized" | "revoked";
  collector_version: string | null;
  protocol_version: string | null;
  os: string | null;
  arch: string | null;
  browser: string | null;
  browser_version: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
  current_state: string | null;
}) {
  return {
    id: device.id,
    device_id: device.device_id,
    name: device.name,
    status: device.status,
    collector_version: device.collector_version,
    protocol_version: device.protocol_version,
    os: device.os,
    arch: device.arch,
    browser: device.browser,
    browser_version: device.browser_version,
    first_seen_at: device.first_seen_at,
    last_seen_at: device.last_seen_at,
    current_state: device.current_state
  };
}
