import type { AppContext } from "../env";
import { ok } from "../utils/response";
import { nowIso } from "../utils/time";

export function health(ctx: AppContext): Response {
  return ok({
    service: "livv-api",
    status: "ok",
    version: ctx.env.APP_VERSION ?? "0.2.0",
    timestamp: nowIso()
  });
}
