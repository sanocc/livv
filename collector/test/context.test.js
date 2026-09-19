import { describe, expect, it } from "vitest";
import { CONTEXT_STATES, createPageContext, verifyTaskContext } from "../platforms/ctrip/context-contract.js";
import { ctripContextProbe, readCtripContext } from "../platforms/ctrip/context-reader.js";

function node(value) { return { value, textContent: value, tagName: "INPUT", getAttribute: (name) => name === "data-value" ? value : null }; }
function documentFor(values) { return { querySelector(selector) { const key = { "[data-livv-search-city]": "city", "[data-livv-search-keyword]": "keyword", "[data-livv-check-in]": "checkIn", "[data-livv-check-out]": "checkOut" }[selector]; return values[key] === undefined ? null : node(values[key]); } }; }
function task(overrides = {}) { return { platform: "ctrip", city: "上海", keyword: "迪士尼度假区", check_in: "2027-01-02", check_out: "2027-01-04", ...overrides }; }
function context(values = {}) { return readCtripContext({ document: documentFor({ city: "上海", keyword: "迪士尼度假区", checkIn: "2027-01-02", checkOut: "2027-01-04", ...values }), location: { href: "https://hotels.ctrip.com/hotels/list" } }); }

describe("M06-A Ctrip Page Context", () => {
  it("reads only explicit search controls and supports required fixtures", () => {
    expect(readCtripContext({ document: documentFor({ pageType: "hotel_list", city: "咸宁", keyword: "中心花坛", checkIn: "2028-12-30", checkOut: "2029-01-02" }) })).toMatchObject({ city: { value: "咸宁", state: "verified" }, keyword: { value: "中心花坛", state: "verified" }, check_in: { value: "2028-12-30" }, check_out: { value: "2029-01-02" } });
  });
  it("represents missing and empty keyword conservatively", () => {
    expect(context({ keyword: "" }).keyword).toEqual({ value: null, state: CONTEXT_STATES.EMPTY, evidence_source: "search_control" });
    expect(context({}).keyword.state).toBe(CONTEXT_STATES.VERIFIED);
    expect(readCtripContext({ document: documentFor({ pageType: "hotel_list", city: "上海" }) }).keyword.state).toBe(CONTEXT_STATES.UNKNOWN);
  });
  it("rejects hostname-only or wrong page evidence", () => {
    const wrong = createPageContext({ pageType: { value: "hotel_detail", state: "verified" }, city: { value: "上海", state: "verified" }, keyword: { value: "迪士尼度假区", state: "verified" }, checkIn: { value: "2027-01-02", state: "verified" }, checkOut: { value: "2027-01-04", state: "verified" } });
    expect(verifyTaskContext(task(), wrong)).toMatchObject({ ok: false, code: "WRONG_PAGE_TYPE" });
  });
  it("requires exact normalized values and does not fuzzy-match", () => {
    expect(verifyTaskContext(task(), context({ city: " 上海 ", keyword: "迪士尼度假区" }))).toEqual({ ok: true });
    expect(verifyTaskContext(task(), context({ city: "上海市" }))).toMatchObject({ ok: false, reason: "city" });
    expect(verifyTaskContext(task(), context({ keyword: "中心花坛" }))).toMatchObject({ ok: false, reason: "keyword" });
    expect(verifyTaskContext(task({ keyword: null }), context({ keyword: "迪士尼度假区" }))).toMatchObject({ ok: false, reason: "keyword" });
    expect(verifyTaskContext(task({ keyword: null }), context({ keyword: "" }))).toEqual({ ok: true });
  });
  it("verifies arbitrary cross-year dates without a hardcoded year", () => {
    expect(verifyTaskContext(task({ check_in: "2028-12-30", check_out: "2029-01-02" }), context({ checkIn: "2028-12-30", checkOut: "2029-01-02" }))).toEqual({ ok: true });
    expect(verifyTaskContext(task(), context({ checkIn: "2027-01-03" }))).toMatchObject({ ok: false, reason: "check_in" });
  });
  it("reads verified Ctrip URL parameters with decoded values and strict dates", () => {
    const location = { href: "https://hotels.ctrip.com/hotels/list?cityName=%E4%B8%8A%E6%B5%B7&searchWord=%E8%BF%AA%E5%A3%AB%E5%B0%BC%E5%BA%A6%E5%81%87%E5%8C%BA&checkin=2026-09-19&checkout=2026-09-20" };
    const result = readCtripContext({ document: { querySelector: () => null }, location });
    expect(result).toMatchObject({
      city: { value: "上海", state: "verified", evidence_source: "url.cityName" },
      keyword: { value: "迪士尼度假区", state: "verified", evidence_source: "url.searchWord" },
      check_in: { value: "2026-09-19", state: "verified", evidence_source: "url.checkin" },
      check_out: { value: "2026-09-20", state: "verified", evidence_source: "url.checkout" },
    });
  });
  it("does not turn a missing keyword or invalid date URL parameter into empty", () => {
    const result = readCtripContext({ document: { querySelector: () => null }, location: { href: "https://hotels.ctrip.com/hotels/list?cityName=%E4%B8%8A%E6%B5%B7&checkin=2026-9-19&checkout=" } });
    expect(result.keyword.state).toBe(CONTEXT_STATES.UNKNOWN);
    expect(result.check_in.state).toBe(CONTEXT_STATES.UNKNOWN);
    expect(result.check_out.state).toBe(CONTEXT_STATES.UNKNOWN);
  });
  it("keeps an empty city URL parameter unknown while preserving empty keyword", () => {
    const result = readCtripContext({ document: { querySelector: () => null }, location: { href: "https://hotels.ctrip.com/hotels/list?cityName=&searchWord=" } });
    expect(result.city.state).toBe(CONTEXT_STATES.UNKNOWN);
    expect(result.keyword).toEqual({ value: null, state: CONTEXT_STATES.EMPTY, evidence_source: "url.searchWord" });
  });
  it("verifies page type only with the correct URL scope", () => {
    expect(context().page_type).toEqual({ value: "hotel_list", state: "verified", evidence_source: "url.hotels_list" });
    expect(readCtripContext({ document: { querySelector: () => null }, location: { href: "https://hotels.ctrip.com/hotels/list" } }).page_type.state).toBe(CONTEXT_STATES.VERIFIED);
    expect(readCtripContext({ document: documentFor({}), location: { href: "https://hotels.ctrip.com/hotels/detail/123" } }).page_type.state).toBe(CONTEXT_STATES.UNKNOWN);
    expect(readCtripContext({ document: documentFor({}), location: { href: "https://www.ctrip.com/hotels/list" } }).page_type.state).toBe(CONTEXT_STATES.UNKNOWN);
  });
  it("reports only the frozen URL page type evidence and probe version", () => {
    const probe = ctripContextProbe({ document: { querySelector: () => null }, location: { href: "https://hotels.ctrip.com/hotels/list" } });
    expect(probe.probe_version).toBe("ctrip-context-v1");
    expect(probe.page_type_evidence).toEqual({ source: "url.hotels_list", matched: true });
  });
});
