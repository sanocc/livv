import { CONTEXT_STATES, createPageContext, field, unknownField } from "./context-contract.js";

const selectors = Object.freeze({
  city: "[data-livv-search-city]",
  keyword: "[data-livv-search-keyword]",
  checkIn: "[data-livv-check-in]",
  checkOut: "[data-livv-check-out]",
});

function ctripHotelListUrl(location) {
  try {
    const url = new URL(location?.href ?? "");
    return url.hostname === "hotels.ctrip.com" && url.pathname === "/hotels/list";
  } catch { return false; }
}

function valueOf(root, selector) {
  const node = root?.querySelector?.(selector);
  if (!node) return null;
  const value = node.getAttribute?.("data-value") ?? node.value ?? node.textContent;
  return field(value, CONTEXT_STATES.VERIFIED, "search_control");
}

function urlField(location, parameter, { date = false, allowEmpty = true } = {}) {
  let params;
  try { params = new URL(location?.href ?? "").searchParams; } catch { return unknownField(); }
  if (!params.has(parameter)) return unknownField();
  const value = params.get(parameter);
  if (!allowEmpty && !value) return unknownField();
  if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(value ?? "")) return unknownField();
  return field(value, CONTEXT_STATES.VERIFIED, `url.${parameter}`);
}

export function readCtripContext({ document = globalThis.document, location = globalThis.location } = {}) {
  const pageType = ctripHotelListUrl(location)
    ? field("hotel_list", CONTEXT_STATES.VERIFIED, "url.hotels_list")
    : unknownField();
  return createPageContext({
    pageType,
    city: valueOf(document, selectors.city) ?? urlField(location, "cityName", { allowEmpty: false }),
    keyword: valueOf(document, selectors.keyword) ?? urlField(location, "searchWord"),
    checkIn: valueOf(document, selectors.checkIn) ?? urlField(location, "checkin", { date: true }),
    checkOut: valueOf(document, selectors.checkOut) ?? urlField(location, "checkout", { date: true }),
    sourceUrl: location?.href ?? null,
  });
}

export function ctripContextProbe({ document = globalThis.document, location = globalThis.location } = {}) {
  return {
    platform: "ctrip",
    probe_version: "ctrip-context-v1",
    source_url: location?.href ?? null,
    page_type_evidence: {
      source: "url.hotels_list",
      matched: ctripHotelListUrl(location),
    },
  };
}

export const CTRIP_CONTEXT_SELECTORS = selectors;
