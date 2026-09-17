# Collector Design

## Role

Collector is a pure Chrome hotel data collection agent for five fixed platforms:

- Ctrip.
- Meituan.
- Fliggy.
- Tongcheng.
- Tuniu.

## Responsibilities

Collector is responsible for OTA page recognition, hotel list collection, hotel detail collection, local collection result display, API upload, cloud automatic task execution, device heartbeat, capability heartbeat, device status, and platform collectability status.

Collector is not responsible for market administration, Scheduler administration, manual cloud task claiming, early cloud task execution, an engineering log top-level page, a local database service, or a FastAPI service.

## Popup Information Architecture

Top-level tabs are fixed:

- Collection results.
- Task status.
- Device status.

The Popup must render immediately and refresh asynchronously. API requests must not delay the Popup appearing.

Removed top-level concepts:

- Old cloud task page.
- Claim task button.
- Early execute button.
- Engineering fields such as `scheduler_owns_device_pool`.
- Top-level logs tab.
- Tab ID, lease ID, run ID, or other engineering fields unnecessary for normal users.

Logs may exist only under device management diagnostics or development mode.

## Platform Status

The device status page shows a top platform list in one horizontal row:

- Ctrip.
- Meituan.
- Fliggy.
- Tongcheng.
- Tuniu.

The UI uses official platform logos.

Status visuals:

- `ready`: color logo plus green status dot.
- `unknown`: gray or low-saturation logo plus gray status dot.
- `invalid`: gray logo plus red status dot.
- `checking`: translucent logo plus loading state.

Clicking a platform logo opens that platform hotel page for user login and navigation context setup. It must not auto-run collection, auto-upload data, save passwords, or persist OTA cookies by itself.

## Collection Policy

Unified shorthand: 30 / 200 / 10 / 3 Policy.

List normal collection: each platform defaults to the first 30 real ranking positions.

Full market collection: at most 200 unique hotels. If fewer than 200 exist, collect actual count. Stop immediately at 200.

Detail room types: collect all real room types when count is 10 or fewer. When count is greater than 10, take the first 10 in page order. Do not reorder room types by price.

Single room-type quotes: if valid sellable quotes are 3 or fewer, keep all. If more than 3, prefer no breakfast, single breakfast, and double breakfast, taking the lowest valid price for each. If breakfast labels are unreliable, take the first 3 valid sellable prices in ascending price order. Never fabricate breakfast type.

Sold-out quotes do not occupy valid sellable quote slots. When no sellable quote exists, sold-out evidence may be retained with empty price.

## Automatic Task Boundary

Formal Collector must not depend on the user opening Popup to claim work. If Chrome is running, the extension is enabled, the device is authorized and online, and Scheduler is healthy, background automatic work can proceed.
