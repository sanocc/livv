PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT,
  device_secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disabled', 'revoked')),
  extension_version TEXT,
  platform TEXT,
  browser TEXT,
  os TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  last_seen_at TEXT,
  disabled_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen_at ON devices(last_seen_at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL UNIQUE,
  platform TEXT,
  city TEXT,
  checkin TEXT,
  checkout TEXT,
  keyword TEXT,
  keyword_type TEXT,
  collection_limit INTEGER,
  assigned_device_id TEXT REFERENCES devices(device_id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'running', 'uploading', 'completed', 'failed', 'cancelled')),
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  started_at TEXT,
  collection_completed_at TEXT,
  upload_started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_device ON tasks(assigned_device_id);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  device_id TEXT REFERENCES devices(device_id),
  event_type TEXT NOT NULL,
  stage TEXT,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(task_id),
  device_id TEXT REFERENCES devices(device_id),
  platform TEXT,
  city TEXT,
  checkin TEXT,
  checkout TEXT,
  keyword TEXT,
  target_count INTEGER,
  hotel_count INTEGER,
  started_at TEXT,
  completed_at TEXT,
  uploaded_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_hotels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id TEXT NOT NULL REFERENCES collections(collection_id),
  platform TEXT NOT NULL,
  platform_hotel_id TEXT NOT NULL,
  collection_rank INTEGER NOT NULL,
  hotel_name TEXT,
  is_ad INTEGER,
  score REAL,
  review_count INTEGER,
  room_name TEXT,
  breakfast TEXT,
  cancellation TEXT,
  activity_tags TEXT,
  discount_summary TEXT,
  original_price REAL,
  display_price REAL,
  latest_dynamic TEXT,
  dynamic TEXT,
  UNIQUE(collection_id, platform_hotel_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_hotels_collection ON collection_hotels(collection_id, collection_rank);
