import type { AccessIdentity, AppContext } from "../env";
import { requireRole } from "../middleware/rbac";
import { AuditRepository } from "../repositories/audit";
import { MarketRepository } from "../repositories/markets";
import { parsePage } from "../schemas/common";
import { parseCreateMarket } from "../schemas/markets";
import { MarketService } from "../services/markets";
import { readJsonObject } from "../utils/json";
import { ok } from "../utils/response";

function service(ctx: AppContext): MarketService {
  return new MarketService(new MarketRepository(ctx.env.DB), new AuditRepository(ctx.env.DB));
}

export async function listMarkets(ctx: AppContext): Promise<Response> {
  const identity = ctx.identity as AccessIdentity;
  requireRole(identity.role, "viewer");
  const { page, pageSize } = parsePage(new URL(ctx.request.url));
  const result = await service(ctx).list(page, pageSize);
  return ok({ items: result.items, page, page_size: pageSize, total: result.total });
}

export async function createMarket(ctx: AppContext): Promise<Response> {
  const identity = ctx.identity as AccessIdentity;
  requireRole(identity.role, "manager");
  const input = parseCreateMarket(await readJsonObject(ctx.request));
  const created = await service(ctx).create(input, identity);
  return ok(created, { status: 201 });
}

export async function getMarket(ctx: AppContext): Promise<Response> {
  const identity = ctx.identity as AccessIdentity;
  requireRole(identity.role, "viewer");
  return ok(await service(ctx).get(ctx.params.id!));
}
