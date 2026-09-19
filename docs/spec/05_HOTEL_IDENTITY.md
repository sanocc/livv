# LIVV OTA V2 Hotel Identity and Mapping Specification

## 1. Identity layers

V2 distinguishes three identities:

- **OTA Hotel Identity**: a platform-scoped identity identified by
  `(platform, platform_hotel_id)`. It is created from an official platform
  hotel ID and is not inferred from a name.
- **Master Hotel**: a cloud-owned cross-platform business identity. It is not
  owned by, and MUST NOT be scoped to, a single Market.
- **Market Hotel relationship**: the relationship between a Market and a
  Master Hotel, including whether the hotel is watched in that Market.

An OTA Hotel Identity MAY appear in many Markets through accepted collection
facts. A Master Hotel MAY appear in many Markets. A Master Hotel MAY have one
OTA identity per supported platform, subject to mapping evidence.

## 2. Identity creation and immutability

The official `platform_hotel_id` is the stable OTA identity key. Hotel name,
address, URL, rating, or a Collector-generated fallback MUST NOT substitute for
it. The identity record SHOULD retain the latest observed name and evidence,
but changes in display name MUST NOT create a second OTA identity.

Accepted historical Price Facts MUST retain their original OTA identity,
Market, Task/Collection, stay date, observation time, and observed values.

## 3. Master Hotel mapping

Mapping is a cloud business operation with two states:

- `candidate`: a recommendation for review;
- `confirmed`: an operator-approved mapping.

Candidates MAY be generated from names, addresses, coordinates, or other
signals, but they are recommendations only. The system MUST NOT silently turn a
candidate into a confirmed mapping. Final confirmation requires a human with
the appropriate management permission.

At any time, one OTA Hotel Identity MUST NOT have confirmed mappings to two
different Master Hotels. A uniqueness conflict MUST be rejected and surfaced
as a business conflict. A Master Hotel is allowed to have identities from
multiple platforms.

Mapping a hotel does not merge historical records, rewrite Price Facts, or
change the original Market. Unmapping and remapping MUST preserve all original
facts and MUST create an Audit record containing actor, time, previous state,
new state, reason, and affected identities.

## 4. Market watch relationship

The watch relationship is `(market_id, master_hotel_id)` and is separate from
identity mapping. Phase 1 supports only two states: `watched` and `not_watched`.
It MUST NOT implement priority tiers, weights, alert rules, or competitor
segments without a later specification.

Every hotel remains in collection, storage, and analytics regardless of watch
state. Watching a hotel changes presentation/filtering and relevant overview
views only; it MUST NOT change Task generation, collection eligibility, price
fact persistence, or ranking calculations.

## 5. Audit and access

Create, confirm, reject, unmap, remap, watch, and unwatch operations MUST be
audited. Audit records MUST be append-oriented and must identify the human
actor or system actor. A user interface MUST show whether a mapping is a
candidate or confirmed and MUST NOT imply certainty for candidates.

Mapping and watch APIs MUST be authorized by the Security/RBAC specification.
Collectors MUST NOT create, confirm, remove, or modify mappings.

## 6. Data quality boundaries

Unmapped OTA identities remain valid platform-market data. Analytics MUST be
able to operate at platform-market level without mapping. Cross-platform
analytics MUST explicitly report mapping coverage and MUST NOT treat an
unmapped identity as equivalent to a Master Hotel.
