import { identityNamespaces } from "./catalog.js";
export class AdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = "AdapterError";
    this.code = code;
  }
}
const ensure = (ok, code) => {
  if (!ok) throw new AdapterError(code);
};
const text = (value, max = 300) => {
  if (value == null) return null;
  ensure(
    typeof value === "string" && value.trim().length > 0 && value.length <= max,
    "INVALID_OBSERVATION_TEXT",
  );
  return value.trim();
};
const number = (value, max = 10000000) => {
  if (value == null) return null;
  ensure(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= max,
    "INVALID_OBSERVATION_NUMBER",
  );
  return value;
};
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
// Research envelope: never infer context from request parameters or default unknown fields.
export function observationEnvelope(input) {
  ensure(identityNamespaces.includes(input?.platform), "UNKNOWN_PLATFORM");
  ensure(
    input.context?.platform === input.platform,
    "PLATFORM_CONTEXT_MISMATCH",
  );
  ensure(
    validDate(input.context.checkin) &&
      validDate(input.context.checkout) &&
      input.context.checkout > input.context.checkin,
    "INVALID_STAY",
  );
  ensure(
    typeof input.context_verified === "boolean",
    "CONTEXT_VERIFICATION_REQUIRED",
  );
  ensure(
    typeof input.observed_at === "string" &&
      /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.observed_at) &&
      Number.isFinite(Date.parse(input.observed_at)),
    "INVALID_OBSERVED_AT",
  );
  ensure(
    input.exhausted === null || typeof input.exhausted === "boolean",
    "INVALID_EXHAUSTION",
  );
  ensure(
    input.exhausted !== true ||
      (input.stop_reason === "NATURAL_END" && text(input.exhaustion_evidence)),
    "EXHAUSTION_EVIDENCE_REQUIRED",
  );
  ensure(
    Array.isArray(input.hotels) && input.hotels.length <= 4000,
    "INVALID_HOTELS",
  );
  ensure(
    typeof input.source === "string" && input.source.trim().length > 0,
    "OBSERVATION_SOURCE_REQUIRED",
  );
  ensure(
    !input.context_verified ||
      (typeof input.context.city === "string" &&
        input.context.city.trim().length > 0 &&
        typeof input.context.keyword === "string"),
    "VERIFIED_CONTEXT_INCOMPLETE",
  );
  const seen = new Set();
  const hotels = input.hotels.map((h) => {
    ensure(
      h && typeof h === "object" && h.platform === input.platform,
      "HOTEL_PLATFORM_MISMATCH",
    );
    const id = text(h.hotel_id, 100);
    ensure(id, "HOTEL_ID_REQUIRED");
    ensure(!seen.has(id), "DUPLICATE_HOTEL_ID");
    seen.add(id);
    ensure(
      h.rank == null || (Number.isInteger(h.rank) && h.rank > 0),
      "INVALID_RANK",
    );
    ensure(h.is_ad == null || typeof h.is_ad === "boolean", "INVALID_AD_STATE");
    ensure(
      [null, undefined, "available", "sold_out", "unknown"].includes(
        h.availability_status,
      ),
      "INVALID_AVAILABILITY",
    );
    ensure(
      h.availability_status !== "sold_out" || text(h.sold_out_evidence),
      "SOLD_OUT_EVIDENCE_REQUIRED",
    );
    ensure(
      h.activity_tags == null ||
        (Array.isArray(h.activity_tags) && h.activity_tags.length <= 30),
      "INVALID_TAGS",
    );
    return {
      platform: input.platform,
      hotel_id: id,
      hotel_name: text(h.hotel_name, 200),
      rank: h.rank ?? null,
      is_ad: h.is_ad ?? null,
      score: number(h.score, 5),
      review_count: h.review_count == null ? null : number(h.review_count),
      display_price: number(h.display_price),
      original_price: number(h.original_price),
      currency: h.currency == null ? null : text(h.currency, 3),
      price_basis: text(h.price_basis, 80),
      dynamic: text(h.dynamic),
      activity_tags: h.activity_tags?.map((v) => text(v, 100)) ?? null,
      availability_status: h.availability_status ?? "unknown",
      sold_out_evidence:
        h.availability_status === "sold_out" ? text(h.sold_out_evidence) : null,
    };
  });
  return {
    contract_version: 1,
    source: text(input.source, 80),
    platform: input.platform,
    observed_at: new Date(input.observed_at).toISOString(),
    observed_at_basis: text(input.observed_at_basis, 80),
    context: {
      platform: input.platform,
      city: text(input.context.city, 80),
      keyword:
        input.context.keyword === "" ? "" : text(input.context.keyword, 120),
      checkin: input.context.checkin,
      checkout: input.context.checkout,
    },
    context_verified: input.context_verified,
    exhausted: input.exhausted,
    stop_reason: text(input.stop_reason, 80),
    exhaustion_evidence:
      input.exhausted === true ? text(input.exhaustion_evidence) : null,
    hotels,
  };
}
