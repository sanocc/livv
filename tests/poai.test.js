import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  csv,
  normalize,
  summarize,
  group,
  previous,
  range,
} from "../ops/public/model.js";
import { ingestTelemetry, deviceDiagnostics } from "../api/src/telemetry.js";
import { database } from "./db-adapter.js";
test("POAI domains and Agent version use canonical bindings with unchanged production schedule", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../agent/manifest.json", import.meta.url)),
  );
  assert.equal(manifest.version, "1.3.5");
  assert.equal(manifest.name, "POAI 酒店助手");
  assert.deepEqual(manifest.host_permissions, [
    "https://api.poai.cc/*",
    "https://m.ctrip.com/*",
  ]);
  const api = JSON.parse(
    fs.readFileSync(new URL("../api/wrangler.jsonc", import.meta.url)),
  );
  assert.equal(api.name, "poai-api");
  assert.equal(
    api.d1_databases[0].database_id,
    "75a2bb2d-ca57-4be9-9eb4-6b389d504c5f",
  );
  assert.deepEqual(api.triggers.crons, ["* * * * *"]);
  for (const [directory, domain] of [
    ["api", "api.poai.cc"],
    ["ota", "ota.poai.cc"],
    ["site", "poai.cc"],
    ["ops", "ops.poai.cc"],
    ["ai", "ai.poai.cc"],
  ]) {
    const config = JSON.parse(
      fs.readFileSync(
        new URL(`../${directory}/wrangler.jsonc`, import.meta.url),
      ),
    );
    assert.equal(config.routes[0].pattern, domain);
  }
});
test("OPS parses quoted CSV, keeps real zeros, rejects malformed rows and duplicate grains", () => {
  const table = csv(
    '\uFEFF营业日,营收,售卖房量,可售房量,房型,渠道\r\n2026-10-01,"1,200",6,10,大床,"携程,直销"\r\n2026-10-02,0,0,,大床,直销',
  );
  const r = normalize(table);
  assert.equal(r[0].revenue, 1200);
  assert.equal(r[0].channel, "携程,直销");
  assert.equal(r[1].revenue, 0);
  assert.equal(r[1].available, null);
  assert.equal(summarize([r[0]]).adr, 200);
  assert.equal(summarize([r[0]]).occ, 0.6);
  assert.equal(summarize([r[1]]).adr, null);
  assert.equal(summarize([r[1]]).occ, null);
  assert.equal(summarize([]).revenue, null);
  assert.throws(() => csv('"missing'), /引号/);
  assert.throws(() => normalize([table[0], table[1], table[1]]), /重复/);
  assert.throws(() => normalize([table[0], ["2026-02-30", 100, 1]]), /营业日/);
  assert.throws(() => normalize([table[0], ["2026-10-01", "", 1]]), /缺失/);
});
test("OPS occupancy counts repeated room-type capacity once across channels, missing capacity stays unknown", () => {
  const r = normalize([
    ["营业日", "营收", "售卖房量", "可售房量", "房型", "渠道"],
    ["2026-10-01", 600, 3, 10, "大床", "携程"],
    ["2026-10-01", 400, 2, 10, "大床", "直销"],
    ["2026-10-01", 600, 2, 5, "双床", "携程"],
  ]);
  const s = summarize(r);
  assert.equal(s.rooms, 7);
  assert.equal(s.available, 15);
  assert.equal(s.adr, 1600 / 7);
  assert.equal(s.occ, 7 / 15);
  assert.equal(
    group(r, "channel").find((x) => x.name === "携程").revenue,
    1200,
  );
  assert.equal(
    summarize([...r, { ...r[0], date: "2026-10-02", available: null }]).occ,
    null,
  );
  assert.throws(
    () =>
      normalize([
        ["营业日", "营收", "售卖房量", "可售房量", "房型", "渠道"],
        ["2026-10-01", 600, 3, 10, "大床", "携程"],
        ["2026-10-01", 400, 2, 11, "大床", "直销"],
      ]),
    /不一致/,
  );
});
test("OPS comparisons and inclusive calendar ranges handle month, year and leap boundaries", () => {
  assert.equal(previous("2026-01-01", "day"), "2025-12-31");
  assert.equal(previous("2026-10-01", "week"), "2026-09-24");
  assert.equal(previous("2026-03-31", "month"), "2026-02-28");
  assert.equal(previous("2024-03-31", "month"), "2024-02-29");
  assert.deepEqual(range("2026-10-02", "week"), ["2026-09-28", "2026-10-04"]);
  assert.deepEqual(range("2026-10-02", "quarter"), [
    "2026-10-01",
    "2026-12-31",
  ]);
});
test("cloud log fields reject raw messages and arbitrary error values, D1 errors remain authoritative", async () => {
  const DB = database(),
    points = [],
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,created_at) VALUES(?,?,?,?)",
    )
    .run(id, "hash", "approved", now);
  const env = { DB, HELPER_EVENTS: { writeDataPoint: (p) => points.push(p) } };
  await ingestTelemetry(
    env,
    { id },
    {
      events: [
        {
          event_id: crypto.randomUUID(),
          event_code: "API_TIMEOUT",
          occurred_at: now,
          helper_version: "1.3.1",
          error_code: "COOKIE_secret",
          message: "token=secret",
        },
      ],
    },
  );
  assert.equal(points[0].blobs[11], "API_TIMEOUT");
  assert.ok(!JSON.stringify(points).includes("secret"));
  const d = await deviceDiagnostics(env, id);
  assert.deepEqual(d.logs, []);
  assert.equal(d.agent_logs.length, 1);
  assert.equal(d.agent_logs[0].error_code, "API_TIMEOUT");
  assert.equal(d.agent_logs[0].app_version, "1.3.1");
  assert.equal(d.agent_logs[0].level, "error");
});
test("sparse D1 Agent logs are idempotent and survive unavailable sampled analytics without inventing task results", async () => {
  const DB = database(),
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  DB.raw
    .prepare(
      "INSERT INTO devices(id,credential_hash,status,created_at) VALUES(?,?,?,?)",
    )
    .run(id, "hash", "approved", now);
  const e = {
    event_id: crypto.randomUUID(),
    event_code: "HELPER_ERROR",
    occurred_at: now,
    helper_version: "1.3.1",
    diagnostic: "API_RESPONSE_NOT_JSON",
    message: "secret",
  };
  assert.equal(
    (await ingestTelemetry({ DB }, { id }, { events: [e] })).available,
    true,
  );
  await ingestTelemetry({ DB }, { id }, { events: [e] });
  const logs = DB.raw.prepare("SELECT * FROM agent_logs").all();
  assert.equal(logs.length, 1);
  assert.ok(!JSON.stringify(logs).includes("secret"));
  assert.equal(
    JSON.parse(logs[0].metadata).diagnostic,
    "API_RESPONSE_NOT_JSON",
  );
  assert.equal(DB.raw.prepare("SELECT count(*) n FROM tasks").get().n, 0);
  await ingestTelemetry(
    { DB },
    { id },
    {
      events: [
        { ...e, event_id: crypto.randomUUID(), event_code: "LIST_PROGRESS" },
      ],
    },
  );
  assert.equal(DB.raw.prepare("SELECT count(*) n FROM agent_logs").get().n, 1);
});
