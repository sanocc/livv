# Ctrip Page Context Contract — M06-A

状态：`IMPLEMENTED — M06-A PAGE TYPE CONTRACT FROZEN`

本契约只定义 Ctrip hotel-list 页面上的任务上下文读取和验证，不实现酒店、价格或 Collection Adapter。

## Context model

`PageContext` contains:

- `platform`: `ctrip`
- `page_type`
- `city`
- `keyword`
- `check_in`
- `check_out`
- `source_url`

Each value is represented as `{ value, state, evidence_source }`, where `state` is `verified`, `empty`, or `unknown`. Empty keyword is represented by `{ value: null, state: "empty", evidence_source: "url.searchWord" }`; a missing or untrusted value is `unknown` and never treated as empty.

## Evidence priority

1. OTA-owned explicit search controls or structured search state.
2. Verified Ctrip URL parameters: `cityName`, `searchWord`, `checkin`, `checkout`.
3. `page_type` is a business-page classification: `https://hotels.ctrip.com/hotels/list` yields `hotel_list` with evidence `url.hotels_list`. It does not assert that results are ready for collection.
4. `unknown` when neither source is available.

The hostname alone does not prove page type. Arbitrary body text, hotel cards, prices, dictionaries, fixed city values, and fixed years are not context evidence. Values are normalized with Unicode NFKC and whitespace trimming, then compared exactly; there is no fuzzy matching.

The current fixture contract uses explicit `data-livv-*` evidence attributes and verified URL parameters so the reader and validator can be tested without scraping arbitrary page text. `result_surface` (`ready`, `loading`, `empty`, or `unknown`) belongs to future M07 collection readiness and is not implemented by M06-A. The real `div.list-item` observation is retained as a M07 Ctrip Result Surface Discovery candidate only; it is not a permanent readiness contract.

## Real-page regressions

These are real Ctrip page validations, not synthetic fixtures:

- Case 1 — Shanghai + `迪士尼度假区`, 2026-09-19 → 2026-09-20: `city` = `上海` / `verified` / `url.cityName`; `keyword` = `迪士尼度假区` / `verified` / `url.searchWord`; dates = `verified` via `url.checkin` / `url.checkout`.
- Case 2 — Xianning + `中心花坛`, 2026-09-19 → 2026-09-20: `city` = `咸宁` / `verified` / `url.cityName`; `keyword` = `中心花坛` / `verified` / `url.searchWord`; dates = `verified` via `url.checkin` / `url.checkout`.
- Case 3 — Xianning with empty keyword, 2026-09-19 → 2026-09-20: `city` = `咸宁` / `verified` / `url.cityName`; `keyword` = `null` / `empty` / `url.searchWord`; dates = `verified` via `url.checkin` / `url.checkout`. `empty` is distinct from `unknown`.
- Case 4 — Ctrip detail page `/hotels/detail/`: outside the `/hotels/list` URL scope; Probe returns `UNSUPPORTED_PAGE`.

For city, a missing or empty/unusable `cityName` is `unknown`; no city dictionary or fallback is used. For keyword, a present empty `searchWord=` is `empty`, while an absent or unreliable parameter is `unknown`. Dates must be strict `YYYY-MM-DD` strings; no year is inferred or added.

## Navigation contract

The Ctrip navigation sequence is: ensure Ctrip surface, set and confirm city, set and confirm keyword, set dates, submit search, wait for results, read context, and verify context. A failed verification causes exactly one complete retry; a second failure returns a stable navigation/context error.

M06-A exposes navigation readiness only. Collection readiness remains false, so production task claim and collection execution remain disabled.
