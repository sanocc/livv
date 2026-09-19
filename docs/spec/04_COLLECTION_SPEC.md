# LIVV OTA V2 Collection Specification

## 1. Scope

This is the Phase-1 List Task contract for Ctrip, Meituan, Fliggy, and
Tongcheng. It defines facts visible on a hotel list page. It does not define
hotel detail collection.

## 2. Collection envelope

Every result MUST identify the Task/Attempt and verified Page Context, and MUST
contain:

- `platform`;
- `market_id` or the cloud-resolved Market identity;
- absolute `check_in` and `check_out`;
- `target_hotels`;
- `observed` after official-ID deduplication;
- `quality_status`: `complete`, `partial`, or `failed`;
- `stop_reason`;
- `collected_at`;
- normalized hotel facts;
- adapter and collector protocol versions.

The result MUST be uploadable without relying on local history. Cloudflare is
the durable owner after acceptance.

## 3. Required hotel facts (P0)

Each accepted hotel fact MUST contain or explicitly represent:

- `platform_hotel_id` — official platform identity;
- `hotel_name`;
- `display_position`;
- `is_ad`;
- `display_price`, or an explicit sold-out/price-unavailable state;
- `currency`;
- `availability`;
- `source_url`;
- `collected_at`.

The platform hotel ID MUST come from a platform-authoritative link, embedded
state, attribute, or equivalent evidence. A name, URL slug without proof, or
Collector-generated surrogate MUST NOT be accepted as the official ID.

If a required value cannot be established, the fact MUST be rejected or the
collection MUST fail according to the platform contract; it MUST NOT be
guessed.

## 4. Optional facts (P1)

When clear evidence exists, the adapter MAY collect:

- `organic_position`;
- `room_name`;
- `reference_price`;
- `promotion_text`;
- `inventory_text`;
- `rating`;
- `review_count`.

Unavailable or ambiguous P1 values MUST be `null` (or an empty structured
value where the field contract requires it). They MUST NOT be inferred from
nearby text or visual appearance.

## 5. Advertising and ranking

`display_position` is the visible card order. `organic_position` is the
natural rank when the platform provides evidence. `is_ad` identifies paid or
promoted placement. Ads MUST remain in display order but MUST NOT participate
in organic ranking calculations. If organic position cannot be verified, it is
null; display position MUST not be relabeled as organic position.

## 6. Platform adapter boundary

Each platform has three explicit logical components:

1. Navigation Adapter: opens and searches the OTA;
2. Page Context Reader: reads real search state;
3. Collection Adapter: extracts list cards and evidence.

The Page Context `page_type` identifies the business page and is distinct from
collection readiness. A future platform result-surface contract MAY classify
the surface as `ready`, `loading`, `empty`, or `unknown`; that classification
belongs to the Collection Gate, not the M06 Context Reader.

The Collection Adapter MUST start from actual hotel cards, use explicit
platform evidence, deduplicate by official ID, and return normalized facts. It
MUST NOT scan the whole page for hotel-looking text, choose the smallest
number as a price, or upload directly to D1/API.

Each platform Adapter MUST document and test its own evidence contract for
official hotel ID, hotel card boundary, price/availability, ad status, and
list-end detection. The master specification MUST NOT prescribe unverified
CSS selectors. Ctrip MUST include the Shanghai + `迪士尼度假区` and Xianning +
`中心花坛` regressions.

## 7. Pagination and stopping

The adapter MUST maintain a cumulative in-memory set of unique official hotel
IDs for the Attempt. It MUST add an ID when it appears in any scan and MUST
not use the number of currently mounted DOM cards as `observed`. A virtual list
may contain 13 cards in every scan while nine cards are new IDs after a scroll;
the cumulative count is then 22.

The adapter MUST continue scrolling/pagination only while progress is made and
the target has not been reached. It MUST stop with exactly one of:

- `target_reached`: at least target unique official-ID facts were accepted;
- `list_exhausted`: verified platform-level evidence that the real result set
  has ended;
- `no_progress`: repeated pagination/scroll action produced no new eligible
  cards;
- `timeout`: the bounded collection deadline was reached;
- `adapter_error`: an unrecoverable platform-specific extraction error.

The stop reason MUST be recorded even when the list is empty. No-progress,
unchanged scrolling, timeout, or seeing only N cards in the current DOM MUST
NOT be represented as `list_exhausted`.

## 8. Quality status semantics

`complete` means the adapter completely observed the platform result set under
the verified context: either `target_reached`, or `list_exhausted` with valid
platform-level exhaustion evidence and no fatal Quality Gate violation. It does
not necessarily mean target count was reached. The UI/API MUST always retain
actual `observed`, `target`, and `stop_reason`; 13/30 MUST never be rendered as
30/30.

`partial` means the adapter produced some usable facts but stopped before the
target without qualifying as valid exhaustion, for example `no_progress`,
`timeout`, or a retryable adapter error. A result of 13/30 MUST be partial
unless the adapter positively proved `list_exhausted`.

`failed` means no acceptable collection envelope can be trusted, including
context contamination, fatal identity/price integrity problems, or
`adapter_error` with unusable output. Failed results MUST NOT be presented as
ordinary successful market data.

The Ctrip regression `咸宁 · 中心花坛`, target 30 and observed 13, MUST remain
partial or failed when no verified list-end evidence exists. It MUST become
complete with `stop_reason = list_exhausted` only when the Ctrip contract proves
the result set genuinely contains only 13 eligible unique official IDs.

## 9. Quality Gate

Before upload, the Collector MUST verify at least:

- every accepted fact has a non-empty official platform ID;
- hotel name is present;
- non-sold-out display price is numeric and currency is explicit;
- no duplicate official IDs remain;
- positions are valid for the platform evidence available;
- all facts share the verified Task/Page Context;
- `observed` equals the deduplicated accepted fact count;
- stop reason and quality status are mutually consistent.

The gate MUST preserve evidence or evidence references sufficient to explain
why an ID, price, ad flag, or organic position was accepted. Evidence is for
auditability, not a license to guess.

## 10. Excluded data

List Tasks MUST NOT collect full hotel details, all room types, all rate plans,
complete breakfast/cancellation policies, all facilities, hotel images, or
review body text. Future Detail Tasks require a separate specification and
separate acceptance criteria.

## 11. Upload and cloud acceptance

The Collector MUST upload only after Context Gate and Quality Gate pass (or
after the contract explicitly allows a `partial` envelope). Cloudflare MUST
validate the envelope and persist an accepted Collection. Collection acceptance
does not itself complete the Task. Only an accepted `complete` Collection may
transition the Task to completed; an accepted `partial` Collection ends the
current Attempt under its actual partial/failure semantics and sends the Task
through Retry policy. A local `complete` quality status is never enough.
