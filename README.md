# LIVV OTA V2

LIVV OTA V2 is the clean implementation of the LIVV OTA market
collection, governance, task execution and analytics system.

V1 is reference material only.

The authoritative product and engineering specifications live in:

docs/spec/

## Development

Install dependencies and run the M01 checks:

```sh
npm install
npm run typecheck
npm test
npm run test:db
npm run test:device
npm run test:task
npm run wrangler:dry-run
```

The Worker exposes the health contract, M03 device identity/authorization
routes, and the M04 Batch, claim, progress, failure, lease, and retry routes.
Local D1 migration checks use `wrangler.d1.local.toml`; no remote D1 is
configured in this repository.
