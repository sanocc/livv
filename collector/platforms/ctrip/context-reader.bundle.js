// Generated from context-contract.js and context-reader.js. Do not edit manually.
(() => {
const CONTEXT_STATES = Object.freeze({ VERIFIED: "verified", EMPTY: "empty", UNKNOWN: "unknown" });

const CTRIP_CONTEXT_CONTRACT = Object.freeze({
  pageType: { required: ["hostname: hotels.ctrip.com", "pathname: /hotels/list"], evidence: "url.hotels_list", rejected: "other hostnames, other paths, broad classes, page text, hotel names, prices" },
  city: { primary: "explicit city search control or structured search state", fallback: "verified URL search parameter", rejected: "arbitrary page text or city dictionary" },
  keyword: { primary: "explicit keyword search control or structured search state", fallback: "verified URL search parameter", rejected: "arbitrary page text or keyword dictionary" },
  dates: { primary: "explicit date controls or structured search state", fallback: "verified URL search parameters", rejected: "current date or fixed year" },
});

function normalizeContextText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized || null;
}

function field(value, state, evidence = "none") {
  const normalized = normalizeContextText(value);
  if (state === CONTEXT_STATES.UNKNOWN) return { value: null, state: CONTEXT_STATES.UNKNOWN, evidence_source: "none" };
  if (normalized === null) return { value: null, state: CONTEXT_STATES.EMPTY, evidence_source: evidence };
  return { value: normalized, state: CONTEXT_STATES.VERIFIED, evidence_source: evidence };
}

function unknownField() { return { value: null, state: CONTEXT_STATES.UNKNOWN, evidence_source: "none" }; }

function createPageContext({ pageType, city, keyword, checkIn, checkOut, sourceUrl = null }) {
  const copyField = (input) => input?.state
    ? field(input.value, input.state, input.evidence_source ?? "none")
    : unknownField();
  return {
    platform: "ctrip",
    page_type: copyField(pageType),
    city: copyField(city),
    keyword: copyField(keyword),
    check_in: copyField(checkIn),
    check_out: copyField(checkOut),
    source_url: typeof sourceUrl === "string" ? sourceUrl : null,
  };
}

function verifyTaskContext(task, context) {
  if (!context || context.platform !== "ctrip") return { ok: false, code: "CONTEXT_MISMATCH", reason: "platform" };
  if (context.page_type?.state !== CONTEXT_STATES.VERIFIED || context.page_type.value !== "hotel_list") {
    return { ok: false, code: "WRONG_PAGE_TYPE", reason: "page_type" };
  }
  const expected = [
    ["city", task.city, context.city],
    ["check_in", task.check_in, context.check_in],
    ["check_out", task.check_out, context.check_out],
  ];
  for (const [name, wanted, actual] of expected) {
    if (actual?.state !== CONTEXT_STATES.VERIFIED || normalizeContextText(wanted) !== actual.value) return { ok: false, code: "CONTEXT_MISMATCH", reason: name };
  }
  const wantedKeyword = normalizeContextText(task.keyword);
  if (wantedKeyword === null) {
    if (context.keyword?.state !== CONTEXT_STATES.EMPTY) return { ok: false, code: "CONTEXT_MISMATCH", reason: "keyword" };
  } else if (context.keyword?.state !== CONTEXT_STATES.VERIFIED || context.keyword.value !== wantedKeyword) {
    return { ok: false, code: "CONTEXT_MISMATCH", reason: "keyword" };
  }
  return { ok: true };
}


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

function readCtripContext({ document = globalThis.document, location = globalThis.location } = {}) {
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

function ctripContextProbe({ document = globalThis.document, location = globalThis.location } = {}) {
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

const CTRIP_CONTEXT_SELECTORS = selectors;

  globalThis.LIVV_CTRIP_CONTEXT = { readCtripContext, ctripContextProbe };
})();
