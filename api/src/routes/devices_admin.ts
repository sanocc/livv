import type { AccessIdentity, AppContext } from "../env";
import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";
import { requireRole } from "../middleware/rbac";
import { ok } from "../utils/response";

function accessIdentity(ctx: AppContext): AccessIdentity {
  if (!ctx.identity || ctx.identity.type !== "access_user") {
    throw new AppError(
      ErrorCodes.ACCESS_REQUIRED,
      "Access user identity required",
      401
    );
  }

  return ctx.identity;
}

export async function authorizeDevice(ctx: AppContext): Promise<Response> {
  const identity = accessIdentity(ctx);

  requireRole(identity.role, "admin");

  const id = ctx.params.id!;
  const now = new Date().toISOString();

  const result = await ctx.env.DB.prepare(
    `UPDATE devices
     SET status = 'authorized',
         authorized_at = ?,
         authorized_by = ?,
         revoked_at = NULL,
         revoked_by = NULL,
         updated_at = ?
     WHERE (id = ? OR device_id = ?)
       AND status = 'pending'`
  )
    .bind(now, identity.sub, now, id, id)
    .run();

  if (!result.meta.changes) {
    const existing = await ctx.env.DB.prepare(
      `SELECT id, device_id, name, status, collector_version,
              os, arch, browser, browser_version,
              first_seen_at, last_seen_at, authorized_at, authorized_by
       FROM devices
       WHERE id = ? OR device_id = ?
       LIMIT 1`
    )
      .bind(id, id)
      .first();

    if (!existing) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        "Device not found",
        404
      );
    }

    if (existing.status === "authorized") {
      return ok({ device: existing, idempotent: true });
    }

    throw new AppError(
      ErrorCodes.CONFLICT,
      `Device cannot be authorized from status ${String(existing.status)}`,
      409
    );
  }

  const device = await ctx.env.DB.prepare(
    `SELECT id, device_id, name, status, collector_version,
            os, arch, browser, browser_version,
            first_seen_at, last_seen_at, authorized_at, authorized_by
     FROM devices
     WHERE id = ? OR device_id = ?
     LIMIT 1`
  )
    .bind(id, id)
    .first();

  return ok({ device, idempotent: false });
}

export async function listDevices(ctx: AppContext): Promise<Response> {
  const identity = accessIdentity(ctx);

  requireRole(identity.role, "manager");

  const { results } = await ctx.env.DB.prepare(
    `SELECT id, device_id, name, status, collector_version,
            os, arch, browser, browser_version,
            first_seen_at, last_seen_at, authorized_at, authorized_by
     FROM devices
     ORDER BY first_seen_at DESC
     LIMIT 100`
  ).all();

  return ok({ items: results ?? [] });
}
