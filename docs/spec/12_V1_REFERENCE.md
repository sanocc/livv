# LIVV OTA V2 V1 Reference Specification

V1 is reference material only. V2 specifications and frozen product rules always have priority. V1 behavior MUST NOT be copied merely because it exists.

## 1. Permitted reference areas

The team MAY inspect V1 for:

- four-platform M04 Adapter experience;
- official hotel ID extraction;
- pagination, lazy-loading, and virtual-list handling;
- Quality Gate experience;
- device authentication experience;
- Cloudflare Worker/D1 operational experience;
- Hotel Mapping candidate experience.

These references are evidence to evaluate, not contracts. Each reused idea requires independent V2 tests and must respect V2 ownership boundaries.

## 2. Explicitly prohibited inheritance

V2 MUST NOT inherit by default:

- V1 Popup architecture;
- `lastResults`;
- `collectLogs` or local business history;
- fixed Market definitions;
- `m03-default`;
- hard-coded 2026 dates, cities, or Markets;
- M04 Compare/Test UI;
- V1 UI;
- legacy parsers unless an independent audit proves a specific need.

## 3. Recorded V1 lessons

The following are mandatory V2 regression themes:

- keyword loss, specifically `迪士尼度假区` and `中心花坛`;
- treating 13/30 as ordinary success;
- local `lastResults` allowing stale cross-page re-upload;
- Popup owning too much execution responsibility;
- binding `platform_hotels` to one Market.

