# LIVV OTA V2 Logical Database Specification

Status: logical model only. This document does not create migrations or prescribe SQL.

## 1. Database principles

Cloudflare D1 is the authoritative business database. The entities below are logical records and required constraints, not implementation instructions.

The model MUST avoid storing values fully derivable from immutable records. It MUST preserve business decisions and external observations. Historical Price Facts MUST never be rewritten because a Hotel Mapping changes.

## 2. Identity and access entities

### users

Stores human users authenticated through Cloudflare Access, including stable identity, role (`viewer`, `manager`, `admin`, `owner`), status, and timestamps. Owner management is restricted to owner.

### devices

Stores `device_id`, display metadata, authorization state (`pending`, `authorized`, `revoked`), `last_heartbeat_at`, and lifecycle timestamps. Online/offline is derived from heartbeat freshness and is not a persisted authorization state.

### device_credentials

Stores a credential hash, device reference, status, creation/revocation data, and rotation metadata. Plaintext credentials MUST NOT be stored. A device MAY have historical credentials, but only permitted active credentials can authenticate.

### device_capabilities

Stores Collector protocol/version and supported platform capabilities for a device. Capabilities are technical metadata, not authorization.

## 3. Market and execution entities

### markets

Stores normalized city, nullable normalized keyword, generated display name, timezone, status, and timestamps. Identity is unique on normalized city plus normalized keyword. Unicode NFKC, edge trim, and internal whitespace normalization occur before uniqueness. Markets MUST NOT be manually created or fuzzy merged.

### collection_batches

Stores the user/manual/schedule origin, resolved Market, original selected platforms and D0-D14 offsets, target, execution mode, and lifecycle. It may retain submitted input for display, but Tasks are the immutable execution contract.

### collection_tasks

Stores one Market, one Platform, one absolute `check_in`, one absolute `check_out`, one target, immutable `priority` and `sequence`, lifecycle, `attempt_count`, `next_eligible_at`, and Batch reference. Task dates are never recomputed from D+n. A Task has at most one active lease.

### task_attempts

Stores one Task attempt, device, lease start/expiry, attempt number, state (`created`, `active`, `accepted`, `partial`, `failed`, `expired`), failure code, stop reason, and upload idempotency key. Attempt state is separate from Task state. The lease duration is ten minutes and Phase 1 has no renewal. `accepted` is reserved for a complete Collection; `partial` preserves an accepted partial Collection without completing the Task.

### schedules

Stores Market, selected platforms, selected D0-D14 offsets, target, days of week, local execution time, timezone, enabled state, and timestamps. Phase 1 does not support arbitrary Cron, sub-hour intervals, or complex calendar expressions. A Schedule generates Batches; it does not execute Tasks and is not stored in a Collector.

### schedule_runs

Stores one Schedule trigger identity, `scheduled_for`, generated Batch, outcome, and timestamps. `(schedule_id, scheduled_for)` MUST be unique, preventing duplicate Batch generation for the same trigger.

## 4. Collection and hotel entities

### collections

Stores one accepted or explicitly recorded collection envelope: Task/Attempt, Market, platform, verified context, stay dates, observation time, observed, target, quality status, stop reason, and receipt/idempotency identity.

### platform_hotels

Stores an OTA Hotel Identity keyed by `(platform, platform_hotel_id)`, latest non-authoritative display metadata, and timestamps. It MUST NOT be bound to a single Market. Market appearance is represented through Collections and Price Facts.

### price_facts

Stores facts observed in a Collection, including platform hotel reference, Market/Collection reference, hotel fields, price/availability/currency, display/organic positions, ad state, source URL, `stay_date`, and `observed_at`. Historical rows are append-oriented and MUST NOT change when a mapping changes.

### master_hotels

Stores cross-platform business hotel identities independent of Markets.

### hotel_mappings

Stores candidate and confirmed relationships between one OTA Hotel Identity and one Master Hotel, evidence, actor, status, and audit timestamps. At most one confirmed Master Hotel may exist for an OTA identity. Candidates do not count as confirmed mappings.

### market_watched_hotels

Stores the binary watched/not-watched relationship between a Market and Master Hotel. Watch state does not control collection or fact persistence.

## 5. Audit entity

### audit_events

Stores append-oriented actor/device, action, target, before/after summary, reason, outcome, and timestamp for security, mapping, watch, device, Batch, Schedule, Task, and upload decisions. It is separate from operational Workers Logs.

## 6. Required constraints

- One device has at most one active lease.
- A Task and its Attempts are separate records.
- Lease expiry is ten minutes.
- Upload idempotency is unique per Attempt key and returns the existing receipt.
- `(schedule_id, scheduled_for)` is unique.
- One OTA identity has at most one confirmed Master Hotel mapping.
- Price Facts retain original collection identity and are not rewritten by unmap/remap.
- `platform_hotels` has no single-Market ownership column.
