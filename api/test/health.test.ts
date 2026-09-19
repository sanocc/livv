import worker from "../src/index";
import { errorResponse } from "../src/response";
import { describe, expect, it } from "vitest";

const env = {};

async function request(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://example.test${path}`, init), env);
}

describe("M01 Worker foundation", () => {
  it.each(["/health", "/api/v1/health"])("serves %s", async (path) => {
    const response = await request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true, service: "livv-api-v2" });
  });

  it("returns a stable 404 for an unknown route", async () => {
    const response = await request("/not-a-route");
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.error).toEqual({ code: "NOT_FOUND", message: "Route not found" });
    expect(body.request_id).toEqual(expect.any(String));
  });

  it("does not expose stack traces for unexpected failures", async () => {
    const response = errorResponse(new Error("private implementation detail"), "test-request");
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("at ");
    expect(text).not.toContain("Error:");
    expect(text).not.toContain("stack");
  });
});
