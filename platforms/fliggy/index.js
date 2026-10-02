import { AdapterError, observationEnvelope, validDate } from "../contract.js";
export const FLYAI_ENDPOINT = "https://flyai.open.fliggy.com/mcp";
export function hotelSearchArguments(context) {
  if (
    context?.platform !== "fliggy" ||
    typeof context.city !== "string" ||
    !context.city.trim() ||
    context.city.length > 80 ||
    typeof context.keyword !== "string" ||
    context.keyword.length > 120 ||
    !validDate(context.checkin) ||
    !validDate(context.checkout) ||
    context.checkout <= context.checkin
  )
    throw new AdapterError("INVALID_SEARCH_CONTEXT");
  return {
    destName: context.city,
    ...(context.keyword ? { keyWords: context.keyword } : {}),
    checkInDate: context.checkin,
    checkOutDate: context.checkout,
    limit: 10,
  };
}
// Exact publisher-documented formats only. Ranges, "起", discounts and USD stay unknown.
export function documentedPrice(value) {
  if (
    typeof value !== "string" ||
    !/^[¥￥](?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)
  )
    return null;
  const n = Number(value.slice(1).replaceAll(",", ""));
  return Number.isFinite(n) && n <= 10000000 ? n : null;
}
export function fliggyObservation(response, requestedContext, receivedAt) {
  hotelSearchArguments(requestedContext);
  if (
    response?.status !== 0 ||
    response.error ||
    response.isError === true ||
    response.success === false ||
    !Array.isArray(response.data?.itemList)
  )
    throw new AdapterError("FLYAI_SEARCH_RESPONSE_INVALID");
  const rows = response.data.itemList;
  const envelope = observationEnvelope({
    source: "fliggy-flyai-search",
    platform: "fliggy",
    observed_at: receivedAt,
    observed_at_basis: "client_response_received",
    context: requestedContext,
    // Documentation does not demonstrate date/city echo or full inventory coverage.
    context_verified: false,
    exhausted: null,
    stop_reason: "UNKNOWN",
    hotels: rows.map((item) => ({
      platform: "fliggy",
      hotel_id: item.shId,
      hotel_name: item.name,
      display_price: documentedPrice(item.price),
      currency: documentedPrice(item.price) == null ? null : "CNY",
      price_basis: "search_quote_unverified",
      original_price: null,
      score:
        typeof item.score === "string" &&
        /^(?:[0-4](?:\.\d+)?|5(?:\.0+)?)$/.test(item.score)
          ? Number(item.score)
          : null,
      rank: null,
      is_ad: null,
      review_count: null,
      dynamic: null,
      availability_status: "unknown",
      activity_tags: null,
    })),
  });
  return {
    ...envelope,
    evidence: {
      type: "flyai_search_response",
      requested_context_only: true,
      price_basis_verified: false,
      response_count: rows.length,
    },
  };
}
async function readLimited(response, max = 2000000) {
  const reader = response.body?.getReader();
  if (!reader) throw new AdapterError("FLYAI_PROTOCOL_ERROR");
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > max) throw new AdapterError("FLYAI_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(buffer);
}
export function decodeSearchRpc(body, contentType, id) {
  let values;
  try {
    values = contentType.includes("text/event-stream")
      ? body
          .split(/\r?\n\r?\n/)
          .map((block) =>
            block
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n"),
          )
          .filter((v) => v && v !== "[DONE]")
          .map((v) => JSON.parse(v))
      : [JSON.parse(body)];
  } catch {
    throw new AdapterError("FLYAI_PROTOCOL_ERROR");
  }
  const rpc = values.find((v) => v?.jsonrpc === "2.0" && v.id === id);
  if (!rpc || rpc.error || rpc.result?.isError || !rpc.result)
    throw new AdapterError("FLYAI_PROTOCOL_ERROR");
  if (rpc.result.structuredContent) return rpc.result.structuredContent;
  const parts = Array.isArray(rpc.result.content)
    ? rpc.result.content.filter((v) => v?.type === "text")
    : null;
  if (parts?.length !== 1 || typeof parts[0].text !== "string")
    throw new AdapterError("FLYAI_PROTOCOL_ERROR");
  try {
    return JSON.parse(parts[0].text);
  } catch {
    throw new AdapterError("FLYAI_PROTOCOL_ERROR");
  }
}
// Experimental stateless MCP route. Never copy shared CLI credentials, signing profiles
// or fabricate device fingerprints. Channel signing/session requirements remain unverified.
export async function searchFliggy(
  context,
  { apiKey, fetcher = fetch, now = () => new Date().toISOString() } = {},
) {
  const args = hotelSearchArguments(context);
  if (!apiKey) throw new AdapterError("FLYAI_API_ACCESS_REQUIRED");
  if (typeof apiKey !== "string" || !/^[\x21-\x7e]{8,512}$/.test(apiKey))
    throw new AdapterError("FLYAI_INVALID_KEY_FORMAT");
  const id = "poai-readonly-hotel-search";
  let response;
  try {
    response = await fetcher(FLYAI_ENDPOINT, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "search_hotels", arguments: args },
      }),
    });
  } catch {
    throw new AdapterError("FLYAI_NETWORK_UNAVAILABLE");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new AdapterError(
      response.status === 401 || response.status === 403
        ? "FLYAI_ACCESS_DENIED"
        : response.status === 429
          ? "FLYAI_RATE_LIMITED"
          : "FLYAI_UPSTREAM_ERROR",
    );
  }
  let body;
  try {
    body = await readLimited(response);
  } catch (error) {
    throw error instanceof AdapterError
      ? error
      : new AdapterError("FLYAI_RESPONSE_UNAVAILABLE");
  }
  return fliggyObservation(
    decodeSearchRpc(body, response.headers.get("content-type") ?? "", id),
    context,
    now(),
  );
}
export const fliggyAdapter = Object.freeze({
  platform: "fliggy",
  collection_enabled: false,
  search: searchFliggy,
  parseSearch: fliggyObservation,
  parseObservation: fliggyObservation,
});
