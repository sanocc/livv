import { first, run } from "./db";

export interface DeviceRow {
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
}

export class DeviceRepository {
  constructor(private readonly db: D1Database) {}

  async findByDeviceId(deviceId: string): Promise<DeviceRow | null> {
    return first<DeviceRow>(this.db, "SELECT * FROM devices WHERE device_id = ?", deviceId);
  }

  async findByCredentialHash(hash: string): Promise<DeviceRow | null> {
    return first<DeviceRow>(
      this.db,
      "SELECT d.* FROM devices d JOIN device_credentials c ON c.device_id = d.id WHERE c.credential_hash = ? AND c.revoked_at IS NULL",
      hash
    );
  }

  async createPending(input: {
    id: string;
    deviceId: string;
    name?: string;
    collectorVersion: string;
    protocolVersion: string;
    os: string;
    arch: string;
    browser: string;
    browserVersion: string;
    now: string;
  }): Promise<void> {
    await run(
      this.db,
      "INSERT INTO devices (id, device_id, name, status, collector_version, protocol_version, os, arch, browser, browser_version, first_seen_at, last_seen_at, current_state, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      input.id,
      input.deviceId,
      input.name ?? null,
      input.collectorVersion,
      input.protocolVersion,
      input.os,
      input.arch,
      input.browser,
      input.browserVersion,
      input.now,
      input.now,
      "registered",
      input.now,
      input.now
    );
  }

  async touchRegistration(deviceRowId: string, input: { collectorVersion: string; os: string; arch: string; browser: string; browserVersion: string; now: string }): Promise<void> {
    await run(
      this.db,
      "UPDATE devices SET collector_version = ?, os = ?, arch = ?, browser = ?, browser_version = ?, last_seen_at = ?, updated_at = ? WHERE id = ?",
      input.collectorVersion,
      input.os,
      input.arch,
      input.browser,
      input.browserVersion,
      input.now,
      input.now,
      deviceRowId
    );
  }

  async createCredential(id: string, deviceRowId: string, credentialHash: string, now: string): Promise<void> {
    await run(
      this.db,
      "INSERT INTO device_credentials (id, device_id, credential_hash, issued_at) VALUES (?, ?, ?, ?)",
      id,
      deviceRowId,
      credentialHash,
      now
    );
  }
}
