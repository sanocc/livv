import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { expectedBusinessTables, resetDatabase } from "./helpers/db";

describe("database schema", () => {
  it("applies 0001 migration completely", async () => {
    await resetDatabase(env.DB);
    const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all<{ name: string }>();
    const names = new Set((rows.results ?? []).map((row) => row.name));
    expect(expectedBusinessTables.every((table) => names.has(table))).toBe(true);
    expect(expectedBusinessTables).toHaveLength(21);
  });

  it("enables foreign keys", async () => {
    await resetDatabase(env.DB);
    const pragma = await env.DB.prepare("PRAGMA foreign_keys").first<Record<string, number>>();
    expect(Object.values(pragma ?? {})[0]).toBe(1);
  });

  it("enforces unique constraints", async () => {
    await resetDatabase(env.DB);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO markets (id, name, city, keyword, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind("market-1", "A", "Xianning", "Center", "active", "Asia/Shanghai", now, now)
      .run();
    await expect(
      env.DB.prepare("INSERT INTO markets (id, name, city, keyword, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind("market-2", "A", "Xianning", "Center", "active", "Asia/Shanghai", now, now)
        .run()
    ).rejects.toThrow();
  });
});
