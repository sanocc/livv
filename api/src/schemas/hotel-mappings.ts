import {
  AppError
} from "../errors/app-error";

import {
  ErrorCodes
} from "../errors/codes";

export interface ConfirmHotelMappingPayload {
  market_id: string;
  hotel_name: string;
  platform_hotel_row_ids: string[];
}

const ALLOWED_FIELDS =
  new Set([
    "market_id",
    "hotel_name",
    "platform_hotel_row_ids"
  ]);

export function parseConfirmHotelMapping(
  body: Record<string, unknown>
): ConfirmHotelMappingPayload {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new AppError(
        ErrorCodes.INVALID_PAYLOAD,
        `Unknown field: ${key}`,
        400
      );
    }
  }

  if (
    typeof body.market_id !==
      "string" ||
    !body.market_id.trim()
  ) {
    throw new AppError(
      ErrorCodes.INVALID_PAYLOAD,
      "market_id must be a non-empty string",
      400
    );
  }

  if (
    typeof body.hotel_name !==
      "string" ||
    !body.hotel_name.trim()
  ) {
    throw new AppError(
      ErrorCodes.INVALID_PAYLOAD,
      "hotel_name must be a non-empty string",
      400
    );
  }

  if (
    !Array.isArray(
      body.platform_hotel_row_ids
    )
  ) {
    throw new AppError(
      ErrorCodes.INVALID_PAYLOAD,
      "platform_hotel_row_ids must be an array",
      400
    );
  }

  if (
    body.platform_hotel_row_ids.some(
      (value) =>
        typeof value !== "string" ||
        !value.trim()
    )
  ) {
    throw new AppError(
      ErrorCodes.INVALID_PAYLOAD,
      "platform_hotel_row_ids must contain only non-empty strings",
      400
    );
  }

  return {
    market_id:
      body.market_id.trim(),

    hotel_name:
      body.hotel_name.trim(),

    platform_hotel_row_ids:
      body.platform_hotel_row_ids
        .map(
          (value) =>
            (value as string).trim()
        )
  };
}
