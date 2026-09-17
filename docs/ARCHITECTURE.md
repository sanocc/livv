# LIVV Architecture

## Scope

M00 freezes the local project skeleton and architecture contracts only. No historical project is restored, migrated, or used as the design source. No database or cloud resource is created in this phase.

## Domains

- `livv.cc`: public site, no login required.
- `admin.livv.cc`: administration backend, requires Cloudflare Access plus LIVV RBAC.
- `ota.livv.cc`: OTA market and competitor system, requires Cloudflare Access plus LIVV RBAC.
- `ops.livv.cc`: hotel operations management system, requires Cloudflare Access plus LIVV RBAC.
- `cai.livv.cc`: data research and lottery system, requires Cloudflare Access plus LIVV RBAC.
- `api.livv.cc`: the only unified API entry.

## Modules

- `collector`: Chrome extension agent for OTA collection across Ctrip, Meituan, Fliggy, Tongcheng, and Tuniu.
- `api`: Cloudflare Worker API boundary. It owns authentication, authorization, validation, idempotency, device management, Scheduler, and D1 reads/writes.
- `ota`: authenticated OTA market frontend.
- `admin`: authenticated LIVV administration frontend.
- `ops`: authenticated hotel operations frontend.
- `cai`: authenticated data research and lottery frontend.

## OTA Data Flow

Collector -> HTTPS -> `api.livv.cc` -> Cloudflare Worker -> D1 -> `ota.livv.cc`.

D1 is the only online source of truth for OTA. Collector devices never access D1 directly. OTA frontends never write D1 directly. Every write goes through the API.

## Authentication Boundaries

Human users authenticate through Cloudflare Access and then receive LIVV RBAC authorization. Reserved roles are `owner`, `admin`, `manager`, and `viewer`.

Collector device authentication is separate from human login. Devices auto-register, become `pending`, and require owner/admin approval before they can upload business facts or claim Scheduler work.

## Local Runtime Principle

OTA must not depend on local SQLite or localhost FastAPI. After a Mac reset, reinstalling Collector and completing device registration/authorization must be enough for the device to work again.
