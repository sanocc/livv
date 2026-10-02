import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../api/src/index.js";
import { harness, input, device, claimStart } from "./acceptance-support.js";
import { nowIso } from "../api/src/config.js";

test("unchanged MV3 LIST executor uploads acceptance through original API (explicit Chrome/DOM simulation, not live evidence)", async () => {
  const h = harness(),
    oldChrome = globalThis.chrome,
    oldFetch = globalThis.fetch;
  try {
    const d = await device(h),
      task = (await h.call("/v1/admin/acceptance-tasks", "POST", input())).data
        .task;
    const attempt = await claimStart(h, d, task);
    const active = {
      task,
      attempt,
      tab_id: 7,
      phase: "LIST",
      phase_at: Date.now(),
      core_hotels: [],
    };
    const state = {
      identity: { device_id: d.id, credential: "a".repeat(64) },
      auto: true,
      active,
      logs: [],
    };
    const noopListener = { addListener() {} };
    globalThis.chrome = {
      storage: {
        local: {
          async get(keys) {
            return Object.fromEntries(keys.map((k) => [k, state[k]]));
          },
          async set(values) {
            Object.assign(state, values);
          },
        },
      },
      runtime: {
        getManifest: () => ({ version: "1.3.6" }),
        onInstalled: noopListener,
        onStartup: noopListener,
        onMessage: noopListener,
      },
      alarms: { onAlarm: noopListener },
      sidePanel: { async setPanelBehavior() {} },
      tabs: {
        onUpdated: noopListener,
        async get(id) {
          assert.equal(id, 7);
          return {
            url: "https://m.ctrip.com/webapp/hotels/hotelsearch/listPage",
            status: "complete",
          };
        },
      },
      scripting: {
        async executeScript({ target, func }) {
          assert.equal(target.tabId, 7);
          assert.equal(func.name, "inspectList");
          return [
            {
              result: {
                url: "https://m.ctrip.com/webapp/hotels/hotelsearch/listPage",
                context: task,
                context_verified: true,
                unparsed_cards: 0,
                captcha: false,
                exhausted: false,
                observed_at: nowIso(),
                hotels: [0, null, 188].map((display_price, i) => ({
                  hotel_id: String(i + 1),
                  hotel_name: `隔离模拟酒店${i + 1}`,
                  display_price,
                  original_price: null,
                  rank: i + 1,
                  is_ad: false,
                })),
              },
            },
          ];
        },
      },
    };
    const paths = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).origin, "https://api.poai.cc");
      paths.push(new URL(url).pathname);
      return worker.fetch(
        new Request("http://localhost" + new URL(url).pathname, options),
        h.env,
      );
    };
    let source = readFileSync(
      new URL("../agent/background.js", import.meta.url),
      "utf8",
    );
    // Ancillary telemetry is outside this business protocol test; suppress only its queue timer.
    source = source.replace(
      'import { telemetryEvent, telemetryQueue } from "./telemetry.js";',
      "const telemetryEvent = () => null; const telemetryQueue = () => ({ enqueue: async () => {}, flush: async () => {} });",
    );
    source = source.replace(
      /from "\.\/([^"\n]+)"/g,
      (_, file) =>
        `from "${new URL("../agent/" + file, import.meta.url).href}"`,
    );
    source = source.replace("void tick(true);", "export { run };");
    const { run } = await import(
      "data:text/javascript;base64," + Buffer.from(source).toString("base64")
    );
    await run(active);
    assert.equal(state.active, null);
    assert.equal(state.last_result.status, "COMPLETED");
    assert.ok(paths.includes(`/v1/device/attempts/${attempt.id}/result`));
    assert.ok(
      paths.every((p) => p.startsWith(`/v1/device/attempts/${attempt.id}/`)),
    );
    const r = (await h.call(`/v1/admin/acceptance-tasks/${task.id}`)).data;
    assert.equal(r.status, "SIMULATED_PASS");
    assert.ok(Object.values(r.checks).every((v) => v === true));
    assert.deepEqual(
      r.observations.map((o) => o.display_price),
      [0, null, 188],
    );
    assert.equal(state.identity.device_id, d.id);
    assert.equal(state.auto, true);
  } finally {
    globalThis.chrome = oldChrome;
    globalThis.fetch = oldFetch;
    h.DB.raw.close();
  }
});
