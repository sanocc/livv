import { run } from "./db";

export class AuditRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: {
    id: string;
    actorType: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadataJson?: string;
    createdAt: string;
  }): Promise<void> {
    await run(
      this.db,
      "INSERT INTO audit_events (id, actor_type, actor_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      input.id,
      input.actorType,
      input.actorId,
      input.action,
      input.targetType,
      input.targetId,
      input.metadataJson ?? null,
      input.createdAt
    );
  }
}
