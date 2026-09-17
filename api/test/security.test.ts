import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { api, json } from "./helpers/http";
import { resetDatabase } from "./helpers/db";

describe("security boundaries", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("rejects unknown access auth", async () => {
    const response = await api("/api/v1/markets");
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "ACCESS_REQUIRED" } });
  });

  it("accepts mock verified Access identity in tests", async () => {
    const response = await api("/api/v1/markets", {
      headers: {
        "x-livv-mock-access-sub": "user-1",
        "x-livv-mock-access-email": "user@livv.test",
        "x-livv-mock-access-role": "viewer"
      }
    });
    expect(response.status).toBe(200);
  });

  it("logs request metadata without credentials", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const credential = "super-secret-device-credential";
    await api("/api/v1/collector/device", {
      headers: {
        "x-livv-device-id": "missing",
        "x-livv-device-credential": credential
      }
    });
    const logs = spy.mock.calls.map((call) => String(call[0])).join("\n");
    spy.mockRestore();
    expect(logs).toContain("request_id");
    expect(logs).not.toContain(credential);
    expect(logs).not.toContain("authorization");
    expect(logs).not.toContain("cookie");
  });
});
