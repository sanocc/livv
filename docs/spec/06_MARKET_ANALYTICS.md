# LIVV OTA V2 Market Analytics Specification

## 1. Analytical scopes

V2 distinguishes:

- **Platform Market**: one Market observed on one OTA platform;
- **Cross-platform Market**: the same Market compared across supported OTA
  platforms.

Platform Market analytics MUST work without Hotel Mapping. Cross-platform
analytics MUST use confirmed Master Hotel mappings for identity deduplication
and MUST show mapping coverage, including the proportion of platform identities
that remain unmapped.

## 2. Price observation model

Every price observation MUST preserve both:

- `stay_date`: the hotel's requested check-in date (with check-out as part of
  the Task context);
- `observed_at`: the time the OTA page was collected.

Stay Date and Observation Time are never interchangeable. A D0/D1 difference
is a difference in stay date and MUST NOT be described as a price increase or
decrease. Price change is defined only between observations sharing the same
Market, Hotel, Platform, and Stay Date while having different Observation
Times.

## 3. Platform Market statistics

For a selected Market, Platform, and Stay Date, the system MAY compute the
distribution from accepted, usable display prices. The minimum statistics are:

- minimum available price;
- P25;
- median;
- mean;
- P75;
- price percentile for each included observation.

Sold-out or unavailable facts MUST NOT be treated as zero. Currency and price
eligibility MUST be validated before inclusion. The analytics result MUST
retain sample count and quality coverage so a small or partial collection is
not presented as a full market census.

## 4. Cross-platform statistics

Cross-platform aggregation MUST first deduplicate by confirmed Master Hotel.
For each Master Hotel, each platform contributes its lowest available
displayed price for the same Market and Stay Date. The cross-platform
distribution then uses those per-platform minima, not every duplicate room/card
row and not a hotel name join.

The result MUST state which platforms contributed, which identities were
unmapped, and the mapping coverage. It MUST NOT silently exclude unmapped
platform data or claim complete cross-platform coverage when mapping is
incomplete.

## 5. Rankings

Natural rank is calculated independently per Platform Market, based on verified
`organic_position` and the platform's own evidence. Ads do not enter natural
rank. V2 MUST NOT produce a fictional combined or average cross-platform rank;
platform rank columns remain separate.

## 6. Watch and competitor views

The watched hotel view is a presentation of `(Market, Master Hotel)`
relationships. It MAY show current price, price distribution, platform
rankings, mapping coverage, and changes over time. Unwatched hotels continue to
be collected, saved, and included in platform analytics.

## 7. D0-D14 future-price structure

The overview MUST support D0 through D14 as separate future Stay Date slices.
Each slice retains its own check-in/check-out and observation time. The UI MAY
compare slices as a future price structure, but MUST NOT label the difference
between slices as a temporal price change. Temporal change requires repeated
observations for the same Stay Date.

## 8. Collection quality effects

Analytics MUST carry collection quality and stop reason. `complete` with
`list_exhausted` means complete observation of that platform's available result
set, not target attainment. `partial` results MAY appear in exploratory views
with visible quality warnings, but MUST NOT be mixed with complete results
without a quality indicator. `failed` collections MUST NOT contribute price or
rank metrics.

Phase-1 default analytics uses complete Collections for normal core market
statistics. Partial Collections remain real facts and diagnostic evidence, but
MUST NOT be presented as complete market samples by default. UI views MUST
display collection quality, observed/target, and stop reason.

Aggregations SHOULD expose counts by quality, observed/target, and stop reason.
The analytics layer MUST NOT fill missing hotels or prices by interpolation.

## 9. Scope exclusions

V2 Phase 1 does not perform AI price prediction, automated future price
forecasting, or a learned demand model. Descriptive distributions,
observation-to-observation changes, D0-D14 slices, and explicit quality
coverage are the supported analytics scope.
