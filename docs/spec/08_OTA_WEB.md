# LIVV OTA V2 OTA Web Specification

## 1. Product surface

`ota.livv.cc` MUST have exactly three first-level sections:

1. 市场概览
2. 酒店管理
3. 设备管理

The web application MUST be a native HTML/CSS/ES Modules application served
from Cloudflare Static Assets. Phase 1 MUST NOT introduce React, Vue, or
Next.js.

## 2. 市场概览

The section MUST contain these capabilities:

- Market selection;
- market price distributions;
- watched competitors;
- per-platform natural rankings;
- D0-D14 Stay Date views;
- recent price changes for the same Stay Date over different Observation Times;
- collection quality and observed/target coverage.

Market selection MUST use the cloud's resolved Markets. There MUST NOT be a
manual “新增Market” entry. A new Market is created only as a side effect of
publishing a Batch with normalized city and keyword.

The overview MUST distinguish Platform Market from Cross-platform Market,
display mapping coverage for cross-platform views, retain actual
`observed/target` and `stop_reason`, and never render 13/30 as 30/30.

The D0-D14 controls select separate Stay Dates. The UI MUST NOT call D0 versus
D1 a price rise/fall. Price changes require the same Market, Hotel, Platform,
and Stay Date with different Observation Times.

## 3. 酒店管理

The section MUST contain:

- 酒店: OTA identities and Master Hotels;
- 待映射: candidate mappings awaiting human confirmation;
- 关注竞品: Market + Master Hotel watch relationships.

Mapping UI MUST distinguish candidate from confirmed, enforce that one OTA
identity cannot be confirmed to two Master Hotels, and expose audit history for
confirm, reject, unmap, and remap. Hotel management MUST not alter historical
Price Facts. Watch/unwatch is Phase-1 binary state and MUST not stop collection
or analytics for unwatched hotels.

The mapping and watch controls MUST be enabled only for `manager`, `admin`, or
`owner` according to the Security specification. The frontend MUST NOT be the
authorization mechanism.

## 4. 设备管理

The section MUST contain:

- 设备: device identity, authorization state, and dynamic presence;
- 任务: Batch/Task/Attempt status and lease information;
- 计划: Schedule configuration and generated Batches;
- 执行情况: progress, observed/target, quality, and stop reasons;
- 失败记录: failed/expired Attempts and stable error codes.

Persistent device status is only pending/authorized/revoked. Online/offline
must be computed from heartbeat freshness and displayed separately.

## 5. Batch creation

Batch creation MUST accept city, nullable keyword, platforms, D0-D14 selections,
target hotels (default 30), and immediate/Schedule mode. It MUST show the
normalized Market identity and timezone used by the cloud after resolution.
The UI MUST NOT provide a direct Market-create form or allow arbitrary Market
names.

After submission, the UI SHOULD show the immutable absolute check-in and
check-out dates created for each Task. It MUST not suggest that the Collector
will recalculate D+n.

## 6. Quality and mapping presentation

Complete, partial, and failed collection quality MUST be visually and
semantically distinct. A complete `list_exhausted` result MAY be below target,
but the actual count and stop reason remain visible. Failed collections MUST
not contribute as valid price/rank data.

Cross-platform hotel cards MUST indicate confirmed mapping coverage. An
unmapped OTA identity MUST remain visible in platform views rather than being
silently dropped.
