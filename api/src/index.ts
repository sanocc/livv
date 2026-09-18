import type { AppContext, Env } from "./env";
import { Router } from "./router";
import { health } from "./routes/health";
import { createMarket, getMarket, listMarkets } from "./routes/markets";
import {
  getOwnDevice,
  heartbeat,
  registerDevice,
  rejectPendingBusinessWrite,
  uploadCollections,
} from "./routes/collector";
import { authorizeDevice, listDevices } from "./routes/devices_admin";
import { listHotelMappingCandidates } from "./routes/hotel-mappings";
import { scheduledNoop } from "./routes/internal";
import { CollectionRepository } from "./repositories/collections";
import { fail, ok } from "./utils/response";
import { corsHeaders, optionsResponse } from "./utils/cors";
import { logRequest } from "./utils/logger";

const router = new Router();
router.on("GET", "/health", "public", health);
router.on("GET", "/api/v1/health", "public", health);

router.on("GET", "/api/v1/admin/whoami", "public", async (ctx: AppContext) => {
  const identity = await ctx.executionCtx.access?.getIdentity();

  if (!identity) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "ACCESS_IDENTITY_MISSING",
          message: "Cloudflare Access identity unavailable"
        }
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      }
    );
  }

  return ok({
    user_uuid: identity.user_uuid ?? null,
    email: identity.email ?? null,
    name: identity.name ?? null
  });
});

router.on("GET", "/api/v1/markets", "access_user", listMarkets);
router.on("POST", "/api/v1/markets", "access_user", createMarket);
router.on("GET", "/api/v1/markets/:id", "access_user", getMarket);

router.on(
  "GET",
  "/api/v1/hotel-mappings/candidates",
  "access_user",
  listHotelMappingCandidates
);

router.on("POST", "/api/v1/collector/register", "public", registerDevice);
router.on("GET", "/api/v1/collector/device", "device", getOwnDevice);
router.on("POST", "/api/v1/collector/heartbeat", "device", heartbeat);
router.on("POST", "/api/v1/collector/collections", "device", uploadCollections);
router.on("POST", "/api/v1/collector/tasks/claim", "device", rejectPendingBusinessWrite);

router.on("GET", "/api/v1/admin/devices", "access_user", listDevices);
router.on("POST", "/api/v1/admin/devices/:id/authorize", "access_user", authorizeDevice);

router.on("GET", "/api/v1/collections", "public", async (ctx: AppContext) => {
  const items = await new CollectionRepository(ctx.env.DB).listRecent(50);
  return ok({ items });
});
router.on("GET", "/api/v1/collections/:id", "public", async (ctx: AppContext) => {
  const row = await new CollectionRepository(ctx.env.DB).getWithFacts(ctx.params.id!);
  if (!row) return fail(new Error("not found"), ctx.requestId);
  return ok(row);
});

router.on("POST", "/api/v1/internal/scheduler/noop", "internal", scheduledNoop);

export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    if (request.method.toUpperCase() === "OPTIONS") {
      return optionsResponse(request);
    }
    const ctx: AppContext = {
      env,
      executionCtx,
      request,
      requestId: crypto.randomUUID(),
      startedAt: Date.now(),
      params: {},
    };
    try {
      const response = await router.handle(ctx);
      const withCors = new Response(response.body, response);
      for (const [key, value] of Object.entries(corsHeaders(request))) {
        withCors.headers.set(key, value);
      }
      withCors.headers.set("x-request-id", ctx.requestId);
      logRequest(ctx, withCors.status);
      return withCors;
    } catch (error) {
      const response = fail(error, ctx.requestId);
      for (const [key, value] of Object.entries(corsHeaders(request))) {
        response.headers.set(key, value);
      }
      response.headers.set("x-request-id", ctx.requestId);
      logRequest(ctx, response.status, error);
      return response;
    }
  },
  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {},
};
