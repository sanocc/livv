# LIVV OTA V2 Master Specification

Status: SPECIFICATION BASELINE V1.0 — FROZEN FOR IMPLEMENTATION  
Priority: highest among all V2 specifications

## 1. Purpose and scope

LIVV OTA V2 is a hotel OTA market-price collection, governance, monitoring,
and analytics system. Phase 1 supports exactly these platforms:

- Ctrip (`ctrip`)
- Meituan (`meituan`)
- Fliggy (`fliggy`)
- Tongcheng (`tongcheng`)

This specification defines the product invariants and the contracts shared by
the Cloudflare control plane, the Chrome Collector, task execution, and list
collection. It does not define implementation code.

The terms `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, and `MAY` are normative.

## 2. Authority and architecture

Cloudflare Workers, D1, Static Assets, and the web application together form
the control plane, scheduler, business-data plane, analytics layer, and sole
authoritative business source.

The Chrome Collector is a lightweight execution terminal. It MUST execute
cloud tasks and report execution facts. It MUST NOT own business history,
business identity, scheduling, or analytics.

The phase-1 implementation MUST remain compatible with TypeScript, Workers,
D1, Static Assets, native HTML/CSS/ES Modules, and Vitest. React, Vue, Next.js,
Docker, PostgreSQL, Redis, independent servers, and complex message brokers
MUST NOT be introduced without a separately approved decision.

## 3. Core business invariants

### 3.1 Market identity

A Market is resolved or created by Cloudflare from normalized `city + keyword`.
Normalization MUST apply Unicode NFKC, remove leading/trailing whitespace, and
normalize consecutive internal whitespace for both fields. An empty or
all-whitespace keyword becomes the business value `null`.

The user does not manually create a Market. V2 Phase 1 MUST NOT merge Markets
by fuzzy matching. Platform, date, device, and target hotel count are not
Market identity. Every Market MUST store a timezone; Phase-1 China OTA Markets
use `Asia/Shanghai`.

`keyword` has two business values at the input boundary: a non-empty string or
`null`. Its verified runtime representation MUST additionally distinguish:
`verified`, `empty`, and `unknown`; `empty` MUST NOT be treated as `unknown`.

Default names are `城市 · 关键词` when a keyword exists and `城市` when it is
null. Market creation and resolution MUST be idempotent for the normalized
identity.

### 3.2 Batch and Task

A user request published on `ota.livv.cc` is a Batch. A Batch MAY contain one
or more platforms, any subset of D0 through D14, `city`, nullable `keyword`,
and `target_hotels` (default 30). It MAY execute immediately or be generated
by a Schedule.

Cloudflare MUST resolve the Market and expand the Batch into minimum Tasks at
creation time. Each Task contains exactly one Market, Platform, absolute
`check_in`, absolute `check_out`, and `target_hotels`.

D+n MUST be converted to absolute dates when the Batch is created, using the
Market timezone's local calendar date. Phase 1 uses a one-night stay:
`check_out = check_in + 1 calendar day` in the Market timezone. The explicit
absolute `check_in` and `check_out` MUST be stored on every Task. A Task's
dates are immutable. The Collector MUST NOT interpret D+n or recalculate a
date from a one-night default.

Default sequence order is date first, then the configured platform order:
`ctrip`, `meituan`, `fliggy`, `tongcheng`. Every Task MUST have stable
`priority` and `sequence`; retry and requeue MUST preserve both.

### 3.3 Task lease and completion

An authorized online device MAY lease at most one Task at a time. A lease lasts
10 minutes. Phase 1 has no lease renewal.

Collection acceptance and Task completion are different concepts. A Collection
MAY be accepted and durably saved without completing its Task. A Task becomes
`completed` only after Cloudflare accepts a valid `complete` Collection for the
same Attempt. A `list_exhausted` result with verified evidence is `complete`
even when observed is below target. Local adapter completion, a non-empty
result, or an HTTP request that Cloudflare rejects MUST NOT complete a Task.

An accepted `partial` Collection preserves real facts and diagnostic evidence,
but does not complete the Task. For `no_progress`, `timeout`, or retryable
adapter failure with observed below target, the Attempt ends with its actual
failure/partial semantics and the Task follows Retry policy. If no later
Attempt produces a `complete` Collection within the maximum, the Task becomes
`failed`.

If an Attempt has not produced an accepted upload before its lease expires,
that Attempt is `expired` and the Task becomes eligible for retry. `expired`
and `failed` MUST remain distinct.

Each Task permits at most three Attempts by default. After Attempt 1 expires or
has a retryable failure, it is immediately eligible again. After Attempt 2,
the Task is eligible one minute later. Expiry or retryable failure of Attempt 3
makes the Task `failed`. A clearly non-retryable business failure MAY make the
Task `failed` immediately. `priority` and `sequence` never change. Retry wait
MUST NOT block other eligible Tasks.

### 3.4 Context and collection safety

Before collection, the Collector MUST read the OTA's real Page Context and
verify Task Context equals Page Context for platform, `page_type = hotel_list`,
city, keyword state/value, `check_in`, and `check_out`.

Each platform MUST define an independent Context Contract. Authority is
ordered: (A) explicit OTA search controls/search state; (B) OTA structured
page state; (C) a clearly validated URL parameter; (D) otherwise `unknown`.
The Collector MUST NOT infer city or keyword from hotel正文, a location
dictionary, or arbitrary page text. On first mismatch it MAY run Navigation
once more. A second mismatch MUST fail the Attempt; no data from the mismatched
page may be collected or uploaded.

### 3.5 Collection truthfulness

Every hotel fact MUST use the platform's official `platform_hotel_id` when the
platform exposes one. Hotel names MUST NOT substitute for official IDs.

Facts MUST be deduplicated by `(platform, platform_hotel_id)`.

The system MUST record `observed`, `target`, `quality_status`, and
`stop_reason`. It MUST NOT display a partial result as target completion or
fabricate missing hotels.

`list_exhausted` is valid only when the platform Collection Adapter supplies
verified platform-level evidence that the complete observable result set has
ended. No-progress, an unchanged scroll, timeout, or a DOM containing only N
cards is not sufficient. Such a result MAY have `quality_status = complete` even
when `observed < target`, but the UI and analytics MUST show the actual
observed count and target (for example, 13/30). Without reliable exhaustion
evidence, `observed < target` MUST be `partial` or `failed` as defined by the
Collection Specification.

Collection MUST use a cumulative set of unique official hotel IDs. The number
of cards currently present in the DOM MUST NOT be used as the cumulative
observed count. Lazy loading, infinite scroll, pagination, virtual lists, and
DOM recycling may repeatedly expose the same nodes; every newly observed
official ID is added to the Attempt's in-memory seen set until a terminal stop
reason is reached.

## 4. Ownership boundaries

| Concern | Cloudflare | Collector |
|---|---|---|
| Market identity and naming | authoritative | read-only task input |
| Batch, Schedule, Task | authoritative | no ownership |
| absolute dates | creates and freezes | consumes |
| lease, retry, completion | authoritative | reports |
| device credential | validates and stores hash/metadata | stores credential locally |
| Page Context | receives verified context in upload | reads from OTA and validates |
| adapter execution | receives result | executes |
| collection history and analytics | authoritative | no persistence |
| diagnostics | stores business-relevant report | local runtime diagnostics only |

The Collector's long-lived storage is limited in principle to `device_id`,
`device_credential`, and minimal technical configuration. Market, lastResults,
historical payloads/prices, business logs, task history, schedules, mappings,
competitors, and analytics MUST NOT be persistently stored by the Collector.

## 5. Required state distinctions

The system MUST distinguish:

- Batch lifecycle from Task lifecycle;
- Task lease from Attempt lifecycle;
- collection quality (`complete`, `partial`, `failed`) from Task acceptance;
- `expired` from `failed`;
- keyword `empty` from `unknown`;
- display position from organic position;
- advertised cards from organic cards.

Persistent Device authorization state MUST be exactly `pending`, `authorized`,
or `revoked`. Online/offline is dynamic presence derived from
`last_heartbeat_at`, not authorization state.

Formal APIs MUST return stable machine-readable error codes separately from
HTTP status. The Phase-1 minimum code set is:
`AUTH_REQUIRED`, `DEVICE_PENDING`, `DEVICE_REVOKED`, `DEVICE_BUSY`, `NO_TASK`,
`LEASE_EXPIRED`, `TASK_NOT_OWNED`, `CONTEXT_MISMATCH`, `WRONG_PAGE_TYPE`,
`NAVIGATION_FAILED`, `COLLECTION_PARTIAL`, `QUALITY_GATE_FAILED`,
`DUPLICATE_UPLOAD`, `INVALID_PAYLOAD`, `NOT_FOUND`, `CONFLICT`,
`RATE_LIMITED`, and `INTERNAL_ERROR`.

HTTP status and Task/Attempt `failure_code` are separate contracts. A partial
Collection is a valid business result and MAY be accepted by the API; it is
not automatically an HTTP failure. `NO_TASK` is represented by HTTP 204 with
no ordinary error payload.

## 6. Phase-1 exclusions

List Tasks MUST NOT collect full hotel details, all room types, all rate plans,
complete breakfast/cancellation policies, all facilities, images, or review
text. Those MAY be future Detail Tasks and MUST NOT be smuggled into the List
Task contract.

V1 popup architecture, `lastResults`, local business logs, local Market
ownership, fixed test Markets, `m03-default`, M03/M04 compatibility, V1
comparison UI, hard-coded test city/date/Market values, and legacy parsers are
not V2 requirements.

## 7. Required acceptance cases

The specification and later automated/acceptance tests MUST cover:

1. Shanghai + `迪士尼度假区`;
2. Xianning + `中心花坛`;
3. null keyword, including Market naming and Page Context `empty`;
4. a context mismatch and exactly one re-navigation;
5. a 13-of-30 exhausted list and a 13-of-30 non-exhausted list;
6. lease expiry, retry ordering, duplicate upload, and terminal retry;
7. manual collection entering the normal cloud Task chain.
