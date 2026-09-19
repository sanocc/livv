# LIVV OTA V2 Implementation Milestone Specification

Status: SPECIFICATION BASELINE V1.0 — FROZEN FOR IMPLEMENTATION.

This is an execution plan, not implementation code. Every milestone follows:

`Tests -> Review -> Commit`

A milestone that fails tests, acceptance checks, or specification review MUST not start the next milestone. Commits occur only after the milestone passes; this document does not authorize a commit during specification work.

## M00 — Specification and contract freeze

- Scope: approve 00–13, terminology, state machines, API/error contracts, logical data model, acceptance matrix, and security boundaries.
- Out of scope: all runtime code, migrations, deployment, and UI.
- Artifacts: signed specification review and contradiction log.
- Automated tests: document lint/contract consistency checks.
- Acceptance: all frozen rules trace to at least one normative section.
- Rollback: revert only the unapproved specification revision.
- Completion: product and engineering approve the contract baseline.

## M01 — Cloudflare skeleton and test harness

- Scope: project boundaries, environment configuration, Vitest harness, health contract.
- Out of scope: business tables, device auth, Collector, UI.
- Artifacts: project skeleton and test fixtures.
- Automated tests: health and harness smoke tests.
- Acceptance: lightweight stack only; no prohibited infrastructure.
- Rollback: remove the milestone deployment without data migration.
- Completion: deterministic tests run in the approved environment.

## M02 — D1 logical schema and migrations

- Scope: implement the approved 09 model and constraints.
- Out of scope: scheduling behavior, analytics queries, UI.
- Artifacts: versioned migrations and schema tests.
- Automated tests: uniqueness, ownership, idempotency, and historical immutability tests.
- Acceptance: Market, Task/Attempt, Schedule Run, mapping, and fact constraints pass.
- Rollback: approved backward migration or restore procedure documented before applying production changes.
- Completion: schema review and clean test run.

## M03 — Authentication and device authorization

- Scope: Cloudflare Access human auth, device register/status/heartbeat, credential hashing, pending/authorized/revoked enforcement, RBAC foundation.
- Out of scope: Task claiming and collection upload.
- Artifacts: auth endpoints, policy tests, audit records.
- Automated tests: credential, state, role, and route-isolation tests.
- Acceptance: revoked devices and unauthorized roles are rejected server-side.
- Rollback: disable the new auth routes and revoke test credentials safely.
- Completion: security review passes.

## M04 — Task scheduler, claim, lease, and retry

- Scope: Market resolution, Batch expansion, absolute dates, Task ordering, ten-minute lease, one-device-one-task, three-Attempt retry policy.
- Out of scope: OTA navigation and collection adapters.
- Artifacts: Task APIs and state transition tests.
- Automated tests: 60-task expansion, expiry, retry timing, no starvation, duplicate claim, and offline/re-online cases.
- Acceptance: Task completion requires an accepted complete Collection; accepted
  partial results follow Retry policy; bad Tasks do not block.
- Rollback: stop claiming new Tasks while preserving existing authoritative state.
- Completion: state-machine and concurrency review passes.

## M05 — Collector shell and runtime

- Scope: Manifest V3 runtime, background coordinator, transient Session, Popup-independent execution, device protocol client.
- Out of scope: platform navigation and collection extraction.
- Artifacts: Collector runtime contract and diagnostics policy.
- Automated tests: lifecycle, restart, Popup close, and persistence-boundary tests.
- Acceptance: no business history is persisted; one active Task maximum.
- Rollback: disable Collector claim capability and leave cloud state intact.
- Completion: runtime boundary acceptance passes.

## M06 — Page Context and Navigation

- Scope: implementation discovery and four platform Context Contracts,
  Navigation Adapters, Context Gate, and one re-navigation rule. M06 MUST
  separately establish and prove authoritative sources for `page_type`, city,
  keyword, `check_in`, and `check_out` on Ctrip, Meituan, Fliggy, and
  Tongcheng. It MUST follow A/B/C/D authority priority and MUST NOT hard-code
  selectors before real-page validation.
- Out of scope: hotel fact extraction and analytics.
- Artifacts: platform evidence contracts and replay fixtures.
- Automated tests: Shanghai/Xianning keyword regressions, empty/unknown, wrong city/date/page type.
- Acceptance: no guessed context and no upload after mismatch. Ctrip MUST pass
  Shanghai + `迪士尼度假区` and Xianning + `中心花坛` regressions.
- Rollback: disable affected platform adapter without changing stored facts.
- Completion: platform contract review passes.

## M07 — Four-platform Collection Adapters

- Scope: official IDs, fields, evidence, cumulative virtual-list collection,
  stop reasons, Quality Gate, and four platform-specific Exhaustion Contracts.
  Each contract MUST define verified platform-level evidence for
  `list_exhausted`; no-progress, apparent scroll bottom, DOM stability, or
  timeout alone MUST NOT qualify.
- Out of scope: cloud upload and cross-platform analytics.
- Artifacts: adapter contracts and fixtures.
- Automated tests: dynamic list, DOM recycling, duplicate IDs, ads, prices, exhaustion, no-progress, timeout, and partial cases.
- Acceptance: Ctrip 13/30 regression cannot be falsely complete; if reliable
  exhaustion cannot be proved, the adapter returns `no_progress`/`timeout` and
  a partial or failed result according to the Collection specification.
- Rollback: disable only the failing platform adapter.
- Completion: each adapter passes its platform evidence review.

## M08 — Collection upload and idempotency

- Scope: upload validation, accepted partial results, receipts, duplicate upload handling, Task completion transition.
- Out of scope: mapping and analytics.
- Artifacts: upload API and receipt contract.
- Automated tests: network retry, duplicate receipt, lease expiry, schema and Quality Gate rejection.
- Acceptance: no duplicate facts; HTTP and Attempt failure semantics separate.
- Rollback: reject new uploads while retaining accepted receipts.
- Completion: end-to-end Task upload acceptance passes.

## M09 — Hotel identity and mapping

- Scope: OTA identities, Master Hotels, candidate/confirmed mapping, conflict, unmap/remap, Market watch relationship, Audit.
- Out of scope: predictive analytics.
- Artifacts: management APIs and review UI contract.
- Automated tests: single confirmed mapping, candidate isolation, history preservation, watch independence.
- Acceptance: mapping never rewrites historical facts.
- Rollback: disable mapping mutations; retain read-only history.
- Completion: RBAC and audit review passes.

## M10 — Analytics

- Scope: platform/cross-platform distributions, mapping coverage, rankings, D0-D14 slices, same-stay-date price changes, quality treatment.
- Out of scope: AI prediction and forecasting.
- Artifacts: analytics query contracts and fixtures.
- Automated tests: deduplication, minima, percentiles, time-axis, partial and failed quality cases.
- Acceptance: no combined fictional ranking and no D0/D1 false price change.
- Rollback: disable affected analytics view without changing facts.
- Completion: metric definitions and sample outputs reviewed.

## M11 — OTA Web

- Scope: native Static Assets web application with the three first-level sections, Batch/Market, hotel, device, task, and analytics views.
- Out of scope: new framework and Collector UI ownership.
- Artifacts: Web contracts and acceptance scenarios.
- Automated tests: route authorization, quality display, mapping coverage, no manual Market creation.
- Acceptance: frontend does not substitute for API authorization.
- Rollback: serve the prior static asset revision.
- Completion: product UI acceptance passes.

## M12 — Schedule

- Scope: Schedule CRUD, enable/disable, simple days-of-week/local-time trigger
  calculation, Schedule Run uniqueness, and Batch generation. Arbitrary Cron,
  sub-hour intervals, and complex calendar expressions are out of scope.
- Out of scope: Schedule execution inside Collector.
- Artifacts: Schedule API and run audit contract.
- Automated tests: timezone, recurrence, disabled schedule, duplicate trigger, D+n generation.
- Acceptance: one trigger creates at most one Batch.
- Rollback: disable schedules and preserve already-created Batches.
- Completion: scheduler review passes.

## M13 — Full end-to-end acceptance

- Scope: browser-to-Cloudflare-to-Collector-to-analytics flows across all four platforms and core failure paths.
- Out of scope: unapproved future features.
- Artifacts: release acceptance report and operational runbook.
- Automated tests: complete 11_TESTING matrix.
- Acceptance: no open critical security, data integrity, or task correctness issue.
- Rollback: disable production claim/schedule entry points while preserving accepted business data.
- Completion: owner approval for production cutover.

## M14 — Production cutover

- Scope: staged release, monitoring, controlled enablement, and handoff.
- Out of scope: architecture expansion or new product scope.
- Artifacts: deployment record, rollback record, and support ownership.
- Automated tests: release smoke and health checks.
- Acceptance: Workers Logs, Audit, device presence, task queue, and data quality monitoring are operational.
- Rollback: documented staged disablement and prior asset/version restoration.
- Completion: production sign-off and post-cutover review.
