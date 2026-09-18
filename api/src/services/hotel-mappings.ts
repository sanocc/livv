import {
  AppError
} from "../errors/app-error";

import {
  ErrorCodes
} from "../errors/codes";

import type {
  AccessIdentity
} from "../env";

import {
  HotelMappingWriteRepository
} from "../repositories/hotel-mappings";

import {
  newId
} from "../utils/id";

import {
  nowIso
} from "../utils/time";

export interface ConfirmHotelMappingInput {
  market_id: string;
  hotel_name: string;
  platform_hotel_row_ids: string[];
}

export class HotelMappingService {
  constructor(
    private readonly repo:
      HotelMappingWriteRepository
  ) {}

  async confirm(
    input: ConfirmHotelMappingInput,
    actor: AccessIdentity
  ) {
    const marketId =
      input.market_id.trim();

    const hotelName =
      input.hotel_name.trim();

    const rowIds = [
      ...new Set(
        input.platform_hotel_row_ids
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ];

    if (!marketId) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        "market_id is required",
        400
      );
    }

    if (!hotelName) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        "hotel_name is required",
        400
      );
    }

    if (rowIds.length < 2) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        "At least two platform hotels are required",
        400
      );
    }

    if (rowIds.length > 4) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        "At most four platform hotels are allowed",
        400
      );
    }

    const marketExists =
      await this.repo.marketExists(
        marketId
      );

    if (!marketExists) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        "Market not found",
        404
      );
    }

    const hotels =
      await this.repo
        .getObservedPlatformHotels(
          marketId,
          rowIds
        );

    if (
      hotels.length !==
      rowIds.length
    ) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        "One or more platform hotels were not observed in this market",
        400
      );
    }

    const platforms =
      hotels.map(
        (hotel) =>
          hotel.platform
      );

    if (
      new Set(platforms).size !==
      platforms.length
    ) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        "Only one hotel per platform may be confirmed",
        400
      );
    }

    const fallback =
      hotels.find(
        (hotel) =>
          !/^\d{4,}$/.test(
            String(
              hotel.platform_hotel_id ||
              ""
            )
          )
      );

    if (fallback) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        "Fallback platform identity cannot be confirmed",
        400,
        {
          details: {
            platform:
              fallback.platform,
            platform_hotel_row_id:
              fallback.id
          }
        }
      );
    }

    const existing =
      await this.repo
        .getConfirmedMappings(
          rowIds
        );

    if (existing.length) {
      throw new AppError(
        ErrorCodes.CONFLICT,
        "One or more platform hotels are already confirmed",
        409,
        {
          details: existing
        }
      );
    }

    const city =
      marketId ===
      "xn-center-huatan"
        ? "咸宁"
        : null;

    const now =
      nowIso();

    return this.repo.confirm({
      hotelId:
        newId(),

      hotelName,

      city,

      marketId,

      platformHotels:
        hotels,

      actorId:
        actor.sub,

      auditId:
        newId(),

      mappingIds:
        hotels.map(
          () => newId()
        ),

      now
    });
  }
}
