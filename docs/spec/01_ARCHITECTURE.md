# LIVV OTA V2 Architecture Specification

This document is subordinate to `00_MASTER_SPEC.md`. It defines boundaries and
flows, not implementation code.

## 1. Logical components

### 1.1 Cloudflare control plane

The control plane MUST own authentication, device registration, Market
normalization/resolution, Batch creation, D+n expansion, Task scheduling and leasing,
Attempt state, upload acceptance, deduplication, durable collection history,
and audit/analytics inputs.

It MUST be the only component allowed to decide whether an upload completes a
Task. It MUST validate that the upload belongs to the leased Task and Attempt,
that its context matches the Task, and that its idempotency identity has not
already been accepted.

### 1.2 Web application

The web application MAY create Batches, display Markets and task progress, and
display collection facts and quality. It MUST use cloud APIs. It MUST NOT
create Markets directly, manufacture Task completion, or treat a Collector's
local state as business truth. Its first-level navigation is limited to Market
Overview, Hotel Management, and Device Management as defined in
`08_OTA_WEB.md`.

### 1.3 Collector execution terminal

The Collector consists logically of:

- a background/runtime coordinator whose lifetime is independent of the Popup;
- a Navigation Adapter per platform;
- a Page Context Reader per platform;
- a Collection Adapter per platform;
- a Quality Gate;
- a cloud protocol client;
- a small status/control surface.

The Popup MAY show status and request safe controls. Closing it MUST NOT stop a
running task. Task execution MUST be owned by the background/runtime
coordinator, not the Popup document.

### 1.4 OTA-specific code

Each platform implementation MUST separate Navigation, Page Context reading,
and Collection. Shared code MAY provide contracts, timing utilities, and
validation, but MUST NOT hide platform-specific evidence rules.

## 2. Authoritative data flow

```text
Web user -> Cloud Batch API -> Market resolve -> absolute Tasks
                                      |
                              Task queue / lease
                                      v
Authorized Collector -> Navigation -> Page Context -> Context Gate
                                      -> Collection Adapter -> Quality Gate
                                      -> accepted upload -> Cloud completion
```

The Collector MAY hold only one leased Task and one in-memory execution
Session. Cloudflare remains authoritative if the Collector disconnects.

## 3. Cloud state ownership

Cloudflare MUST durably own at least the following conceptual records:

- Market identity and status;
- Batch definition and lifecycle;
- immutable Task context, priority, and sequence;
- Attempt, lease, retry, and acceptance state;
- device identity/status and credential metadata;
- accepted collection envelope and hotel facts;
- audit events and quality metrics.

Cloudflare MUST also own Master Hotels, OTA Hotel Identities, mapping history,
Market/Hotel watch relationships, and analytics derived from accepted facts.
An OTA identity MUST have at most one active mapping to a Master Hotel.

Exact D1 tables and API representations belong to the later database/API
specifications and MUST preserve these ownership rules.

## 4. Collector runtime state

The runtime Session MAY contain the leased Task, Attempt/lease data, current
tab/window reference, navigation progress, Page Context, collected facts,
Quality Gate result, upload response, and transient diagnostics. This state MAY
be reconstructed or discarded after completion/failure.

Only device credentials and minimal technical configuration MAY survive a
browser restart. No runtime Session field becomes business history merely
because it was serialized temporarily.

## 5. Boundary rules

- Collector MUST NOT resolve or create Markets.
- Collector MUST NOT compute D+n or change frozen dates.
- Collector MUST NOT choose a different Task because it prefers one.
- Collector MUST NOT upload outside a valid lease and Attempt.
- Adapter MUST NOT call D1 or cloud business APIs directly.
- Cloudflare MUST NOT depend on DOM selectors or OTA page internals.
- Web UI MUST NOT infer quality from row count alone.
- Collector MUST NOT access D1 directly; all business operations go through
  the Collector API.
- Collector API and human management API MUST be separate trust boundaries.
- Workers operational logs and business Audit records MUST remain distinct.

## 6. Failure containment

Navigation failure, Page Context mismatch, adapter failure, Quality Gate failure,
upload rejection, credential rejection, and lease expiry are separate failure
classes. The Collector MUST report the most specific class available; the
cloud state machine decides whether the Attempt is failed, expired, or
retryable.

No client-side retry may silently create a second business collection. Uploads
MUST carry a stable Attempt-scoped idempotency key and Cloudflare MUST return
the original acceptance for a repeated accepted key.

## 7. Deployment constraints

Phase 1 SHOULD remain one Cloudflare project with Workers, D1, and Static
Assets. The web layer MUST use native HTML/CSS/ES Modules. React, Vue, and
Next.js are excluded. Docker, PostgreSQL, Redis, independent servers,
Cloudflare Queues, Durable Objects, and R2 are also excluded by default. Any
new service, queue, cache, or framework requires an explicit architecture
decision and must not weaken Cloudflare's authoritative role.
