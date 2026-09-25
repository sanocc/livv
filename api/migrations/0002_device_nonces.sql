PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS device_nonces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(device_id),
  nonce TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(device_id, nonce)
);
CREATE INDEX IF NOT EXISTS idx_device_nonces_expires_at ON device_nonces(expires_at);
