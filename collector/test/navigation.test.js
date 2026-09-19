import { describe, expect, it, vi } from "vitest";
import { createCtripNavigation, NavigationError } from "../platforms/ctrip/navigation.js";
import { ctripAdapter, createPlatformAdapter } from "../platforms/ctrip/adapter.js";
import { verifyTaskContext } from "../platforms/ctrip/context-contract.js";

const task = { platform: "ctrip", city: "上海", keyword: null, check_in: "2027-01-02", check_out: "2027-01-04" };
const good = { platform: "ctrip", page_type: { value: "hotel_list", state: "verified" }, city: { value: "上海", state: "verified" }, keyword: { value: null, state: "empty" }, check_in: { value: "2027-01-02", state: "verified" }, check_out: { value: "2027-01-04", state: "verified" } };
function driver() { return Object.fromEntries(["ensureSurface", "setCity", "confirmCity", "setKeyword", "confirmKeyword", "setDates", "submitSearch", "waitForResults"].map((name) => [name, vi.fn(async () => {})])); }

describe("M06-A Ctrip navigation", () => {
  it("uses one explicit ordered navigation sequence", async () => {
    const d = driver(); const nav = createCtripNavigation({ driver: d, readContext: async () => good });
    const result = await nav.navigate(task);
    expect(result).toMatchObject({ attempts: 1, verification: { ok: true } });
    expect(d.setCity).toHaveBeenCalledWith("上海");
    expect(d.setKeyword).toHaveBeenCalledWith(null);
    expect(d.setDates).toHaveBeenCalledWith("2027-01-02", "2027-01-04");
  });
  it("reruns the complete sequence once after a mismatch, then fails", async () => {
    const d = driver(); let reads = 0; const nav = createCtripNavigation({ driver: d, readContext: async () => { reads += 1; return reads === 1 ? { ...good, city: { value: "错误", state: "verified" } } : good; } });
    expect((await nav.navigate(task)).attempts).toBe(2);
    expect(d.ensureSurface).toHaveBeenCalledTimes(2);
    const failing = createCtripNavigation({ driver: d, readContext: async () => ({ ...good, page_type: { value: "hotel_detail", state: "verified" } }) });
    await expect(failing.navigate(task)).rejects.toMatchObject({ code: "WRONG_PAGE_TYPE" });
  });
  it("exposes only the Ctrip adapter and keeps context verification deterministic", () => {
    expect(ctripAdapter.platform).toBe("ctrip");
    expect(createPlatformAdapter(ctripAdapter).platform).toBe("ctrip");
    expect(verifyTaskContext(task, good).ok).toBe(true);
    expect(() => createPlatformAdapter({ platform: "other" })).toThrow();
    expect(NavigationError).toBeTypeOf("function");
  });
});
