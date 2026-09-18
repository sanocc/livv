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
