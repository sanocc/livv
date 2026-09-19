import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../../migrations/0001_initial.sql", import.meta.url)),
  "utf8",
);

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(migration);
  return database;
}

function insert(database: DatabaseSync, sql: string, values: SQLInputValue[] = []): void {
  database.prepare(sql).run(...values);
}

function seedMarket(database: DatabaseSync, id: string, keyword: string | null = null): void {
  insert(database,
    "INSERT INTO markets (id, city, keyword, display_name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, `Test City ${id}`, keyword, `Test Market ${id}`, "Asia/Shanghai", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"]);
}

function seedDevice(database: DatabaseSync, id: string): void {
  insert(database,
    "INSERT INTO devices (device_id, display_name, authorization_state, created_at, updated_at) VALUES (?, ?, 'authorized', ?, ?)",
    [id, `Device ${id}`, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"]);
}

function seedTask(database: DatabaseSync, taskId = "task-1", batchId = "batch-1"): void {
  seedMarket(database, "market-1");
  insert(database,
    "INSERT INTO collection_batches (id, origin, market_id, selected_platforms, selected_offsets, target_hotels, execution_mode, created_at, updated_at) VALUES (?, 'user', ?, ?, ?, ?, 'immediate', ?, ?)",
    [batchId, "market-1", '["ctrip"]', '[0]', 30, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"]);
  insert(database,
    "INSERT INTO collection_tasks (id, batch_id, market_id, platform, check_in, check_out, target_hotels, priority, sequence, created_at, updated_at) VALUES (?, ?, ?, 'ctrip', ?, ?, ?, ?, ?, ?, ?)",
    [taskId, batchId, "market-1", "2026-02-01", "2026-02-02", 30, 10, 1, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"]);
}

describe("M02 D1 schema migration", () => {
  it("applies from an empty database and creates every logical entity", () => {
    const database = createDatabase();
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all().map((row) => String(row.name));

    expect(tables).toEqual([
      "audit_events", "collection_batches", "collection_tasks", "collections",
      "device_capabilities", "device_credentials", "devices", "hotel_mappings",
      "market_watched_hotels", "markets", "master_hotels", "platform_hotels",
      "price_facts", "schedule_runs", "schedules", "task_attempts", "users",
    ]);
  });

  it("uses one unique identity for a null Market keyword", () => {
    const database = createDatabase();
    seedMarket(database, "market-1", null);

    expect(() => insert(database,
      "INSERT INTO markets (id, city, keyword, display_name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["market-2", "Test City market-1", null, "Duplicate", "Asia/Shanghai", "now", "now"])).toThrow();
    expect(() => insert(database,
      "INSERT INTO markets (id, city, keyword, display_name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["market-3", "Test City market-1", "", "Duplicate", "Asia/Shanghai", "now", "now"])).toThrow();
  });

  it("does not allow duplicate OTA identities or a Market column on platform_hotels", () => {
    const database = createDatabase();
    insert(database, "INSERT INTO platform_hotels (platform, platform_hotel_id, created_at, updated_at) VALUES ('ctrip', 'ota-1', ?, ?)", ["now", "now"]);

    expect(() => insert(database, "INSERT INTO platform_hotels (platform, platform_hotel_id, created_at, updated_at) VALUES ('ctrip', 'ota-1', ?, ?)", ["now", "now"])).toThrow();
    const columns = database.prepare("PRAGMA table_info(platform_hotels)").all().map((row) => String(row.name));
    expect(columns).not.toContain("market_id");
  });

  it("separates immutable Task order/date data from unique Attempt numbers", () => {
    const database = createDatabase();
    seedTask(database);
    seedDevice(database, "device-1");
    insert(database,
      "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, claimed_at, lease_expires_at, upload_idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["attempt-1", "task-1", "device-1", 1, "2026-01-01T00:00:00Z", "2026-01-01T00:10:00Z", "upload-1"]);

    expect(() => insert(database,
      "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, claimed_at, lease_expires_at, upload_idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["attempt-2", "task-1", "device-1", 1, "2026-01-01T00:00:00Z", "2026-01-01T00:10:00Z", "upload-2"])).toThrow();

    const task = database.prepare("SELECT priority, sequence, check_in, check_out, target_hotels FROM collection_tasks WHERE id = 'task-1'").get();
    expect(task).toMatchObject({ priority: 10, sequence: 1, check_in: "2026-02-01", check_out: "2026-02-02", target_hotels: 30 });
  });

  it("allows at most one active lease per device", () => {
    const database = createDatabase();
    seedTask(database, "task-1", "batch-1");
    insert(database, "INSERT INTO collection_tasks (id, batch_id, market_id, platform, check_in, check_out, target_hotels, priority, sequence, created_at, updated_at) VALUES ('task-2', 'batch-1', 'market-1', 'meituan', '2026-02-01', '2026-02-02', 30, 20, 2, 'now', 'now')");
    seedDevice(database, "device-1");
    insert(database, "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, status, claimed_at, lease_expires_at, upload_idempotency_key) VALUES ('attempt-1', 'task-1', 'device-1', 1, 'active', 'now', 'later', 'upload-1')");

    expect(() => insert(database, "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, status, claimed_at, lease_expires_at, upload_idempotency_key) VALUES ('attempt-2', 'task-2', 'device-1', 1, 'active', 'now', 'later', 'upload-2')")).toThrow();
    insert(database, "UPDATE task_attempts SET status = 'expired' WHERE id = 'attempt-1'");
    insert(database, "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, status, claimed_at, lease_expires_at, upload_idempotency_key) VALUES ('attempt-2', 'task-2', 'device-1', 1, 'active', 'now', 'later', 'upload-2')");
  });

  it("enforces schedule trigger and upload idempotency uniqueness", () => {
    const database = createDatabase();
    seedTask(database);
    insert(database, "INSERT INTO schedules (id, market_id, selected_platforms, selected_offsets, target_hotels, days_of_week, local_time, timezone, created_at, updated_at) VALUES ('schedule-1', 'market-1', '[\"ctrip\"]', '[0]', 30, '[1]', '09:00', 'Asia/Shanghai', 'now', 'now')");
    insert(database, "INSERT INTO schedule_runs (id, schedule_id, scheduled_for, batch_id, outcome, created_at, updated_at) VALUES ('run-1', 'schedule-1', '2026-01-01T09:00:00+08:00', 'batch-1', 'created', 'now', 'now')");
    expect(() => insert(database, "INSERT INTO schedule_runs (id, schedule_id, scheduled_for, batch_id, outcome, created_at, updated_at) VALUES ('run-2', 'schedule-1', '2026-01-01T09:00:00+08:00', 'batch-1', 'created', 'now', 'now')")).toThrow();

    seedDevice(database, "device-1");
    insert(database, "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, claimed_at, lease_expires_at, upload_idempotency_key) VALUES ('attempt-1', 'task-1', 'device-1', 1, 'now', 'later', 'upload-1')");
    insert(database, "INSERT INTO collections (id, task_id, attempt_id, market_id, platform, page_type, context_city, context_keyword_state, context_check_in, context_check_out, source_url, stay_date, observed_at, target_hotels, observed_hotels, quality_status, stop_reason, official_id_count, priced_count, duplicate_id_count, adapter_version, collector_version, idempotency_key, receipt_id, created_at) VALUES ('collection-1', 'task-1', 'attempt-1', 'market-1', 'ctrip', 'hotel_list', 'Test City market-1', 'empty', '2026-02-01', '2026-02-02', 'https://example.test', '2026-02-01', 'now', 30, 13, 'partial', 'no_progress', 13, 13, 0, 'adapter-v1', 'collector-v1', 'upload-1', 'receipt-1', 'now')");
    expect(() => insert(database, "INSERT INTO collections (id, task_id, attempt_id, market_id, platform, page_type, context_city, context_keyword_state, context_check_in, context_check_out, source_url, stay_date, observed_at, target_hotels, observed_hotels, quality_status, stop_reason, official_id_count, priced_count, duplicate_id_count, adapter_version, collector_version, idempotency_key, receipt_id, created_at) SELECT 'collection-2', task_id, attempt_id, market_id, platform, page_type, context_city, context_keyword_state, context_check_in, context_check_out, source_url, stay_date, observed_at, target_hotels, observed_hotels, quality_status, stop_reason, official_id_count, priced_count, duplicate_id_count, adapter_version, collector_version, idempotency_key, 'receipt-2', created_at FROM collections WHERE id = 'collection-1'")).toThrow();
  });

  it("limits confirmed mappings and keeps watched relations unique", () => {
    const database = createDatabase();
    seedMarket(database, "market-1");
    insert(database, "INSERT INTO master_hotels (id, display_name, created_at, updated_at) VALUES ('master-1', 'Master One', 'now', 'now'), ('master-2', 'Master Two', 'now', 'now')");
    insert(database, "INSERT INTO platform_hotels (platform, platform_hotel_id, created_at, updated_at) VALUES ('ctrip', 'ota-1', 'now', 'now')");
    insert(database, "INSERT INTO hotel_mappings (id, platform, platform_hotel_id, master_hotel_id, status, created_at, updated_at) VALUES ('mapping-1', 'ctrip', 'ota-1', 'master-1', 'confirmed', 'now', 'now')");
    expect(() => insert(database, "INSERT INTO hotel_mappings (id, platform, platform_hotel_id, master_hotel_id, status, created_at, updated_at) VALUES ('mapping-2', 'ctrip', 'ota-1', 'master-2', 'confirmed', 'now', 'now')")).toThrow();
    insert(database, "INSERT INTO hotel_mappings (id, platform, platform_hotel_id, master_hotel_id, status, created_at, updated_at) VALUES ('mapping-3', 'ctrip', 'ota-1', 'master-2', 'candidate', 'now', 'now')");

    insert(database, "INSERT INTO market_watched_hotels (market_id, master_hotel_id, status, created_at, updated_at) VALUES ('market-1', 'master-1', 'watched', 'now', 'now')");
    expect(() => insert(database, "INSERT INTO market_watched_hotels (market_id, master_hotel_id, status, created_at, updated_at) VALUES ('market-1', 'master-1', 'not_watched', 'now', 'now')")).toThrow();
  });

  it("requires referenced records and retains facts across Markets", () => {
    const database = createDatabase();
    seedTask(database, "task-1", "batch-1");
    seedMarket(database, "market-2", "Keyword");
    seedDevice(database, "device-1");
    insert(database, "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, claimed_at, lease_expires_at, upload_idempotency_key) VALUES ('attempt-1', 'task-1', 'device-1', 1, 'now', 'later', 'upload-1')");
    insert(database, "INSERT INTO collections (id, task_id, attempt_id, market_id, platform, page_type, context_city, context_keyword_state, context_check_in, context_check_out, source_url, stay_date, observed_at, target_hotels, observed_hotels, quality_status, stop_reason, official_id_count, priced_count, duplicate_id_count, adapter_version, collector_version, idempotency_key, receipt_id, created_at) VALUES ('collection-1', 'task-1', 'attempt-1', 'market-1', 'ctrip', 'hotel_list', 'Test City market-1', 'empty', '2026-02-01', '2026-02-02', 'https://example.test', '2026-02-01', 'now', 30, 13, 'complete', 'list_exhausted', 13, 13, 0, 'adapter-v1', 'collector-v1', 'upload-1', 'receipt-1', 'now')");
    insert(database, "INSERT INTO platform_hotels (platform, platform_hotel_id, created_at, updated_at) VALUES ('ctrip', 'ota-1', 'now', 'now')");
    insert(database, "INSERT INTO price_facts (id, collection_id, platform, platform_hotel_id, display_position, is_ad, availability, source_url, stay_date, observed_at, collected_at) VALUES ('fact-1', 'collection-1', 'ctrip', 'ota-1', 1, 0, 'available', 'https://example.test', '2026-02-01', 'now', 'now')");

    expect(() => insert(database, "INSERT INTO price_facts (id, collection_id, platform, platform_hotel_id, display_position, is_ad, availability, source_url, stay_date, observed_at, collected_at) VALUES ('fact-invalid', 'collection-1', 'meituan', 'ota-1', 1, 0, 'available', 'https://example.test', '2026-02-01', 'now', 'now')")).toThrow();
    expect(() => insert(database, "DELETE FROM platform_hotels WHERE platform = 'ctrip' AND platform_hotel_id = 'ota-1'")).toThrow();
    expect(() => insert(database, "DELETE FROM markets WHERE id = 'market-1'")).toThrow();

    insert(database, "INSERT INTO collection_batches (id, origin, market_id, selected_platforms, selected_offsets, target_hotels, execution_mode, created_at, updated_at) VALUES ('batch-2', 'user', 'market-2', '[\"ctrip\"]', '[0]', 30, 'immediate', 'now', 'now')");
    insert(database, "INSERT INTO collection_tasks (id, batch_id, market_id, platform, check_in, check_out, target_hotels, priority, sequence, created_at, updated_at) VALUES ('task-2', 'batch-2', 'market-2', 'ctrip', '2026-02-01', '2026-02-02', 30, 20, 1, 'now', 'now')");
    insert(database, "INSERT INTO task_attempts (id, task_id, device_id, attempt_number, claimed_at, lease_expires_at, upload_idempotency_key) VALUES ('attempt-2', 'task-2', 'device-1', 1, 'now', 'later', 'upload-2')");
    insert(database, "INSERT INTO collections (id, task_id, attempt_id, market_id, platform, page_type, context_city, context_keyword_state, context_check_in, context_check_out, source_url, stay_date, observed_at, target_hotels, observed_hotels, quality_status, stop_reason, official_id_count, priced_count, duplicate_id_count, adapter_version, collector_version, idempotency_key, receipt_id, created_at) VALUES ('collection-2', 'task-2', 'attempt-2', 'market-2', 'ctrip', 'hotel_list', 'Test City market-2', 'verified', '2026-02-01', '2026-02-02', 'https://example.test', '2026-02-01', 'later', 30, 13, 'complete', 'list_exhausted', 13, 13, 0, 'adapter-v1', 'collector-v1', 'upload-2', 'receipt-2', 'later')");
    insert(database, "INSERT INTO price_facts (id, collection_id, platform, platform_hotel_id, display_position, is_ad, availability, source_url, stay_date, observed_at, collected_at) VALUES ('fact-2', 'collection-2', 'ctrip', 'ota-1', 1, 0, 'available', 'https://example.test', '2026-02-01', 'later', 'later')");
    expect(database.prepare("SELECT COUNT(*) AS count FROM price_facts WHERE platform = 'ctrip' AND platform_hotel_id = 'ota-1'").get()).toMatchObject({ count: 2 });

    insert(database, "INSERT INTO master_hotels (id, display_name, created_at, updated_at) VALUES ('master-1', 'Master One', 'now', 'now'), ('master-2', 'Master Two', 'now', 'now')");
    insert(database, "INSERT INTO hotel_mappings (id, platform, platform_hotel_id, master_hotel_id, status, created_at, updated_at) VALUES ('mapping-1', 'ctrip', 'ota-1', 'master-1', 'confirmed', 'now', 'now')");
    insert(database, "UPDATE hotel_mappings SET status = 'unmapped', updated_at = 'later' WHERE id = 'mapping-1'");
    insert(database, "INSERT INTO hotel_mappings (id, platform, platform_hotel_id, master_hotel_id, status, created_at, updated_at) VALUES ('mapping-2', 'ctrip', 'ota-1', 'master-2', 'confirmed', 'later', 'later')");
    expect(database.prepare("SELECT COUNT(*) AS count FROM price_facts").get()).toMatchObject({ count: 2 });
  });
});
