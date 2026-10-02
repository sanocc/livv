import {
  pageStep,
  inspectList,
  scrollList,
  inspectDetail,
  scrollDetail,
  detailLink,
} from "../../agent/mobile.js";
import { contextMatches, marketNavigation } from "../../agent/navigation.js";
import { observationEnvelope, AdapterError } from "../contract.js";
import { dedupe } from "../../api/src/domain.js";
// Reuse the existing parser unchanged. Chrome production runtime stays unchanged.
export const ctripAdapter = Object.freeze({
  platform: "ctrip",
  collection_enabled: true,
  parseObservation: ctripObservation,
  navigate: marketNavigation,
  pageStep,
  inspectList,
  scrollList,
  inspectDetail,
  scrollDetail,
  detailLink,
  contextMatches,
});
export function ctripObservation(result, task) {
  if (
    task.platform !== "ctrip" ||
    !contextMatches(result, task) ||
    result.unparsed_cards > 0 ||
    result.captcha
  )
    throw new AdapterError("PAGE_CONTEXT_NOT_VERIFIED");
  const url = new URL(result.url);
  if (
    url.origin !== "https://m.ctrip.com" ||
    !url.pathname.startsWith("/webapp/hotels/") ||
    url.username ||
    url.password
  )
    throw new AdapterError("UNTRUSTED_PAGE");
  return observationEnvelope({
    source: "ctrip-dom",
    platform: "ctrip",
    observed_at: result.observed_at,
    observed_at_basis: "list_snapshot",
    context: result.context,
    context_verified: true,
    exhausted: result.exhausted,
    stop_reason: result.exhausted ? "NATURAL_END" : "UNKNOWN",
    exhaustion_evidence: result.exhausted
      ? "existing_parser_visible_end_marker"
      : null,
    hotels: dedupe(result.hotels).map((h) => ({
      ...h,
      platform: "ctrip",
      currency: "CNY",
      price_basis: "hotel_list_starting_price",
    })),
  });
}
