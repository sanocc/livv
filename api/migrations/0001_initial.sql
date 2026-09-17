PRAGMA foreign_keys = ON;

-- M01 local migration draft. Timestamps are UTC ISO-8601 text.

CREATE TABLE livv_users (
  sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_livv_users_email ON livv_users(email);

CREATE TABLE markets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  keyword TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_markets_city_keyword_name ON markets(city, keyword, name);
CREATE INDEX ix_markets_status_city ON markets(status, city);

CREATE TABLE market_platform_contexts (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  city_context TEXT,
  search_context TEXT,
  navigation_metadata_json TEXT,
  last_verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE UNIQUE INDEX ux_market_platform_contexts_market_platform
  ON market_platform_contexts(market_id, platform);
CREATE INDEX ix_market_platform_contexts_platform_status
  ON market_platform_contexts(platform, status);

CREATE TABLE hotels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  brand TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX ix_hotels_city_name ON hotels(city, name);
CREATE INDEX ix_hotels_status ON hotels(status);

CREATE TABLE platform_hotels (
  id TEXT PRIMARY KEY,
  market_id TEXT,
  platform TEXT NOT NULL,
  platform_hotel_id TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  brand TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE UNIQUE INDEX ux_platform_hotels_platform_external_id
  ON platform_hotels(platform, platform_hotel_id);
CREATE INDEX ix_platform_hotels_market_platform
  ON platform_hotels(market_id, platform);
CREATE INDEX ix_platform_hotels_name_city
  ON platform_hotels(hotel_name, city);

CREATE TABLE hotel_mappings (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL,
  platform_hotel_row_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence_json TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (hotel_id) REFERENCES hotels(id),
  FOREIGN KEY (platform_hotel_row_id) REFERENCES platform_hotels(id),
  FOREIGN KEY (confirmed_by) REFERENCES livv_users(sub)
);

CREATE INDEX ix_hotel_mappings_hotel_status
  ON hotel_mappings(hotel_id, status);
CREATE INDEX ix_hotel_mappings_platform_hotel_status
  ON hotel_mappings(platform_hotel_row_id, status);
CREATE UNIQUE INDEX ux_hotel_mappings_confirmed_platform_hotel
  ON hotel_mappings(platform_hotel_row_id)
  WHERE status = 'confirmed';
CREATE UNIQUE INDEX ux_hotel_mappings_confirmed_primary_per_platform
  ON hotel_mappings(hotel_id, platform)
  WHERE status = 'confirmed' AND is_primary = 1;

CREATE TABLE competitor_roles (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  hotel_id TEXT NOT NULL,
  role TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES markets(id),
  FOREIGN KEY (hotel_id) REFERENCES hotels(id),
  FOREIGN KEY (confirmed_by) REFERENCES livv_users(sub)
);

CREATE UNIQUE INDEX ux_competitor_roles_market_hotel
  ON competitor_roles(market_id, hotel_id);
CREATE INDEX ix_competitor_roles_market_role
  ON competitor_roles(market_id, role);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  collector_version TEXT,
  protocol_version TEXT,
  os TEXT,
  arch TEXT,
  browser TEXT,
  browser_version TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT,
  authorized_at TEXT,
  authorized_by TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  current_state TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (authorized_by) REFERENCES livv_users(sub),
  FOREIGN KEY (revoked_by) REFERENCES livv_users(sub)
);

CREATE UNIQUE INDEX ux_devices_device_id ON devices(device_id);
CREATE INDEX ix_devices_status_last_seen ON devices(status, last_seen_at);

CREATE TABLE device_credentials (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE UNIQUE INDEX ux_device_credentials_hash
  ON device_credentials(credential_hash);
CREATE INDEX ix_device_credentials_device_active
  ON device_credentials(device_id, revoked_at, expires_at);

CREATE TABLE device_capabilities (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  rank_monitor INTEGER NOT NULL DEFAULT 0,
  market_discovery INTEGER NOT NULL DEFAULT 0,
  core_detail INTEGER NOT NULL DEFAULT 0,
  navigation_ready INTEGER NOT NULL DEFAULT 0,
  last_reported_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE UNIQUE INDEX ux_device_capabilities_device_platform
  ON device_capabilities(device_id, platform);
CREATE INDEX ix_device_capabilities_platform_ready
  ON device_capabilities(platform, navigation_ready);

CREATE TABLE device_navigation_contexts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  city TEXT,
  keyword TEXT,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  safe_metadata_json TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE UNIQUE INDEX ux_device_navigation_contexts_scope
  ON device_navigation_contexts(device_id, market_id, platform, business_date);
CREATE INDEX ix_device_navigation_contexts_market_platform_status
  ON device_navigation_contexts(market_id, platform, status);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  date_offset_start INTEGER NOT NULL DEFAULT 0,
  date_offset_end INTEGER NOT NULL DEFAULT 14,
  strategy TEXT NOT NULL,
  task_type TEXT NOT NULL,
  assigned_device_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (market_id) REFERENCES markets(id),
  FOREIGN KEY (assigned_device_id) REFERENCES devices(id),
  FOREIGN KEY (created_by) REFERENCES livv_users(sub)
);

CREATE INDEX ix_plans_market_status ON plans(market_id, status);
CREATE INDEX ix_plans_assigned_device ON plans(assigned_device_id);

CREATE TABLE plan_platforms (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE UNIQUE INDEX ux_plan_platforms_plan_platform
  ON plan_platforms(plan_id, platform);
CREATE INDEX ix_plan_platforms_platform_enabled
  ON plan_platforms(platform, enabled);

CREATE TABLE task_units (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  plan_id TEXT,
  market_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  task_type TEXT NOT NULL,
  business_date TEXT NOT NULL,
  day_offset INTEGER NOT NULL,
  time_window TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  earliest_run_at TEXT NOT NULL,
  latest_run_at TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  assigned_device_id TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  retry_of_unit_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  FOREIGN KEY (market_id) REFERENCES markets(id),
  FOREIGN KEY (assigned_device_id) REFERENCES devices(id),
  FOREIGN KEY (retry_of_unit_id) REFERENCES task_units(id)
);

CREATE UNIQUE INDEX ux_task_units_idempotency_key
  ON task_units(idempotency_key);
CREATE INDEX ix_task_units_claim_queue
  ON task_units(status, platform, earliest_run_at, latest_run_at, priority);
CREATE INDEX ix_task_units_market_business_date
  ON task_units(market_id, business_date, task_type);
CREATE INDEX ix_task_units_assigned_device_status
  ON task_units(assigned_device_id, status);

CREATE TABLE task_attempts (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  lease_expires_at TEXT NOT NULL,
  progress_stage TEXT,
  progress_value REAL,
  error_code TEXT,
  error_stage TEXT,
  safe_message TEXT,
  retryable INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES task_units(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE UNIQUE INDEX ux_task_attempts_unit_attempt_no
  ON task_attempts(unit_id, attempt_no);
CREATE UNIQUE INDEX ux_task_attempts_run_id
  ON task_attempts(run_id);
CREATE INDEX ix_task_attempts_device_active
  ON task_attempts(device_id, status, lease_expires_at);
CREATE INDEX ix_task_attempts_unit_status
  ON task_attempts(unit_id, status);

CREATE TABLE upload_receipts (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES task_attempts(id)
);

CREATE UNIQUE INDEX ux_upload_receipts_attempt_payload
  ON upload_receipts(attempt_id, payload_hash);
CREATE UNIQUE INDEX ux_upload_receipts_receipt
  ON upload_receipts(receipt_id);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  task_attempt_id TEXT,
  upload_receipt_id TEXT,
  platform TEXT NOT NULL,
  task_type TEXT NOT NULL,
  market_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  quality TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  policy_version TEXT NOT NULL,
  collector_version TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id),
  FOREIGN KEY (upload_receipt_id) REFERENCES upload_receipts(id),
  FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE UNIQUE INDEX ux_collections_idempotency_key
  ON collections(idempotency_key);
CREATE INDEX ix_collections_market_business_date
  ON collections(market_id, business_date, platform, task_type);
CREATE INDEX ix_collections_device_created
  ON collections(device_id, created_at);
CREATE INDEX ix_collections_attempt
  ON collections(task_attempt_id);

CREATE TABLE price_facts (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  platform_hotel_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  rank_position INTEGER,
  display_price REAL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  availability TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id),
  FOREIGN KEY (market_id) REFERENCES markets(id),
  FOREIGN KEY (platform_hotel_id) REFERENCES platform_hotels(id)
);

CREATE INDEX ix_price_facts_market_date_price
  ON price_facts(market_id, business_date, check_in, availability, display_price);
CREATE INDEX ix_price_facts_platform_hotel_date
  ON price_facts(platform_hotel_id, business_date, check_in, collected_at);
CREATE INDEX ix_price_facts_collection
  ON price_facts(collection_id);

CREATE TABLE room_facts (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  platform_hotel_id TEXT NOT NULL,
  room_key TEXT,
  room_name TEXT NOT NULL,
  room_order INTEGER NOT NULL,
  availability TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id),
  FOREIGN KEY (platform_hotel_id) REFERENCES platform_hotels(id)
);

CREATE INDEX ix_room_facts_collection_order
  ON room_facts(collection_id, room_order);
CREATE INDEX ix_room_facts_platform_hotel
  ON room_facts(platform_hotel_id, collected_at);

CREATE TABLE rate_facts (
  id TEXT PRIMARY KEY,
  room_fact_id TEXT NOT NULL,
  price REAL,
  reference_price REAL,
  breakfast_count INTEGER,
  breakfast_text TEXT,
  cancellation_text TEXT,
  inventory_text TEXT,
  supplier_text TEXT,
  availability TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  FOREIGN KEY (room_fact_id) REFERENCES room_facts(id)
);

CREATE INDEX ix_rate_facts_room_price
  ON rate_facts(room_fact_id, availability, price);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_audit_events_target_created
  ON audit_events(target_type, target_id, created_at);
CREATE INDEX ix_audit_events_actor_created
  ON audit_events(actor_type, actor_id, created_at);
