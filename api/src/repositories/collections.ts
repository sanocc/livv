import type { UploadCollectionInput } from "../schemas/collections";

const DEFAULT_MARKET_ID = "m03-default";

export class CollectionRepository {
  constructor(private readonly db: D1Database) {}

  async ensureDefaultMarket() {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO markets
         (id, name, city, keyword, status, timezone, created_at, updated_at)
         VALUES (?, 'M03 Default', '未分区', 'hotel', 'active', 'Asia/Shanghai', ?, ?)`,
      )
      .bind(DEFAULT_MARKET_ID, now, now)
      .run();
    return DEFAULT_MARKET_ID;
  }

  async resolveDeviceRowId(deviceIdOrRowId: string) {
    const row = await this.db
      .prepare("SELECT id FROM devices WHERE id = ? OR device_id = ?")
      .bind(deviceIdOrRowId, deviceIdOrRowId)
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  async findByIdempotencyKey(key: string) {
    return this.db
      .prepare("SELECT id, idempotency_key, created_at FROM collections WHERE idempotency_key = ?")
      .bind(key)
      .first<{ id: string; idempotency_key: string; created_at: string }>();
  }

  async upsertPlatformHotel(input: {
    marketId: string;
    platform: string;
    externalId: string;
    hotelName: string;
    city?: string | null;
    now: string;
  }) {
    const existing = await this.db
      .prepare("SELECT id FROM platform_hotels WHERE platform = ? AND platform_hotel_id = ?")
      .bind(input.platform, input.externalId)
      .first<{ id: string }>();
    if (existing?.id) return existing.id;

    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO platform_hotels (
           id, market_id, platform, platform_hotel_id, hotel_name, city,
           first_seen_at, last_seen_at, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .bind(
        id,
        input.marketId,
        input.platform,
        input.externalId,
        input.hotelName,
        input.city ?? null,
        input.now,
        input.now,
        input.now,
        input.now,
      )
      .run();
    return id;
  }

  async insertCollection(row: {
    id: string;
    deviceRowId: string;
    marketId: string;
    input: UploadCollectionInput;
    now: string;
  }) {
    await this.db
      .prepare(
        `INSERT INTO collections (
           id, idempotency_key, device_id, task_attempt_id, upload_receipt_id,
           platform, task_type, market_id, business_date, check_in, check_out,
           started_at, finished_at, quality, status, error_code, policy_version,
           collector_version, source, created_at
         ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.input.idempotency_key,
        row.deviceRowId,
        row.input.attempt_id,
        row.input.platform,
        row.input.task_type,
        row.marketId,
        row.input.business_date,
        row.input.check_in,
        row.input.check_out,
        row.now,
        row.now,
        row.input.quality,
        "completed",
        row.input.policy_version,
        row.input.collector_version,
        row.input.source,
        row.now,
      )
      .run();
  }

  async insertPriceFacts(args: {
    collectionId: string;
    marketId: string;
    input: UploadCollectionInput;
    platformHotelIds: string[];
    now: string;
  }) {
    if (!args.input.price_facts.length) return;
    const stmts = args.input.price_facts.map((fact, index) =>
      this.db
        .prepare(
          `INSERT INTO price_facts (
             id, collection_id, market_id, platform_hotel_id, business_date,
             check_in, check_out, rank_position, display_price, currency,
             availability, collected_at, payload_hash, extras_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          args.collectionId,
          args.marketId,
          args.platformHotelIds[index],
          args.input.business_date,
          args.input.check_in,
          args.input.check_out,
          fact.rank,
          fact.price,
          fact.currency ?? "CNY",
          fact.sold_out ? "sold_out" : "available",
          args.now,
          args.input.payload_hash,
          JSON.stringify(fact.raw ?? {}),
        ),
    );
    await this.db.batch(stmts);
  }

  async listRecent(limit = 50) {
    const { results } = await this.db
      .prepare(
        `SELECT id, market_id, device_id, platform, task_type, business_date,
                check_in, check_out, status, source, created_at
         FROM collections
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all();
    return results ?? [];
  }

  async getWithFacts(id: string) {
    const collection = await this.db
      .prepare(
        `SELECT id, market_id, device_id, platform, task_type, business_date,
                check_in, check_out, status, source, created_at
         FROM collections WHERE id = ?`,
      )
      .bind(id)
      .first();
    if (!collection) return null;
    const { results } = await this.db
      .prepare(
        `SELECT pf.rank_position, pf.display_price, pf.extras_json, pf.availability,
                ph.hotel_name, ph.platform_hotel_id
         FROM price_facts pf
         JOIN platform_hotels ph ON ph.id = pf.platform_hotel_id
         WHERE pf.collection_id = ?
         ORDER BY pf.rank_position ASC`,
      )
      .bind(id)
      .all();
    return { collection, facts: results ?? [] };
  }
}
