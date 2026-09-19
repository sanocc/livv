# LIVV OTA V2 Security Specification

## 1. Trust zones

V2 has two separately protected API zones:

- **Human management zone** for `ota.livv.cc`, protected by Cloudflare Access;
- **Collector execution zone** for device registration, heartbeat, claim,
  progress, and upload.

Collector endpoints MUST NOT accept human management privileges by implication.
Management endpoints MUST NOT accept a Collector credential as a substitute
for human authentication.

## 2. Human authentication and RBAC

Cloudflare Access MUST protect the human backend. Human users MUST be assigned
one of `viewer`, `manager`, `admin`, or `owner` roles:

- `viewer`: read Markets, hotels, analytics, devices, and execution status;
- `manager`: all viewer permissions, publish Batches/Tasks, create/modify/
  enable/disable Schedules, confirm/remove Hotel Mappings, and watch/unwatch
  competitors;
- `admin`: all manager permissions, authorize/revoke devices, and manage
  ordinary users and roles, excluding owner management;
- `owner`: all permissions, owner-level permission management, and high-risk
  system configuration.

The final resource-scope model MUST be explicit in the API contract. A role
MUST NOT grant more access merely because a browser reached a hidden URL.
Every mutating management action MUST be authorized server-side and audited.

## 3. Device credentials

The device protocol uses `device_id` and `device_credential`. Registration MAY
return a credential once; the Collector stores it locally as permitted by the
Collector specification. Cloudflare MUST store only a credential hash, never
the reusable plaintext credential.

Persistent device authorization state is exactly `pending`, `authorized`, or
`revoked`. Presence is dynamic, derived from `last_heartbeat_at`; it MUST NOT
be represented as an authorization state.

Pending devices MUST NOT claim or upload unless a separate approved bootstrap
operation explicitly permits the action. Revoked devices MUST NOT claim or
upload. Credential comparison, rotation, revocation, and rate limits MUST be
server-side.

## 4. Task and upload protection

Claim, progress, and upload endpoints MUST verify device identity, credential,
authorization state, active lease ownership, Task/Attempt identity, and lease
expiry. A device MUST NOT access another device's Task or upload for an
unowned Attempt.

Uploads MUST use an Attempt-scoped idempotency key. A repeated accepted upload
MUST return the prior acceptance and MUST NOT duplicate Price Facts or complete
a different Task. Idempotency does not bypass context, schema, or lease
validation.

## 5. API minimization

The Collector API MUST expose only the minimum operations needed for
registration, heartbeat, claim, progress/failure reporting, and upload. It
MUST NOT expose D1 credentials, arbitrary SQL, management RBAC, mapping edits,
analytics administration, or unrelated business mutations.

The Collector MUST never access D1 directly. All reads/writes pass through
authenticated Worker APIs. Human APIs and Collector APIs MUST use separate
route groups, authorization checks, and error handling contracts.

## 6. Error contract

Every formal API error MUST contain a stable machine-readable `error_code`.
HTTP status and business code are separate dimensions; clients MUST branch on
`error_code`, never on human-readable error messages.

The minimum shared codes are:

`AUTH_REQUIRED`, `DEVICE_PENDING`, `DEVICE_REVOKED`, `DEVICE_BUSY`, `NO_TASK`,
`LEASE_EXPIRED`, `TASK_NOT_OWNED`, `CONTEXT_MISMATCH`, `WRONG_PAGE_TYPE`,
`NAVIGATION_FAILED`, `COLLECTION_PARTIAL`, `QUALITY_GATE_FAILED`,
`DUPLICATE_UPLOAD`, `INVALID_PAYLOAD`, `NOT_FOUND`, `CONFLICT`,
`RATE_LIMITED`, `INTERNAL_ERROR`.

The API specification MUST define the HTTP mapping, retryability, and safe
client action for every code. Error responses MUST NOT disclose credentials,
internal queries, or unnecessary personal/security data.

## 7. Logging and audit

Workers Logs are operational telemetry for debugging availability and runtime
behavior. Business Audit is durable business history for registration,
authorization, mapping, watch changes, Batch/Task decisions, uploads, and
security actions. They MUST remain separate in purpose, schema, retention, and
access policy.

Logs MUST redact credentials, authorization headers, and sensitive payloads.
Audit records MUST identify actor/device, action, target, time, and outcome.
