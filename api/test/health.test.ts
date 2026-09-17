import { describe, expect, it } from "vitest";
import { api, json } from "./helpers/http";

describe("health", () => {
  it("/health returns 200", async () => {
    const response = await api("/health");
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      ok: true,
      data: { service: "livv-api", status: "ok" }
    });
  });

  it("/api/v1/health returns 200", async () => {
    const response = await api("/api/v1/health");
    expect(response.status).toBe(200);
    expect((await json(response)).data.version).toBeTruthy();
  });
});
