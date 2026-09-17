export interface QueryResult<T> {
  results: T[];
}

export async function first<T>(db: D1Database, sql: string, ...bindings: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...bindings).first<T>()) ?? null;
}

export async function all<T>(db: D1Database, sql: string, ...bindings: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

export async function run(db: D1Database, sql: string, ...bindings: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...bindings).run();
}

export async function batch(db: D1Database, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  return db.batch(statements);
}
