/**
 * LIVV Collector M04 Quality Gate
 */

export function isOfficialHotelId(value) {
  return /^\d{4,}$/.test(String(value || ""));
}

export function auditHotelFacts(facts) {
  const list = Array.isArray(facts) ? facts : [];

  const official = list.filter((row) =>
    isOfficialHotelId(row.platform_hotel_id)
  );

  const missingId = list.filter((row) =>
    !isOfficialHotelId(row.platform_hotel_id)
  );

  const invalidName = list.filter(
    (row) => !String(row.hotel_name || "").trim()
  );

  const invalidPrice = list.filter(
    (row) =>
      !row.sold_out &&
      (
        row.display_price == null ||
        !Number.isFinite(Number(row.display_price))
      )
  );

  const ambiguousPrice = list.filter(
    (row) => row.quality?.ambiguous_price
  );

  const ids = official.map((row) =>
    String(row.platform_hotel_id)
  );

  const duplicateIds = [
    ...new Set(
      ids.filter(
        (id, index) => ids.indexOf(id) !== index
      )
    )
  ];

  return {
    total: list.length,

    official_id_count: official.length,
    missing_id_count: missingId.length,

    duplicate_id_count: duplicateIds.length,
    duplicate_ids: duplicateIds,

    invalid_name_count: invalidName.length,
    invalid_price_count: invalidPrice.length,
    ambiguous_price_count: ambiguousPrice.length,

    passed:
      missingId.length === 0 &&
      duplicateIds.length === 0 &&
      invalidName.length === 0 &&
      invalidPrice.length === 0 &&
      ambiguousPrice.length === 0
  };
}
