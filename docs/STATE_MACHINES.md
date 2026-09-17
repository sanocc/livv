# State Machines

M01 freezes state semantics. Clients may request actions, but the API owns all state transitions.

## Device

States: `pending`, `authorized`, `revoked`.

- New registration creates `pending`.
- Owner/admin authorization moves `pending` or `revoked` to `authorized`.
- Owner/admin revoke moves `pending` or `authorized` to `revoked`.
- Heartbeat never authorizes or revokes a device by itself.

Permissions:

- `pending`: register, heartbeat, capability heartbeat, local manual collection, self status lookup. No fact upload or Scheduler claim.
- `authorized`: fact upload and Scheduler claim allowed.
- `revoked`: local manual collection allowed. No fact upload or Scheduler claim.

## Plan

Suggested states: `draft`, `enabled`, `paused`, `archived`.

- Create plan as `draft` or `enabled`.
- Enable moves `draft` or `paused` to `enabled`.
- Pause moves `enabled` to `paused`.
- Archive moves any non-archived plan to `archived`.

Saving or enabling a plan does not immediately execute collection. It only allows task units to be generated according to strategy.

## Task Unit

Initial business states:

- `waiting`: queued and eligible when time/capability rules match.
- `leased`: assigned to an attempt with an active lease.
- `running`: device reported active execution.
- `paused`: dispatch/claim paused; legal enqueue remains allowed.
- `success`: completed successfully.
- `failed`: exhausted or terminal failure.
- `cancelled`: intentionally cancelled.
- `missed`: business window missed.
- `blocked`: cannot proceed without external action, such as navigation or human verification.

The API owns transitions. Collector cannot arbitrarily set unit status.

Normal flow: `waiting` -> `leased` -> `running` -> `success`.

Failure/retry flow: `leased` or `running` -> `failed`; retry creates a new unit or new attempt without overwriting the old attempt.

Lease expiry flow: `leased` or `running` -> `waiting` or `failed`, depending on retry policy and business window.

Paused semantics: paused stops claim/dispatch only. Paused waiting time does not directly count as lateness, but the real business window deadline still applies.

## Task Attempt

Suggested states: `leased`, `running`, `success`, `failed`, `expired`, `cancelled`, `stale`.

- Claim creates an attempt with `leased`, `run_id`, and `lease_expires_at`.
- Progress moves `leased` to `running` or updates a running attempt.
- Renew extends `lease_expires_at` only for matching `run_id` and `device_id`.
- Complete moves an active matching attempt to `success`.
- Fail moves an active matching attempt to `failed`.
- Expired lease can make the attempt `expired`.
- Uploads from old `run_id`, wrong `device_id`, or expired attempts are rejected as stale.

One task unit can have multiple attempts. Retries never overwrite previous attempts.
