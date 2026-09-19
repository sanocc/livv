-- M03 device registration and authorization fields.
-- Authorization transitions and credential issuance remain service-layer rules.

ALTER TABLE devices ADD COLUMN collector_version TEXT;
ALTER TABLE devices ADD COLUMN protocol_version TEXT;
ALTER TABLE devices ADD COLUMN os TEXT;
ALTER TABLE devices ADD COLUMN arch TEXT;
ALTER TABLE devices ADD COLUMN browser TEXT;
ALTER TABLE devices ADD COLUMN browser_version TEXT;
ALTER TABLE devices ADD COLUMN authorized_at TEXT;
ALTER TABLE devices ADD COLUMN authorized_by TEXT;
ALTER TABLE devices ADD COLUMN revoked_by TEXT;

ALTER TABLE device_capabilities ADD COLUMN protocol_version TEXT;

CREATE UNIQUE INDEX device_credentials_one_active_uq
  ON device_credentials (device_id)
  WHERE status = 'active';
