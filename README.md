# LIVV

LIVV is a new local-first project skeleton for a hotel OTA market intelligence and operations platform. This repository starts from zero: no historical code, database, GitHub resource, Cloudflare resource, or compatibility layer is part of this project.

## Directories

- `collector/`: Chrome hotel assistant Collector. It collects OTA page data and talks only to `api.livv.cc`.
- `api/`: Unified API boundary for authentication, authorization, validation, idempotency, device management, Scheduler, and D1 access.
- `ota/`: OTA market and competitor system for authenticated users.
- `admin/`: LIVV administration backend for authenticated users.
- `ops/`: Hotel operations management system for authenticated users.
- `cai/`: Data research and lottery system for authenticated users.
- `docs/`: M00 architecture contracts.

## Domain Plan

- `livv.cc`: public LIVV site, no login required.
- `admin.livv.cc`: administration backend, protected by Cloudflare Access and LIVV RBAC.
- `ota.livv.cc`: OTA market and competitor system, protected by Cloudflare Access and LIVV RBAC.
- `ops.livv.cc`: hotel operations system, protected by Cloudflare Access and LIVV RBAC.
- `cai.livv.cc`: data research and lottery system, protected by Cloudflare Access and LIVV RBAC.
- `api.livv.cc`: single unified LIVV API entry.

## OTA Main Chain

Chrome hotel assistant Collector -> HTTPS -> `api.livv.cc` -> Cloudflare Worker -> D1 -> `ota.livv.cc`.

D1 is the only online source of truth for OTA. Collector devices never access D1 directly. Frontends never write D1 directly. All writes pass through `api.livv.cc`.

## Current Phase

M00: new project skeleton and architecture contracts only.

This phase does not implement product code, initialize Git, create databases, deploy Cloudflare resources, or connect GitHub.

## Recommended Development Order

1. M01: API contract refinement and D1 migration draft.
2. M02: Cloudflare Worker API skeleton with local tests.
3. M03: Collector extension skeleton and device auto-registration.
4. M04: OTA authenticated frontend skeleton.
5. M05: Scheduler minimum model and controlled task execution.
