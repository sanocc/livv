// Isolated synthetic devices only. This is not real Chrome/Mac/Windows evidence.
import assert from "node:assert/strict";
import worker from "../api/src/index.js";
import { database } from "./db-adapter.js";
import { businessDate, addDays, nowIso } from "../api/src/config.js";
export function harness() {
  const DB = database();
  const env = {
    DB,
    ENVIRONMENT: "local",
    LOCAL_ADMIN_TOKEN: "isolated-acceptance-test",
  };
  async function call(
    path,
    method = "GET",
    body,
    headers = { Authorization: "Bearer isolated-acceptance-test" },
  ) {
    const response = await worker.fetch(
      new Request("http://localhost" + path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
    return { status: response.status, data: await response.json() };
  }
  return { DB, env, call };
}
export const input = (os = "macOS") => ({
  platform: "ctrip",
  os,
  city: "咸宁",
  keyword: "中心花坛",
  checkin: addDays(businessDate(), 1),
  checkout: addDays(businessDate(), 2),
});
export async function device(h, os = "macOS", extra = {}) {
  const id = crypto.randomUUID(),
    credential = "a".repeat(64);
  const headers = { "X-Device-ID": id, Authorization: `Bearer ${credential}` };
  assert.equal(
    (
      await h.call(
        "/v1/devices/register",
        "POST",
        { device_id: id, credential, version: "1.3.6" },
        {},
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await h.call(`/v1/admin/devices/${id}`, "PATCH", {
        status: "approved",
        name: "隔离模拟设备",
      })
    ).status,
    200,
  );
  const environment = {
    os,
    browser_name: "Chrome",
    browser_version: "140.0.0.0",
    manifest_version: 3,
    capabilities: { ctrip: true, market_list: true },
    ...extra,
  };
  assert.equal(
    (await h.call("/v1/device/environment", "POST", environment, headers))
      .status,
    200,
  );
  assert.equal(
    (
      await h.call(
        "/v1/device/heartbeat",
        "POST",
        {
          version: "1.3.6",
          runtime: { auto: true, debugger_permission: true },
        },
        headers,
      )
    ).status,
    200,
  );
  return { id, headers, environment };
}
export async function claimStart(h, d, task) {
  const r = await h.call("/v1/device/claim", "POST", {}, d.headers);
  assert.equal(r.status, 200);
  assert.equal(r.data.task.id, task.id);
  assert.equal(r.data.task.task_type, "MARKET_LIST");
  assert.equal(
    (
      await h.call(
        `/v1/device/attempts/${r.data.attempt.id}/start`,
        "POST",
        {},
        d.headers,
      )
    ).status,
    200,
  );
  return r.data.attempt;
}
export async function complete(
  h,
  d,
  task,
  attempt,
  { prices = [0, null, 188], stages = true } = {},
) {
  // Snapshot is observed before the asynchronous LIST_READY acknowledgement, as in the real Agent.
  const observed_at = nowIso();
  if (stages)
    for (const event of ["LIST_READY", "MARKET_LOCKED"]) {
      assert.equal(
        (
          await h.call(
            `/v1/device/attempts/${attempt.id}/events`,
            "POST",
            { event, message: "do-not-export-raw-diagnostics" },
            d.headers,
          )
        ).status,
        200,
      );
    }
  const payload = {
    source: "ctrip-dom",
    platform: task.platform,
    city: task.city,
    keyword: task.keyword,
    checkin: task.checkin,
    checkout: task.checkout,
    observed_at,
    exhausted: false,
    stop_reason: "TARGET_REACHED",
    hotels: prices.map((display_price, i) => ({
      hotel_id: String(i + 1),
      hotel_name: `隔离模拟酒店${i + 1}`,
      display_price,
      original_price: null,
      rank: i + 1,
      is_ad: false,
    })),
    rooms: [],
    detail_results: [],
  };
  const result = await h.call(
    `/v1/device/attempts/${attempt.id}/result`,
    "POST",
    payload,
    d.headers,
  );
  assert.equal(result.status, 200, JSON.stringify(result));
  return payload;
}
