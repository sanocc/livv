#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
MIGRATION="$ROOT_DIR/api/migrations/0001_initial.sql"
DB_FILE="$(mktemp "${TMPDIR:-/tmp}/livv_schema_XXXXXX.sqlite")"

cleanup() {
  rm -f "$DB_FILE"
}
trap cleanup EXIT

sqlite3 "$DB_FILE" "PRAGMA foreign_keys = ON;"
sqlite3 "$DB_FILE" < "$MIGRATION"

table_count="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")"
index_count="$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';")"
fk_count="$(sqlite3 "$DB_FILE" "SELECT sum(cnt) FROM (SELECT count(*) AS cnt FROM pragma_foreign_key_list('livv_users') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('markets') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('market_platform_contexts') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('hotels') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('platform_hotels') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('hotel_mappings') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('competitor_roles') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('devices') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('device_credentials') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('device_capabilities') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('device_navigation_contexts') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('plans') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('plan_platforms') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('task_units') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('task_attempts') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('upload_receipts') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('collections') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('price_facts') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('room_facts') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('rate_facts') UNION ALL SELECT count(*) FROM pragma_foreign_key_list('audit_events'));")"

sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('markets','platform_hotels','price_facts','task_units','task_attempts','upload_receipts','livv_users') ORDER BY name;"
printf 'schema ok: %s tables, %s indexes, %s foreign keys\n' "$table_count" "$index_count" "$fk_count"
