import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../migrations/0001_initial.sql", import.meta.url)), "utf8");
const deviceMigration = readFileSync(fileURLToPath(new URL("../../migrations/0002_device_authorization.sql", import.meta.url)), "utf8");

export class TestD1Statement {
  constructor(private readonly database: DatabaseSync, private readonly sql: string, private readonly values: SQLInputValue[] = []) {}

  bind(...values: unknown[]): TestD1Statement {
    return new TestD1Statement(this.database, this.sql, values as SQLInputValue[]);
  }

  async first<T>(): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...this.values);
    return (row ?? null) as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    const results = this.database.prepare(this.sql).all(...this.values) as unknown as T[];
    return { results, success: true, meta: {} } as D1Result<T>;
  }

  async run(): Promise<D1Result<unknown>> {
    this.database.prepare(this.sql).run(...this.values);
    return { results: [], success: true, meta: {} } as unknown as D1Result<unknown>;
  }
}

export class TestD1 {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.sqlite.exec(migration);
    this.sqlite.exec(deviceMigration);
  }

  prepare(query: string): D1PreparedStatement {
    return new TestD1Statement(this.sqlite, query) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
    this.sqlite.exec("BEGIN");
    try {
      const results: D1Result<unknown>[] = [];
      for (const statement of statements as unknown as TestD1Statement[]) {
        results.push(await statement.run());
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

export function d1Env(database: TestD1): { DB: D1Database } {
  return { DB: database as unknown as D1Database };
}
