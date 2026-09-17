# Scheduler Design

M00 writes design only. Scheduler is not implemented in this phase.

## Model

Long-term collection plan -> `task_unit` -> `task_attempt`.

Saving or enabling a long-term plan does not immediately execute it. Immediate collection creates a separate high-priority `task_unit`.

## D0-D14 Strategy

- D0: T1, T2, T3, T4, T5. Five times per day.
- D1: T1, T3, T4, T5. Four times per day.
- D2-D3: T1, T3, T4. Three times per day.
- D4-D7: T1, T4. Two times per day.
- D8-D14: T3. One time per day.

## Time Windows

- T1: 08:00-11:00.
- T2: 11:00-14:00.
- T3: 14:00-18:00.
- T4: 18:00-22:00.
- T5: 22:00-next day 04:00.

T5 belongs to the previous business day even when it crosses midnight.

Tasks execute with staggering inside each time window. They must not all run at the beginning of the window.

## Execution Principles

Scheduler must support:

- Background automatic claim.
- Single-device serial execution.
- Multi-device allocation.
- Lease.
- Renew.
- Progress.
- Upload.
- Complete.
- Retry.
- Idempotency.
- Stale attempt protection.
- Device capability.
- Navigation context.

Collector must not depend on Popup being open to claim work. When Chrome is running, the extension is enabled, the device is authorized and online, and Scheduler is healthy, automatic work should proceed in the background.

## Paused Semantics

Paused stops task dispatch and claim only. It must not stop legal task enqueueing.

Waiting time during paused periods must not directly count as lateness. Actual business window deadlines still remain.

## Errors

Errors must include `error_code`, `stage`, `safe_message`, `platform`, and `retryable`.

Do not collapse errors into only `PARSE_ERROR` or `UNKNOWN_ERROR`.

Human verification and risk control must be explicitly recognized, for example as `human_verification_required`. The system must not attempt to bypass verification.
