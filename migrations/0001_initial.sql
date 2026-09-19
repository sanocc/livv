-- LIVV OTA V2 D1 Schema V1
-- Business state transitions and lease expiry handling belong to the service layer.

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  access_subject TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'manager', 'admin', 'owner')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT,
  authorization_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (authorization_state IN ('pending', 'authorized', 'revoked')),
  last_heartbeat_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE device_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  rotated_at TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE RESTRICT
);
CREATE INDEX device_credentials_lookup_idx
  ON device_credentials (device_id, status);

CREATE TABLE device_capabilities (
  device_id TEXT PRIMARY KEY NOT NULL,
  collector_version TEXT NOT NULL,
  supported_platforms TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE RESTRICT
);
CREATE INDEX devices_presence_idx
  ON devices (authorization_state, last_heartbeat_at);

CREATE TABLE markets (
  id TEXT PRIMARY KEY NOT NULL,
  city TEXT NOT NULL CHECK (length(city) > 0),
  keyword TEXT CHECK (keyword IS NULL OR length(keyword) > 0),
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX markets_identity_uq
  ON markets (city, COALESCE(keyword, ''));
CREATE INDEX markets_status_idx ON markets (status);

CREATE TABLE collection_batches (
  id TEXT PRIMARY KEY NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('user', 'manual', 'schedule')),
  market_id TEXT NOT NULL,
  created_by_user_id TEXT,
  selected_platforms TEXT NOT NULL,
  selected_offsets TEXT NOT NULL,
  target_hotels INTEGER NOT NULL CHECK (target_hotels > 0),
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('immediate', 'schedule')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX batches_market_created_idx
  ON collection_batches (market_id, created_at);

CREATE TABLE collection_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ctrip', 'meituan', 'fliggy', 'tongcheng')),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  target_hotels INTEGER NOT NULL CHECK (target_hotels > 0),
  priority INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'leased', 'retry_wait', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_eligible_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (check_out > check_in),
  FOREIGN KEY (batch_id) REFERENCES collection_batches(id) ON DELETE RESTRICT,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE RESTRICT,
  UNIQUE (batch_id, market_id, platform, check_in, check_out),
  UNIQUE (batch_id, sequence)
);

CREATE INDEX tasks_eligible_queue_idx
  ON collection_tasks (status, next_eligible_at, priority, sequence);
CREATE INDEX tasks_batch_date_platform_idx
  ON collection_tasks (batch_id, check_in, platform);
CREATE INDEX tasks_market_date_idx
  ON collection_tasks (market_id, check_in, platform);

CREATE TABLE task_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'active', 'accepted', 'partial', 'failed', 'expired')),
  claimed_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  failure_code TEXT,
  stop_reason TEXT,
  upload_idempotency_key TEXT NOT NULL,
  UNIQUE (task_id, attempt_number),
  UNIQUE (id, upload_idempotency_key),
  UNIQUE (upload_idempotency_key),
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX attempts_device_active_lease_uq
  ON task_attempts (device_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX attempts_task_active_uq
  ON task_attempts (task_id)
  WHERE status = 'active';
CREATE INDEX attempts_task_idx ON task_attempts (task_id, attempt_number);
CREATE INDEX attempts_device_status_idx ON task_attempts (device_id, status);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY NOT NULL,
  market_id TEXT NOT NULL,
  selected_platforms TEXT NOT NULL,
  selected_offsets TEXT NOT NULL,
  target_hotels INTEGER NOT NULL CHECK (target_hotels > 0),
  days_of_week TEXT NOT NULL,
  local_time TEXT NOT NULL,
  timezone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE RESTRICT
);

CREATE INDEX schedules_due_idx ON schedules (enabled, timezone, local_time);

CREATE TABLE schedule_runs (
  id TEXT PRIMARY KEY NOT NULL,
  schedule_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  batch_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('created', 'skipped', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (schedule_id, scheduled_for),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id) REFERENCES collection_batches(id) ON DELETE RESTRICT
);

CREATE INDEX schedule_runs_due_idx
  ON schedule_runs (schedule_id, scheduled_for);

CREATE TABLE collections (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  market_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ctrip', 'meituan', 'fliggy', 'tongcheng')),
  page_type TEXT NOT NULL,
  context_city TEXT NOT NULL,
  context_keyword_state TEXT NOT NULL CHECK (context_keyword_state IN ('verified', 'empty', 'unknown')),
  context_keyword TEXT,
  context_check_in TEXT NOT NULL,
  context_check_out TEXT NOT NULL,
  source_url TEXT NOT NULL,
  stay_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  target_hotels INTEGER NOT NULL CHECK (target_hotels > 0),
  observed_hotels INTEGER NOT NULL CHECK (observed_hotels >= 0),
  quality_status TEXT NOT NULL CHECK (quality_status IN ('complete', 'partial', 'failed')),
  stop_reason TEXT NOT NULL
    CHECK (stop_reason IN ('target_reached', 'list_exhausted', 'no_progress', 'timeout', 'adapter_error')),
  official_id_count INTEGER NOT NULL CHECK (official_id_count >= 0),
  priced_count INTEGER NOT NULL CHECK (priced_count >= 0),
  duplicate_id_count INTEGER NOT NULL CHECK (duplicate_id_count >= 0),
  adapter_version TEXT NOT NULL,
  collector_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  receipt_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE (id, platform),
  FOREIGN KEY (task_id) REFERENCES collection_tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (attempt_id) REFERENCES task_attempts(id) ON DELETE RESTRICT,
  FOREIGN KEY (attempt_id, idempotency_key)
    REFERENCES task_attempts(id, upload_idempotency_key) ON DELETE RESTRICT,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE RESTRICT
);

CREATE INDEX collections_task_idx ON collections (task_id, created_at);
CREATE INDEX collections_attempt_idempotency_idx
  ON collections (attempt_id, idempotency_key);
CREATE INDEX collections_market_platform_stay_idx
  ON collections (market_id, platform, stay_date, observed_at);

CREATE TABLE platform_hotels (
  platform TEXT NOT NULL CHECK (platform IN ('ctrip', 'meituan', 'fliggy', 'tongcheng')),
  platform_hotel_id TEXT NOT NULL,
  latest_hotel_name TEXT,
  latest_source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (platform, platform_hotel_id)
);

CREATE INDEX platform_hotels_platform_idx ON platform_hotels (platform);

CREATE TABLE price_facts (
  id TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_hotel_id TEXT NOT NULL,
  display_position INTEGER NOT NULL CHECK (display_position > 0),
  organic_position INTEGER CHECK (organic_position IS NULL OR organic_position > 0),
  is_ad INTEGER NOT NULL CHECK (is_ad IN (0, 1)),
  display_price REAL,
  reference_price REAL,
  currency TEXT,
  availability TEXT NOT NULL
    CHECK (availability IN ('available', 'sold_out', 'unavailable', 'unknown')),
  room_name TEXT,
  promotion_text TEXT,
  inventory_text TEXT,
  rating REAL,
  review_count INTEGER CHECK (review_count IS NULL OR review_count >= 0),
  source_url TEXT NOT NULL,
  stay_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE RESTRICT,
  FOREIGN KEY (collection_id, platform)
    REFERENCES collections(id, platform) ON DELETE RESTRICT,
  FOREIGN KEY (platform, platform_hotel_id)
    REFERENCES platform_hotels(platform, platform_hotel_id) ON DELETE RESTRICT,
  UNIQUE (collection_id, platform, platform_hotel_id)
);

CREATE INDEX facts_collection_idx ON price_facts (collection_id);
CREATE INDEX facts_platform_hotel_observed_idx
  ON price_facts (platform, platform_hotel_id, observed_at);
CREATE INDEX facts_platform_stay_idx
  ON price_facts (platform, stay_date, observed_at);

CREATE TABLE master_hotels (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE hotel_mappings (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  platform_hotel_id TEXT NOT NULL,
  master_hotel_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'rejected', 'unmapped')),
  evidence TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (platform, platform_hotel_id)
    REFERENCES platform_hotels(platform, platform_hotel_id) ON DELETE RESTRICT,
  FOREIGN KEY (master_hotel_id) REFERENCES master_hotels(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX mappings_confirmed_identity_uq
  ON hotel_mappings (platform, platform_hotel_id)
  WHERE status = 'confirmed';
CREATE INDEX mappings_platform_hotel_idx
  ON hotel_mappings (platform, platform_hotel_id, status);
CREATE INDEX mappings_master_hotel_idx
  ON hotel_mappings (master_hotel_id, status);

CREATE TABLE market_watched_hotels (
  market_id TEXT NOT NULL,
  master_hotel_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('watched', 'not_watched')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (market_id, master_hotel_id),
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE RESTRICT,
  FOREIGN KEY (master_hotel_id) REFERENCES master_hotels(id) ON DELETE RESTRICT
);

CREATE INDEX watched_market_idx ON market_watched_hotels (market_id, status);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'device', 'system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_target_time_idx
  ON audit_events (target_type, target_id, created_at);
