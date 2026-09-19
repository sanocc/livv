import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/index";
import { d1Env, TestD1 } from "./localD1";
import type { AccessIdentity } from "../src/env";

const input = {
  device_id: "device-1",
  name: "Collector One",
  collector_version: "collector-1.0.0",
  protocol_version: "1",
  os: "macOS",
  arch: "arm64",
  browser: "Chrome",
  browser_version: "140",
};

const admin: AccessIdentity = { subject: "admin@example.test", role: "admin" };
const manager: AccessIdentity = { subject: "manager@example.test", role: "manager" };
const viewer: AccessIdentity = { subject: "viewer@example.test", role: "viewer" };
const owner: AccessIdentity = { subject: "owner@example.test", role: "owner" };

async function call(database: TestD1, path: string, init?: RequestInit, identity?: AccessIdentity): Promise<{ response: Response; body: any }> {
  const response = await handleRequest(new Request(`https://example.test${path}`, init), d1Env(database), identity);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

async function register(database: TestD1, value = input): Promise<{ credential: string; body: any }> {
  const result = await call(database, "/api/v1/collector/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  expect(result.response.status).toBe(201);
  return { credential: result.body.data.credential, body: result.body };
}

function deviceAuth(credential: string): HeadersInit {
  return { authorization: `Bearer ${credential}` };
}

describe("M03 device identity and authorization", () => {
  it("registers a pending device, hashes the credential, and is idempotent", async () => {
    const database = new TestD1();
    const first = await register(database);
    expect(first.credential).toMatch(/^[0-9a-f]{64}$/);
    expect(first.body.data.device.status).toBe("pending");
    const stored = database.sqlite.prepare("SELECT credential_hash FROM device_credentials WHERE device_id = 'device-1'").get() as { credential_hash: string };
    expect(stored.credential_hash).not.toBe(first.credential);

    const second = await call(database, "/api/v1/collector/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, name: "Updated Name" }),
    });
    expect(second.response.status).toBe(200);
    expect(second.body.data.credential).toBeUndefined();
    expect(second.body.data.device.name).toBe("Updated Name");
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM devices").get()).toMatchObject({ count: 1 });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM device_credentials WHERE status = 'active'").get()).toMatchObject({ count: 1 });
  });

  it("rejects malformed registration and distinguishes missing or invalid credentials", async () => {
    const database = new TestD1();
    const malformed = await call(database, "/api/v1/collector/register", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, unknown: true }),
    });
    expect(malformed.response.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_PAYLOAD");
    const malformedJson = await call(database, "/api/v1/collector/register", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{not-json",
    });
    expect(malformedJson.response.status).toBe(400);
    expect(malformedJson.body.error.code).toBe("INVALID_PAYLOAD");
    const invalidField = await call(database, "/api/v1/collector/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, browser_version: 140 }),
    });
    expect(invalidField.response.status).toBe(400);
    expect(invalidField.body.error.code).toBe("INVALID_PAYLOAD");

    const missing = await call(database, "/api/v1/collector/device");
    expect(missing.response.status).toBe(401);
    expect(missing.body.error.code).toBe("AUTH_REQUIRED");
    const invalid = await call(database, "/api/v1/collector/device", { headers: deviceAuth("invalid") });
    expect(invalid.response.status).toBe(401);
    expect(invalid.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("allows pending own-device reads and heartbeat but not authorized-only operations", async () => {
    const database = new TestD1();
    const { credential } = await register(database);
    const own = await call(database, "/api/v1/collector/device", { headers: deviceAuth(credential) });
    expect(own.response.status).toBe(200);
    expect(own.body.data.device.status).toBe("pending");
    expect(own.body.data.device.credential_hash).toBeUndefined();
    const before = database.sqlite.prepare("SELECT authorization_state, authorized_by, authorized_at, last_heartbeat_at FROM devices WHERE device_id = 'device-1'").get();

    const protectedFields = await call(database, "/api/v1/collector/heartbeat", {
      method: "POST", headers: { ...deviceAuth(credential), "content-type": "application/json" },
      body: JSON.stringify({ authorized_by: "forged", authorized_at: "forged", credential_hash: "forged" }),
    });
    expect(protectedFields.response.status).toBe(400);
    expect(protectedFields.body.error.code).toBe("INVALID_PAYLOAD");

    const heartbeat = await call(database, "/api/v1/collector/heartbeat", {
      method: "POST", headers: { ...deviceAuth(credential), "content-type": "application/json" },
      body: JSON.stringify({ collector_version: "collector-2.0.0" }),
    });
    expect(heartbeat.response.status).toBe(200);
    expect(heartbeat.body.data.device.collector_version).toBe("collector-2.0.0");
    expect(heartbeat.body.data.device.status).toBe("pending");
    expect(heartbeat.body.data.device.last_heartbeat_at).toEqual(expect.any(String));
    expect(database.sqlite.prepare("SELECT authorization_state, authorized_by, authorized_at, last_heartbeat_at FROM devices WHERE device_id = 'device-1'").get()).toMatchObject({
      authorization_state: (before as { authorization_state: string }).authorization_state,
      authorized_by: (before as { authorized_by: string | null }).authorized_by,
      authorized_at: (before as { authorized_at: string | null }).authorized_at,
    });

    const adminAttempt = await call(database, "/api/v1/devices", { headers: deviceAuth(credential) });
    expect(adminAttempt.response.status).toBe(401);
    expect(adminAttempt.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("enforces Access RBAC and records idempotent authorization", async () => {
    const database = new TestD1();
    const { credential } = await register(database);
    const list = await call(database, "/api/v1/devices", undefined, viewer);
    expect(list.response.status).toBe(200);
    expect(list.body.data.devices).toHaveLength(1);
    const managerList = await call(database, "/api/v1/devices", undefined, manager);
    expect(managerList.response.status).toBe(200);
    const managerGet = await call(database, "/api/v1/devices/device-1", undefined, manager);
    expect(managerGet.response.status).toBe(200);
    expect(JSON.stringify(managerList.body)).not.toContain("credential");
    expect(JSON.stringify(managerList.body)).not.toContain("hash");
    expect(JSON.stringify(managerGet.body)).not.toContain("credential");
    expect(JSON.stringify(managerGet.body)).not.toContain("hash");

    const managerAttempt = await call(database, "/api/v1/devices/device-1/authorize", { method: "POST" }, manager);
    expect(managerAttempt.response.status).toBe(403);
    expect(managerAttempt.body.error.code).toBe("FORBIDDEN");
    const forgedHeader = await call(database, "/api/v1/devices", { headers: { "X-Role": "admin" } });
    expect(forgedHeader.response.status).toBe(401);
    expect(forgedHeader.body.error.code).toBe("AUTH_REQUIRED");
    const forgedUserHeader = await call(database, "/api/v1/devices", { headers: { "X-User": "admin@example.test" } });
    expect(forgedUserHeader.response.status).toBe(401);

    const authorized = await call(database, "/api/v1/devices/device-1/authorize", { method: "POST" }, admin);
    expect(authorized.response.status).toBe(200);
    expect(authorized.body.data.device.status).toBe("authorized");
    expect(database.sqlite.prepare("SELECT authorized_by, authorized_at FROM devices WHERE device_id = 'device-1'").get()).toMatchObject({ authorized_by: admin.subject });
    const auditCount = database.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'device.authorize'").get();

    const repeat = await call(database, "/api/v1/devices/device-1/authorize", { method: "POST" }, owner);
    expect(repeat.response.status).toBe(200);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'device.authorize'").get()).toEqual(auditCount);

    const authorizedOwn = await call(database, "/api/v1/collector/device", { headers: deviceAuth(credential) });
    expect(authorizedOwn.response.status).toBe(200);
    expect(authorizedOwn.body.data.device.status).toBe("authorized");

    const managerRevoke = await call(database, "/api/v1/devices/device-1/revoke", { method: "POST" }, manager);
    expect(managerRevoke.response.status).toBe(403);
    const ownerRevoke = await call(database, "/api/v1/devices/device-1/revoke", { method: "POST" }, owner);
    expect(ownerRevoke.response.status).toBe(200);
  });

  it("revokes credentials, records audit, and keeps revoked terminal", async () => {
    const database = new TestD1();
    const { credential } = await register(database);
    await call(database, "/api/v1/devices/device-1/authorize", { method: "POST" }, admin);
    const revoked = await call(database, "/api/v1/devices/device-1/revoke", { method: "POST" }, admin);
    expect(revoked.response.status).toBe(200);
    expect(revoked.body.data.device.status).toBe("revoked");
    expect(database.sqlite.prepare("SELECT revoked_by, revoked_at FROM devices WHERE device_id = 'device-1'").get()).toMatchObject({ revoked_by: admin.subject });
    expect(database.sqlite.prepare("SELECT status FROM device_credentials WHERE device_id = 'device-1'").get()).toMatchObject({ status: "revoked" });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'device.revoke'").get()).toMatchObject({ count: 1 });
    const auditMetadata = database.sqlite.prepare("SELECT metadata FROM audit_events WHERE action = 'device.revoke'").get() as { metadata: string };
    expect(auditMetadata.metadata).not.toContain(credential);
    expect(auditMetadata.metadata).not.toContain("hash");
    expect(auditMetadata.metadata).not.toContain("token");

    const oldCredential = await call(database, "/api/v1/collector/device", { headers: deviceAuth(credential) });
    expect(oldCredential.response.status).toBe(403);
    expect(oldCredential.body.error.code).toBe("DEVICE_REVOKED");
    const revokedHeartbeat = await call(database, "/api/v1/collector/heartbeat", {
      method: "POST", headers: { ...deviceAuth(credential), "content-type": "application/json" }, body: "{}",
    });
    expect(revokedHeartbeat.response.status).toBe(403);
    expect(revokedHeartbeat.body.error.code).toBe("DEVICE_REVOKED");
    const reauthorize = await call(database, "/api/v1/devices/device-1/authorize", { method: "POST" }, admin);
    expect(reauthorize.response.status).toBe(409);
    expect(reauthorize.body.error.code).toBe("CONFLICT");

    const auditBeforeRepeat = database.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'device.revoke'").get();
    const repeatRevoke = await call(database, "/api/v1/devices/device-1/revoke", { method: "POST" }, owner);
    expect(repeatRevoke.response.status).toBe(200);
    expect(database.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'device.revoke'").get()).toEqual(auditBeforeRepeat);
  });

  it("revokes a pending device and does not log credential material", async () => {
    const database = new TestD1();
    const { credential } = await register(database);
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const revoked = await call(database, "/api/v1/devices/device-1/revoke", { method: "POST" }, admin);
    expect(revoked.response.status).toBe(200);
    expect(revoked.body.data.device.status).toBe("revoked");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
    expect(credential).toHaveLength(64);
  });

  it("does not expose stack traces in a device API error", async () => {
    const database = new TestD1();
    const response = await handleRequest(new Request("https://example.test/api/v1/collector/device"), d1Env(database));
    const text = await response.text();
    expect(response.status).toBe(401);
    expect(text).not.toContain("at ");
    expect(text).not.toContain("Error:");
    expect(text).not.toContain("stack");
  });
});
