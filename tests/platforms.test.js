import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { platformCatalog } from "../platforms/catalog.js";
import { platformAdapter } from "../platforms/index.js";
import { ctripObservation, ctripAdapter } from "../platforms/ctrip/index.js";
import { observationEnvelope, AdapterError } from "../platforms/contract.js";
import {
  fliggyObservation,
  documentedPrice,
  searchFliggy,
  decodeSearchRpc,
  hotelSearchArguments,
  FLYAI_ENDPOINT,
} from "../platforms/fliggy/index.js";
import { inspectList } from "../agent/mobile.js";
import worker from "../api/src/index.js";
import { database } from "./db-adapter.js";
import { target } from "../api/src/domain.js";
import { platformCapabilitiesView } from "../ota/public/platforms.js";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/fliggy-search.example.json", import.meta.url),
  ),
);
const context = {
  platform: "fliggy",
  city: "杭州",
  keyword: "",
  checkin: "2026-10-05",
  checkout: "2026-10-06",
};
const at = "2026-10-02T10:00:00Z";
const parse = (rows) =>
  fliggyObservation({ status: 0, data: { itemList: rows } }, context, at);
const hotel = {
  shId: "same-id",
  name: "隔离测试酒店",
  price: "¥0",
  score: "4.5",
};
const envelope = () => ({
  platform: "ctrip",
  source: "ctrip-dom",
  context: { ...context, platform: "ctrip" },
  context_verified: true,
  observed_at: at,
  observed_at_basis: "list_snapshot",
  exhausted: null,
  stop_reason: "UNKNOWN",
  hotels: [
    {
      platform: "ctrip",
      hotel_id: "same-id",
      hotel_name: "隔离测试酒店",
      display_price: 0,
    },
  ],
});

test("catalog separates current collection, experimental implementation, cloud blockers and unknown live health", () => {
  const rows = platformCatalog();
  assert.deepEqual(
    rows.map((p) => p.id),
    ["ctrip", "meituan", "fliggy", "tongcheng"],
  );
  assert.deepEqual(
    rows.filter((p) => p.collection_enabled).map((p) => p.id),
    ["ctrip"],
  );
  assert.ok(
    rows.every(
      (p) => p.health === "unknown" && p.live_verification.verified_at === null,
    ),
  );
  rows[0].capabilities.market_list = false;
  assert.equal(platformCatalog()[0].capabilities.market_list, true);
  assert.deepEqual(platformCatalog()[3].identity_namespaces, [
    "tongcheng",
    "elong",
  ]);
});
test("unknown adapters never fall back to Ctrip; unverified platforms cannot navigate or parse invented DOM", () => {
  for (const id of ["meituan", "tongcheng", "elong"]) {
    assert.equal(platformAdapter(id).platform, id);
    assert.throws(
      () => platformAdapter(id).parseObservation(),
      /PLATFORM_LIVE_EVIDENCE_REQUIRED/,
    );
    assert.throws(
      () => platformAdapter(id).inspectList(),
      /PLATFORM_LIVE_EVIDENCE_REQUIRED/,
    );
    assert.throws(
      () => platformAdapter(id).navigate(),
      /PLATFORM_LIVE_EVIDENCE_REQUIRED/,
    );
  }
  for (const id of ["other", "__proto__", "constructor"])
    assert.throws(() => platformAdapter(id), /UNKNOWN_PLATFORM/);
  assert.equal(platformAdapter("fliggy").collection_enabled, false);
});
test("Ctrip adapter reuses existing parser and native context checks; dedupe and null/zero semantics retained", () => {
  assert.equal(ctripAdapter.inspectList, inspectList);
  assert.equal(ctripAdapter.parseObservation, ctripObservation);
  assert.equal(platformAdapter("fliggy").parseObservation, fliggyObservation);
  const task = { ...context, platform: "ctrip" };
  const result = {
    url: "https://m.ctrip.com/webapp/hotels/hotelsearch/listPage",
    context: task,
    context_verified: true,
    unparsed_cards: 0,
    captcha: false,
    observed_at: at,
    exhausted: false,
    hotels: [
      {
        hotel_id: "1",
        hotel_name: "隔离",
        rank: 2,
        is_ad: true,
        display_price: 99,
      },
      {
        hotel_id: "1",
        hotel_name: "隔离",
        rank: 5,
        is_ad: false,
        display_price: 0,
      },
      {
        hotel_id: "2",
        hotel_name: "隔离2",
        rank: 6,
        is_ad: false,
        display_price: null,
      },
    ],
  };
  const parsed = ctripObservation(result, task);
  assert.equal(parsed.hotels.length, 2);
  assert.equal(parsed.hotels[0].display_price, 0);
  assert.equal(parsed.hotels[0].is_ad, false);
  assert.equal(parsed.hotels[1].display_price, null);
  assert.equal(parsed.exhausted, false);
  assert.equal(parsed.hotels[0].availability_status, "unknown");
  for (const changed of [
    { context_verified: false },
    { captcha: true },
    { unparsed_cards: 1 },
    { context: { ...task, platform: "meituan" } },
  ])
    assert.throws(
      () => ctripObservation({ ...result, ...changed }, task),
      /PAGE_CONTEXT_NOT_VERIFIED/,
    );
  assert.throws(
    () =>
      ctripObservation(
        { ...result, url: "https://example.com/webapp/hotels/" },
        task,
      ),
    /UNTRUSTED_PAGE/,
  );
  assert.equal(
    ctripObservation({ ...result, exhausted: true }, task).stop_reason,
    "NATURAL_END",
  );
});
test("unified observation preserves raw namespaces, missing values and real zero, without sold-out or exhaustion inference", () => {
  for (const platform of ["ctrip", "meituan", "fliggy", "tongcheng", "elong"]) {
    const base = envelope();
    base.platform = base.context.platform = base.hotels[0].platform = platform;
    const result = observationEnvelope(base);
    assert.equal(result.platform, platform);
    assert.equal(result.hotels[0].hotel_id, "same-id");
    assert.equal(result.hotels[0].display_price, 0);
    assert.equal(result.hotels[0].original_price, null);
    assert.equal(result.hotels[0].is_ad, null);
    assert.equal(result.hotels[0].rank, null);
    assert.equal(result.hotels[0].availability_status, "unknown");
    assert.equal(result.exhausted, null);
  }
  for (const price of [-1, NaN, Infinity, "0"]) {
    const base = envelope();
    base.hotels[0].display_price = price;
    assert.throws(
      () => observationEnvelope(base),
      /INVALID_OBSERVATION_NUMBER/,
    );
  }
  for (const change of [
    { exhausted: true },
    { context: { ...context } },
    { observed_at: "2026-10-02" },
  ])
    assert.throws(
      () => observationEnvelope({ ...envelope(), ...change }),
      AdapterError,
    );
  assert.throws(
    () => observationEnvelope({ ...envelope(), source: null }),
    /OBSERVATION_SOURCE_REQUIRED/,
  );
  assert.throws(
    () =>
      observationEnvelope({
        ...envelope(),
        context: { ...envelope().context, city: null },
      }),
    /VERIFIED_CONTEXT_INCOMPLETE/,
  );
  const base = envelope();
  base.hotels[0].availability_status = "sold_out";
  assert.throws(() => observationEnvelope(base), /SOLD_OUT_EVIDENCE_REQUIRED/);
  base.hotels[0].sold_out_evidence = "明确已订完";
  assert.equal(
    observationEnvelope(base).hotels[0].sold_out_evidence,
    "明确已订完",
  );
  base.hotels.push({ ...base.hotels[0] });
  assert.throws(() => observationEnvelope(base), /DUPLICATE_HOTEL_ID/);
});
test("FlyAI publisher example is parsed as unverified search quote, never a same-context production observation", () => {
  assert.match(fixture.fixture_kind, /not_live/);
  const result = fliggyObservation(fixture.response, context, at);
  assert.equal(result.hotels[0].hotel_id, "10021423");
  assert.equal(result.hotels[0].display_price, 618);
  assert.equal(result.hotels[0].score, 5);
  assert.equal(result.context_verified, false);
  assert.equal(result.hotels[0].price_basis, "search_quote_unverified");
  assert.equal(result.observed_at_basis, "client_response_received");
  assert.equal(result.exhausted, null);
  assert.equal(result.hotels[0].rank, null);
  assert.equal(result.hotels[0].is_ad, null);
  assert.equal(result.hotels[0].original_price, null);
  assert.equal(result.hotels[0].review_count, null);
  assert.equal(result.hotels[0].availability_status, "unknown");
});
test("FlyAI price formats reject ranges, discounts, other currency and ambiguous values; zero and missing remain distinct", () => {
  assert.equal(documentedPrice("¥0"), 0);
  assert.equal(documentedPrice("￥1,234.50"), 1234.5);
  for (const price of [
    null,
    "",
    618,
    "618",
    "¥100起",
    "¥100-200",
    "$50",
    "¥00,100",
    "¥1.234",
    "¥-1",
    "¥Infinity",
  ])
    assert.equal(documentedPrice(price), null);
  const result = parse([
    hotel,
    { ...hotel, shId: "2", price: null, score: "9.2" },
  ]);
  assert.equal(result.hotels[0].display_price, 0);
  assert.equal(result.hotels[1].display_price, null);
  assert.equal(result.hotels[1].score, null);
  assert.equal(result.hotels[1].currency, null);
  assert.throws(
    () => parse([{ ...hotel, shId: 123 }]),
    /INVALID_OBSERVATION_TEXT/,
  );
  assert.throws(
    () => fliggyObservation({ status: 1, data: { itemList: [] } }, context, at),
    /RESPONSE_INVALID/,
  );
});
test("FlyAI contradictory business errors and malformed item identities are rejected", () => {
  for (const flag of [
    { error: { message: "private" } },
    { isError: true },
    { success: false },
  ])
    assert.throws(
      () => fliggyObservation({ ...fixture.response, ...flag }, context, at),
      /RESPONSE_INVALID/,
    );
  assert.throws(
    () => observationEnvelope({ ...envelope(), hotels: [null] }),
    /HOTEL_PLATFORM_MISMATCH/,
  );
  for (const result of [{ content: {} }, { content: [null] }])
    assert.throws(
      () =>
        decodeSearchRpc(
          JSON.stringify({ jsonrpc: "2.0", id: "test", result }),
          "application/json",
          "test",
        ),
      /PROTOCOL_ERROR/,
    );
});
test("FlyAI query validates explicit platform/city/stay; cannot transform another platform's hotel into Fliggy", () => {
  assert.deepEqual(hotelSearchArguments(context), {
    destName: "杭州",
    checkInDate: "2026-10-05",
    checkOutDate: "2026-10-06",
    limit: 10,
  });
  for (const c of [
    { ...context, platform: "meituan" },
    { ...context, checkin: "2026-02-30" },
    { ...context, checkout: context.checkin },
    { ...context, city: "" },
  ])
    assert.throws(() => hotelSearchArguments(c), /INVALID_SEARCH_CONTEXT/);
  const base = envelope();
  base.hotels[0].platform = "meituan";
  assert.throws(() => observationEnvelope(base), /HOTEL_PLATFORM_MISMATCH/);
});
test("experimental FlyAI client restricts target and tool, never retries, logs credentials or follows redirects", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      searchFliggy(context, {
        fetcher: () => {
          calls++;
        },
      }),
    /FLYAI_API_ACCESS_REQUIRED/,
  );
  assert.equal(calls, 0);
  const result = await searchFliggy(context, {
    apiKey: "isolated-fixture-key",
    now: () => at,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, FLYAI_ENDPOINT);
      assert.equal(options.redirect, "manual");
      const rpc = JSON.parse(options.body);
      assert.equal(rpc.method, "tools/call");
      assert.equal(rpc.params.name, "search_hotels");
      assert.equal(rpc.params.arguments.limit, 10);
      assert.equal(
        options.headers.Authorization,
        "Bearer isolated-fixture-key",
      );
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(fixture.response) }],
        },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.context_verified, false);
  assert.ok(!JSON.stringify(result).includes("isolated-fixture-key"));
  for (const [status, code] of [
    [302, "UPSTREAM_ERROR"],
    [401, "ACCESS_DENIED"],
    [403, "ACCESS_DENIED"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM_ERROR"],
  ]) {
    let attempts = 0;
    await assert.rejects(
      () =>
        searchFliggy(context, {
          apiKey: "isolated-fixture-key",
          fetcher: async () => {
            attempts++;
            return new Response("private upstream message", { status });
          },
        }),
      new RegExp(code),
    );
    assert.equal(attempts, 1);
  }
  await assert.rejects(
    () =>
      searchFliggy(context, {
        apiKey: "isolated-fixture-key",
        fetcher: async () => {
          throw Error("isolated-fixture-key");
        },
      }),
    /FLYAI_NETWORK_UNAVAILABLE/,
  );
});
test("FlyAI RPC decoding accepts matching JSON/SSE response and rejects upstream errors, mismatched IDs and malformed payloads", () => {
  const rpc = {
    jsonrpc: "2.0",
    id: "test",
    result: {
      content: [{ type: "text", text: JSON.stringify(fixture.response) }],
    },
  };
  assert.deepEqual(
    decodeSearchRpc(JSON.stringify(rpc), "application/json", "test"),
    fixture.response,
  );
  assert.deepEqual(
    decodeSearchRpc(
      `event: message\r\ndata: ${JSON.stringify(rpc)}\r\n\r\n`,
      "text/event-stream",
      "test",
    ),
    fixture.response,
  );
  for (const body of [
    "not JSON",
    JSON.stringify({ ...rpc, id: "other" }),
    JSON.stringify({ ...rpc, result: { isError: true } }),
    JSON.stringify({ ...rpc, error: { message: "private" } }),
  ])
    assert.throws(
      () => decodeSearchRpc(body, "application/json", "test"),
      /PROTOCOL_ERROR/,
    );
});
test("FlyAI client limits response bytes and ignores unrecognized fields rather than forwarding raw data", async () => {
  await assert.rejects(
    () =>
      searchFliggy(context, {
        apiKey: "isolated-fixture-key",
        fetcher: async () => new Response("x".repeat(2000001)),
      }),
    /RESPONSE_TOO_LARGE/,
  );
  const result = parse([
    {
      ...hotel,
      cookie: "private",
      detailUrl: "https://example.com/?token=private",
    },
  ]);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.deepEqual(parse([]).hotels, []);
  assert.equal(parse([]).exhausted, null);
});
test("admin platform endpoint uses existing auth, is GET only and never writes D1 or enables new platform tasks", async () => {
  const DB = database(),
    before = DB.raw.prepare("SELECT total_changes() n").get().n;
  const request = (method = "GET", headers = {}) =>
    new Request("http://localhost/v1/admin/platforms", {
      method,
      headers: { "Content-Type": "application/json", ...headers },
    });
  const env = {
    DB,
    ENVIRONMENT: "local",
    LOCAL_ADMIN_TOKEN: "isolated-platform-test",
    CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    CF_ACCESS_AUD: "isolated-aud",
  };
  assert.equal((await worker.fetch(request(), env)).status, 401);
  const response = await worker.fetch(
    request("GET", { Authorization: "Bearer isolated-platform-test" }),
    env,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.platforms.length, 4);
  assert.equal(
    (
      await worker.fetch(
        request("POST", { Authorization: "Bearer isolated-platform-test" }),
        env,
      )
    ).status,
    404,
  );
  assert.equal(DB.raw.prepare("SELECT total_changes() n").get().n, before);
  assert.equal(DB.raw.prepare("SELECT count(*) n FROM platforms").get().n, 1);
  for (const platform of ["meituan", "fliggy", "tongcheng", "elong"])
    assert.throws(
      () => target({ ...context, platform }),
      /UNSUPPORTED_PLATFORM/,
    );
  DB.raw.close();
});
test("OTA platform presentation distinguishes fixture implementation from live success and escapes upstream labels", () => {
  const platforms = platformCatalog();
  platforms[1].name = '<img src=x onerror="bad">';
  const rendered = platformCapabilitiesView({ platforms });
  assert.ok(!rendered.includes("<img src=x"));
  assert.match(rendered, /&lt;img/);
  assert.match(rendered, /未开启生产任务/);
  assert.match(rendered, /Cloud 出口拒绝/);
  assert.match(rendered, /不能替代已批准 Chrome Agent/);
});
