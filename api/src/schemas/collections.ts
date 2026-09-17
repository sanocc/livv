import { AppError } from "../errors/app-error";
import { ErrorCodes } from "../errors/codes";

export type PriceFactInput = {
  platform_hotel_id?: string;
  hotel_name: string;
  city?: string;
  rank?: number | null;
  price?: number | null;
  currency?: string;
  sold_out?: boolean;
  source_url?: string;
  raw?: Record<string, unknown>;
};

export type RoomFactInput = {
  room_name: string;
  room_order: number;
  raw?: Record<string, unknown>;
};

export type RateFactInput = {
  room_order: number;
  breakfast?: string | null;
  price?: number | null;
  currency?: string;
  sold_out?: boolean;
  raw?: Record<string, unknown>;
};

export type UploadCollectionInput = {
  idempotency_key: string;
  payload_hash: string;
  platform: string;
  task_type: string;
  market_id?: string | null;
  business_date: string;
  check_in: string;
  check_out: string;
  quality: string;
  policy_version: string;
  collector_version: string;
  source: string;
  source_url?: string | null;
  run_id?: string | null;
  attempt_id?: string | null;
  title?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  price_facts: PriceFactInput[];
  room_facts: RoomFactInput[];
  rate_facts: RateFactInput[];
};

function asString(value: unknown, field: string, required = true): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!required && (value === undefined || value === null || value === "")) return "";
  throw new AppError(ErrorCodes.NOT_IMPLEMENTED, `${field} is required`, 400);
}

function asOptionalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseUploadCollection(body: Record<string, unknown>): UploadCollectionInput {
  const priceFactsRaw = Array.isArray(body.price_facts) ? body.price_facts : [];
  const roomFactsRaw = Array.isArray(body.room_facts) ? body.room_facts : [];
  const rateFactsRaw = Array.isArray(body.rate_facts) ? body.rate_facts : [];

  if (priceFactsRaw.length > 200) {
    throw new AppError(ErrorCodes.NOT_IMPLEMENTED, "price_facts exceeds 200", 400);
  }

  return {
    idempotency_key: asString(body.idempotency_key, "idempotency_key"),
    payload_hash: asString(body.payload_hash, "payload_hash"),
    platform: asString(body.platform, "platform"),
    task_type: asString(body.task_type ?? "manual_page", "task_type"),
    market_id: asOptionalString(body.market_id),
    business_date: asString(body.business_date ?? new Date().toISOString().slice(0, 10), "business_date"),
    check_in: asString(body.check_in ?? new Date().toISOString().slice(0, 10), "check_in"),
    check_out: asString(body.check_out ?? new Date().toISOString().slice(0, 10), "check_out"),
    quality: asString(body.quality ?? "partial", "quality"),
    policy_version: asString(body.policy_version ?? "30-200-10-3", "policy_version"),
    collector_version: asString(body.collector_version ?? "0.3.1", "collector_version"),
    source: asString(body.source ?? "manual_popup", "source"),
    source_url: asOptionalString(body.source_url),
    run_id: asOptionalString(body.run_id),
    attempt_id: asOptionalString(body.attempt_id),
    title: asOptionalString(body.title),
    notes: asOptionalString(body.notes),
    metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : {},
    price_facts: priceFactsRaw.map((row, index) => {
      const fact = (row ?? {}) as Record<string, unknown>;
      const hotel_name = asString(fact.hotel_name ?? fact.title, `price_facts[${index}].hotel_name`);
      return {
        platform_hotel_id: asOptionalString(fact.platform_hotel_id) ?? undefined,
        hotel_name,
        city: asOptionalString(fact.city) ?? undefined,
        rank: asNumber(fact.rank),
        price: asNumber(fact.price),
        currency: asOptionalString(fact.currency) || "CNY",
        sold_out: Boolean(fact.sold_out),
        source_url: asOptionalString(fact.source_url) ?? undefined,
        raw: fact,
      };
    }),
    room_facts: roomFactsRaw.map((row, index) => {
      const fact = (row ?? {}) as Record<string, unknown>;
      return {
        room_name: asString(fact.room_name, `room_facts[${index}].room_name`),
        room_order: asNumber(fact.room_order) ?? index + 1,
        raw: fact,
      };
    }),
    rate_facts: rateFactsRaw.map((row, index) => {
      const fact = (row ?? {}) as Record<string, unknown>;
      return {
        room_order: asNumber(fact.room_order) ?? index + 1,
        breakfast: asOptionalString(fact.breakfast),
        price: asNumber(fact.price),
        currency: asOptionalString(fact.currency) || "CNY",
        sold_out: Boolean(fact.sold_out),
        raw: fact,
      };
    }),
  };
}
