import { all, first, run } from "./db";

export interface MarketRow {
  id: string;
  name: string;
  city: string;
  keyword: string;
  status: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMarketRow {
  id: string;
  name: string;
  city: string;
  keyword: string;
  timezone: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export class MarketRepository {
  constructor(private readonly db: D1Database) {}

  async list(page: number, pageSize: number): Promise<{ items: MarketRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const items = await all<MarketRow>(
      this.db,
      "SELECT id, name, city, keyword, status, timezone, created_at, updated_at FROM markets ORDER BY created_at DESC LIMIT ? OFFSET ?",
      pageSize,
      offset
    );
    const count = await first<{ total: number }>(this.db, "SELECT count(*) AS total FROM markets");
    return { items, total: count?.total ?? 0 };
  }

  async get(id: string): Promise<MarketRow | null> {
    return first<MarketRow>(
      this.db,
      "SELECT id, name, city, keyword, status, timezone, created_at, updated_at FROM markets WHERE id = ?",
      id
    );
  }

  async create(input: CreateMarketRow): Promise<void> {
    await run(
      this.db,
      "INSERT INTO markets (id, name, city, keyword, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      input.id,
      input.name,
      input.city,
      input.keyword,
      input.status,
      input.timezone,
      input.created_at,
      input.updated_at
    );
  }
}
