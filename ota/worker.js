export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/v1/collections") {
      const { results } = await env.DB.prepare(
        `SELECT id, platform, task_type, market_id, business_date,
                check_in, check_out, quality, status,
                collector_version, source, created_at
         FROM collections
         ORDER BY created_at DESC
         LIMIT 50`
      ).all();

      return json({ ok: true, data: { items: results ?? [] } });
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/api/v1/collections/")
    ) {
      const id = decodeURIComponent(
        url.pathname.slice("/api/v1/collections/".length)
      );

      if (!id || id.includes("/")) {
        return json(
          { ok: false, error: { code: "NOT_FOUND", message: "Not found" } },
          404
        );
      }

      const collection = await env.DB.prepare(
        `SELECT *
         FROM collections
         WHERE id = ?
         LIMIT 1`
      )
        .bind(id)
        .first();

      if (!collection) {
        return json(
          {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "Collection not found"
            }
          },
          404
        );
      }

      const { results } = await env.DB.prepare(
        `SELECT
           pf.id,
           pf.collection_id,
           pf.market_id,
           pf.platform_hotel_id,
           pf.business_date,
           pf.check_in,
           pf.check_out,
           pf.rank_position,
           pf.display_price,
           pf.currency,
           pf.availability,
           pf.collected_at,
           pf.extras_json,
           ph.hotel_name,
           ph.platform,
           ph.platform_hotel_id AS external_hotel_id,
           ph.city
         FROM price_facts pf
         LEFT JOIN platform_hotels ph
           ON ph.id = pf.platform_hotel_id
         WHERE pf.collection_id = ?
         ORDER BY
           CASE WHEN pf.rank_position IS NULL THEN 1 ELSE 0 END,
           pf.rank_position ASC,
           ph.hotel_name ASC`
      )
        .bind(id)
        .all();

      return json({
        ok: true,
        data: {
          collection,
          facts: results ?? []
        }
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/market-overview"
    ) {
      const marketId =
        (
          url.searchParams.get("market_id") ||
          "xn-center-huatan"
        ).trim();

      const market =
        await env.DB.prepare(`
          SELECT
            id,
            name,
            city,
            keyword,
            status,
            timezone
          FROM markets
          WHERE id = ?
          LIMIT 1
        `)
          .bind(marketId)
          .first();

      if (!market) {
        return json(
          {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "Market not found"
            }
          },
          404
        );
      }

      const { results: latestCollections } =
        await env.DB.prepare(`
          WITH ranked AS (
            SELECT
              id,
              platform,
              business_date,
              check_in,
              check_out,
              quality,
              status,
              created_at,
              ROW_NUMBER() OVER (
                PARTITION BY platform
                ORDER BY
                  created_at DESC,
                  id DESC
              ) AS rn
            FROM collections
            WHERE market_id = ?
              AND task_type = 'list'
          )
          SELECT
            id,
            platform,
            business_date,
            check_in,
            check_out,
            quality,
            status,
            created_at
          FROM ranked
          WHERE rn = 1
          ORDER BY platform
        `)
          .bind(marketId)
          .all();

      const collectionIds =
        (latestCollections || [])
          .map((x) => x.id)
          .filter(Boolean);

      let facts = [];

      if (collectionIds.length) {
        const placeholders =
          collectionIds
            .map(() => "?")
            .join(",");

        const result =
          await env.DB.prepare(`
            SELECT
              pf.collection_id,
              pf.platform_hotel_id,
              pf.rank_position,
              pf.display_price,
              pf.availability,
              pf.collected_at,
              ph.platform,
              ph.hotel_name,
              ph.platform_hotel_id
                AS external_hotel_id
            FROM price_facts pf
            JOIN platform_hotels ph
              ON ph.id =
                 pf.platform_hotel_id
            WHERE pf.collection_id
              IN (${placeholders})
            ORDER BY
              ph.platform,
              pf.rank_position
          `)
            .bind(...collectionIds)
            .all();

        facts =
          result.results || [];
      }

      const priced =
        facts.filter(
          (x) =>
            x.display_price != null &&
            Number.isFinite(
              Number(x.display_price)
            )
        );

      const prices =
        priced.map(
          (x) =>
            Number(x.display_price)
        );

      const minPrice =
        prices.length
          ? Math.min(...prices)
          : null;

      const avgPrice =
        prices.length
          ? prices.reduce(
              (sum, x) => sum + x,
              0
            ) / prices.length
          : null;

      const maxPrice =
        prices.length
          ? Math.max(...prices)
          : null;

      const ranges = [
        {
          key: "0-100",
          label: "¥0-100",
          min: 0,
          max: 100
        },
        {
          key: "101-200",
          label: "¥101-200",
          min: 101,
          max: 200
        },
        {
          key: "201-300",
          label: "¥201-300",
          min: 201,
          max: 300
        },
        {
          key: "301-400",
          label: "¥301-400",
          min: 301,
          max: 400
        },
        {
          key: "401+",
          label: "¥401+",
          min: 401,
          max: Infinity
        }
      ];

      const distribution =
        ranges.map((range) => ({
          key: range.key,
          label: range.label,
          count:
            prices.filter(
              (price) =>
                price >= range.min &&
                price <= range.max
            ).length
        }));

      const platformSummary =
        (latestCollections || [])
          .map((collection) => {
            const rows =
              facts.filter(
                (x) =>
                  x.collection_id ===
                  collection.id
              );

            const platformPrices =
              rows
                .filter(
                  (x) =>
                    x.display_price != null
                )
                .map(
                  (x) =>
                    Number(
                      x.display_price
                    )
                );

            return {
              platform:
                collection.platform,

              collection_id:
                collection.id,

              quality:
                collection.quality,

              status:
                collection.status,

              collected_at:
                collection.created_at,

              hotels:
                rows.length,

              priced:
                platformPrices.length,

              min_price:
                platformPrices.length
                  ? Math.min(
                      ...platformPrices
                    )
                  : null,

              avg_price:
                platformPrices.length
                  ? platformPrices.reduce(
                      (sum, x) =>
                        sum + x,
                      0
                    ) /
                    platformPrices.length
                  : null
            };
          });

      const latestAt =
        platformSummary
          .map(
            (x) =>
              x.collected_at
          )
          .filter(Boolean)
          .sort()
          .at(-1) || null;

      return json({
        ok: true,
        data: {
          market,

          summary: {
            observed_identities:
              facts.length,

            priced:
              priced.length,

            min_price:
              minPrice,

            avg_price:
              avgPrice,

            max_price:
              maxPrice,

            platform_count:
              platformSummary.length,

            healthy_platforms:
              platformSummary.filter(
                (x) =>
                  x.status ===
                    "completed" &&
                  x.quality ===
                    "complete"
              ).length,

            latest_at:
              latestAt
          },

          distribution,

          platforms:
            platformSummary,

          facts
        }
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/hotel-mappings/candidates"
    ) {
      return env.API.fetch(request);
    }

    if (request.method === "GET" && url.pathname === "/api/v1/admin/devices") {
      const { results } = await env.DB.prepare(
        `SELECT id, device_id, name, status, collector_version,
                os, arch, browser, browser_version,
                first_seen_at, last_seen_at,
                authorized_at, authorized_by
         FROM devices
         ORDER BY first_seen_at DESC
         LIMIT 100`
      ).all();

      return json({ ok: true, data: { items: results ?? [] } });
    }

    if (url.pathname.startsWith("/api/")) {
      return json(
        { ok: false, error: { code: "NOT_FOUND", message: "Not found" } },
        404
      );
    }

    return env.ASSETS.fetch(request);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

