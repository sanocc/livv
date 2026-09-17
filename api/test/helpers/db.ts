import migrationSql from "../../migrations/0001_initial.sql?raw";

export const expectedBusinessTables = [
  "audit_events",
  "rate_facts",
  "room_facts",
  "price_facts",
  "collections",
  "upload_receipts",
  "task_attempts",
  "task_units",
  "plan_platforms",
  "plans",
  "device_navigation_contexts",
  "device_capabilities",
  "device_credentials",
  "devices",
  "competitor_roles",
  "hotel_mappings",
  "platform_hotels",
  "hotels",
  "market_platform_contexts",
  "markets",
  "livv_users"
];

export async function resetDatabase(db: D1Database): Promise<void> {
  await db.exec("PRAGMA foreign_keys = OFF");
  for (const table of expectedBusinessTables) {
    await db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  await db.exec("PRAGMA foreign_keys = ON");
  await applyMigration(db);
}

export async function applyMigration(db: D1Database): Promise<void> {
  for (const statement of splitSql(migrationSql)) {
    if (/^PRAGMA\s+foreign_keys/i.test(statement)) continue;
    await db.exec(`${statement.replace(/\s+/g, " ")};`);
  }
}

export function splitSql(sql: string): string[] {
  return stripLineComments(sql)
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement);
}

function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}
