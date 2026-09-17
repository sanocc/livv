import { AuditRepository } from "../repositories/audit";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(input: {
    actorType: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const event = {
      id: newId(),
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      createdAt: nowIso()
    };

    await this.repo.create(
      input.metadata ? { ...event, metadataJson: JSON.stringify(input.metadata) } : event
    );
  }
}
