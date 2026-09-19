# LIVV OTA V2 API Contract Specification

## 1. Contract principles

Workers APIs are the only business interface. The Collector MUST NOT access D1 directly. HTTP status and machine-readable business `error_code` are separate; clients MUST NOT branch on error messages.

Every JSON response, except the no-content claim response and the health endpoints, MUST use a stable envelope containing `data` or `error`, a request correlation identifier, and pagination metadata where applicable. Exact serialization belongs to implementation review, but the semantic fields below are mandatory. `GET /health` and `GET /api/v1/health` are explicit liveness/readiness exceptions and retain the minimal `{ "ok": true, "service": "livv-api-v2" }` response.

## 2. Authentication classes

### Public

- `GET /api/v1/health`: unauthenticated liveness/readiness signal;
- `POST /api/v1/collector/register`: bootstrap device registration, rate limited.

### Device Auth

Uses `device_id` plus device credential. The formal Collector API is:

- `POST /api/v1/collector/register`;
- `GET /api/v1/collector/device`;
- `POST /api/v1/collector/heartbeat`;
- `POST /api/v1/collector/tasks/claim`;
- `POST /api/v1/collector/tasks/:id/progress`;
- `POST /api/v1/collector/tasks/:id/fail`;
- `POST /api/v1/collector/collections`.

Endpoints are limited to the device's own status and assigned execution.

### Access User

Uses Cloudflare Access identity and server-side RBAC. Formal management API
resource roots are:

- `/api/v1/markets`;
- `/api/v1/batches`;
- `/api/v1/tasks`;
- `/api/v1/schedules`;
- `/api/v1/devices`;
- `/api/v1/hotel-mappings`;
- `/api/v1/watched-hotels`;
- `/api/v1/analytics`.

Sub-resources MAY be added without crossing the Collector/Access User boundary.

Collector credentials MUST NOT authorize Access User operations.

## 3. Core behavior

### Market and Batch

The Batch endpoint accepts city, nullable keyword, platforms, D0-D14 offsets, target, and immediate/Schedule mode. The server normalizes and resolves the Market; no Market-create endpoint exists. Task creation stores absolute dates and one-night check-out.

### Claim

Claim is atomic and leases at most one Task to one authorized device for ten minutes. If no eligible Task exists, the server returns HTTP 204 with no ordinary error payload; `NO_TASK` is not returned as a normal error object. `DEVICE_BUSY` applies when the device already has an active lease.

### Progress and failure

Progress is Attempt-scoped and cannot complete a Task. Task failure records a machine-readable Attempt `failure_code` and retryability. `CONTEXT_MISMATCH`, `WRONG_PAGE_TYPE`, `NAVIGATION_FAILED`, and `QUALITY_GATE_FAILED` are Attempt semantics; they are not automatically HTTP request failures.

### Upload

Upload validates device, Task, Attempt, lease, context, schema, and quality.
Partial Collection is a valid business result and MAY be accepted and saved.
Collection accepted is not Task completed: only an accepted `complete`
Collection completes the Task. Accepted partial results end the current
Attempt under their actual partial/failure semantics and send the Task through
Retry policy.

Repeated upload with the same accepted idempotency key is server-side idempotent: it creates no second Collection or Price Fact set, returns the existing receipt, and includes `duplicate: true`. It is not an ordinary 4xx failure.

## 4. Error contract

The minimum stable codes are:

`AUTH_REQUIRED`, `DEVICE_PENDING`, `DEVICE_REVOKED`, `DEVICE_BUSY`, `NO_TASK`, `LEASE_EXPIRED`, `TASK_NOT_OWNED`, `CONTEXT_MISMATCH`, `WRONG_PAGE_TYPE`, `NAVIGATION_FAILED`, `COLLECTION_PARTIAL`, `QUALITY_GATE_FAILED`, `DUPLICATE_UPLOAD`, `INVALID_PAYLOAD`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.

The formal HTTP status semantics are:

| HTTP | Meaning |
|---:|---|
| 200/201 | successful read or mutation/creation |
| 204 | successful claim with no available Task |
| 400 | malformed request / `INVALID_PAYLOAD` |
| 401 | missing/invalid authentication / `AUTH_REQUIRED` |
| 403 | pending/revoked device or RBAC denial |
| 404 | `NOT_FOUND` |
| 409 | state conflict such as `DEVICE_BUSY`, `LEASE_EXPIRED`, `TASK_NOT_OWNED`, or `CONFLICT` |
| 422 | parseable request failing a business precondition |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |

An Attempt `failure_code` is stored separately from HTTP status. A successful HTTP upload can carry `quality_status = partial`; an HTTP 409 can report an expired lease without implying that the business collection itself was partial.

## 5. Pagination and idempotency

List APIs MUST accept bounded page size and opaque or stable cursor semantics. Responses MUST report whether more records exist without exposing unbounded queries. Mutating endpoints SHOULD accept an idempotency key where a client retry could otherwise create a Batch, Schedule Run, or upload.

## 6. Authorization requirements

Every Access User mutation MUST enforce viewer/manager/admin/owner rules on the server. Hiding a frontend control is not authorization. Every device endpoint MUST enforce device ownership, authorization state, lease ownership, and credential validity.
