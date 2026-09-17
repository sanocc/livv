# OTA Design

## Top-Level Pages

`ota.livv.cc` has exactly three top-level pages:

- Market overview.
- Competitor management.
- Collection tasks.

## Market Overview

The top area shows:

- Market.
- Current business day.
- Data update time.

The default business day is today, D0.

The first row has three modules:

- Market price changes.
- Market price bands.
- Market insights.

Market insights may later use Cloudflare Workers AI. If AI fails, a rule-based summary must be used as fallback. AI must not be required for normal page operation.

## Market Price Changes

Do not use a line chart.

Use a rolling display with price increases in the upper half and price decreases in the lower half. Each row shows hotel name, platform logo, lowest price, distance from previous price change, and how many minutes ago it changed.

Hotel names show at most the first 10 Chinese characters, followed by `...` when longer. Hovering the rolling area pauses scrolling. Do not show hotel images.

## Core Metrics

Market overview must include:

- Sellable hotel count.
- Market lowest price.
- Market median price.
- Market average price.
- Today price increases.
- Today price decreases.
- Today sold out.

## Competitor Price Detail

Fields:

- Hotel name.
- Competitor category.
- Market ranking.
- Market lowest price.
- Ctrip.
- Meituan.
- Fliggy.
- Tongcheng.
- Tuniu.
- Price change.

Market lowest price must display one platform logo plus price. If several platforms share the same lowest price, choose by fixed priority: Ctrip, Meituan, Fliggy, Tongcheng, Tuniu. Do not display multiple logos in the main lowest-price cell.

## 14-Day Price Matrix

The matrix is hotel by D0 through D14.

Each date cell shows only the lowest valid price across the five platforms for that hotel and the lowest platform logo. The date header shows month/day, weekday, and legal holiday if any.

Hovering a cell shows each platform logo, platform name, platform lowest price, and collection time.

When no real data exists, the cell remains empty. Prices must not be fabricated.

## Competitor Management

Use a left hotel list and right hotel detail layout. Selecting a hotel on the left updates the details on the right.

Supported hotel categories:

- Own hotel.
- Core competitor.
- Normal competitor.
- Watch hotel.
- Unconfirmed/unclassified.

The page shows independent identities from all five platforms and supports mapping candidates, mapping confirmation, and candidate exclusion. Final mapping is always manual.
