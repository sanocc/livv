import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, json, managerHeaders, viewerHeaders } from "./helpers/http";
import { resetDatabase } from "./helpers/db";

const marketPayload = {
  name: "Xianning Center Flower Bed",
  city: "Xianning",
  keyword: "Center Flower Bed",
  timezone: "Asia/Shanghai"
};

describe("markets", () => {
  beforeEach(async () => {
    await resetDatabase(env.DB);
  });

  it("lists empty markets for viewer", async () => {
    const response = await api("/api/v1/markets", { headers: viewerHeaders });
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ ok: true, data: { items: [], page: 1, page_size: 20, total: 0 } });
  });

  it("creates and gets a market", async () => {
    const create = await api("/api/v1/markets", {
      method: "POST",
      headers: managerHeaders,
      body: JSON.stringify(marketPayload)
    });
    expect(create.status).toBe(201);
    const created = await json(create);
    const id = created.data.id;

    const get = await api(`/api/v1/markets/${id}`, { headers: viewerHeaders });
    expect(get.status).toBe(200);
    expect(await json(get)).toMatchObject({ ok: true, data: { id, city: "Xianning" } });
  });

  it("enforces duplicate market constraint", async () => {
    await api("/api/v1/markets", { method: "POST", headers: managerHeaders, body: JSON.stringify(marketPayload) });
    const duplicate = await api("/api/v1/markets", {
      method: "POST",
      headers: managerHeaders,
      body: JSON.stringify(marketPayload)
    });
    expect(duplicate.status).toBe(409);
    expect(await json(duplicate)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("rejects invalid and unknown fields", async () => {
    const response = await api("/api/v1/markets", {
      method: "POST",
      headers: managerHeaders,
      body: JSON.stringify({ ...marketPayload, status: "authorized" })
    });
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  });

  it("allows viewer read and rejects viewer write", async () => {
    const read = await api("/api/v1/markets", { headers: viewerHeaders });
    expect(read.status).toBe(200);

    const write = await api("/api/v1/markets", {
      method: "POST",
      headers: viewerHeaders,
      body: JSON.stringify(marketPayload)
    });
    expect(write.status).toBe(403);
    expect(await json(write)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("records audit event for market creation", async () => {
    const response = await api("/api/v1/markets", {
      method: "POST",
      headers: managerHeaders,
      body: JSON.stringify(marketPayload)
    });
    const id = (await json(response)).data.id;
    const audit = await env.DB.prepare("SELECT action, target_type, target_id FROM audit_events WHERE target_id = ?").bind(id).first();
    expect(audit).toMatchObject({ action: "market.create", target_type: "market", target_id: id });
  });
});
