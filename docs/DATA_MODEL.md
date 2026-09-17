# D1 Data Model

M01 freezes the local D1 schema draft before Worker, Collector, or OTA business code begins. No Cloudflare D1 database is created or migrated in this phase.

Database timestamps are stored as UTC ISO-8601 text. `business_date`, `check_in`, and `check_out` are hotel-market local dates. The first market timezone is `Asia/Shanghai`. T5 crosses midnight but still belongs to the previous `business_date`.

## Layers

A. Market layer: `markets`, `market_platform_contexts`.

B. Hotel identity layer: `hotels`, `platform_hotels`, `hotel_mappings`.

C. Collection fact layer: `collections`, `price_facts`, `room_facts`, `rate_facts`, `upload_receipts`.

D. Competitor governance layer: `competitor_roles`.

E. Device layer: `devices`, `device_credentials`, `device_capabilities`, `device_navigation_contexts`.

F. Scheduling layer: `plans`, `plan_platforms`, `task_units`, `task_attempts`.

G. Identity/RBAC layer: `livv_users`, `audit_events`.

Collected facts remain visible even when a platform hotel has no mapping or role. Mapping and competitor classification are governance data; they do not gate fact persistence.

## Tables

### livv_users

Cloudflare Access-authenticated human users authorized by LIVV RBAC.

- Primary key: `sub`.
- Important fields: `email`, `display_name`, `role`, `status`, `created_at`, `updated_at`.
- Roles: `owner`, `admin`, `manager`, `viewer`.
- Unique constraints: `email`.

LIVV does not create a username/password table. Cloudflare Access authenticates; LIVV RBAC authorizes.

### markets

LIVV market definition, such as `Xianning · Center Flower Bed`. A market is not a platform search object.

- Primary key: `id`.
- Important fields: `name`, `city`, `keyword`, `status`, `timezone`, `created_at`, `updated_at`.
- Unique constraints: `city`, `keyword`, `name`.

Platform URLs, account state, cookies, and platform-specific search parameters do not belong in this table.

### market_platform_contexts

Safe platform navigation/search context for a market.

- Primary key: `id`.
- Foreign keys: `market_id` to `markets.id`.
- Important fields: `platform`, `city_context`, `search_context`, `navigation_metadata_json`, `last_verified_at`, `status`.
- Unique constraints: `market_id`, `platform`.

This table must not store passwords, cookies, session secrets, or account credentials.

### hotels

LIVV canonical hotel identity used only when a real-world hotel identity is needed.

- Primary key: `id`.
- Important fields: `name`, `city`, `address`, `latitude`, `longitude`, `brand`, `status`, `created_at`, `updated_at`.
- Unique constraints: none on hotel name.

Hotel names are not unique. Similar names must not be automatically merged.

### platform_hotels

Hotel identity as represented by one OTA platform.

- Primary key: `id`.
- Foreign keys: optional `market_id` to `markets.id`.
- Important fields: `platform`, `platform_hotel_id`, `hotel_name`, `city`, `address`, `latitude`, `longitude`, `brand`, `first_seen_at`, `last_seen_at`, `status`.
- Unique constraints: `platform`, `platform_hotel_id`.

Platform hotels can exist independently before mapping and their facts remain visible.

### hotel_mappings

Candidate, confirmed, or rejected relationship between a canonical hotel and a platform hotel.

- Primary key: `id`.
- Foreign keys: `hotel_id` to `hotels.id`, `platform_hotel_row_id` to `platform_hotels.id`, `confirmed_by` to `livv_users.sub`.
- Important fields: `platform`, `status`, `source`, `evidence_json`, `is_primary`, `confirmed_at`, `created_at`, `updated_at`.
- Unique constraints: one active confirmed mapping per platform hotel; one active primary platform identity per canonical hotel per platform.

Statuses include `candidate`, `confirmed`, and `rejected`. Algorithms may create `candidate`; only human actions may create `confirmed`.

`platform` intentionally duplicates the platform from `platform_hotels` so SQLite/D1 can enforce the canonical-hotel-plus-platform primary mapping constraint without a cross-table expression index. The API must validate that it matches the linked platform hotel.

### competitor_roles

Market-specific role for a canonical hotel.

- Primary key: `id`.
- Foreign keys: `market_id` to `markets.id`, `hotel_id` to `hotels.id`, `confirmed_by` to `livv_users.sub`.
- Important fields: `role`, `confirmed_at`, `updated_at`.
- Unique constraints: one role per `market_id`, `hotel_id`.

Roles include `own`, `core`, `normal`, and `watch`. Unclassified hotels do not require a forced row.

### devices

Collector device registration and authorization state.

- Primary key: `id`.
- Important fields: `device_id`, `name`, `status`, `collector_version`, `protocol_version`, `os`, `arch`, `browser`, `browser_version`, `first_seen_at`, `last_seen_at`, `authorized_at`, `authorized_by`, `revoked_at`, `revoked_by`, `current_state`.
- Foreign keys: `authorized_by` and `revoked_by` to `livv_users.sub`.
- Unique constraints: `device_id`.

Device states: `pending`, `authorized`, `revoked`.

### device_credentials

Automatically managed device credentials.

- Primary key: `id`.
- Foreign keys: `device_id` to `devices.id`.
- Important fields: `credential_hash`, `issued_at`, `expires_at`, `revoked_at`.
- Unique constraints: `credential_hash`.

Users never view, copy, or enter credentials.

### device_capabilities

Per-platform Collector capability heartbeat.

- Primary key: `id`.
- Foreign keys: `device_id` to `devices.id`.
- Important fields: `platform`, `rank_monitor`, `market_discovery`, `core_detail`, `navigation_ready`, `last_reported_at`.
- Unique constraints: `device_id`, `platform`.

Platforms are `ctrip`, `meituan`, `fliggy`, `tongcheng`, and `tuniu`.

### device_navigation_contexts

Safe per-device navigation readiness for a platform and market.

- Primary key: `id`.
- Foreign keys: `device_id` to `devices.id`, `market_id` to `markets.id`.
- Important fields: `platform`, `city`, `keyword`, `business_date`, `status`, `safe_metadata_json`, `last_verified_at`.
- Unique constraints: `device_id`, `market_id`, `platform`, `business_date`.

This table must not store cookies, passwords, account secrets, or session secrets.

### plans

Long-term Scheduler rule, not an execution record.

- Primary key: `id`.
- Foreign keys: `market_id` to `markets.id`, `assigned_device_id` to `devices.id`, `created_by` to `livv_users.sub`.
- Important fields: `name`, `status`, `date_offset_start`, `date_offset_end`, `strategy`, `task_type`, `assigned_device_id`, `created_at`, `updated_at`.

Saving or enabling a plan does not immediately execute work.

### plan_platforms

Plan/platform relationship without five boolean columns.

- Primary key: `id`.
- Foreign keys: `plan_id` to `plans.id`.
- Important fields: `platform`, `enabled`.
- Unique constraints: `plan_id`, `platform`.

### task_units

Executable Scheduler unit created from a plan or immediate collection request.

- Primary key: `id`.
- Foreign keys: optional `plan_id` to `plans.id`, `market_id` to `markets.id`, optional `assigned_device_id` to `devices.id`, optional `retry_of_unit_id` to `task_units.id`.
- Important fields: `platform`, `task_type`, `business_date`, `day_offset`, `time_window`, `check_in`, `check_out`, `earliest_run_at`, `latest_run_at`, `scheduled_at`, `priority`, `status`, `created_at`, `updated_at`.
- Unique constraints: scheduler idempotency key.

Initial statuses include `waiting`, `leased`, `running`, `paused`, `success`, `failed`, `cancelled`, `missed`, and `blocked`. Status values are documented in `STATE_MACHINES.md` instead of being locked by fragile table checks.

### task_attempts

Concrete execution attempt for one task unit.

- Primary key: `id`.
- Foreign keys: `unit_id` to `task_units.id`, `device_id` to `devices.id`.
- Important fields: `run_id`, `attempt_no`, `status`, `started_at`, `finished_at`, `lease_expires_at`, `progress_stage`, `progress_value`, `error_code`, `error_stage`, `safe_message`, `retryable`, `created_at`.
- Unique constraints: `unit_id`, `attempt_no`; `run_id`.

One unit can have multiple attempts. Retries never overwrite old attempts.

### upload_receipts

Idempotency receipt for Collector uploads.

- Primary key: `id`.
- Foreign keys: `attempt_id` to `task_attempts.id`.
- Important fields: `payload_hash`, `receipt_id`, `created_at`.
- Unique constraints: `attempt_id`, `payload_hash`; `receipt_id`.

The same attempt and payload hash must not write duplicate facts.

### collections

One real collection batch.

- Primary key: `id`.
- Foreign keys: `device_id` to `devices.id`, optional `task_attempt_id` to `task_attempts.id`, `market_id` to `markets.id`, optional `upload_receipt_id` to `upload_receipts.id`.
- Important fields: `platform`, `task_type`, `business_date`, `check_in`, `check_out`, `started_at`, `finished_at`, `quality`, `status`, `error_code`, `policy_version`, `collector_version`, `source`, `created_at`.
- Unique constraints: collection idempotency key.

Task types: `rank_monitor`, `market_discovery`, `core_detail`, `manual`. Quality values: `FULL`, `PARTIAL`, `FAILED`; `quality` is required.

### price_facts

Immutable list-level price fact.

- Primary key: `id`.
- Foreign keys: `collection_id` to `collections.id`, `market_id` to `markets.id`, `platform_hotel_id` to `platform_hotels.id`.
- Important fields: `business_date`, `check_in`, `check_out`, `rank_position`, `display_price`, `currency`, `availability`, `collected_at`, `payload_hash`.

Availability values: `available`, `sold_out`, `unknown`.

Facts are never updated in place as "latest". Latest/head views may be query results or derived caches. If `hotel_daily_latest` is ever introduced, it is a derived cache and not an original fact source.

### room_facts

Immutable room-level detail fact under a detail collection.

- Primary key: `id`.
- Foreign keys: `collection_id` to `collections.id`, `platform_hotel_id` to `platform_hotels.id`.
- Important fields: `room_key`, `room_name`, `room_order`, `availability`, `collected_at`.

A `core_detail` collection may produce multiple room facts, subject to the Collector policy.

### rate_facts

Immutable rate quote fact under a room fact.

- Primary key: `id`.
- Foreign keys: `room_fact_id` to `room_facts.id`.
- Important fields: `price`, `reference_price`, `breakfast_count`, `breakfast_text`, `cancellation_text`, `inventory_text`, `supplier_text`, `availability`, `collected_at`.

`breakfast_count` may be null when uncertain. Sold-out rates may have null `price`. Reference price and actual sale price are separate.

### audit_events

High-value management audit events.

- Primary key: `id`.
- Important fields: `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `metadata_json`, `created_at`.

Audit events cover device authorize/revoke, mapping confirm/reject, competitor role change, plan create/update/pause, and user role change. Page browsing is not audited.

## Policy Expression

Collector enforces the 30 / 200 / 10 / 3 Policy before upload:

- `rank_monitor`: first 30 real ranking positions.
- `market_discovery`: at most 200 unique hotels.
- `core_detail`: 10 or fewer rooms means all rooms; more than 10 means first 10 page-order rooms.
- Per room: 3 or fewer valid sellable quotes means all; more than 3 prefers no breakfast, single breakfast, and double breakfast when labels are reliable, otherwise lowest 3 valid sellable prices.

D1 stores Collector output and necessary evidence. D1 does not re-run collection filtering as business logic.
