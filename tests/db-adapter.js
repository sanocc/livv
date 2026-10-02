import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function database(through = "9999") {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../api/migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && f <= through)
    .sort())
    raw.exec("BEGIN;" + readFileSync(new URL(file, dir), "utf8") + "COMMIT;");
  return {
    raw,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              return { results: raw.prepare(sql).all(...args) };
            },
            async first() {
              return raw.prepare(sql).get(...args) ?? null;
            },
            async run() {
              const r = raw.prepare(sql).run(...args);
              return { meta: { changes: Number(r.changes) } };
            },
            _sql: sql,
            _args: args,
          };
        },
      };
    },
    async batch(statements) {
      raw.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        raw.exec("COMMIT");
        return result;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
