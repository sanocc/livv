import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, json, managerHeaders } from "./helpers/http";
import { resetDatabase } from "./helpers/db";

describe("router", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("returns unified 404", async () => {
    const response = await api("/api/v1/missing");
    expect(response.status).toBe(404);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("returns method error", async () => {
    const response = await api("/api/v1/markets", { method: "DELETE", headers: managerHeaders });
    expect(response.status).toBe(405);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } });
  });

  it("returns malformed JSON safely", async () => {
    const response = await api("/api/v1/markets", {
      method: "POST",
      headers: managerHeaders,
      body: "{"
    });
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "BAD_JSON" } });
  });

  it("does not expose stack traces on unexpected exceptions", async () => {
    await env.DB.exec("DROP TABLE audit_events");
    const response = await api("/api/v1/markets", {
      method: "POST",
      headers: managerHeaders,
      body: JSON.stringify({ name: "A", city: "Xianning", keyword: "Center", timezone: "Asia/Shanghai" })
    });
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("Error:");
    expect(body).not.toContain("stack");
  });
});
