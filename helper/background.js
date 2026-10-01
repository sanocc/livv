import { telemetryEvent, telemetryQueue } from "./telemetry.js";
import {
  pageStep,
  inspectList,
  scrollList,
  inspectDetail,
  scrollDetail,
  detailLink,
} from "./mobile.js";
import { performInput } from "./input.js";
import { failRemainingDetails, completeDetailResults } from "./detail-state.js";
import { taskView, publicState, remember, trustedView } from "./view-state.js";
import {
  contextMatches,
  navigationProfile,
  marketNavigation,
  rememberNavigation,
} from "./navigation.js";
const API = "https://api.poai.cc",
  VERSION = chrome.runtime.getManifest().version;
const telemetry = telemetryQueue({
  storage: chrome.storage.local,
  send: async (body) => {
    const id = await identity();
    const r = await fetch(API + "/v1/device/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LIVV-Device-ID": id.device_id,
        Authorization: `Bearer ${id.credential}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok || !(await r.json()).available)
      throw Error("Telemetry unavailable");
  },
});
function observe(event, active, diagnostic = "", message = "") {
  try {
    const point = telemetryEvent(
      event,
      active,
      VERSION,
      Date.now(),
      diagnostic,
    );
    if (!point) return;
    point.diagnostic = /not valid JSON|Unexpected token/.test(message)
      ? "API_RESPONSE_NOT_JSON"
      : /Failed to fetch|fetch failed/.test(message)
        ? "NETWORK_FETCH_FAILED"
        : "";
    void telemetry.enqueue(point).catch(() => {});
  } catch {}
}
let progressKey = "",
  onlineObservedAt = 0;
let busy = false,
  timer;
const read = async () =>
  chrome.storage.local.get([
    "identity",
    "active",
    "auto",
    "cloud",
    "cloud_at",
    "error",
    "logs",
    "managed_tab",
    "ui_history",
    "navigation_profiles",
  ]);
async function log(event, message = "", context = null) {
  const { logs = [], active } = await read();
  // Only the leading error-code token is eligible for remote telemetry; never upload free text.
  observe(
    event,
    context ?? active,
    String(message).split(/[:\s]/)[0],
    String(message),
  );
  await chrome.storage.local.set({
    logs: [
      ...logs,
      {
        at: new Date().toISOString(),
        event,
        message,
        task_id: active?.task.id ?? null,
        attempt_id: active?.attempt.id ?? null,
      },
    ].slice(-100),
  });
}
async function identity() {
  let { identity } = await read();
  if (!identity) {
    identity = {
      device_id: crypto.randomUUID(),
      credential: Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    };
    await chrome.storage.local.set({ identity });
  }
  return identity;
}
async function request(path, body = {}, method = "POST", authenticated = true) {
  const id = await identity();
  const r = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated
        ? {
            "X-LIVV-Device-ID": id.device_id,
            Authorization: `Bearer ${id.credential}`,
          }
        : {}),
    },
    ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(
      data.error?.message ?? data.error?.code ?? `HTTP_${r.status}`,
    );
    e.code = data.error?.code ?? `HTTP_${r.status}`;
    throw e;
  }
  return data;
}
let initialized = false;
async function initialize() {
  if (initialized) return;
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const i = await identity();
  if (!i.registered) {
    await request(
      "/v1/devices/register",
      { ...i, version: VERSION },
      "POST",
      false,
    );
    await chrome.storage.local.set({ identity: { ...i, registered: true } });
  }
  await chrome.alarms.create("livv-heartbeat", { periodInMinutes: 0.5 });
  const state = await read();
  if (state.auto === undefined) await chrome.storage.local.set({ auto: true });
  initialized = true;
}
async function execute(a, func, args = []) {
  const tab = await chrome.tabs.get(a.tab_id);
  if (!tab.url && tab.status === "loading") return null;
  const url = tab.url ? new URL(tab.url) : null;
  if (
    url?.origin !== "https://m.ctrip.com" ||
    !(
      url.pathname === "/webapp/hotels" ||
      url.pathname.startsWith("/webapp/hotels/")
    )
  )
    throw Object.assign(
      new Error(
        `采集标签页离开携程酒店页面：${url?.origin ?? "unknown"}${url?.pathname ?? ""}`,
      ),
      {
        code: "MANAGED_TAB_NAVIGATED",
      },
    );
  const result = await chrome.scripting.executeScript({
    target: { tabId: a.tab_id },
    func,
    args,
  });
  return result[0]?.result;
}
async function recordView(record) {
  try {
    const { ui_history = [] } = await read();
    await chrome.storage.local.set({
      ui_history: remember(ui_history, record),
    });
  } catch {
    /* A display cache must never prevent collection or upload. */
  }
}
async function save(a) {
  if (a.phase === "LIST") {
    const count = Math.floor((a.market?.length ?? 0) / 10) * 10,
      key = `${a.attempt.id}:${count}`;
    if (count > 0 && key !== progressKey) {
      progressKey = key;
      observe("LIST_PROGRESS", a);
    }
  }
  await chrome.storage.local.set({ active: a });
  await recordView(taskView(a));
}
async function fail(a, code, message) {
  await log(code, message);
  let acknowledged = false;
  await request(`/v1/device/attempts/${a.attempt.id}/fail`, {
    error_code: code,
    error_message: message,
  })
    .then(() => {
      acknowledged = true;
    })
    .catch(() => {});
  if (acknowledged) observe("ATTEMPT_FAILED", a);
  await recordView({
    ...taskView(a),
    status: null,
    attempt_status: acknowledged ? "FAILED" : null,
    error_code: code,
    finished_at: new Date().toISOString(),
  });
  await chrome.storage.local.set({ active: null, error: code });
  if (["CAPTCHA_REQUIRED", "LOGIN_REQUIRED"].includes(code))
    await chrome.storage.local.set({ auto: false });
}
async function phaseEvent(a, event, message = "") {
  await log(event, message, a);
  await request(`/v1/device/attempts/${a.attempt.id}/events`, {
    event,
    message,
  });
}
async function navigationFallback(a, code, message) {
  await phaseEvent(a, code, message);
  a.navigation_mode = "UI_FALLBACK";
  a.phase = "CITY_OPEN";
  a.phase_at = Date.now();
  a.positions = {};
  a.market = [];
  delete a.list_ready_at;
  delete a.last_growth;
  delete a.market_observed_at;
  await save(a);
  await chrome.tabs.update(a.tab_id, {
    url: "https://m.ctrip.com/webapp/hotels/",
  });
}
async function run(a) {
  if (a.upload) {
    if (!a.upload_started_at) {
      a.upload_started_at = Date.now();
      await save(a);
      await phaseEvent(
        a,
        "UPLOAD_START",
        JSON.stringify({
          navigation: a.navigation_mode,
          claim_to_upload_ms:
            a.upload_started_at - Date.parse(a.attempt.claimed_at),
        }),
      );
    }
    a.upload.detail_results = completeDetailResults(a);
    try {
      const result = await request(
        `/v1/device/attempts/${a.attempt.id}/result`,
        a.upload,
      );
      observe("UPLOAD_SUCCESS", a);
      await log(result.status, `保存真实酒店${result.market_count}家`, a);
      await log(
        "TASK_TIMING",
        JSON.stringify({
          navigation: a.navigation_mode,
          task_type: a.task.task_type,
          upload_ms: Date.now() - a.upload_started_at,
          total_ms: Date.now() - Date.parse(a.attempt.claimed_at),
        }),
      );
      await recordView({
        ...taskView(a),
        status: result.status ?? null,
        attempt_status: result.status ?? null,
        count: result.market_count ?? a.market?.length,
        detail_success:
          result.detail_success ??
          a.detail_results.filter((d) => d.status === "SUCCESS").length,
        detail_total: result.detail_total ?? a.details?.length,
        snapshot_id: result.snapshot_id,
        error_code: result.status === "PARTIAL" ? "PARTIAL_COLLECTION" : null,
        finished_at: new Date().toISOString(),
      });
      await chrome.storage.local.set({
        active: null,
        error: null,
        last_result: result,
      });
    } catch (e) {
      if (
        [
          "ATTEMPT_EXPIRED",
          "DEVICE_NOT_APPROVED",
          "IDEMPOTENCY_CONFLICT",
        ].includes(e.code)
      )
        await fail(a, e.code, e.message);
      else {
        await log("UPLOAD_RETRY", e.message);
        await chrome.storage.local.set({ error: "UPLOAD_FAILED" });
      }
    }
    return;
  }
  const remaining = Date.parse(a.attempt.timeout_at) - Date.now();
  if (remaining < 20000) {
    if (a.market?.length && a.task.scope !== "all") {
      await finish(a, "TIMEOUT", false);
      return;
    }
    await fail(a, "ATTEMPT_TIMEOUT", "执行时间已到，未获得可保存的市场列表");
    return;
  }
  if (
    a.phase !== "LIST" &&
    !a.phase.startsWith("DETAIL") &&
    Date.now() - a.phase_at > 120000
  ) {
    await fail(a, "SEARCH_CONTROL_TIMEOUT", "城市、关键词或搜索控件无法确认");
    return;
  }
  if (a.phase === "FAST_NAVIGATION") {
    try {
      const r = await execute(a, inspectList);
      if (r?.captcha) {
        await fail(a, "CAPTCHA_REQUIRED", "携程需要人工验证码");
        return;
      }
      if (contextMatches(r, a.task)) {
        a.phase = "LIST";
        a.phase_at = Date.now();
        await save(a);
        await phaseEvent(
          a,
          "FAST_NAV_VERIFIED",
          "URL, visible keyword and card city/dates match task",
        );
      } else if (r?.hotels?.length || Date.now() - a.phase_at > 45000) {
        await navigationFallback(
          a,
          "FAST_NAV_CONTEXT_MISMATCH",
          "Direct page context did not match task; UI fallback",
        );
      }
    } catch (e) {
      if (e.code === "MANAGED_TAB_NAVIGATED") throw e;
      await navigationFallback(a, "FAST_NAV_FAILED", e.code ?? e.message);
    }
    return;
  }
  if (a.phase === "LIST") {
    const r = await execute(a, inspectList);
    if (!r) return;
    if (r.captcha) {
      await fail(a, "CAPTCHA_REQUIRED", "携程需要人工验证码");
      return;
    }
    if (!contextMatches(r, a.task)) {
      if (a.navigation_mode === "FAST_NAVIGATION")
        await navigationFallback(
          a,
          "FAST_NAV_CONTEXT_MISMATCH",
          "Context changed before collection",
        );
      else if (Date.now() - a.phase_at > 45000)
        await fail(a, "PAGE_CONTEXT_MISMATCH", "携程实际搜索条件未与任务一致");
      return;
    }
    if (r.unparsed_cards) {
      await fail(
        a,
        "PARSER_SCHEMA_CHANGED",
        `${r.unparsed_cards}张卡片缺少Hotel ID或酒店名，停止以保护排名真实性`,
      );
      return;
    }
    if (!a.list_ready_at) {
      a.list_ready_at = Date.now();
      await phaseEvent(
        a,
        "LIST_READY",
        JSON.stringify({
          navigation: a.navigation_mode,
          claim_to_ready_ms: a.list_ready_at - Date.parse(a.attempt.claimed_at),
        }),
      );
      const state = await read();
      const profile = navigationProfile(r, a.task);
      await chrome.storage.local.set({
        navigation_profiles: rememberNavigation(
          state.navigation_profiles ?? [],
          profile,
        ),
      });
    }
    const map = new Map((a.market ?? []).map((h) => [h.hotel_id, h])),
      before = map.size;
    for (const hotel of r.hotels) {
      const h = hotel,
        old = map.get(h.hotel_id);
      if (!old || (old.is_ad && !h.is_ad)) map.set(h.hotel_id, h);
    }
    a.market = [...map.values()].sort((x, y) => x.rank - y.rank);
    a.market_observed_at = r.observed_at;
    a.list_url = r.url;
    if (map.size > before) a.last_growth = Date.now();
    a.last_growth ??= Date.now();
    const reached =
      a.task.collection_limit !== null && map.size >= a.task.collection_limit;
    if (reached || r.exhausted) {
      a.market_locked_at = Date.now();
      if (a.task.collection_limit)
        a.market = a.market.slice(0, a.task.collection_limit);
      a.stop_reason = reached ? "TARGET_REACHED" : "NATURAL_END";
      a.exhausted = !reached && r.exhausted;
      a.details = (
        a.task.task_type === "MARKET_LIST" ? [] : a.core_hotels
      ).filter((h) => a.market.some((m) => m.hotel_id === h.hotel_id));
      a.rooms = [];
      a.detail_results = [];
      a.detail_index = 0;
      await log(
        "MARKET_LOCKED",
        `${a.market.length}家唯一酒店，详情目标${a.details.length}家`,
        a,
      );
      await request(`/v1/device/attempts/${a.attempt.id}/events`, {
        event: "MARKET_LOCKED",
        message: JSON.stringify({
          count: a.market.length,
          details: a.details.length,
          ready_to_lock_ms: Date.now() - a.list_ready_at,
          claim_to_lock_ms: Date.now() - Date.parse(a.attempt.claimed_at),
        }),
      });
      if (!a.details.length) {
        await finish(a, a.stop_reason, a.exhausted);
        return;
      }
      a.phase = "DETAIL_OPEN";
      a.phase_at = Date.now();
      await save(a);
      return;
    }
    if (map.size >= 2000) {
      if (a.task.scope === "all")
        await fail(
          a,
          "ALL_MARKET_SAFETY_LIMIT",
          "全市场尚未自然耗尽，停止且不冒充完整全市场",
        );
      else await finish(a, "SAFETY_LIMIT", false);
      return;
    }
    if (Date.now() - a.last_growth > 45000) {
      if (a.task.scope === "all" || !map.size)
        await fail(
          a,
          "COLLECTION_STALLED",
          "未获得自然耗尽证据，不能标记全市场成功",
        );
      else await finish(a, "STALLED", false);
      return;
    }
    await execute(a, scrollList);
    await save(a);
    return;
  }
  if (a.phase === "DETAIL_OPEN") {
    const h = a.market.find(
      (x) => x.hotel_id === a.details[a.detail_index]?.hotel_id,
    );
    if (!h) {
      await finish(a, a.stop_reason, a.exhausted);
      return;
    }
    if (remaining < 60000) {
      for (const pending of a.details.slice(a.detail_index))
        a.detail_results.push({
          hotel_id: pending.hotel_id,
          status: "FAILED",
          error_code: "DETAIL_TIME_BUDGET",
        });
      await finish(a, a.stop_reason, a.exhausted);
      return;
    }
    const r = await execute(a, detailLink, [
      h.hotel_id,
      Date.now() - a.phase_at,
    ]);
    if (!r) return;
    if (r.pending) {
      await log("DETAIL_ENTRY_WAIT", JSON.stringify(r.diagnostic));
      return;
    }
    if (r?.action) await performInput(chrome, a.tab_id, r.action);
    if (r?.error) {
      a.detail_results.push({
        hotel_id: h.hotel_id,
        status: "FAILED",
        error_code: r.error,
      });
      a.detail_index++;
      a.phase_at = Date.now();
      await save(a);
      return;
    }
    a.phase = "DETAIL_READ";
    a.phase_at = Date.now();
    a.current_detail_rooms = [];
    a.detail_last_growth = Date.now();
    await save(a);
    return;
  }
  if (a.phase === "DETAIL_READ") {
    const h = a.market.find(
        (x) => x.hotel_id === a.details[a.detail_index].hotel_id,
      ),
      r = await execute(a, inspectDetail, [h, a.task]);
    const diagnostic = JSON.stringify(r?.diagnostic ?? null);
    if (diagnostic !== a.detail_diagnostic) {
      a.detail_diagnostic = diagnostic;
      await log("DETAIL_CONTEXT", h.hotel_id + " " + diagnostic);
      await save(a);
    }
    if (r?.context_verified && r.rooms.length) {
      const collected = new Map(
        (a.current_detail_rooms ?? []).map((room) => [room.room_name, room]),
      );
      const before = collected.size;
      for (const room of r.rooms) collected.set(room.room_name, room);
      a.current_detail_rooms = [...collected.values()];
      if (collected.size > before) a.detail_last_growth = Date.now();
      await save(a);
      if (
        Date.now() - a.phase_at < 10000 ||
        Date.now() - a.detail_last_growth < 6000
      ) {
        await execute(a, scrollDetail);
        return;
      }
      a.rooms.push(...a.current_detail_rooms);
      a.detail_results.push({ hotel_id: h.hotel_id, status: "SUCCESS" });
    } else if (Date.now() - a.phase_at < 45000) return;
    else
      a.detail_results.push({
        hotel_id: h.hotel_id,
        status: "FAILED",
        error_code: "DETAIL_PARSE_TIMEOUT",
      });
    a.detail_index++;
    a.phase = "DETAIL_RETURN";
    a.phase_at = Date.now();
    await save(a);
    await chrome.tabs.update(a.tab_id, { url: a.list_url });
    return;
  }
  if (a.phase === "DETAIL_RETURN") {
    const tab = await chrome.tabs.get(a.tab_id);
    if (!tab.url?.includes("listPage") || tab.status !== "complete") return;
    a.phase = "DETAIL_OPEN";
    a.phase_at = Date.now();
    await save(a);
    return;
  }
  const r = await execute(a, pageStep, [a.task, a.phase]);
  if (r?.action) await performInput(chrome, a.tab_id, r.action);
  if (r?.diagnostic && r.diagnostic !== a.diagnostic) {
    a.diagnostic = r.diagnostic;
    await log("PAGE_STEP", r.diagnostic);
    await save(a);
  }
  if (r?.error) {
    await fail(a, r.error, "携程自动搜索未完成：" + r.error);
    return;
  }
  if (r?.phase) {
    await log("PHASE", `${a.phase} → ${r.phase}`);
    a.phase = r.phase;
    a.phase_at = Date.now();
    await save(a);
  }
  if (r?.navigate) await chrome.tabs.update(a.tab_id, { url: r.navigate });
}
async function finish(a, reason, exhausted) {
  completeDetailResults(a);
  a.detail_results ??= [];
  for (const h of a.details ?? [])
    if (!a.detail_results.some((d) => d.hotel_id === h.hotel_id))
      a.detail_results.push({
        hotel_id: h.hotel_id,
        status: "FAILED",
        error_code: "DETAIL_INCOMPLETE",
      });
  a.upload = {
    source: "ctrip-dom",
    platform: a.task.platform,
    city: a.task.city,
    keyword: a.task.keyword,
    checkin: a.task.checkin,
    checkout: a.task.checkout,
    observed_at: a.market_observed_at,
    hotels: a.market,
    rooms: a.rooms ?? [],
    detail_results: a.detail_results,
    stop_reason: reason,
    exhausted,
  };
  await save(a);
  await run(a);
}
async function tick(heartbeat = false) {
  if (busy) return;
  busy = true;
  try {
    await initialize();
    let state = await read(),
      heartbeatFetched = false;
    if (
      heartbeat ||
      !state.cloud ||
      Date.now() - (state.cloud_at ?? 0) > 20000
    ) {
      const cloud = await request("/v1/device/heartbeat", {
        version: VERSION,
        error_code: state.error ?? null,
      });
      await chrome.storage.local.set({ cloud, cloud_at: Date.now() });
      if (Date.now() - onlineObservedAt > 300000) {
        onlineObservedAt = Date.now();
        observe("DEVICE_ONLINE", null);
      }
      void telemetry.flush();
      heartbeatFetched = true;
      state = { ...state, cloud };
    }
    if (state.cloud.status !== "approved") {
      if (state.active) await chrome.storage.local.set({ active: null });
      return;
    }
    if (state.active) {
      if (heartbeatFetched && !state.cloud.active_attempt) {
        await recordView({
          ...taskView(state.active),
          status: null,
          attempt_status: null,
          error_code: "SERVER_ATTEMPT_FINISHED",
          finished_at: new Date().toISOString(),
        });
        await log("SERVER_ATTEMPT_FINISHED", state.active.attempt.id);
        await chrome.storage.local.set({ active: null, error: null });
        return;
      }
      if (
        state.cloud.active_attempt &&
        state.cloud.active_attempt.id !== state.active.attempt.id
      ) {
        await chrome.storage.local.set({
          active: null,
          error: "ATTEMPT_REASSIGNED",
        });
        return;
      }
      await run(state.active);
    } else if (state.auto) {
      if (!(await chrome.permissions.contains({ permissions: ["debugger"] }))) {
        await chrome.storage.local.set({
          auto: false,
          error: "INPUT_PERMISSION_REQUIRED",
        });
        return;
      }
      const c = await request("/v1/device/claim");
      if (c) {
        let navigationUrl = null;
        if (c.task.task_type === "MARKET_LIST") {
          try {
            navigationUrl = marketNavigation(
              c.task,
              state.navigation_profiles ?? [],
            );
          } catch {}
        }
        const entryUrl = navigationUrl ?? "https://m.ctrip.com/webapp/hotels/";
        let old = (await chrome.storage.local.get("managed_tab")).managed_tab,
          tab;
        try {
          if (old) tab = await chrome.tabs.get(old);
        } catch {}
        if (tab && !tab.url?.startsWith("https://m.ctrip.com/webapp/hotels/"))
          tab = null;
        const navigationStartedAt = Date.now();
        if (!tab)
          tab = await chrome.tabs.create({
            url: entryUrl,
            active: true,
          });
        else
          await chrome.tabs.update(tab.id, {
            url: entryUrl,
            active: true,
          });
        await chrome.storage.local.set({ managed_tab: tab.id, error: null });
        const a = {
          ...c,
          tab_id: tab.id,
          navigation_started_at: navigationStartedAt,
          phase: navigationUrl ? "FAST_NAVIGATION" : "CITY_OPEN",
          navigation_mode: navigationUrl ? "FAST_NAVIGATION" : "UI_FALLBACK",
          phase_at: Date.now(),
          positions: {},
          market: [],
        };
        await save(a);
        await request(`/v1/device/attempts/${a.attempt.id}/start`);
        if (c.task.task_type === "MARKET_LIST")
          await phaseEvent(
            a,
            navigationUrl ? "FAST_NAV_START" : "FAST_NAV_FAILED",
            navigationUrl
              ? "Verified native navigation candidate (DOM verification required)"
              : "No verified city/keyword profile; UI fallback",
          );
        await log(
          "CLAIMED",
          `${a.task.id} / Attempt #${a.attempt.attempt_number}`,
        );
      }
    }
  } catch (e) {
    const code =
      typeof e.code === "string"
        ? e.code
        : e.name === "TimeoutError"
          ? "API_TIMEOUT"
          : "HELPER_ERROR";
    const state = await read();
    if (
      state.active &&
      [
        "MANAGED_TAB_NAVIGATED",
        "INPUT_PERMISSION_REQUIRED",
        "INPUT_TAB_NOT_OWNED",
        "INPUT_ATTACH_FAILED",
      ].includes(code)
    ) {
      if (["INPUT_PERMISSION_REQUIRED", "INPUT_ATTACH_FAILED"].includes(code))
        await chrome.storage.local.set({ auto: false });
      if (failRemainingDetails(state.active, code)) {
        await log(code, e.message);
        await finish(
          state.active,
          state.active.stop_reason,
          state.active.exhausted,
        );
        return;
      }
      await fail(state.active, code, e.message);
      return;
    }
    await chrome.storage.local.set({ error: code });
    await log(code, e.message);
  } finally {
    busy = false;
    clearTimeout(timer);
    const state = await read();
    if (state.active) timer = setTimeout(() => tick(), 2000);
  }
}
chrome.runtime.onInstalled.addListener(() => tick(true));
chrome.runtime.onStartup.addListener(() => tick(true));
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "livv-heartbeat") tick(true);
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === "complete")
    read().then((s) => {
      if (s.active?.tab_id === id) tick();
    });
});
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.type === "PAGE_READY") {
    read().then((s) => {
      if (sender.tab?.id === s.active?.tab_id) tick();
    });
    return;
  }
  if (!trustedView(sender, chrome.runtime)) return;
  (async () => {
    if (m.type === "STATE") {
      const s = await read(),
        i = await identity();
      return publicState(s, i.device_id, chrome.runtime.getManifest().version);
    }
    if (m.type === "CLEAR_LOGS") {
      await chrome.storage.local.set({ logs: [] });
      return { ok: true };
    }
    if (m.type === "AUTO") {
      await chrome.storage.local.set({ auto: !!m.enabled });
      await tick(true);
      return { ok: true };
    }
    if (m.type === "DEBUG_DOM") {
      const state = await read();
      if (!state.active && !state.managed_tab)
        return { error: "NO_MANAGED_TAB" };
      return execute(
        state.active ?? { tab_id: state.managed_tab },
        (taskCity) => ({
          path: location.pathname,
          inputs: Array.from(document.querySelectorAll("input")).map((e) => ({
            type: e.type,
            value: e.value,
          })),
          city: document.querySelector('[class*="dest-keyword-column"]')
            ?.textContent,
          city_candidates: Array.from(document.querySelectorAll("span,div"))
            .filter(
              (e) =>
                e.children.length === 0 && e.textContent.trim() === taskCity,
            )
            .slice(0, 3)
            .map((e) => e.parentElement.parentElement.outerHTML.slice(0, 3000)),
          candidates: Array.from(
            document.querySelectorAll('[class*="keywordItemMainContainer"]'),
          )
            .slice(0, 3)
            .map((e) => ({
              text: e.textContent,
              html: e.outerHTML.slice(0, 2000),
            })),
          query: Array.from(document.querySelectorAll("span,div"))
            .filter(
              (e) =>
                e.children.length === 0 &&
                e.textContent.replace(/\s/g, "") === "查询",
            )
            .map((e) => e.outerHTML),
          body: document.body.innerText.slice(0, 1800),
        }),
        [state.active?.task.city ?? ""],
      );
    }
    if (m.type === "PROBE_DISABLED") {
      const cloud = await request("/v1/device/heartbeat", { version: VERSION });
      await chrome.storage.local.set({ cloud, cloud_at: Date.now() });
      if (cloud.status !== "disabled")
        throw new Error("请先在OTA禁用此设备，避免探测领取真实任务");
      try {
        await request("/v1/device/claim");
        throw new Error("禁用设备被错误允许领取任务");
      } catch (e) {
        if (e.code !== "DEVICE_NOT_APPROVED") throw e;
        await log("DISABLED_REJECTED", "生产API已拒绝禁用设备领取任务");
      }
      return { ok: true };
    }
    if (m.type === "TASK") {
      const task = await request("/v1/device/tasks", m.task);
      await recordView({
        task_id: task.id,
        task,
        status: task.status,
        attempt_status: null,
        started_at: null,
        created_at: task.created_at,
        count: 0,
        detail_total: 0,
        detail_success: 0,
        detail_failed: 0,
        detail_results: [],
      });
      return task;
    }
    if (m.type === "POLL") {
      await tick(true);
      return { ok: true };
    }
    return { error: "UNKNOWN_MESSAGE" };
  })()
    .then(reply)
    .catch((e) => reply({ error: e.code ?? e.message }));
  return true;
});

// Recover heartbeat alarms whenever the MV3 worker wakes, including re-enable.
// Display-only migration; panels never own execution timers or active state.
if (chrome.sidePanel?.setPanelBehavior) {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
} else {
  void chrome.action.setPopup({ popup: "popup.html" });
}
void tick(true);
