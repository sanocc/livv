# Device Authorization

## Model

Device authorization uses automatic registration plus manual backend approval.

The old authorization-code model is removed. Users never copy, view, or enter tokens or authorization codes.

## Registration Flow

After a new Collector is installed:

1. Collector generates a stable `device_id`.
2. Collector connects to `api.livv.cc`.
3. Collector automatically registers the device.
4. The device defaults to `pending`.

## Pending

Pending devices may:

- Perform local manual collection.
- Send heartbeat.
- Send capability heartbeat.
- Report device information.
- Query their own authorization status.

Pending devices may not:

- Upload price facts to D1.
- Claim Scheduler cloud tasks.
- Modify business data.

## Backend Approval

The OTA collection task device list automatically shows pending devices with:

- Device name.
- `pending` status.
- Collector version.
- OS.
- Architecture.
- Chrome version.
- First seen time.
- Last online time.

Owner/admin users can click authorize. The service changes the device to `authorized`. Collector receives the new state on the next heartbeat.

## Authorized

Authorized devices may upload facts to D1, claim Scheduler tasks, and execute cloud automatic collection. Authorization is long-lived until revoked in the backend.

## Revoked

Revoked devices may continue local manual collection. They may not upload to D1 or claim Scheduler tasks.

## Credentials

Device credentials may exist internally. They must be fully automatic and hidden from users.
