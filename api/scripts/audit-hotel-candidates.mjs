import { execFileSync } from "node:child_process";
import {
  groupHotelCandidates
} from "../src/domain/hotel-name.ts";

const sql = `
WITH ranked AS (
  SELECT
    pf.platform_hotel_id,
    pf.rank_position,
    pf.display_price,
    pf.collected_at,
    ROW_NUMBER() OVER (
      PARTITION BY pf.platform_hotel_id
      ORDER BY
        pf.collected_at DESC,
        pf.id DESC
    ) AS rn
  FROM price_facts pf
  WHERE pf.market_id = 'xn-center-huatan'
)
SELECT
  ph.id AS platform_hotel_row_id,
  ph.platform,
  ph.platform_hotel_id,
  ph.hotel_name
FROM ranked r
JOIN platform_hotels ph
  ON ph.id = r.platform_hotel_id
WHERE r.rn = 1
ORDER BY ph.platform, ph.hotel_name;
`;

const raw = execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "livv-data",
    "--remote",
    "--json",
    "--command",
    sql
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8"
  }
);

const parsed = JSON.parse(raw);

const rows =
  parsed?.[0]?.results || [];

const suggestions =
  groupHotelCandidates(rows);

const bySize = {};

for (const group of suggestions) {
  bySize[group.members.length] =
    (bySize[group.members.length] || 0) + 1;
}

const identityUse =
  new Map();

for (const group of suggestions) {
  for (const member of group.members) {
    const arr =
      identityUse.get(
        member.platform_hotel_row_id
      ) || [];

    arr.push(
      group.suggestion_id
    );

    identityUse.set(
      member.platform_hotel_row_id,
      arr
    );
  }
}

const reused =
  [...identityUse.entries()]
    .filter(
      ([, groups]) =>
        groups.length > 1
    );

const duplicatePlatformGroups =
  suggestions.filter((group) => {
    const platforms =
      group.members.map(
        (x) => x.platform
      );

    return (
      new Set(platforms).size !==
      platforms.length
    );
  });

const warnings =
  rows.filter(
    (row) =>
      !/^\d{4,}$/.test(
        String(
          row.platform_hotel_id || ""
        )
      )
  );

console.log(
  "===== SUMMARY ====="
);

console.log({
  identities:
    rows.length,

  suggestions:
    suggestions.length,

  by_size:
    bySize,

  identity_warnings:
    warnings.length,

  reused_identities:
    reused.length,

  duplicate_platform_groups:
    duplicatePlatformGroups.length
});

console.log(
  "\n===== WARNINGS ====="
);

console.log(
  warnings
);

console.log(
  "\n===== REUSED IDENTITIES ====="
);

console.log(
  reused.slice(0, 50)
);

console.log(
  "\n===== SUGGESTIONS ====="
);

for (const group of suggestions) {
  console.log(
    JSON.stringify(
      {
        suggested_name:
          group.suggested_name,

        confidence:
          group.confidence,

        members:
          group.members.map(
            (x) => ({
              platform:
                x.platform,

              id:
                x.platform_hotel_id,

              name:
                x.hotel_name,

              score:
                x.score,

              level:
                x.level,

              reasons:
                x.reasons
            })
          )
      },
      null,
      2
    )
  );
}
