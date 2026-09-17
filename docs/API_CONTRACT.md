# API Contract

M01 freezes the future API contract before Worker implementation. No Cloudflare Worker is created in this phase.

## Style

All application endpoints use `/api/v1/...`.

Do not create parallel legacy prefixes such as `/api/ota`, `/api/v2`, `/api/cloud`, or `/api/local`.

API errors use:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  }
}
```

Error codes are stable and documented in `ERROR_CODES.md`.

## Authentication Classes

- Public: no login required. Reserved for public site needs only.
- Access user: authenticated by Cloudflare Access and authorized by LIVV RBAC.
- Device Credential: Collector device credential, separate from human login.
- Internal Cron: internal Scheduler generation and maintenance jobs.

Cloudflare Access is authentication. LIVV RBAC is authorization.

RBAC roles: `owner`, `admin`, `manager`, `viewer`.

Write permissions:

- Competitor management and mapping write: `manager+`.
- Device authorization/revoke: `admin+`.
- User role management: `owner`.

## Pagination

All hotel list APIs must support pagination, search, filters, and sort.

Standard query fields:

- `page`: 1-based page number.
- `page_size`: requested page size, maximum 100.
- `search`: optional text search.
- `sort`: stable sort key.
- `filter[...]`: structured filter values.

Standard list response:

```json
{
  "items": [],
  "page": 1,
  "page_size": 20,
  "total": 0
}
```

APIs must avoid per-hotel N+1 query shapes.

## Collector API

Device Credential authentication.

- `POST /api/v1/collector/register`: auto-register a new device and issue hidden credentials.
- `POST /api/v1/collector/heartbeat`: update device online state and basic metadata.
- `GET /api/v1/collector/status`: return the device authorization state and capability summary.
- `GET /api/v1/collector/device`: M02 own-device status endpoint; this is the implemented bootstrap-safe form of device status lookup.
- `POST /api/v1/collector/collections`: upload a collection batch and facts.
- `POST /api/v1/collector/tasks/claim`: claim one Scheduler task.
- `POST /api/v1/collector/tasks/:id/renew`: renew an active lease.
- `POST /api/v1/collector/tasks/:id/progress`: report progress.
- `POST /api/v1/collector/tasks/:id/complete`: complete a task.
- `POST /api/v1/collector/tasks/:id/fail`: fail a task with structured error.

Pending devices may register, heartbeat, report capabilities, do local manual collection, and query their own status. They may not upload facts or claim Scheduler tasks.

Authorized devices may upload facts and claim Scheduler tasks.

Revoked devices may continue local manual collection but may not upload facts or claim Scheduler tasks.

Upload requests must include idempotency data, `attempt_id` when task-driven, `run_id`, `device_id`, `payload_hash`, collection metadata, list facts, and optional room/rate facts. The API rejects stale attempts, wrong devices, expired leases, and duplicate payload writes.

M02 clarification: `POST /api/v1/collector/collections` and `POST /api/v1/collector/tasks/claim` may exist only as permission-boundary stubs. They reject pending/revoked devices and do not implement price upload or Scheduler claim.

## Market And OTA Read API

Access user authentication.

- `GET /api/v1/markets`: paginated market list.
- `GET /api/v1/markets/:id/overview`: market overview summary.
- `GET /api/v1/markets/:id/hotels`: paginated hotel table for a market.
- `GET /api/v1/markets/:id/price-matrix`: 14-day D0-D14 price matrix.
- `GET /api/v1/hotels/:id`: canonical hotel detail with mapped platform identities.
- `GET /api/v1/hotels/:id/prices`: paginated hotel price facts and latest derived view.

`overview` returns a bounded payload:

- `market`.
- `business_date`.
- `updated_at`.
- `available_hotel_count`.
- `min_price`.
- `median_price`.
- `average_price`.
- `price_up_count`.
- `price_down_count`.
- `sold_out_count`.
- `price_band`.
- `price_changes`.
- `insight`.

14-day matrix data is separate from overview to avoid unbounded payloads.

## Hotel And Mapping API

Access user authentication.

- `GET /api/v1/hotels/:id/platform-identities`: platform hotel identities linked to a canonical hotel.
- `GET /api/v1/platform-hotels`: paginated platform hotel pool, including unmapped and unclassified identities.
- `GET /api/v1/platform-hotels/:id`: platform hotel detail and facts.
- `GET /api/v1/mappings/candidates`: mapping candidates.
- `POST /api/v1/mappings/:id/confirm`: confirm a candidate mapping, `manager+`.
- `POST /api/v1/mappings/:id/reject`: reject a candidate mapping, `manager+`.
- `POST /api/v1/mappings`: create a manual mapping candidate or confirmed mapping, confirmed requires `manager+` human action.

Automatic logic can create `candidate` only. Final `confirmed` mapping requires a human manager or higher.

## Competitor API

Access user authentication.

- `GET /api/v1/markets/:id/competitors`: paginated market competitor roles and prices.
- `PUT /api/v1/markets/:id/competitors/:hotel_id/role`: set role, `manager+`.
- `DELETE /api/v1/markets/:id/competitors/:hotel_id/role`: remove role and return hotel to unclassified, `manager+`.

Competitor roles attach to `market_id + hotel_id`, not globally to a hotel.

## Device Admin API

Access user authentication.

- `GET /api/v1/devices`: paginated device list.
- `GET /api/v1/devices/:id`: device detail.
- `POST /api/v1/devices/:id/authorize`: authorize device, `admin+`.
- `POST /api/v1/devices/:id/revoke`: revoke device, `admin+`.

Device credentials are hidden from users.

## Plan And Task API

Access user authentication for management. Internal Cron for generation.

- `GET /api/v1/plans`: paginated plan list.
- `POST /api/v1/plans`: create plan, `manager+`.
- `GET /api/v1/plans/:id`: plan detail.
- `PUT /api/v1/plans/:id`: update plan, `manager+`.
- `POST /api/v1/plans/:id/pause`: pause plan, `manager+`.
- `POST /api/v1/plans/:id/enable`: enable plan, `manager+`.
- `GET /api/v1/tasks`: paginated task unit list.
- `POST /api/v1/tasks/immediate`: create immediate high-priority task unit, `manager+`.
- `GET /api/v1/tasks/:id`: task unit detail with attempts.
- `POST /api/v1/internal/scheduler/generate`: generate task units from plans, Internal Cron.
- `POST /api/v1/internal/scheduler/expire-leases`: expire stale leases, Internal Cron.

Long-term plan -> `task_unit` -> `task_attempt`.

Saving or enabling a plan does not execute immediately. Immediate collection creates a separate high-priority task unit.

## Collection API

Access user authentication for reads. Collector writes through Collector API.

- `GET /api/v1/collections`: paginated collection batches.
- `GET /api/v1/collections/:id`: collection detail.
- `GET /api/v1/collections/:id/price-facts`: paginated list facts.
- `GET /api/v1/collections/:id/room-facts`: paginated room facts and rate facts.

Facts are immutable. Latest views are query results or future derived caches, not the original fact source.

## Time Contract

D0 means check in on the current business date and check out the next day. D14 means check in 14 days later and check out the next day.

Standard Scheduler strategy:

- D0: T1, T2, T3, T4, T5.
- D1: T1, T3, T4, T5.
- D2-D3: T1, T3, T4.
- D4-D7: T1, T4.
- D8-D14: T3.

Time windows:

- T1: 08:00-11:00.
- T2: 11:00-14:00.
- T3: 14:00-18:00.
- T4: 18:00-22:00.
- T5: 22:00-next day 04:00.

T5 belongs to the previous business day.
