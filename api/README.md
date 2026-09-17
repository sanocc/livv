# API

Cloudflare Worker API skeleton for `api.livv.cc`.

M02 implements the local Worker foundation only:

- `fetch(request, env, ctx)` entrypoint.
- Safe `scheduled(event, env, ctx)` skeleton.
- Lightweight router.
- Unified success/error responses.
- Type-safe env bindings.
- Mockable auth/RBAC boundaries.
- Markets read/create/get flow.
- Collector device auto-register and own-device query flow.
- Repository/service layering over D1.
- Audit and structured logging helpers.

This phase does not connect to real Cloudflare, create production D1, deploy, initialize Git, implement OTA UI, or implement Collector parser/runtime.

## Local Commands

- `npm run validate:schema`: validate `migrations/0001_initial.sql` with a temporary SQLite database.
- `npm test`: run Worker tests with Vitest and the Cloudflare Workers pool.
- `npm run typecheck`: run TypeScript checking.
- `npm run dev`: start Wrangler locally.

<!-- automatic deployment verification -->
