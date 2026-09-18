import { all } from "./db";

export interface MappingCandidateRow {
  platform_hotel_row_id: string;
  platform: string;
  platform_hotel_id: string;
  hotel_name: string;
  city: string | null;
  last_observed_at: string;
  latest_rank: number | null;
  latest_price: number | null;
  mapping_status: string | null;
  master_hotel_id: string | null;
  master_hotel_name: string | null;
}

export class HotelMappingRepository {
  constructor(
    private readonly db: D1Database
  ) {}

  async listCandidates(
    marketId: string
  ): Promise<MappingCandidateRow[]> {
    return all<MappingCandidateRow>(
      this.db,
      `
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
        WHERE pf.market_id = ?
      )
      SELECT
        ph.id AS platform_hotel_row_id,
        ph.platform,
        ph.platform_hotel_id,
        ph.hotel_name,
        ph.city,
        r.collected_at AS last_observed_at,
        r.rank_position AS latest_rank,
        r.display_price AS latest_price,
        hm.status AS mapping_status,
        h.id AS master_hotel_id,
        h.name AS master_hotel_name
      FROM ranked r
      JOIN platform_hotels ph
        ON ph.id = r.platform_hotel_id
      LEFT JOIN hotel_mappings hm
        ON hm.platform_hotel_row_id = ph.id
       AND hm.status = 'confirmed'
      LEFT JOIN hotels h
        ON h.id = hm.hotel_id
      WHERE r.rn = 1
      ORDER BY
        ph.hotel_name,
        ph.platform
      `,
      marketId
    );
  }
}

export interface ConfirmablePlatformHotel {
  id: string;
  platform: string;
  platform_hotel_id: string;
  hotel_name: string;
}

export interface ConfirmMappingInput {
  hotelId: string;
  hotelName: string;
  city: string | null;
  marketId: string;
  platformHotels: ConfirmablePlatformHotel[];
  actorId: string;
  auditId: string;
  mappingIds: string[];
  now: string;
}

export interface ConfirmMappingResult {
  hotel_id: string;
  hotel_name: string;
  mapping_count: number;
}

export class HotelMappingWriteRepository {
  constructor(
    private readonly db: D1Database
  ) {}

  async marketExists(
    marketId: string
  ): Promise<boolean> {
    const row =
      await this.db
        .prepare(
          "SELECT id FROM markets WHERE id = ? AND status = 'active' LIMIT 1"
        )
        .bind(marketId)
        .first<{ id: string }>();

    return Boolean(row);
  }

  async getObservedPlatformHotels(
    marketId: string,
    rowIds: string[]
  ): Promise<ConfirmablePlatformHotel[]> {
    if (!rowIds.length) {
      return [];
    }

    const placeholders =
      rowIds.map(() => "?").join(",");

    const result =
      await this.db
        .prepare(
          `
          SELECT DISTINCT
            ph.id,
            ph.platform,
            ph.platform_hotel_id,
            ph.hotel_name
          FROM price_facts pf
          JOIN platform_hotels ph
            ON ph.id = pf.platform_hotel_id
          WHERE pf.market_id = ?
            AND ph.id IN (${placeholders})
          `
        )
        .bind(
          marketId,
          ...rowIds
        )
        .all<ConfirmablePlatformHotel>();

    return result.results ?? [];
  }

  async getConfirmedMappings(
    rowIds: string[]
  ): Promise<
    Array<{
      platform_hotel_row_id: string;
      hotel_id: string;
    }>
  > {
    if (!rowIds.length) {
      return [];
    }

    const placeholders =
      rowIds.map(() => "?").join(",");

    const result =
      await this.db
        .prepare(
          `
          SELECT
            platform_hotel_row_id,
            hotel_id
          FROM hotel_mappings
          WHERE status = 'confirmed'
            AND platform_hotel_row_id
              IN (${placeholders})
          `
        )
        .bind(...rowIds)
        .all<{
          platform_hotel_row_id: string;
          hotel_id: string;
        }>();

    return result.results ?? [];
  }

  async confirm(
    input: ConfirmMappingInput
  ): Promise<ConfirmMappingResult> {
    const statements:
      D1PreparedStatement[] = [];

    statements.push(
      this.db
        .prepare(
          `
          INSERT INTO hotels (
            id,
            name,
            city,
            status,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, 'active', ?, ?)
          `
        )
        .bind(
          input.hotelId,
          input.hotelName,
          input.city,
          input.now,
          input.now
        )
    );

    input.platformHotels.forEach(
      (hotel, index) => {
        statements.push(
          this.db
            .prepare(
              `
              INSERT INTO hotel_mappings (
                id,
                hotel_id,
                platform_hotel_row_id,
                platform,
                status,
                source,
                evidence_json,
                is_primary,
                confirmed_by,
                confirmed_at,
                created_at,
                updated_at
              )
              VALUES (
                ?, ?, ?, ?,
                'confirmed',
                'manual',
                ?,
                1,
                ?,
                ?,
                ?,
                ?
              )
              `
            )
            .bind(
              input.mappingIds[index],
              input.hotelId,
              hotel.id,
              hotel.platform,
              JSON.stringify({
                market_id:
                  input.marketId,
                platform_hotel_id:
                  hotel.platform_hotel_id,
                hotel_name:
                  hotel.hotel_name
              }),
              input.actorId,
              input.now,
              input.now,
              input.now
            )
        );
      }
    );

    statements.push(
      this.db
        .prepare(
          `
          INSERT INTO audit_events (
            id,
            actor_type,
            actor_id,
            action,
            target_type,
            target_id,
            metadata_json,
            created_at
          )
          VALUES (
            ?,
            'access_user',
            ?,
            'hotel_mapping.confirm',
            'hotel',
            ?,
            ?,
            ?
          )
          `
        )
        .bind(
          input.auditId,
          input.actorId,
          input.hotelId,
          JSON.stringify({
            market_id:
              input.marketId,
            hotel_name:
              input.hotelName,
            platform_hotel_row_ids:
              input.platformHotels.map(
                (hotel) => hotel.id
              )
          }),
          input.now
        )
    );

    await this.db.batch(
      statements
    );

    return {
      hotel_id:
        input.hotelId,
      hotel_name:
        input.hotelName,
      mapping_count:
        input.platformHotels.length
    };
  }
}
