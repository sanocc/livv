// A browser failure during stage two must not discard the locked market list.
export function failRemainingDetails(active, errorCode) {
  if (
    !active.phase?.startsWith("DETAIL") ||
    !active.market?.length ||
    !["TARGET_REACHED", "NATURAL_END"].includes(active.stop_reason)
  )
    return false;
  active.detail_results ??= [];
  for (const hotel of active.details ?? []) {
    if (!active.detail_results.some((r) => r.hotel_id === hotel.hotel_id))
      active.detail_results.push({
        hotel_id: hotel.hotel_id,
        status: "FAILED",
        error_code: errorCode,
      });
  }
  return true;
}
// Even a partial list must account for every frozen core hotel actually observed.
export function completeDetailResults(active) {
  if (active.task?.task_type === "MARKET_LIST") return [];
  const expected = (active.core_hotels ?? []).filter((h) =>
    (active.market ?? []).some((m) => m.hotel_id === h.hotel_id),
  );
  active.detail_results ??= active.upload?.detail_results ?? [];
  for (const hotel of expected) {
    if (!active.detail_results.some((r) => r.hotel_id === hotel.hotel_id))
      active.detail_results.push({
        hotel_id: hotel.hotel_id,
        status: "FAILED",
        error_code: "DETAIL_INCOMPLETE",
      });
  }
  return active.detail_results;
}
