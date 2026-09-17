const tabs = document.querySelectorAll("nav button");
const panels = document.querySelectorAll(".tab");
const collectStatus = document.getElementById("collectStatus");
const resultList = document.getElementById("resultList");

tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabs.forEach((b) => b.classList.remove("on"));
    panels.forEach((p) => p.classList.remove("on"));
    btn.classList.add("on");
    document.getElementById(btn.dataset.tab).classList.add("on");
    if (btn.dataset.tab === "device") refreshDevice();
    if (btn.dataset.tab === "results") renderResults();
    if (btn.dataset.tab === "tasks") renderLogs();
  });
});

async function send(message) {
  return chrome.runtime.sendMessage(message);
}

function guessPlatform(host) {
  if (host.includes("ctrip") || host.includes("trip.com")) return "ctrip";
  if (host.includes("meituan") || host.includes("dianping")) return "meituan";
  if (host.includes("fliggy") || host.includes("taobao") || host.includes("alitrip")) return "fliggy";
  if (host.includes("ly.com") || host.includes("tongcheng")) return "tongcheng";
  return "unknown";
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function collectCurrent() {
  collectStatus.textContent = "采集中…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    collectStatus.textContent = "当前页不能采集";
    return;
  }
  const isCtripList = /hotels\.ctrip\.com\/hotels\/list/i.test(tab.url);
  const isMeituanList = /(i\.meituan\.com\/awp\/h5\/hotel|(hotel|ihotel)\.meituan\.com|hotel\.dianping\.com)/i.test(tab.url);
  const isTongchengList = /(ly\.com\/hotel|tongcheng\.com\/hotel)/i.test(tab.url);
  const isFliggyList = /hotel\.fliggy\.com|hotel\.taobao\.com|alitrip\.com/i.test(tab.url);
  let result;
  if (isCtripList) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["parsers/ctrip-list.js"],
    });
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (typeof window.__livvScrapeCtripList === "function" ? window.__livvScrapeCtripList() : null),
    });
    result = injected.result;
  } else if (isMeituanList) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["parsers/meituan-list.js"],
    });
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (typeof window.__livvScrapeMeituanList === "function" ? window.__livvScrapeMeituanList() : null),
    });
    result = injected.result;
  } else if (isTongchengList) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["parsers/tongcheng-list.js"],
    });
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (typeof window.__livvScrapeTongchengList === "function" ? window.__livvScrapeTongchengList() : null),
    });
    result = injected.result;
  } else if (isFliggyList) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["parsers/fliggy-list.js"],
    });
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (typeof window.__livvScrapeFliggyList === "function" ? window.__livvScrapeFliggyList() : null),
    });
    result = injected.result;
  } else {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        href: location.href,
        host: location.hostname,
        hotels: [],
        count: 0,
      }),
    });
    result = injected.result;
  }
  if (!result) {
    collectStatus.textContent = "页面解析失败";
    return;
  }
  const platform = guessPlatform(result.host || new URL(tab.url).hostname);
  const hotelName = result.title || document.title || "未识别酒店";
  const url = new URL(result.href);
  const rawIn = url.searchParams.get("checkin") || url.searchParams.get("checkIn") || url.searchParams.get("inDate") || "";
  const rawOut = url.searchParams.get("checkout") || url.searchParams.get("checkOut") || url.searchParams.get("outDate") || "";
  const check_in = (rawIn.replaceAll("/", "-") || new Date().toISOString().slice(0, 10));
  const check_out = (rawOut.replaceAll("/", "-") || check_in);
  const business_date = check_in;
  const rawPayload = { page: result, platform, check_in, check_out };
  const payload_hash = await sha256(JSON.stringify(rawPayload) + Date.now().toString().slice(0, 8));
  const item = {
    collected_at: new Date().toISOString(),
    source_url: result.href,
    platform,
    title: hotelName,
    upload: {
      idempotency_key: payload_hash,
      payload_hash,
      platform,
      task_type: "list",
      business_date,
      check_in,
      check_out,
      quality: "partial",
      policy_version: "30-200-10-3",
      collector_version: "0.3.1",
      source: "manual_popup",
      source_url: result.href,
      title: hotelName,
      metadata: { host: result.host, parsed_count: result.count || 0 },
      price_facts: (result.hotels && result.hotels.length
        ? result.hotels.map((h) => ({
            platform_hotel_id: h.platform_hotel_id,
            hotel_name: h.hotel_name,
            rank: h.rank,
            price: h.price,
            sold_out: h.sold_out,
            source_url: h.source_url,
            raw: h.raw,
          }))
        : [
            {
              hotel_name: hotelName,
              source_url: result.href,
              raw: rawPayload,
            },
          ]),
      room_facts: [],
      rate_facts: [],
    },
  };
  const res = await send({ type: "SAVE_LOCAL", payload: item });
  collectStatus.textContent = res.ok ? `已本地保存（${platform}，${(result.hotels||[]).length} 家）` : res.error;
  renderResults();
}

async function uploadLatest() {
  const { lastResults } = await chrome.storage.local.get({ lastResults: [] });
  if (!lastResults.length) {
    collectStatus.textContent = "没有可上传的本地结果";
    return;
  }
  collectStatus.textContent = "上传中…";
  const latest = lastResults[0];
  const res = await send({ type: "UPLOAD", payload: latest.upload });
  if (!res.ok) {
    collectStatus.textContent = `上传失败：${res.error}`;
    return;
  }
  const count = latest.upload?.price_facts?.length || latest.upload?.hotels?.length || 0;
  const when = new Date().toLocaleString("zh-CN", { hour12: false });
  collectStatus.textContent = `上传成功！已保存${count}条。${when}`;
  await pushLog({
    at: when,
    platform: latest.upload?.platform || latest.platform || "",
    kind: latest.upload?.task_type === "detail" ? "酒店详情" : "酒店列表",
    count,
    ok: true,
  });
}

function setAuthPill(device) {
  const ok = device?.status === "authorized" || device?.status === "active";
  const authText = document.getElementById("authText");
  const authDot = document.getElementById("authDot");
  if (authText) authText.textContent = ok ? "已授权" : (device?.status || "未授权");
  if (authDot) authDot.className = "dot " + (ok ? "on" : "off");
}

async function refreshDevice() {
  const box = document.getElementById("deviceSummary");
  if (box) box.textContent = "读取设备中…";
  const res = await send({ type: "STATUS" });
  const device = res.device || {};
  setAuthPill(device);
  if (!box) return;
  if (!res.ok && !device.device_id && !device.id) {
    box.textContent = res.error || "设备信息暂不可用";
    return;
  }
  const id = device.device_id || device.id || "—";
  const status = device.status || "unknown";
  const lastRaw = device.last_seen_at || device.updated_at || "";
  const last = lastRaw ? new Date(lastRaw).toLocaleString("zh-CN", { hour12: false }) : "—";
  const st = status === "authorized" || status === "active" ? "已授权" : status;
  box.innerHTML = `<p>设备 ID：${id}</p><p>状态：${st}</p><p>最近心跳：${last}</p>`;
}

function clipName(name, n = 25) {
  const s = String(name || "");
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function setStats(facts) {
  const list = facts || [];
  const ad = list.filter((f) => f.raw?.is_ad).length;
  const sold = list.filter((f) => f.sold_out || f.price == null).length;
  const err = list.filter((f) => !f.hotel_name).length;
  document.getElementById("stAll").textContent = String(list.length);
  document.getElementById("stAvail").textContent = String(Math.max(0, list.length - sold));
  document.getElementById("stSold").textContent = String(sold);
  document.getElementById("stAd").textContent = String(ad);
  document.getElementById("stErr").textContent = String(err);
}

function dayOffset(checkIn) {
  if (!checkIn) return "—";
  const a = new Date();
  const b = new Date(checkIn.replaceAll("/", "-") + "T00:00:00");
  if (Number.isNaN(b.getTime())) return "—";
  const d = Math.round((b - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  return "D" + String(d);
}

async function renderResults() {
  const { lastResults } = await chrome.storage.local.get({ lastResults: [] });
  if (!lastResults.length) {
    resultList.innerHTML = "<div class='empty'><strong>还没有本地结果</strong><p>打开列表页后点击采集当前页。</p></div>";
    setStats([]);
    return;
  }
  const item = lastResults[0];
  const facts = item.upload?.price_facts || [];
  setStats(facts);
  resultList.innerHTML = facts.map((f) => {
    const raw = f.raw || {};
    const promos = (raw.promotions || []).slice(0, 4).map((p) => `<span class="chip-promo">${p}</span>`).join("");
    return `<div class="hotel">
      <div class="l1">
        <span class="rank">${f.rank || ""}</span>
        <span class="name" title="${f.hotel_name || ""}">${f.hotel_name || ""}</span>
        <span class="ad-slot">${raw.is_ad ? "<span class='chip-ad'>广告</span>" : ""}</span>
        <span class="chip-rate">${raw.rating ?? "-"}</span>
        <span class="reviews">${raw.review_count != null ? raw.review_count + "评" : ""}</span>
      </div>
      <div class="l2">
        <span></span>
        <span class="room">${raw.room_name || ""}</span>
        <span class="list">${raw.list_price ? "¥" + raw.list_price : ""}</span>
      </div>
      <div class="l3">
        <span></span>
        <span class="promos">${promos}</span>
        <span class="sale">${f.price != null ? "¥" + f.price + "起" : ""}</span>
      </div>
    </div>`;
  }).join("");
}

async function refreshPageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  let city = "—", cin = "—", cout = "—", kw = "—", page = "—";
  try {
    const u = new URL(url);
    const rawIn = u.searchParams.get("checkin") || u.searchParams.get("checkIn") || u.searchParams.get("ci") || u.searchParams.get("startDay") || u.searchParams.get("inDate") || "";
    const rawOut = u.searchParams.get("checkout") || u.searchParams.get("checkOut") || u.searchParams.get("co") || u.searchParams.get("endDay") || u.searchParams.get("outDate") || "";
    const fmt = (v) => {
      const s = String(v).replaceAll("/", "-");
      if (/^\d{8}$/.test(s)) return s.slice(4, 6) + "-" + s.slice(6, 8);
      return s.slice(5) || "—";
    };
    cin = rawIn ? fmt(rawIn) : "—";
    cout = rawOut ? fmt(rawOut) : "—";
    const pick = (...keys) => {
      for (const key of keys) {
        const raw = u.searchParams.get(key);
        if (!raw) continue;
        try {
          const val = decodeURIComponent(raw).split(",")[0].trim();
          if (val) return val;
        } catch {
          if (raw.trim()) return raw.trim();
        }
      }
      return "";
    };
    kw = pick("markland", "keyword", "keywords", "destName", "optionName", "display", "poiName") || "—";
    city = pick("cityName", "cityname", "city") || city;
    city = city.replace(/市$/, "");
    if (u.searchParams.get("cityId") === "259" || u.searchParams.get("city") === "194" || u.searchParams.get("city") === "421200") city = "咸宁";
    else if (/^\d+$/.test(city)) city = "咸宁";
    if (/\/hotels\/list|hotel\/list|hotellist|hotel_list|hotel\.meituan\.com|ihotel\.meituan\.com|hotel\.fliggy\.com/i.test(url)) page = "列表页";
    else if (/hotel|detail/.test(url)) page = "酒店详情页";
  } catch {}
  if ((kw === "—" || city === "—") && tab?.id) {
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const text = document.body?.innerText || "";
          const chips = [...document.querySelectorAll("span,div")].map((el) => (el.textContent || "").trim());
          const kwHit = chips.find((t) => t.length >= 2 && t.length <= 12 && /花坛|广场|车站|万达|温泉|机场|大学|步行街/.test(t));
          return { kw: kwHit || "", city: "" };
        },
      });
      if (kw === "—" && inj?.result?.kw) kw = inj.result.kw;
    } catch {}
  }
  document.getElementById("pageType").textContent = page;
  document.getElementById("ctxCity").textContent = city;
  document.getElementById("ctxIn").textContent = cin;
  document.getElementById("ctxOut").textContent = cout;
  document.getElementById("ctxKw").textContent = kw;
  const fullIn = cin !== "—" ? `2026-${cin}` : "";
  document.getElementById("ctxD").textContent = dayOffset(fullIn);
  document.getElementById("platLogo").textContent = url.includes("ctrip") ? "携" : url.includes("meituan") || url.includes("dianping") ? "美" : url.includes("ly.com") || url.includes("tongcheng") ? "同" : url.includes("fliggy") || url.includes("taobao") ? "飞" : "平";
}

async function probeDom() {
  collectStatus.textContent = "探测DOM中…";
  const box = document.getElementById("domProbe");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    collectStatus.textContent = "没有活动标签页";
    return;
  }
  const [inj] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      function shallow(obj, depth) {
        if (!obj || typeof obj !== "object" || depth > 1) return obj && typeof obj === "object" ? "[object]" : obj;
        const out = {};
        const keys = Object.keys(obj).slice(0, 40);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          try {
            const v = obj[k];
            out[k] = v && typeof v === "object" ? Object.keys(v).slice(0, 20) : v;
          } catch (e) {}
        }
        return out;
      }
      const cell = document.querySelector("div.cell, a.poi");
      const poi = document.querySelector("a.poi");
      const vueBits = [];
      const els = [cell, poi, poi && poi.parentElement];
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        vueBits.push({
          tag: el.tagName + "." + (el.className || ""),
          vue2keys: el.__vue__ ? Object.keys(el.__vue__).slice(0, 30) : null,
          vue2data: el.__vue__ ? shallow(el.__vue__._data || el.__vue__.poi || el.__vue__, 0) : null,
          vue3keys: el.__vueParentComponent ? Object.keys(el.__vueParentComponent).slice(0, 30) : null,
          vue3props: el.__vueParentComponent ? shallow(el.__vueParentComponent.props || el.__vueParentComponent.ctx, 0) : null,
        });
      }
      const resources = (performance.getEntriesByType("resource") || [])
        .map((e) => e.name)
        .filter((n) => /poi|hotel|search|hbsearch/i.test(n))
        .slice(0, 15);
      return {
        probe: "v2",
        href: location.href,
        title: document.title,
        vueBits,
        resources,
        cellAttrs: cell ? [...cell.attributes].map((a) => a.name + "=" + a.value) : [],
        poiAttrs: poi ? [...poi.attributes].map((a) => a.name + "=" + a.value) : [],
        cardText: (cell && cell.innerText || "").slice(0, 300),
      };
    },
  });
  const data = inj && inj.result ? inj.result : { error: "空结果" };
  if (box) {
    box.hidden = false;
    box.textContent = JSON.stringify(data, null, 2);
  }
  collectStatus.textContent = "DOM探测完成，把下面文本发给我";
}

document.getElementById("platforms")?.addEventListener("click", (event) => {
  const url = event.target?.dataset?.url;
  if (url) chrome.tabs.create({ url });
});

document.getElementById("collect").addEventListener("click", () => collectCurrent().catch((e) => {
  collectStatus.textContent = e.message;
}));
document.getElementById("probe").addEventListener("click", () => probeDom().catch((e) => {
  collectStatus.textContent = e.message;
}));
document.getElementById("upload").addEventListener("click", () => uploadLatest().catch((e) => {
  collectStatus.textContent = e.message;
}));

const PLAT_CN = { ctrip: "携程", meituan: "美团", fliggy: "飞猪", tongcheng: "同程" };

async function pushLog(entry) {
  const { collectLogs = [] } = await chrome.storage.local.get({ collectLogs: [] });
  collectLogs.unshift({ ...entry, id: Date.now() });
  await chrome.storage.local.set({ collectLogs: collectLogs.slice(0, 10) });
}

async function renderLogs() {
  const box = document.getElementById("logList");
  if (!box) return;
  const { collectLogs = [] } = await chrome.storage.local.get({ collectLogs: [] });
  if (!collectLogs.length) {
    box.innerHTML = "<li class='muted'>暂无日志</li>";
    return;
  }
  box.innerHTML = collectLogs.map((row, i) => {
    const plat = PLAT_CN[row.platform] || row.platform || "未知";
    return `<li>
      <span class="log-no">${i + 1}</span>
      <span class="log-time">${row.at || ""}</span>
      <span>成功上传 <span class="log-plat ${row.platform || ""}">${plat}</span> <span class="log-kind">${row.kind || "酒店列表"}</span> <span class="log-n">${row.count ?? 0}</span> 条</span>
    </li>`;
  }).join("");
}

send({ type: "ENSURE" }).then(async () => {
  await refreshPageContext().catch(() => {});
  await renderResults();
  const res = await send({ type: "STATUS" });
  if (res.ok) setAuthPill(res.device);
  const svc = document.getElementById("svcDot");
  const svcText = document.getElementById("svcText");
  if (svc) svc.className = "dot on";
  if (svcText) svcText.textContent = "正常";
});
