import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, json } from "./helpers/http";
import { resetDatabase } from "./helpers/db";

const registerPayload = {
  device_id: "device-001",
  name: "Mac Chrome",
  collector_version: "0.0.1",
  protocol_version: "2026-09",
  os: "macOS",
  arch: "arm64",
  browser: "Chrome",
  browser_version: "140.0.0"
};

describe("collector devices", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("first register creates pending device and credential", async () => {
    const response = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registerPayload)
    });
    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.data.device).toMatchObject({ device_id: "device-001", status: "pending" });
    expect(body.data.credential).toEqual(expect.any(String));
  });

  it("duplicate register is idempotent and keeps same device", async () => {
    const first = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registerPayload)
    });
    const firstBody = await json(first);
    const second = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registerPayload)
    });
    const secondBody = await json(second);
    expect(second.status).toBe(200);
    expect(secondBody.data.device.id).toBe(firstBody.data.device.id);
    expect(secondBody.data.credential).toBeNull();
    expect(secondBody.data.idempotent).toBe(true);
  });

  it("client cannot self-authorize during register", async () => {
    const response = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...registerPayload, status: "authorized" })
    });
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  });

  it("rejects invalid payload", async () => {
    const response = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "device-001" })
    });
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  });

  it("returns own status with device credential", async () => {
    const register = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registerPayload)
    });
    const credential = (await json(register)).data.credential;

    const response = await api("/api/v1/collector/device", {
      headers: {
        "x-livv-device-id": "device-001",
        "x-livv-device-credential": credential
      }
    });
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ ok: true, data: { device: { device_id: "device-001", status: "pending" } } });
  });

  it("cannot query another device with mismatched credential", async () => {
    const register = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registerPayload)
    });
    const credential = (await json(register)).data.credential;

    const response = await api("/api/v1/collector/device", {
      headers: {
        "x-livv-device-id": "device-002",
        "x-livv-device-credential": credential
      }
    });
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
  });

  it("does not expose credential hash in register response", async () => {
    const response = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registerPayload)
    });
    const body = await response.text();
    expect(body).not.toContain("credential_hash");
  });

  it("pending device cannot upload facts or claim tasks", async () => {
    const register = await api("/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registerPayload)
    });
    const credential = (await json(register)).data.credential;
    const headers = {
      "content-type": "application/json",
      "x-livv-device-id": "device-001",
      "x-livv-device-credential": credential
    };

    const upload = await api("/api/v1/collector/collections", {
      method: "POST",
      headers,
      body: JSON.stringify({})
    });
    const claim = await api("/api/v1/collector/tasks/claim", {
      method: "POST",
      headers,
      body: JSON.stringify({})
    });

    expect(upload.status).toBe(403);
    expect(claim.status).toBe(403);
    expect(await json(upload)).toMatchObject({ ok: false, error: { code: "DEVICE_PENDING" } });
    expect(await json(claim)).toMatchObject({ ok: false, error: { code: "DEVICE_PENDING" } });
  });
});
