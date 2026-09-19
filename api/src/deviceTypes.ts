export interface DeviceMetadata {
  device_id: string;
  name?: string;
  collector_version: string;
  protocol_version: string;
  os: string;
  arch: string;
  browser: string;
  browser_version: string;
}

export interface DeviceMetadataPatch {
  name?: string;
  collector_version?: string;
  protocol_version?: string;
  os?: string;
  arch?: string;
  browser?: string;
  browser_version?: string;
}

export interface DeviceView {
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
  last_heartbeat_at: string | null;
  authorized_at: string | null;
  revoked_at: string | null;
}

export interface AuthenticatedDevice extends DeviceView {
  credential_status: "active" | "revoked";
}
