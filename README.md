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
npm run wrangler:dry-run
```

The Worker currently exposes only `GET /health` and
`GET /api/v1/health`. M01 intentionally has no D1 binding or business routes.
