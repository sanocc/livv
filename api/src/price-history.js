import { date, requireThat, text } from "./domain.js";
import { addDays, CONFIG } from "./config.js";
import { rows, first } from "./db.js";

export async function priceHistory(db, url) {
  const q = url.searchParams;
  const observationDate = date(q.get("observation_date"));
  const checkin = date(q.get("checkin"));
  const checkout = date(q.get("checkout"));
  requireThat(
    checkout > checkin &&
      Date.parse(checkout) - Date.parse(checkin) <= 30 * 86400000,
    "INVALID_STAY",
  );
  const platform = text(q.get("platform"), 100);
  const city = text(q.get("city"), 80);
  const keyword = q.get("keyword") === "" ? "" : text(q.get("keyword"), 120);
  const scope = q.get("scope") ?? "top30";
  requireThat(["top30", "custom", "all"].includes(scope), "INVALID_SCOPE");
  const suppliedLimit = q.get("collection_limit");
  const limit =
    scope === "all" ? null : scope === "top30" ? 30 : Number(suppliedLimit);
  requireThat(
    scope === "all"
      ? suppliedLimit == null || suppliedLimit === "null"
      : Number.isInteger(limit) &&
          limit >= 1 &&
          limit <= CONFIG.maxHotels &&
          (scope !== "top30" ||
            suppliedLimit == null ||
            Number(suppliedLimit) === 30),
    "INVALID_LIMIT",
  );
  const ids = [
    ...new Set(
      (q.get("hotel_ids") ?? "")
        .split(",")
        .filter(Boolean)
        .map((id) => text(id, 100)),
    ),
  ];
  requireThat(ids.length >= 1 && ids.length <= 11, "INVALID_HOTELS");
  requireThat(
    await first(db, "SELECT id FROM platforms WHERE id=?", platform),
    "UNSUPPORTED_PLATFORM",
  );
  const encoded = JSON.stringify(ids);
  const mapped = await rows(
    db,
    `SELECT p.hotel_id,p.original_name hotel_name,h.id standard_hotel_id,h.name standard_name,h.category FROM platform_hotels p LEFT JOIN hotel_mappings m ON m.platform=p.platform AND m.hotel_id=p.hotel_id LEFT JOIN standard_hotels h ON h.id=m.standard_hotel_id WHERE p.platform=? AND p.hotel_id IN (SELECT value FROM json_each(?))`,
    platform,
    encoded,
  );
  const byId = new Map(mapped.map((h) => [h.hotel_id, h]));
  const hotels = ids.map((id) => ({
    platform,
    hotel_id: id,
    hotel_name: byId.get(id)?.hotel_name ?? id,
    standard_hotel_id: byId.get(id)?.standard_hotel_id ?? null,
    standard_name: byId.get(id)?.standard_name ?? null,
    category: byId.get(id)?.category ?? null,
  }));
  requireThat(
    ids.length <= 10 || hotels.some((h) => h.category === "mine"),
    "INVALID_HOTELS",
  );
  const start = new Date(observationDate + "T00:00:00+08:00").toISOString();
  const end = new Date(
    addDays(observationDate, 1) + "T00:00:00+08:00",
  ).toISOString();
  const market =
    "t.platform=? AND t.city=? AND t.keyword=? AND t.checkin=? AND t.checkout=? AND t.scope=? AND t.collection_limit IS ?";
  const context = [platform, city, keyword, checkin, checkout, scope, limit];
  // One baseline per raw identity, strictly before the requested day. Missing prices never replace it.
  const baseline = await rows(
    db,
    `SELECT hotel_id,display_price,observed_at,snapshot_id FROM (SELECT o.hotel_id,o.display_price,s.observed_at,s.id snapshot_id,ROW_NUMBER() OVER(PARTITION BY o.platform,o.hotel_id ORDER BY s.observed_at DESC,s.received_at DESC,s.id DESC) rn FROM market_observations o JOIN snapshots s ON s.id=o.snapshot_id JOIN tasks t ON t.id=s.task_id WHERE ${market} AND s.observed_at<? AND o.platform=? AND o.hotel_id IN (SELECT value FROM json_each(?)) AND o.display_price IS NOT NULL) WHERE rn=1`,
    ...context,
    start,
    platform,
    encoded,
  );
  // Retain every matching snapshot, even if none of the selected hotels was observed in it.
  const data = await rows(
    db,
    `SELECT s.id snapshot_id,s.task_id,s.observed_at,s.received_at,s.market_status,s.stop_reason,s.exhausted,t.status task_status,o.hotel_id,o.hotel_name,o.display_price FROM snapshots s JOIN tasks t ON t.id=s.task_id LEFT JOIN market_observations o ON o.snapshot_id=s.id AND o.platform=? AND o.hotel_id IN (SELECT value FROM json_each(?)) WHERE ${market} AND s.observed_at>=? AND s.observed_at<? ORDER BY s.observed_at,s.received_at,s.id`,
    platform,
    encoded,
    ...context,
    start,
    end,
  );
  // Planned times are not observation timestamps. Keep missing tasks separate from price points.
  const unobservedTasks = await rows(
    db,
    `SELECT t.id task_id,t.plan_id,t.due_at,t.window_start,t.window_end,t.status task_status,t.error_code FROM tasks t LEFT JOIN snapshots s ON s.task_id=t.id WHERE ${market} AND t.due_at>=? AND t.due_at<? AND s.id IS NULL ORDER BY t.due_at,t.id`,
    ...context,
    start,
    end,
  );
  const grouped = new Map();
  for (const row of data) {
    if (!grouped.has(row.snapshot_id))
      grouped.set(row.snapshot_id, {
        snapshot_id: row.snapshot_id,
        task_id: row.task_id,
        observed_at: row.observed_at,
        received_at: row.received_at,
        market_status: row.market_status,
        task_status: row.task_status,
        stop_reason: row.stop_reason,
        exhausted: Boolean(row.exhausted),
        cells: new Map(),
      });
    if (row.hotel_id != null)
      grouped.get(row.snapshot_id).cells.set(row.hotel_id, row);
  }
  const previous = new Map(baseline.map((b) => [b.hotel_id, b]));
  const observations = [...grouped.values()].map(({ cells, ...snapshot }) => {
    const prices = hotels.map((hotel) => {
      const cell = cells.get(hotel.hotel_id);
      const price = cell?.display_price ?? null;
      const old = previous.get(hotel.hotel_id);
      const change = price != null && old ? price - old.display_price : null;
      const point = {
        ...hotel,
        hotel_name: cell?.hotel_name ?? hotel.hotel_name,
        display_price: price,
        missing_reason:
          cell == null
            ? "OBSERVATION_MISSING"
            : price == null
              ? "PRICE_MISSING"
              : null,
        previous_observed_at: old?.observed_at ?? null,
        previous_snapshot_id: old?.snapshot_id ?? null,
        previous_price: old?.display_price ?? null,
        change,
        change_ratio:
          change != null && old.display_price > 0
            ? change / old.display_price
            : null,
      };
      if (price != null)
        previous.set(hotel.hotel_id, {
          display_price: price,
          observed_at: snapshot.observed_at,
          snapshot_id: snapshot.snapshot_id,
        });
      return point;
    });
    const comparable = prices.filter((p) => p.change != null);
    return {
      ...snapshot,
      prices,
      summary: {
        up: comparable.filter((p) => p.change > 0).length,
        down: comparable.filter((p) => p.change < 0).length,
        unchanged: comparable.filter((p) => p.change === 0).length,
        unavailable: prices.length - comparable.length,
      },
    };
  });
  return {
    observation_date: observationDate,
    timezone: CONFIG.timezone,
    checkin,
    checkout,
    platform,
    city,
    keyword,
    scope,
    collection_limit: limit,
    comparison: "PREVIOUS_VALID_SAME_CONTEXT_INCLUDING_PRIOR_DAYS",
    price_context: "HOTEL_LIST_STARTING_PRICE",
    timestamp_context: "LIST_SNAPSHOT",
    mapping_context: "CURRENT",
    hotels,
    observations,
    unobserved_tasks: unobservedTasks,
  };
}
