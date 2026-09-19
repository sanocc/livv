export const CONTEXT_STATES = Object.freeze({ VERIFIED: "verified", EMPTY: "empty", UNKNOWN: "unknown" });

export const CTRIP_CONTEXT_CONTRACT = Object.freeze({
  pageType: { required: ["hostname: hotels.ctrip.com", "pathname: /hotels/list"], evidence: "url.hotels_list", rejected: "other hostnames, other paths, broad classes, page text, hotel names, prices" },
  city: { primary: "explicit city search control or structured search state", fallback: "verified URL search parameter", rejected: "arbitrary page text or city dictionary" },
  keyword: { primary: "explicit keyword search control or structured search state", fallback: "verified URL search parameter", rejected: "arbitrary page text or keyword dictionary" },
  dates: { primary: "explicit date controls or structured search state", fallback: "verified URL search parameters", rejected: "current date or fixed year" },
});

export function normalizeContextText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized || null;
}

export function field(value, state, evidence = "none") {
  const normalized = normalizeContextText(value);
  if (state === CONTEXT_STATES.UNKNOWN) return { value: null, state: CONTEXT_STATES.UNKNOWN, evidence_source: "none" };
  if (normalized === null) return { value: null, state: CONTEXT_STATES.EMPTY, evidence_source: evidence };
  return { value: normalized, state: CONTEXT_STATES.VERIFIED, evidence_source: evidence };
}

export function unknownField() { return { value: null, state: CONTEXT_STATES.UNKNOWN, evidence_source: "none" }; }

export function createPageContext({ pageType, city, keyword, checkIn, checkOut, sourceUrl = null }) {
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

export function verifyTaskContext(task, context) {
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
