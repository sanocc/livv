# LIVV OTA V2 Testing and Acceptance Specification

## 1. Test principles

Tests MUST validate business contracts rather than implementation details. Automated tests use Vitest and deterministic fixtures where possible. Browser acceptance tests MUST use real or approved replayable OTA evidence. No test may use a hard-coded Market, date, or keyword as an implicit production rule.

## 2. Acceptance matrix

| Area | Required cases |
|---|---|
| Page Context | Ctrip Shanghai + `迪士尼度假区`; Ctrip Xianning + `中心花坛`; empty keyword; unknown keyword; wrong city; wrong date; wrong page type |
| Dynamic collection | virtual list with DOM 13 but 30 cumulative unique official IDs; DOM recycling; duplicate IDs; ads/display vs organic positions; target reached; genuine exhaustion; `no_progress != list_exhausted`; timeout; partial; retryable adapter error; missing official ID |
| Task | D0 absolute-date freeze; 4 platforms × D0-D14 = 60 Tasks; priority/sequence; ten-minute expiry; retry timing; bad Task cannot block queue; one device/one Task; offline/re-online |
| Idempotency | same upload twice; network retry; receipt reuse; no duplicate facts |
| Device/security | pending; authorized; revoked; invalid credential; RBAC; device cannot call Admin API; revoked device cannot claim/upload |
| Mapping | candidate is not confirmation; conflicting identity; unmap/remap; historical Fact unchanged; Master Hotel independent of Market |
| Analytics | platform distribution; Master Hotel cross-platform deduplication; minimum/P25/median/mean/P75; Stay Date vs Observation Time; D0 vs D1 is not change; same stay date at different observations is change; partial quality handling |
| Schedule | timezone; no duplicate Batch generation; disabled Schedule; D+n resolved at generation time; `(schedule_id, scheduled_for)` uniqueness |

## 3. Dynamic list acceptance

The collector fixture MUST expose repeated scans where the current DOM count does not increase while new official IDs appear. The expected result is the cumulative unique ID count, not the maximum DOM size. A Ctrip Xianning + `中心花坛` fixture with target 30 and only 13 observed MUST be:

- `complete/list_exhausted` only with verified platform-level end evidence;
- otherwise `partial` or `failed`;
- never `30/30`.

Repeated no-new-ID scans, scroll position at the apparent bottom, temporary DOM stability, and timeout MUST each be tested as insufficient exhaustion evidence by themselves.

An accepted partial Collection MUST be asserted to persist facts without
completing its Task. A complete `list_exhausted` Collection below target MUST
complete its Task while retaining the real observed/target values. After the
maximum Attempts without a complete Collection, the Task MUST be failed.

## 4. Required state and API assertions

Tests MUST assert HTTP status and business/error code independently, including HTTP 204 with no `NO_TASK` error payload, accepted partial upload, duplicate receipt response with `duplicate = true`, and separate Attempt failure codes.

## 5. Milestone gate

Each implementation milestone requires automated tests, acceptance checks, specification review, and explicit completion criteria. A failed gate blocks the next milestone.
