# Error Codes

API errors use this shape:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  }
}
```

`code` is stable. `message` is safe to display. `details` is optional structured context and must not contain secrets.

## Collector Reserved Codes

- `AUTH_REQUIRED`: missing or invalid device credential.
- `DEVICE_PENDING`: device exists but is not authorized for upload or Scheduler claim.
- `DEVICE_REVOKED`: device has been revoked.
- `INVALID_PAYLOAD`: request body failed validation.
- `DUPLICATE_PAYLOAD`: same idempotent upload already accepted.
- `LEASE_EXPIRED`: attempt lease is no longer active.
- `STALE_ATTEMPT`: upload/progress/complete does not match the active attempt, `run_id`, or device.
- `NAVIGATION_NOT_READY`: required platform navigation context is unavailable.
- `HUMAN_VERIFICATION_REQUIRED`: platform requires human verification or risk-control action.
- `PARSE_ERROR`: Collector could not parse required page data.
- `PAGE_LOAD_ERROR`: platform page did not load to the required state.
- `NETWORK_ERROR`: network failure prevented task progress.
- `TASK_CANCELLED`: task was cancelled before completion.

## General Codes

- `ACCESS_REQUIRED`: Cloudflare Access identity is required.
- `FORBIDDEN`: authenticated actor lacks required LIVV RBAC permission.
- `BAD_JSON`: request body is not valid JSON.
- `METHOD_NOT_ALLOWED`: path exists but the HTTP method is unsupported.
- `NOT_FOUND`: target resource does not exist or is not visible to the actor.
- `NOT_IMPLEMENTED`: endpoint exists as a skeleton but its business capability is intentionally disabled in the current milestone.
- `CONFLICT`: request conflicts with current resource state.
- `RATE_LIMITED`: caller exceeded accepted request rate.
- `INTERNAL_ERROR`: unexpected server failure.

`UNKNOWN_ERROR` must not be the ordinary fallback for Collector-visible failures.
