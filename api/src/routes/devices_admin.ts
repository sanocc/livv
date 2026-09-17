import type { AppContext } from "../env";
import { DeviceRepository } from "../repositories/devices";
import { DeviceService } from "../services/devices";
import { ok } from "../utils/response";

function service(ctx: AppContext): DeviceService {
  return new DeviceService(new DeviceRepository(ctx.env.DB));
}

export async function authorizeDevice(ctx: AppContext): Promise<Response> {
  const id = ctx.params.id!;
  const svc = service(ctx) as DeviceService & {
    authorize?: (id: string, identity: unknown) => Promise<unknown>;
  };
  if (typeof svc.authorize === "function") {
    const device = await svc.authorize(id, ctx.identity);
    return ok({ device });
  }
  await ctx.env.DB.prepare(
    `UPDATE devices
     SET status = 'authorized',
         authorized_at = ?,
         authorized_by = ?,
         updated_at = ?
     WHERE id = ? OR device_id = ?`,
  )
    .bind(new Date().toISOString(), "m03-admin", new Date().toISOString(), id, id)
    .run();
  const device = await ctx.env.DB.prepare("SELECT * FROM devices WHERE id = ? OR device_id = ?")
    .bind(id, id)
    .first();
  return ok({ device });
}

export async function listDevices(ctx: AppContext): Promise<Response> {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, device_id, name, status, collector_version, os, arch, browser,
            browser_version, first_seen_at, last_seen_at, authorized_at
     FROM devices
     ORDER BY first_seen_at DESC
     LIMIT 100`,
  ).all();
  return ok({ items: results ?? [] });
}
