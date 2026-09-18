import type {
  AccessIdentity,
  AppContext
} from "../env";

import { requireRole } from "../middleware/rbac";

import { HotelMappingRepository } from "../repositories/hotel-mappings";

import {
  groupHotelCandidates
} from "../domain/hotel-name";

import { ok } from "../utils/response";

export async function listHotelMappingCandidates(
  ctx: AppContext
): Promise<Response> {
  const identity =
    ctx.identity as AccessIdentity;

  requireRole(
    identity.role,
    "viewer"
  );

  const url =
    new URL(ctx.request.url);

  const marketId =
    url.searchParams
      .get("market_id")
      ?.trim();

  if (!marketId) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code:
            "MARKET_ID_REQUIRED",
          message:
            "market_id is required"
        }
      }),
      {
        status: 400,
        headers: {
          "content-type":
            "application/json; charset=utf-8"
        }
      }
    );
  }

  const repo =
    new HotelMappingRepository(
      ctx.env.DB
    );

  const items =
    await repo.listCandidates(
      marketId
    );

  const identities =
    items.map((item) => ({
      ...item,

      identity_status:
        /^\d{4,}$/.test(
          String(
            item.platform_hotel_id ||
            ""
          )
        )
          ? "official"
          : "fallback"
    }));

  const suggestions =
    groupHotelCandidates(
      identities.map(
        (item) => ({
          platform_hotel_row_id:
            item.platform_hotel_row_id,

          platform:
            item.platform,

          platform_hotel_id:
            item.platform_hotel_id,

          hotel_name:
            item.hotel_name
        })
      )
    );

  return ok({
    market_id:
      marketId,

    items:
      identities,

    total:
      identities.length,

    suggestions,

    suggestion_count:
      suggestions.length,

    identity_warnings:
      identities.filter(
        (item) =>
          item.identity_status !==
          "official"
      ).length
  });
}

export async function confirmHotelMapping(
  ctx: AppContext
): Promise<Response> {
  const identity =
    ctx.identity as AccessIdentity;

  requireRole(
    identity.role,
    "manager"
  );

  const {
    readJsonObject
  } =
    await import(
      "../utils/json"
    );

  const {
    HotelMappingService
  } =
    await import(
      "../services/hotel-mappings"
    );

  const {
    HotelMappingWriteRepository
  } =
    await import(
      "../repositories/hotel-mappings"
    );

  const body =
    await readJsonObject(
      ctx.request
    );

  const {
    parseConfirmHotelMapping
  } =
    await import(
      "../schemas/hotel-mappings"
    );

  const input =
    parseConfirmHotelMapping(
      body
    );

  const service =
    new HotelMappingService(
      new HotelMappingWriteRepository(
        ctx.env.DB
      )
    );

  const result =
    await service.confirm(
      input,
      identity
    );

  return new Response(
    JSON.stringify({
      ok: true,
      data: result
    }),
    {
      status: 201,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}
