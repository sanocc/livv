# LIVV API — Phase 6A local foundation

This directory contains the local-only Cloudflare Worker and D1 foundation for the Hotel Assistant. It is intentionally not deployed and does not create or migrate a remote D1 database in this phase.

## Local contract

- `GET /health` is public.
- `POST /v1/devices/register` creates or idempotently re-registers a device. The client keeps a high-entropy `device_secret` locally and submits `SHA256(device_secret)` as `device_secret_verifier`; the API stores that derived verifier in the `device_secret_hash` column and never returns it. This preserves the device HMAC contract without storing the raw client secret on the server.
- `GET /v1/devices/me` returns the authenticated device status, including pending/approved/disabled/revoked status.
- `POST /v1/devices/heartbeat` requires an approved device.
- `/v1/admin/*` returns `ADMIN_AUTH_NOT_CONFIGURED` until human administrator authentication is implemented.

Device-authenticated requests use `X-LIVV-Device-ID`, `X-LIVV-Timestamp`, `X-LIVV-Nonce`, and `X-LIVV-Signature`. The client derives the HMAC key as `SHA256(device_secret)`. The signature is HMAC-SHA256 over:

`METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(REQUEST_BODY)`

The nonce is single-use within the five-minute timestamp window.

## Local checks

```sh
npm test
```

`wrangler.jsonc` contains the existing D1 binding. Remote resource creation/migration/deployment is managed separately from this local contract.

## Admin Auth configuration

Admin routes require a Cloudflare Access JWT in `CF-Access-Jwt-Assertion`, validate it against `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`, and authorize the verified `email` claim against `ADMIN_EMAILS`. These values are intentionally not committed. Protect only `/v1/admin/*` with a Cloudflare Access Application; leave device routes public so HMAC-authenticated devices can register and report status.
