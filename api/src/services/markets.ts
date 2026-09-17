import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";
import type { AccessIdentity } from "../env";
import { AuditRepository } from "../repositories/audit";
import { MarketRepository } from "../repositories/markets";
import type { CreateMarketInput } from "../schemas/markets";
import { newId } from "../utils/id";
import { nowIso } from "../utils/time";
import { AuditService } from "./audit";

export class MarketService {
  private readonly audit: AuditService;

  constructor(
    private readonly markets: MarketRepository,
    auditRepo: AuditRepository
  ) {
    this.audit = new AuditService(auditRepo);
  }

  async list(page: number, pageSize: number) {
    return this.markets.list(page, pageSize);
  }

  async get(id: string) {
    const market = await this.markets.get(id);
    if (!market) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Market not found", 404);
    }
    return market;
  }

  async create(input: CreateMarketInput, actor: AccessIdentity) {
    const now = nowIso();
    const id = newId();

    try {
      await this.markets.create({
        id,
        name: input.name,
        city: input.city,
        keyword: input.keyword,
        timezone: input.timezone,
        status: "active",
        created_at: now,
        updated_at: now
      });
    } catch (error) {
      if (isUniqueError(error)) {
        throw new AppError(ErrorCodes.CONFLICT, "Market already exists", 409);
      }
      throw error;
    }

    await this.audit.record({
      actorType: "access_user",
      actorId: actor.sub,
      action: "market.create",
      targetType: "market",
      targetId: id,
      metadata: { city: input.city, keyword: input.keyword, name: input.name }
    });

    return this.get(id);
  }
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}
