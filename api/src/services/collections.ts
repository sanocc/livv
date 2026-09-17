import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";
import type { DeviceIdentity } from "../env";
import { CollectionRepository } from "../repositories/collections";
import type { UploadCollectionInput } from "../schemas/collections";

export class CollectionService {
  constructor(private readonly collections: CollectionRepository) {}

  assertCanUpload(identity: DeviceIdentity) {
    if (identity.status === "pending") {
      throw new AppError(ErrorCodes.DEVICE_PENDING, "Device is pending approval", 403);
    }
    if (identity.status === "revoked") {
      throw new AppError(ErrorCodes.DEVICE_REVOKED, "Device has been revoked", 403);
    }
    if (identity.status !== "authorized" && identity.status !== "active") {
      throw new AppError(ErrorCodes.DEVICE_PENDING, "Device is not authorized", 403);
    }
  }

  async upload(identity: DeviceIdentity, input: UploadCollectionInput) {
    this.assertCanUpload(identity);

    const existing = await this.collections.findByIdempotencyKey(input.idempotency_key);
    if (existing) {
      return {
        collection_id: existing.id,
        idempotent: true,
        price_fact_count: input.price_facts.length,
      };
    }

    const marketId = input.market_id || (await this.collections.ensureDefaultMarket());
    const deviceKey =
      (identity as DeviceIdentity & { deviceRowId?: string }).deviceRowId || identity.deviceId;
    const deviceRowId = await this.collections.resolveDeviceRowId(deviceKey);
    if (!deviceRowId) {
      throw new AppError(ErrorCodes.NOT_IMPLEMENTED, "Device row not found", 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const platformHotelIds: string[] = [];
    for (const [index, fact] of input.price_facts.entries()) {
      const externalId =
        fact.platform_hotel_id ||
        `${input.platform}:manual:${input.payload_hash.slice(0, 16)}:${index}`;
      const rowId = await this.collections.upsertPlatformHotel({
        marketId,
        platform: input.platform,
        externalId,
        hotelName: fact.hotel_name,
        city: fact.city ?? null,
        now,
      });
      platformHotelIds.push(rowId);
    }

    await this.collections.insertCollection({
      id,
      deviceRowId,
      marketId,
      input,
      now,
    });
    await this.collections.insertPriceFacts({
      collectionId: id,
      marketId,
      input,
      platformHotelIds,
      now,
    });

    return {
      collection_id: id,
      idempotent: false,
      price_fact_count: input.price_facts.length,
    };
  }
}
