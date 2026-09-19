import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type { DeviceMetadata, DeviceMetadataPatch, DeviceView, AuthenticatedDevice } from "./deviceTypes";

interface DeviceRow extends DeviceView {
  credential_status?: "active" | "revoked";
}

function view(row: DeviceRow): DeviceView {
  return {
    id: row.id,
    device_id: row.device_id,
    name: row.name,
    status: row.status,
    collector_version: row.collector_version,
    protocol_version: row.protocol_version,
    os: row.os,
    arch: row.arch,
    browser: row.browser,
    browser_version: row.browser_version,
    first_seen_at: row.first_seen_at,
    last_heartbeat_at: row.last_heartbeat_at,
    authorized_at: row.authorized_at,
    revoked_at: row.revoked_at,
  };
}

const select = `
  SELECT d.device_id AS id, d.device_id, d.display_name AS name, d.authorization_state AS status,
    d.collector_version, COALESCE(d.protocol_version, c.protocol_version) AS protocol_version,
    d.os, d.arch, d.browser, d.browser_version,
    d.created_at AS first_seen_at, d.last_heartbeat_at,
    d.authorized_at, d.revoked_at
  FROM devices d
  LEFT JOIN device_capabilities c ON c.device_id = d.device_id
`;

export class DeviceRepository {
  constructor(private readonly db: D1Database) {}

  async findById(deviceId: string): Promise<DeviceView | null> {
    const row = await this.db.prepare(`${select} WHERE d.device_id = ?`).bind(deviceId).first<DeviceRow>();
    return row ? view(row) : null;
  }

  async findByCredentialHash(hash: string): Promise<AuthenticatedDevice | null> {
    const row = await this.db.prepare(`
      SELECT d.device_id AS id, d.device_id, d.display_name AS name, d.authorization_state AS status,
        d.collector_version, COALESCE(d.protocol_version, c.protocol_version) AS protocol_version,
        d.os, d.arch, d.browser, d.browser_version,
        d.created_at AS first_seen_at, d.last_heartbeat_at,
        d.authorized_at, d.revoked_at, dc.status AS credential_status
      FROM devices d
      LEFT JOIN device_capabilities c ON c.device_id = d.device_id
      INNER JOIN device_credentials dc ON dc.device_id = d.device_id
      WHERE dc.credential_hash = ?
      ORDER BY CASE WHEN dc.status = 'active' THEN 0 ELSE 1 END, dc.created_at DESC
      LIMIT 1
    `).bind(hash).first<DeviceRow>();
    if (!row) return null;
    return { ...view(row), credential_status: row.credential_status! };
  }

  async list(): Promise<DeviceView[]> {
    const result = await this.db.prepare(`${select} ORDER BY d.created_at, d.device_id`).all<DeviceRow>();
    return result.results.map(view);
  }

  async create(input: DeviceMetadata, credentialHash: string, now: string): Promise<void> {
    const deviceId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO devices
        (device_id, display_name, authorization_state, created_at, updated_at,
         collector_version, protocol_version, os, arch, browser, browser_version)
        VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(input.device_id, input.name ?? null, now, now, input.collector_version,
          input.protocol_version, input.os, input.arch, input.browser, input.browser_version),
      this.db.prepare(`INSERT INTO device_capabilities
        (device_id, collector_version, supported_platforms, updated_at, protocol_version)
        VALUES (?, ?, '[]', ?, ?)`)
        .bind(input.device_id, input.collector_version, now, input.protocol_version),
      this.db.prepare(`INSERT INTO device_credentials
        (id, device_id, credential_hash, status, created_at)
        VALUES (?, ?, ?, 'active', ?)`)
        .bind(deviceId, input.device_id, credentialHash, now),
    ];
    await this.db.batch(statements);
  }

  async updateMetadata(deviceId: string, patch: DeviceMetadataPatch, now: string): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const deviceFields = ["name", "collector_version", "os", "arch", "browser", "browser_version"] as const;
    const columns = { name: "display_name", collector_version: "collector_version", os: "os", arch: "arch", browser: "browser", browser_version: "browser_version" } as const;
    for (const field of deviceFields) {
      if (patch[field] !== undefined) {
        fields.push(`${columns[field]} = ?`);
        values.push(patch[field]);
      }
    }
    if (fields.length > 0) {
      fields.push("updated_at = ?");
      values.push(now, deviceId);
      await this.db.prepare(`UPDATE devices SET ${fields.join(", ")} WHERE device_id = ?`).bind(...values).run();
    }

    const capabilityFields: string[] = [];
    const capabilityValues: unknown[] = [];
    if (patch.collector_version !== undefined) {
      capabilityFields.push("collector_version = ?");
      capabilityValues.push(patch.collector_version);
    }
    if (patch.protocol_version !== undefined) {
      capabilityFields.push("protocol_version = ?");
      capabilityValues.push(patch.protocol_version);
    }
    if (capabilityFields.length > 0) {
      capabilityFields.push("updated_at = ?");
      capabilityValues.push(now, deviceId);
      await this.db.prepare(`UPDATE device_capabilities SET ${capabilityFields.join(", ")} WHERE device_id = ?`).bind(...capabilityValues).run();
    }
  }

  async heartbeat(deviceId: string, patch: DeviceMetadataPatch, now: string): Promise<void> {
    await this.updateMetadata(deviceId, patch, now);
    await this.db.prepare("UPDATE devices SET last_heartbeat_at = ?, updated_at = ? WHERE device_id = ?")
      .bind(now, now, deviceId).run();
  }

  async authorize(deviceId: string, actor: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`UPDATE devices SET authorization_state = 'authorized', authorized_at = COALESCE(authorized_at, ?), authorized_by = COALESCE(authorized_by, ?), updated_at = ? WHERE device_id = ?`)
        .bind(now, actor, now, deviceId),
      this.db.prepare(`INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, metadata, outcome, created_at)
        VALUES (?, 'user', ?, 'device.authorize', 'device', ?, ?, 'success', ?)`)
        .bind(crypto.randomUUID(), actor, deviceId, JSON.stringify({ actor: "access_user", authorization_state: "authorized" }), now),
    ]);
  }

  async revoke(deviceId: string, actor: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare(`UPDATE devices SET authorization_state = 'revoked', revoked_at = COALESCE(revoked_at, ?), revoked_by = COALESCE(revoked_by, ?), updated_at = ? WHERE device_id = ?`)
        .bind(now, actor, now, deviceId),
      this.db.prepare("UPDATE device_credentials SET status = 'revoked', revoked_at = COALESCE(revoked_at, ?) WHERE device_id = ? AND status = 'active'")
        .bind(now, deviceId),
      this.db.prepare(`INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, metadata, outcome, created_at)
        VALUES (?, 'user', ?, 'device.revoke', 'device', ?, ?, 'success', ?)`)
        .bind(crypto.randomUUID(), actor, deviceId, JSON.stringify({ actor: "access_user", authorization_state: "revoked" }), now),
    ]);
  }
}
