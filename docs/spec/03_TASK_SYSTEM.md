# LIVV OTA V2 Task System Specification

## 1. Market resolution

The cloud Batch creation operation MUST apply Unicode NFKC, remove
leading/trailing whitespace, and normalize consecutive internal whitespace to
both `city` and `keyword`. An empty or all-whitespace keyword becomes
`null`/`empty`. It MUST then atomically resolve the unique Market for
`normalized city + normalized keyword` or create it. V2 Phase 1 MUST NOT fuzzy
merge Markets. There is no user-facing Market-create operation. Names are
generated from the rules in `00_MASTER_SPEC.md`; callers MUST NOT override
them. A China OTA Market defaults to timezone `Asia/Shanghai` and stores that
timezone explicitly.

## 2. Batch contract

A Batch MUST contain city, nullable keyword, one or more supported platforms,
one or more offsets from D0 through D14, target hotels (default 30), and an
execution mode (`immediate` or Schedule-generated). A Batch MAY retain the
user's original offset selection for display, but execution MUST use the
expanded absolute Tasks.

At creation, Cloudflare MUST:

1. resolve the Market;
2. read the Market timezone;
3. interpret each D+n against the Batch creation local calendar date in that
   timezone;
4. set `check_out = check_in + 1 calendar day` in that timezone;
5. store both absolute dates on every Task;
6. create one Task per Market × Platform × date;
7. assign stable priority and sequence.

The Collector receives absolute dates and never performs this calculation.

## 3. Task identity and ordering

A Task identity MUST include its Batch, Market, Platform, check-in, and
check-out. `target_hotels` is part of the Task execution contract. Duplicate
creation requests MUST be idempotent.

Default ordering is ascending absolute check-in date, then platform order
`ctrip`, `meituan`, `fliggy`, `tongcheng`. `priority` is the scheduler's
ordering value; `sequence` is the stable human/audit order. Retry MUST preserve
both. A retry may alter `next_eligible_at`, never original ordering metadata.

## 4. Task and Attempt states

### 4.1 Task states

```text
queued -> leased -> completed
queued -> leased -> retry_wait -> queued
queued -> leased -> failed
```

`queued` means eligible only when `next_eligible_at <= now`; `leased` means one
active lease exists; `completed` means an accepted complete Collection exists;
`failed` means the retry policy has exhausted or the failure is
non-retryable. A canceled state MAY be added only with an approved product
contract.

### 4.2 Attempt states

```text
created -> active -> accepted
active -> partial -> retry_wait
created/active -> failed
active -> expired
```

An Attempt records its lease, start time, expiry, failure/stop reason, and
upload idempotency identity. `accepted` is reserved for a valid complete
Collection. `partial` records a saved partial Collection and does not complete
the Task. An expired Attempt MUST NOT later complete the Task, even if a
delayed client request arrives.

## 5. Claim and lease rules

Only an authorized online device may claim. Claim MUST atomically select one
eligible Task and create one active Attempt with a ten-minute lease. A device
MUST NOT hold more than one active lease. Cloudflare MUST prevent two devices
from holding the same active Task lease.

There is no lease renewal in Phase 1. At or after expiry, Cloudflare MUST mark
the Attempt `expired`, release the Task into retry policy, and reject late
completion. A Collector receiving an expiry response MUST stop collection and
discard the result.

## 6. Upload acceptance and idempotency

Upload MUST identify device, Task, Attempt, context, collection envelope, and a
stable Attempt-scoped idempotency key. Cloudflare MUST validate lease ownership,
Attempt state, context equality, schema, and Quality Gate result before
acceptance. A complete envelope may move the Attempt to `accepted` and the Task
to `completed`; an accepted partial envelope moves the Attempt to `partial`
and the Task to retry policy.

Repeated requests with the same accepted idempotency key MUST return the
original acceptance without inserting a second collection or completing a
different Task. A rejected upload MUST not advance the Task to completed.

## 7. Failure and retry policy

`failed` means an active Attempt ended with an execution or validation failure;
`expired` means no accepted upload existed before lease expiry. The cloud MUST
preserve both in audit/history.

Retry policy is fixed for Phase 1:

- maximum three Attempts per Task;
- after Attempt 1 expired/retryable failure: immediately eligible;
- after Attempt 2 expired/retryable failure: eligible one minute later;
- after Attempt 3 expired/retryable failure: Task `failed`;
- clearly non-retryable business failure MAY fail immediately;
- `priority` and `sequence` remain unchanged;
- retry waiting MUST allow later eligible Tasks to run.

Authentication rejection, invalid Task context, unsupported platform, and
schema/contract violations SHOULD be non-retryable until an operator changes
the underlying condition. Temporary navigation, network, and empty-list
conditions MAY be retryable according to product-defined limits.

`attempt_count` and `next_eligible_at` MUST be persisted so the policy remains
authoritative after device loss or Worker restart.

## 8. Schedule generation

A Phase-1 Schedule stores exactly the scheduling inputs needed to generate a
Batch:

- `market_id`;
- selected platforms;
- selected D0-D14 offsets;
- `target_hotels`;
- days of week;
- local execution time;
- timezone;
- enabled state.

A Schedule MUST only generate a new Batch at its trigger time. It MUST NOT
execute Tasks and MUST NOT be stored in the Collector. Phase 1 recurrence is
limited to `timezone`, `days_of_week`, `local_time`, and `enabled`. It MUST NOT
accept arbitrary Cron expressions, sub-hour intervals, or complex calendar
expressions. At generation time, each selected D+n is resolved against that
day's local calendar date in the Market timezone, and the resulting Batch
creates immutable absolute Task dates using the one-night rule.

The logical uniqueness key for a trigger is `(schedule_id, scheduled_for)`.
Cloudflare MUST make generation idempotent on that key. A disabled Schedule
MUST NOT generate a Batch. A later eligible Task or retry MUST NOT be treated
as a duplicate Schedule run.

## 9. Manual mode

Manual mode is a source of a Batch, not a bypass. The cloud MUST create a
manual Batch and one or more normal Tasks, assign a lease, and require the same
Attempt and accepted-upload rules. The originating Page Context MAY be included
as diagnostic input but MUST NOT bypass Context Gate validation.
