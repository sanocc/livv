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


async function runM04InTab(tabId) {
  const runtimeUrl = chrome.runtime.getURL(
    "core/runtime.js"
  );

  const [run] =
    await chrome.scripting.executeScript({
      target: {
        tabId
      },

      world: "ISOLATED",

      func: async (moduleUrl) => {
        const mod =
          await import(moduleUrl);

        if (
          typeof mod.collectM04 !==
          "function"
        ) {
          throw new Error(
            "M04 collectM04() 不存在"
          );
        }

        return await mod.collectM04();
      },

      args: [
        runtimeUrl
      ]
    });

  return run?.result || null;
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
    const m04 =
      await runM04InTab(tab.id);

    if (!m04) {
      throw new Error(
        "携程 M04 返回空结果"
      );
    }

    const facts =
      Array.isArray(m04.facts)
        ? m04.facts
        : [];

    result = {
      host:
        new URL(tab.url).hostname,

      href:
        tab.url,

      title:
        tab.title || "携程酒店",

      count:
        facts.length,

      hotels:
        facts.map((fact) => ({
          ...(fact.platform_hotel_id
            ? {
                platform_hotel_id:
                  fact.platform_hotel_id
              }
            : {}),

          hotel_name:
            fact.hotel_name,

          rank:
            fact.display_position,

          price:
            fact.display_price,

          sold_out:
            fact.sold_out,

          source_url:
            fact.source_url,

          raw: {
            ...(fact.raw || {}),

            hotel_id:
              fact.platform_hotel_id,

            is_ad:
              fact.is_ad,

            rating:
              fact.rating,

            review_count:
              fact.review_count,

            room_name:
              fact.room_name,

            promotions:
              fact.promotions || [],

            list_price:
              fact.list_price,

            sale_price:
              fact.display_price,

            m04_quality:
              fact.quality,

            m04_evidence:
              fact.evidence
          }
        })),

      m04: {
        version: "M04",
        audit:
          m04.audit || null,
        meta:
          m04.meta || null
      }
    };
  } else if (isMeituanList) {
    const m04 =
      await runM04InTab(tab.id);

    if (!m04) {
      throw new Error(
        "美团 M04 返回空结果"
      );
    }

    const facts =
      Array.isArray(m04.facts)
        ? m04.facts
        : [];

    result = {
      host:
        new URL(tab.url).hostname,

      href:
        tab.url,

      title:
        tab.title || "美团酒店",

      count:
        facts.length,

      hotels:
        facts.map((fact) => ({
          ...(fact.platform_hotel_id
            ? {
                platform_hotel_id:
                  fact.platform_hotel_id
              }
            : {}),

          hotel_name:
            fact.hotel_name,

          rank:
            fact.display_position,

          price:
            fact.display_price,

          sold_out:
            fact.sold_out,

          source_url:
            fact.source_url,

          raw: {
            ...(fact.raw || {}),

            hotel_id:
              fact.platform_hotel_id,

            is_ad:
              fact.is_ad,

            rating:
              fact.rating,

            review_count:
              fact.review_count,

            room_name:
              fact.room_name,

            promotions:
              fact.promotions || [],

            list_price:
              fact.list_price,

            sale_price:
              fact.display_price,

            m04_quality:
              fact.quality,

            m04_evidence:
              fact.evidence
          }
        })),

      m04: {
        version: "M04",

        audit:
          m04.audit || null,

        meta:
          m04.meta || null
      }
    };
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

  /*
   * M04 Collection Quality
   *
   * complete:
   * - M04 Quality Gate 通过
   * - Rank Monitor 达到正式排名上限
   *
   * 其它情况保持 partial。
   *
   * 目前携程、美团已经正式迁移到 M04。
   */
  const m04Audit =
    result?.m04?.audit || null;

  const m04Meta =
    result?.m04?.meta || null;

  const collectionQuality =
    m04Audit?.passed === true &&
    m04Meta?.reached_target === true &&
    m04Meta?.stop_reason === "rank_limit"
      ? "complete"
      : "partial";

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
      quality: collectionQuality,
      policy_version: "30-200-10-3",
      collector_version: "0.4.0",
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

  const isOfficialId = (value) =>
    /^\d{4,}$/.test(String(value || ""));

  const official = list.filter((f) =>
    isOfficialId(f.platform_hotel_id)
  );

  const missing = list.filter((f) =>
    !isOfficialId(f.platform_hotel_id)
  );

  const ids = official.map((f) =>
    String(f.platform_hotel_id)
  );

  const duplicateIds = new Set(
    ids.filter((id, index) =>
      ids.indexOf(id) !== index
    )
  );

  const sold = list.filter(
    (f) => f.sold_out || f.price == null
  ).length;

  document.getElementById("stAll").textContent =
    String(list.length);

  document.getElementById("stAvail").textContent =
    String(Math.max(0, list.length - sold));

  document.getElementById("stSold").textContent =
    String(official.length);

  document.getElementById("stAd").textContent =
    String(missing.length);

  document.getElementById("stErr").textContent =
    String(duplicateIds.size);

  return {
    total: list.length,
    available: Math.max(0, list.length - sold),
    official_id_count: official.length,
    missing_id_count: missing.length,
    duplicate_id_count: duplicateIds.size,
    duplicate_ids: [...duplicateIds]
  };
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
  collectStatus.textContent = "OTA审计探测中…";

  const box = document.getElementById("domProbe");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    collectStatus.textContent = "没有活动标签页";
    return;
  }

  const [inj] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },

    func: async () => {
      function norm(value) {
        return String(value || "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function platformFromHost(host) {
        if (/ctrip|trip\.com/i.test(host)) return "ctrip";
        if (/meituan|dianping/i.test(host)) return "meituan";
        if (/fliggy|taobao|alitrip/i.test(host)) return "fliggy";
        if (/ly\.com|tongcheng/i.test(host)) return "tongcheng";
        return "unknown";
      }

      function short(value, max = 1000) {
        const s = String(value || "");
        return s.length > max ? s.slice(0, max) + "…" : s;
      }

      function attrsOf(el) {
        if (!el || !el.attributes) return {};
        const out = {};
        for (const a of [...el.attributes]) {
          if (
            a.name === "href" ||
            a.name === "id" ||
            a.name === "class" ||
            a.name.startsWith("data-") ||
            /hotel|poi|shop/i.test(a.name)
          ) {
            out[a.name] = short(a.value, 300);
          }
        }
        return out;
      }

      function selectorHint(el) {
        if (!el) return "";
        const tag = (el.tagName || "").toLowerCase();
        const id = el.id ? "#" + el.id : "";
        const classes = [...(el.classList || [])]
          .slice(0, 5)
          .map((x) => "." + x)
          .join("");
        return tag + id + classes;
      }

      function extractIds(text) {
        const s = String(text || "");
        const out = new Set();

        const patterns = [
          /data-offline-hotelid=["']?(\d{4,})/gi,
          /data-hotel-id=["']?(\d{4,})/gi,
          /data-hotelid=["']?(\d{4,})/gi,
          /data-poi-id=["']?(\d{4,})/gi,
          /data-poiid=["']?(\d{4,})/gi,
          /data-shopid=["']?(\d{4,})/gi,
          /hotelId["'=:\s]+(\d{4,})/gi,
          /hotelid["'=:\s]+(\d{4,})/gi,
          /poiId["'=:\s]+(\d{4,})/gi,
          /poiid["'=:\s]+(\d{4,})/gi,
          /realPoiId["'=:\s]+(\d{4,})/gi,
          /shopId["'=:\s]+(\d{4,})/gi,
          /\/hotel[^0-9]{0,6}(\d{4,})/gi,
          /\/hotels\/(\d{4,})/gi,
          /\/poi\/(\d{4,})/gi,
          /\/shop\/(\d{4,})/gi
        ];

        for (const re of patterns) {
          let m;
          while ((m = re.exec(s))) {
            out.add(m[1]);
            if (out.size >= 20) break;
          }
        }

        return [...out];
      }

      function dataIdAttrs(el) {
        const rows = [];
        const nodes = [
          el,
          ...(el ? [...el.querySelectorAll("*")].slice(0, 150) : [])
        ];

        for (const node of nodes) {
          if (!node?.attributes) continue;

          for (const a of [...node.attributes]) {
            if (
              a.name.startsWith("data-") &&
              /id|hotel|poi|shop/i.test(a.name)
            ) {
              rows.push({
                selector: selectorHint(node),
                name: a.name,
                value: short(a.value, 300)
              });
            }
          }

          if (rows.length >= 30) break;
        }

        return rows;
      }

      function linksOf(el) {
        if (!el) return [];

        return [...el.querySelectorAll("a[href]")]
          .slice(0, 10)
          .map((a) => ({
            text: short(norm(a.textContent), 120),
            href: short(a.href, 500),
            ids: extractIds(a.outerHTML + " " + a.href)
          }));
      }

      function pricesOf(text) {
        return [
          ...String(text || "").matchAll(
            /(?:¥|￥)\s*([0-9]{1,6}(?:\.[0-9]{1,2})?)/g
          )
        ]
          .map((m) => Number(m[1]))
          .filter(Number.isFinite);
      }

      function possibleName(text) {
        const lines = String(text || "")
          .split("\n")
          .map(norm)
          .filter(Boolean);

        return (
          lines.find(
            (line) =>
              line.length >= 4 &&
              line.length <= 100 &&
              /酒店|饭店|宾馆|旅馆|民宿|客栈|度假村|公寓|Hotel|Inn|Hostel/i.test(
                line
              )
          ) || ""
        );
      }

      function vueInfo(el) {
        const out = [];
        let cur = el;

        for (let i = 0; i < 6 && cur; i += 1) {
          try {
            const v2 = cur.__vue__;
            const v3 = cur.__vueParentComponent;

            if (v2) {
              const bag =
                v2._data ||
                v2.$props ||
                v2.poi ||
                v2.hotel ||
                v2;

              out.push({
                level: i,
                type: "vue2",
                selector: selectorHint(cur),
                keys: Object.keys(bag || {}).slice(0, 40),
                id_values: Object.entries(bag || {})
                  .filter(([k]) => /id|hotel|poi|shop/i.test(k))
                  .slice(0, 20)
              });
            }

            if (v3) {
              const bag =
                v3.props ||
                v3.setupState ||
                v3.ctx ||
                {};

              out.push({
                level: i,
                type: "vue3",
                selector: selectorHint(cur),
                keys: Object.keys(bag || {}).slice(0, 40),
                id_values: Object.entries(bag || {})
                  .filter(([k]) => /id|hotel|poi|shop/i.test(k))
                  .slice(0, 20)
              });
            }
          } catch {}

          cur = cur.parentElement;
        }

        return out;
      }

      function chooseCards() {
        const candidates = [];

        const nodes = [
          ...document.querySelectorAll(
            "article, li, section, div"
          )
        ];

        for (const el of nodes) {
          const text = el.innerText || "";

          if (text.length < 25 || text.length > 1600) continue;

          if (!/(?:¥|￥)\s*\d+/.test(text)) continue;

          if (
            !/酒店|饭店|宾馆|旅馆|民宿|客栈|度假村|公寓|Hotel|Inn|Hostel/i.test(
              text
            )
          ) {
            continue;
          }

          const name = possibleName(text);
          if (!name) continue;

          const reviewSignals =
            (text.match(/点评|评价|评论|评分/g) || []).length;

          const detailSignals =
            (text.match(/查看详情|预订|起|订/g) || []).length;

          const priceCount = pricesOf(text).length;

          let score = 0;

          if (name) score += 4;
          if (priceCount >= 1) score += 3;
          if (reviewSignals >= 1) score += 2;
          if (detailSignals >= 1) score += 1;

          if (text.length <= 800) score += 2;

          if (
            /热门筛选|地图找房|价格星级|热门商圈/.test(text)
          ) {
            score -= 4;
          }

          candidates.push({
            el,
            score,
            name,
            textLength: text.length
          });
        }

        candidates.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.textLength - b.textLength;
        });

        const picked = [];
        const names = new Set();

        for (const row of candidates) {
          const compact = norm(row.name)
            .toLowerCase()
            .replace(/[()（）·・\-—_.\s]/g, "");

          if (!compact || names.has(compact)) continue;

          names.add(compact);
          picked.push(row);

          if (picked.length >= 8) break;
        }

        return {
          totalCandidates: candidates.length,
          picked
        };
      }

      const host = location.hostname;
      const platform = platformFromHost(host);
      const chosen = chooseCards();

      const html = document.documentElement.innerHTML || "";

      const samples = chosen.picked.slice(0, 5).map((row, index) => {
        const el = row.el;
        const text = el.innerText || "";
        const outer = el.outerHTML || "";
        const name = row.name;

        let htmlAroundName = "";

        try {
          const pos = html.indexOf(name);
          if (pos >= 0) {
            htmlAroundName = html.slice(
              Math.max(0, pos - 700),
              Math.min(html.length, pos + name.length + 1400)
            );
          }
        } catch {}

        return {
          index: index + 1,
          guessed_name: name,
          selector: selectorHint(el),
          score: row.score,
          text_length: text.length,

          prices: pricesOf(text),

          root_attrs: attrsOf(el),

          data_id_attrs: dataIdAttrs(el),

          links: linksOf(el),

          possible_ids: [
            ...new Set([
              ...extractIds(outer),
              ...extractIds(htmlAroundName)
            ])
          ].slice(0, 30),

          vue: vueInfo(el),

          text: short(text, 1600),

          html_near_name: short(htmlAroundName, 2400)
        };
      });

      const resourceUrls = (
        performance.getEntriesByType("resource") || []
      )
        .map((x) => x.name)
        .filter((url) =>
          /hotel|search|poi|shop|list|detail|hbsearch|graphql|api/i.test(
            url
          )
        )
        .slice(-40);

      const bodyText = document.body?.innerText || "";

      async function auditMeituanHotelSearch() {
        if (platform !== "meituan") return null;

        const allResources = (
          performance.getEntriesByType("resource") || []
        )
          .map((x) => x.name)
          .filter((url) =>
            /ihotel\.meituan\.com\/hbsearch\/HotelSearch/i.test(url)
          );

        const actualUrl =
          allResources.length
            ? allResources[allResources.length - 1]
            : "";

        if (!actualUrl) {
          return {
            found: false,
            error: "未找到页面真实 HotelSearch 请求"
          };
        }

        try {
          const res = await fetch(actualUrl, {
            credentials: "include"
          });

          const json = await res.json();

          const rows =
            json?.data?.searchresult ||
            json?.searchresult ||
            [];

          const simplify = (row, index) => ({
            index: index + 1,

            name:
              row?.name ??
              row?.hotelName ??
              "",

            poiid:
              row?.poiid ??
              row?.poiId ??
              null,

            realPoiId:
              row?.realPoiId ??
              null,

            id:
              row?.poiid ??
              row?.poiId ??
              row?.realPoiId ??
              null,

            price:
              row?.lowestPrice ??
              row?.price ??
              row?.lowestprice ??
              row?.minPrice ??
              null,

            score:
              row?.score ??
              row?.avgScore ??
              row?.rating ??
              null,

            raw_keys:
              Object.keys(row || {}).slice(0, 80)
          });

          return {
            found: true,
            request_url: actualUrl,
            http_status: res.status,
            row_count: Array.isArray(rows)
              ? rows.length
              : 0,
            rows: Array.isArray(rows)
              ? rows.slice(0, 20).map(simplify)
              : [],
            response_top_keys:
              Object.keys(json || {}).slice(0, 40),
            data_keys:
              Object.keys(json?.data || {}).slice(0, 60)
          };
        } catch (error) {
          return {
            found: true,
            request_url: actualUrl,
            error: String(
              error?.message || error
            )
          };
        }
      }

      const meituan_hotel_search =
        await auditMeituanHotelSearch();

      return {
        probe: "OTA_AUDIT_V2",

        platform,

        page: {
          host,
          href: location.href,
          title: document.title
        },

        summary: {
          candidate_card_count: chosen.totalCandidates,
          sampled_card_count: samples.length,
          page_price_count: pricesOf(bodyText).length
        },

        samples,

        relevant_resources: resourceUrls,

        meituan_hotel_search
      };
    }
  });

  const data =
    inj && inj.result
      ? inj.result
      : { error: "空结果" };

  if (box) {
    box.hidden = false;
    box.textContent = JSON.stringify(data, null, 2);
  }

  collectStatus.textContent =
    "OTA Audit V1 完成，请复制下方完整结果";
}

document.getElementById("platforms")?.addEventListener("click", (event) => {
  const url = event.target?.dataset?.url;
  if (url) chrome.tabs.create({ url });
});

document.getElementById("collect").addEventListener("click", () => collectCurrent().catch((e) => {
  collectStatus.textContent = e.message;
}));




async function compareCtripM04() {
  collectStatus.textContent = "M04 新旧对比中…";

  const box = document.getElementById("domProbe");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !tab?.url) {
    collectStatus.textContent = "没有活动标签页";
    return;
  }

  if (!/hotels\.ctrip\.com\/hotels\/list/i.test(tab.url)) {
    collectStatus.textContent = "当前不是携程酒店列表页";
    return;
  }

  // -------------------------------------------------------
  // OLD PARSER
  // -------------------------------------------------------

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["parsers/ctrip-list.js"]
  });

  const [oldRun] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      if (
        typeof window.__livvScrapeCtripList !== "function"
      ) {
        return null;
      }

      return await window.__livvScrapeCtripList();
    }
  });

  const oldResult = oldRun?.result || {
    hotels: []
  };

  // -------------------------------------------------------
  // NEW M04 ADAPTER
  //
  // Chrome scripting.executeScript 不能直接 import ES module，
  // 所以这里加载一个临时页面 runner。
  // -------------------------------------------------------

  const runtimeResult =
    await runM04InTab(
      tab.id
    );

  const newResult = {
    facts:
      runtimeResult?.facts || [],

    card_count:
      runtimeResult?.meta?.card_count ??
      runtimeResult?.facts?.length ??
      0,

    audit:
      runtimeResult?.audit || null,

    meta:
      runtimeResult?.meta || null
  };

  const oldFacts =
    Array.isArray(oldResult.hotels)
      ? oldResult.hotels
      : [];

  const newFacts =
    Array.isArray(newResult.facts)
      ? newResult.facts
      : [];

  const oldById = new Map();
  const oldByName = new Map();

  for (const row of oldFacts) {
    if (row.platform_hotel_id) {
      oldById.set(
        String(row.platform_hotel_id),
        row
      );
    }

    if (row.hotel_name) {
      oldByName.set(
        String(row.hotel_name),
        row
      );
    }
  }

  const differences = {
    name: [],
    price: [],
    rating: [],
    review_count: [],
    room_name: []
  };

  for (const row of newFacts) {
    const old =
      (
        row.platform_hotel_id &&
        oldById.get(
          String(row.platform_hotel_id)
        )
      ) ||
      oldByName.get(row.hotel_name);

    if (!old) {
      continue;
    }

    const oldRaw =
      old.raw || {};

    if (
      String(old.hotel_name || "") !==
      String(row.hotel_name || "")
    ) {
      differences.name.push({
        id:
          row.platform_hotel_id,
        new:
          row.hotel_name,
        old:
          old.hotel_name
      });
    }

    if (
      Number(old.price) !==
      Number(row.display_price)
    ) {
      differences.price.push({
        hotel:
          row.hotel_name,
        new:
          row.display_price,
        old:
          old.price
      });
    }

    if (
      Number(oldRaw.rating) !==
      Number(row.rating)
    ) {
      differences.rating.push({
        hotel:
          row.hotel_name,
        new:
          row.rating,
        old:
          oldRaw.rating
      });
    }

    if (
      Number(oldRaw.review_count) !==
      Number(row.review_count)
    ) {
      differences.review_count.push({
        hotel:
          row.hotel_name,
        new:
          row.review_count,
        old:
          oldRaw.review_count
      });
    }

    if (
      String(oldRaw.room_name || "") !==
      String(row.room_name || "")
    ) {
      differences.room_name.push({
        hotel:
          row.hotel_name,
        new:
          row.room_name,
        old:
          oldRaw.room_name
      });
    }
  }

  const officialIds =
    newFacts.filter(
      (row) =>
        /^\d{4,}$/.test(
          String(
            row.platform_hotel_id || ""
          )
        )
    );

  const ids =
    officialIds.map(
      (row) =>
        String(row.platform_hotel_id)
    );

  const duplicateIds = [
    ...new Set(
      ids.filter(
        (id, index) =>
          ids.indexOf(id) !== index
      )
    )
  ];

  const missingIds =
    newFacts.filter(
      (row) =>
        !/^\d{4,}$/.test(
          String(
            row.platform_hotel_id || ""
          )
        )
    );

  const ambiguousPrices =
    newFacts.filter(
      (row) =>
        row.ambiguous_price
    );

  const report = {
    probe:
      "M04_CTRIP_COMPARE_V1",

    page:
      tab.url,

    old: {
      hotel_count:
        oldFacts.length
    },

    m04: {
      card_count:
        newResult.card_count,

      hotel_count:
        newFacts.length,

      official_id_count:
        officialIds.length,

      missing_id_count:
        missingIds.length,

      duplicate_id_count:
        duplicateIds.length,

      duplicate_ids:
        duplicateIds,

      ambiguous_price_count:
        ambiguousPrices.length
    },

    differences: {
      name_count:
        differences.name.length,

      price_count:
        differences.price.length,

      rating_count:
        differences.rating.length,

      review_count:
        differences.review_count.length,

      room_name_count:
        differences.room_name.length
    },

    difference_details:
      differences,

    m04_facts:
      newFacts
  };

  if (box) {
    box.hidden = false;
    box.textContent =
      JSON.stringify(
        report,
        null,
        2
      );
  }

  console.group(
    "[酒店助手] M04 携程新旧对比"
  );

  console.table(
    newFacts.map(
      (row, index) => ({
        index:
          index + 1,

        id:
          row.platform_hotel_id,

        hotel:
          row.hotel_name,

        price:
          row.display_price,

        rating:
          row.rating,

        reviews:
          row.review_count,

        room:
          row.room_name,

        ambiguous:
          row.ambiguous_price
      })
    )
  );

  console.log(
    "[酒店助手] 对比报告",
    report
  );

  console.groupEnd();

  collectStatus.textContent =
    `M04对比完成：旧${oldFacts.length}家 / 新${newFacts.length}家 / ID ${officialIds.length}/${newFacts.length}`;
}





document.getElementById("compareM04")?.addEventListener(
  "click",
  () =>
    compareCtripM04().catch((e) => {
      collectStatus.textContent =
        `M04对比失败：${e.message}`;
      console.error(
        "[酒店助手] M04 compare failed",
        e
      );
    })
);

document.getElementById("probe").addEventListener("click", () => probeDom().catch((e) => {
  collectStatus.textContent = e.message;
}));
document.getElementById("upload").addEventListener("click", () => uploadLatest().catch((e) => {
  collectStatus.textContent = e.message;
}));


const manifestVersion =
  chrome.runtime.getManifest()?.version || "";

const appVersionEl =
  document.getElementById("appVer");

if (appVersionEl && manifestVersion) {
  appVersionEl.textContent =
    `v${manifestVersion}`;
}

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
