export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/collections") {
      const { results } = await env.DB.prepare(
        `SELECT id, platform, task_type, market_id, business_date,
                check_in, check_out, quality, status,
                collector_version, source, created_at
         FROM collections
         ORDER BY created_at DESC
         LIMIT 50`
      ).all();

      return json({ ok: true, data: { items: results ?? [] } });
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/api/collections/")
    ) {
      const id = decodeURIComponent(
        url.pathname.slice("/api/collections/".length)
      );

      if (!id || id.includes("/")) {
        return json(
          { ok: false, error: { code: "NOT_FOUND", message: "Not found" } },
          404
        );
      }

      const collection = await env.DB.prepare(
        `SELECT *
         FROM collections
         WHERE id = ?
         LIMIT 1`
      )
        .bind(id)
        .first();

      if (!collection) {
        return json(
          {
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: "Collection not found"
            }
          },
          404
        );
      }

      const { results } = await env.DB.prepare(
        `SELECT
           pf.id,
           pf.collection_id,
           pf.market_id,
           pf.platform_hotel_id,
           pf.business_date,
           pf.check_in,
           pf.check_out,
           pf.rank_position,
           pf.display_price,
           pf.currency,
           pf.availability,
           pf.collected_at,
           pf.extras_json,
           ph.hotel_name,
           ph.platform,
           ph.platform_hotel_id AS external_hotel_id,
           ph.city
         FROM price_facts pf
         LEFT JOIN platform_hotels ph
           ON ph.id = pf.platform_hotel_id
         WHERE pf.collection_id = ?
         ORDER BY
           CASE WHEN pf.rank_position IS NULL THEN 1 ELSE 0 END,
           pf.rank_position ASC,
           ph.hotel_name ASC`
      )
        .bind(id)
        .all();

      return json({
        ok: true,
        data: {
          collection,
          facts: results ?? []
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/devices") {
      const { results } = await env.DB.prepare(
        `SELECT id, device_id, name, status, collector_version,
                os, arch, browser, browser_version,
                first_seen_at, last_seen_at,
                authorized_at, authorized_by
         FROM devices
         ORDER BY first_seen_at DESC
         LIMIT 100`
      ).all();

      return json({ ok: true, data: { items: results ?? [] } });
    }

    if (url.pathname.startsWith("/api/")) {
      return json(
        { ok: false, error: { code: "NOT_FOUND", message: "Not found" } },
        404
      );
    }

    return new Response(HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const HTML = '<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>livv ota</title>\n  <style>\n    :root { --blue:#3b82f6; --line:#1e3a5f; --muted:#8ba0bf; --ink:#e8eef8; --bg:#07111f; --card:#0d1b2e; --sale:#7dd3fc; }\n    * { box-sizing: border-box; }\n    body { margin:0; font:14px/1.5 "PingFang SC","Noto Sans SC",sans-serif; color:var(--ink); background:\n      radial-gradient(800px 280px at 8% -10%, #16325a 0%, transparent 55%), var(--bg); color-scheme: dark; }\n    header { background:rgba(8,18,32,.92); backdrop-filter: blur(12px); border-bottom:1px solid var(--line); padding:10px 24px; display:flex; align-items:center; gap:18px; position:sticky; top:0; z-index:10; }\n    .brand { display:flex; align-items:center; gap:10px; min-width:168px; }\n    .logo { width:32px; height:32px; border-radius:10px; background:linear-gradient(180deg,#3b82f6,#1d4ed8); color:#fff; display:grid; place-items:center; font-weight:800; }\n    .brand b { font-size:15px; letter-spacing:.04em; }\n    .brand small { color:var(--muted); display:block; font-size:12px; }\n    nav { display:flex; gap:6px; flex:1; min-width:0; }\n    nav button { border:1px solid transparent; background:none; padding:7px 14px; cursor:pointer; color:var(--muted); font-weight:650; border-radius:999px; }\n    nav button:hover { background:#12233a; color:#dbeafe; }\n    nav button.on { color:#fff; background:#1d4ed8; border-color:#2563eb; }\n    .biz { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; flex:0 0 auto; background:#0d1b2e; border:1px solid var(--line); border-radius:999px; padding:4px 10px 4px 4px; white-space:nowrap; }\n    .biz button { width:28px; height:28px; border:0; background:#163052; color:#dbeafe; border-radius:50%; cursor:pointer; }\n    .biz-wrap { position:relative; flex:0 0 auto; }\n    .biz-label { border:0; background:transparent; color:#e8eef8; padding:4px 8px; cursor:pointer; font:inherit; white-space:nowrap; min-width:108px; }\n    .dot { width:8px; height:8px; border-radius:50%; background:#334155; display:inline-block; }\n    .dot.on { background:#22c55e; }\n    .cal { display:none; position:absolute; right:0; top:44px; width:292px; background:#0d1b2e; border:1px solid var(--line); border-radius:16px; padding:12px; z-index:20; box-shadow:0 16px 40px #0008; }\n    .cal.show { display:block; }\n    .cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }\n    .cal-head button { width:28px; height:28px; border:0; background:#163052; color:#dbeafe; border-radius:8px; cursor:pointer; }\n    .cal-week, .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }\n    .cal-week span { text-align:center; color:#7b91b3; font-size:11px; padding:4px 0; }\n    .cal-grid button { height:36px; border:0; background:transparent; color:#e8eef8; border-radius:8px; cursor:pointer; position:relative; font-size:13px; }\n    .cal-grid button.out { color:#475569; }\n    .cal-grid button.fri, .cal-grid button.sat { background:#122033; }\n    .cal-grid button.has::after { content:""; width:5px; height:5px; border-radius:50%; background:#38bdf8; position:absolute; left:50%; bottom:4px; transform:translateX(-50%); }\n    .cal-grid button.today { box-shadow:inset 0 0 0 1px #3b82f6; }\n    .cal-grid button.on { background:#2563eb; color:#fff; }\n    .wrap { padding:20px 24px 40px; max-width:1280px; margin:0 auto; }\n    .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }\n    .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px 16px; }\n    .card em { color:var(--muted); font-style:normal; font-size:12px; }\n    .card b { display:block; font-size:24px; margin-top:6px; letter-spacing:-.02em; color:#fff; }\n    table { width:100%; border-collapse:separate; border-spacing:0; }\n    th, td { padding:10px 12px; border-bottom:1px solid #163052; text-align:left; font-size:13px; vertical-align:middle; }\n    th { color:#7b91b3; font-weight:600; background:#0b1728; }\n    tbody tr:hover td { background:#12233a; }\n    .sale { color:var(--sale); font-weight:800; }\n    .low { background:#064e3b !important; color:#6ee7b7; border-radius:8px; }\n    .chip { display:inline-block; background:#3b2a12; color:#fdba74; border:1px solid #9a3412; border-radius:999px; padding:2px 8px; font-size:11px; }\n    .ok { color:#34d399; }\n    .wait { color:#fbbf24; }\n    .muted { color:var(--muted); }\n    .soon { color:var(--muted); font-size:13px; padding:8px 0 4px; }\n    h2 { font-size:15px; margin:0 0 12px; color:#f1f5f9; }\n  </style>\n</head>\n<body>\n  <header>\n    <div class="brand">\n      <span class="logo">L</span>\n      <div><b>LIVV OTA</b><small>酒店价格对照</small></div>\n    </div>\n    <nav>\n      <button data-tab="market" class="on">今日市场</button>\n      <button data-tab="hotels">酒店管理</button>\n      <button data-tab="devices">设备管理</button>\n    </nav>\n    <div class="biz-wrap">\n      <div class="biz">\n        <button type="button" id="dayPrev">‹</button>\n        <button type="button" class="biz-label" id="dateBtn">2026-09-16</button>\n        <button type="button" id="dayNext">›</button>\n        <span class="dot" id="dataDot"></span>\n        <span id="freshTime">最新 —</span>\n      </div>\n      <div class="cal" id="cal"></div>\n    </div>\n  </header>\n\n  <div class="wrap" id="tab-market">\n    <div class="kpis">\n      <div class="card"><em>对照酒店</em><b id="kHotels">-</b></div>\n      <div class="card"><em>今日最低平台</em><b id="kWin">-</b></div>\n      <div class="card"><em>四平台都有</em><b id="kAll">-</b></div>\n      <div class="card"><em>近时预订条数</em><b id="kBook">-</b></div>\n    </div>\n    <div class="card" style="margin-bottom:12px">\n      <h2>当日价格对照</h2>\n      <table>\n        <thead><tr><th>酒店</th><th>携程</th><th>美团</th><th>同程</th><th>飞猪</th><th>最低</th><th>最新预订</th></tr></thead>\n        <tbody id="marketRows"><tr><td colspan="7">读取中…</td></tr></tbody>\n      </table>\n    </div>\n    <div class="card">\n      <h2>未来 14 天价格 + Cloudflare AI 分析</h2>\n      <p class="soon">这一块需要按日期连续采集和 Workers AI，下一批再接。先保留入口：展示日历价曲线、异常涨跌、预订热度摘要。</p>\n    </div>\n  </div>\n\n  <div class="wrap" id="tab-hotels" hidden>\n    <div class="card">\n      <h2>跨平台酒店汇总</h2>\n      <p class="muted" id="hotelHint">同一店名合并，ID 来自各平台采集结果。映射推荐下一步再做确认流。</p>\n      <table>\n        <thead><tr><th>酒店</th><th>携程ID</th><th>美团ID</th><th>同程ID</th><th>飞猪ID</th><th>映射</th></tr></thead>\n        <tbody id="hotelRows"><tr><td colspan="6">读取中…</td></tr></tbody>\n      </table>\n    </div>\n  </div>\n\n  <div class="wrap" id="tab-devices" hidden>\n    <div class="kpis">\n      <div class="card"><em>设备总数</em><b id="dTotal">-</b></div>\n      <div class="card"><em>已授权</em><b id="dOk">-</b></div>\n      <div class="card"><em>待审批</em><b id="dWait">-</b></div>\n      <div class="card"><em>采集任务</em><b>未开放</b></div>\n    </div>\n    <div class="card">\n      <h2>设备列表</h2>\n      <table>\n        <thead><tr><th>设备ID</th><th>状态</th><th>说明</th></tr></thead>\n        <tbody id="deviceRows"><tr><td colspan="3">读取中…</td></tr></tbody>\n      </table>\n      <p class="soon">任务发布、在线心跳自动领任务下一步再做。当前只需保证设备授权后能上传列表采集。</p>\n    </div>\n  </div>\n\n  <script>\n    const API = "";\n    const NAMES = { ctrip: "携程", meituan: "美团", tongcheng: "同程", fliggy: "飞猪" };\n    const ORDER = ["ctrip", "meituan", "tongcheng", "fliggy"];\n    let allItems = [];\n\n    document.querySelectorAll("nav button").forEach((btn) => {\n      btn.onclick = () => {\n        document.querySelectorAll("nav button").forEach((b) => b.classList.remove("on"));\n        btn.classList.add("on");\n        ["market", "hotels", "devices"].forEach((id) => {\n          document.getElementById("tab-" + id).hidden = id !== btn.dataset.tab;\n        });\n      };\n    });\n\n    function compactName(s) {\n      return String(s || "").toLowerCase().replace(/\\s+/g, "").replace(/[()（）·・\\-—_.]/g, "");\n    }\n    async function loadFacts(id) {\n      const res = await fetch(API + "/api/collections/" + id);\n      const json = await res.json().catch(() => ({}));\n      return json.data?.facts || json.facts || [];\n    }\n    function bookFrom(f, collectedAt) {\n      let extra = {};\n      try { extra = JSON.parse(f.extras_json || "{}"); } catch {}\n      const raw = extra.raw || extra || {};\n      const blob = JSON.stringify(raw);\n      const m = blob.match(/((刚刚|\\d+(?:\\.\\d+)?)\\s*(分钟|小时|天)?前有人[预預]订(?:了该酒店)?)/);\n      if (!m) return "";\n      const collected = collectedAt ? new Date(collectedAt).getTime() : Date.now();\n      let offset = 0;\n      if (m[1].indexOf("刚刚") >= 0) offset = 60 * 1000;\n      else {\n        const n = parseFloat(m[2]);\n        const unit = m[3];\n        if (unit === "分钟") offset = n * 60 * 1000;\n        else if (unit === "小时") offset = n * 3600 * 1000;\n        else if (unit === "天") offset = n * 86400 * 1000;\n      }\n      const bookedAt = collected - offset;\n      const ago = Math.max(0, Date.now() - bookedAt);\n      let label = "1分钟前";\n      if (ago >= 86400 * 1000) label = Math.floor(ago / 86400 / 1000) + "天前";\n      else if (ago >= 3600 * 1000) label = Math.floor(ago / 3600 / 1000) + "小时前";\n      else label = Math.max(1, Math.floor(ago / 60 / 1000)) + "分钟前";\n      return label + "有人预订";\n    }\n    function hidFrom(f) {\n      let extra = {};\n      try { extra = JSON.parse(f.extras_json || "{}"); } catch {}\n      const raw = extra.raw || extra || {};\n      const id = raw.hotel_id || "";\n      return id && id !== f.hotel_name ? id : "";\n    }\n\n    async function renderMarket(date) {\n      const scoped = date ? allItems.filter((it) => (it.check_in || "").slice(0, 10) === date) : allItems;\n      const latest = {};\n      for (const it of scoped) if (it.platform && !latest[it.platform]) latest[it.platform] = it;\n      const used = ORDER.filter((p) => latest[p]);\n      const groups = new Map();\n      let bookCount = 0;\n      let newest = "";\n      let newestPlat = "";\n      for (const plat of used) {\n        if (!newest || String(latest[plat].created_at) > newest) {\n          newest = latest[plat].created_at;\n          newestPlat = plat;\n        }\n        const facts = await loadFacts(latest[plat].id);\n        for (const f of facts) {\n          const key0 = compactName(f.hotel_name);\n          if (!key0 || key0.length < 4) continue;\n          let key = key0;\n          for (const exist of groups.keys()) {\n            if (exist.includes(key0) || key0.includes(exist)) { key = exist; break; }\n          }\n          const row = groups.get(key) || { name: f.hotel_name, prices: {}, books: {}, ids: {} };\n          if (f.display_price != null && row.prices[plat] == null) row.prices[plat] = f.display_price;\n          const bk = bookFrom(f, latest[plat].created_at);\n          if (bk) { row.books[plat] = bk; bookCount += 1; }\n          const hid = hidFrom(f);\n          if (hid) row.ids[plat] = hid;\n          if ((f.hotel_name || "").length > (row.name || "").length) row.name = f.hotel_name;\n          groups.set(key, row);\n        }\n      }\n      const rows = [...groups.values()].filter((r) => Object.keys(r.prices).length >= 1);\n      rows.sort((a, b) => Object.keys(b.prices).length - Object.keys(a.prices).length);\n      const four = rows.filter((r) => ORDER.every((p) => r.prices[p] != null)).length;\n      const winCount = {};\n      rows.forEach((r) => {\n        const vals = ORDER.map((p) => r.prices[p]).filter((v) => v != null);\n        const min = Math.min(...vals);\n        ORDER.forEach((p) => { if (r.prices[p] === min) winCount[p] = (winCount[p] || 0) + 1; });\n      });\n      const winPlat = Object.entries(winCount).sort((a, b) => b[1] - a[1])[0];\n      document.getElementById("kHotels").textContent = String(rows.length);\n      document.getElementById("kWin").textContent = winPlat ? NAMES[winPlat[0]] : "-";\n      document.getElementById("kAll").textContent = String(four);\n      document.getElementById("kBook").textContent = String(bookCount);\n      document.getElementById("freshTime").textContent = newest\n        ? ("最新 " + (NAMES[newestPlat] || newestPlat) + " " + new Date(newest).toLocaleString("zh-CN", { hour12: false }))\n        : "该日暂无采集";\n      document.getElementById("marketRows").innerHTML = rows.map((r) => {\n        const vals = ORDER.map((p) => r.prices[p]).filter((v) => v != null);\n        const min = Math.min(...vals);\n        const cells = ORDER.map((p) => {\n          const v = r.prices[p];\n          if (v == null) return "<td></td>";\n          return `<td class="sale${v === min ? " low" : ""}">¥${v}</td>`;\n        }).join("");\n        const winner = ORDER.filter((p) => r.prices[p] === min).map((p) => NAMES[p]).join(" / ");\n        const book = ORDER.map((p) => r.books[p]).filter(Boolean)[0] || "";\n        return `<tr><td>${r.name}</td>${cells}<td>${winner}</td><td>${book ? `<span class="chip">${book}</span>` : ""}</td></tr>`;\n      }).join("") || "<tr><td colspan=\'7\'>这一天还没有可对照的采集</td></tr>";\n      document.getElementById("hotelRows").innerHTML = [...groups.values()].map((r) => `<tr>\n        <td>${r.name}</td>\n        <td>${r.ids.ctrip || ""}</td>\n        <td>${r.ids.meituan || ""}</td>\n        <td>${r.ids.tongcheng || ""}</td>\n        <td>${r.ids.fliggy || ""}</td>\n        <td class="muted">${ORDER.filter((p) => r.ids[p]).length >= 2 ? "待确认" : "缺ID"}</td>\n      </tr>`).join("") || "<tr><td colspan=\'6\'>这一天还没有酒店</td></tr>";\n    }\n\n    let currentBiz = "";\n    let viewYear = 2026;\n    let viewMonth = 8;\n    const WEEK = ["日", "一", "二", "三", "四", "五", "六"];\n    const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];\n\n    function ymd(d) {\n      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");\n    }\n    function parseYmd(s) {\n      return new Date((s || ymd(new Date())) + "T00:00:00");\n    }\n    function dataDates() {\n      const set = new Set();\n      allItems.forEach((it) => { if (it.check_in) set.add(String(it.check_in).slice(0, 10)); });\n      return set;\n    }\n    function syncPill() {\n      const d = parseYmd(currentBiz);\n      document.getElementById("dateBtn").textContent = currentBiz.slice(5) + " 周" + WEEKDAY[d.getDay()];\n      document.getElementById("dataDot").classList.toggle("on", dataDates().has(currentBiz));\n    }\n    function drawCal() {\n      const first = new Date(viewYear, viewMonth, 1);\n      const start = new Date(first);\n      start.setDate(1 - first.getDay());\n      let html = `<div class="cal-head"><button type="button" id="calPrev">‹</button><b>${viewYear}年${viewMonth + 1}月</b><button type="button" id="calNext">›</button></div>`;\n      html += `<div class="cal-week">${WEEK.map((w) => `<span>${w}</span>`).join("")}</div><div class="cal-grid">`;\n      const today = ymd(new Date());\n      const has = dataDates();\n      for (let i = 0; i < 42; i++) {\n        const cell = new Date(start);\n        cell.setDate(start.getDate() + i);\n        const key = ymd(cell);\n        const dow = cell.getDay();\n        const cls = [\n          cell.getMonth() !== viewMonth ? "out" : "",\n          dow === 5 ? "fri" : "",\n          dow === 6 ? "sat" : "",\n          has.has(key) ? "has" : "",\n          key === today ? "today" : "",\n          key === currentBiz ? "on" : "",\n        ].filter(Boolean).join(" ");\n        html += `<button type="button" class="${cls}" data-d="${key}">${cell.getDate()}</button>`;\n      }\n      html += "</div>";\n      const box = document.getElementById("cal");\n      box.innerHTML = html;\n      document.getElementById("calPrev").onclick = (e) => { e.stopPropagation(); viewMonth -= 1; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } drawCal(); };\n      document.getElementById("calNext").onclick = (e) => { e.stopPropagation(); viewMonth += 1; if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } drawCal(); };\n      box.querySelectorAll(".cal-grid button").forEach((btn) => {\n        btn.onclick = (e) => {\n          e.stopPropagation();\n          currentBiz = btn.dataset.d;\n          box.classList.remove("show");\n          syncPill();\n          renderMarket(currentBiz);\n        };\n      });\n    }\n    async function boot() {\n      const res = await fetch(API + "/api/collections");\n      const json = await res.json().catch(() => ({}));\n      allItems = json.data?.items || json.items || [];\n      currentBiz = ymd(new Date());\n      const d = parseYmd(currentBiz);\n      viewYear = d.getFullYear();\n      viewMonth = d.getMonth();\n      syncPill();\n      await renderMarket(currentBiz);\n      const dres = await fetch(API + "/api/devices").catch(() => null);\n      if (dres && dres.ok) {\n        const dj = await dres.json().catch(() => ({}));\n        const devices = dj.data?.items || dj.items || dj.data?.devices || [];\n        document.getElementById("dTotal").textContent = String(devices.length);\n        document.getElementById("dOk").textContent = String(devices.filter((x) => x.status === "authorized" || x.status === "active").length);\n        document.getElementById("dWait").textContent = String(devices.filter((x) => x.status === "pending").length);\n        document.getElementById("deviceRows").innerHTML = devices.map((x) => `<tr>\n          <td>${x.device_id || x.id}</td>\n          <td class="${x.status === "pending" ? "wait" : "ok"}">${x.status || ""}</td>\n          <td>${x.note || ""}</td>\n        </tr>`).join("") || "<tr><td colspan=\'3\'>暂无设备</td></tr>";\n      }\n    }\n    function shiftDate(days) {\n      const d = parseYmd(currentBiz);\n      d.setDate(d.getDate() + days);\n      currentBiz = ymd(d);\n      viewYear = d.getFullYear();\n      viewMonth = d.getMonth();\n      syncPill();\n      renderMarket(currentBiz);\n    }\n    document.getElementById("dayPrev").onclick = () => shiftDate(-1);\n    document.getElementById("dayNext").onclick = () => shiftDate(1);\n    document.getElementById("dateBtn").onclick = (e) => {\n      e.stopPropagation();\n      const cal = document.getElementById("cal");\n      const open = !cal.classList.contains("show");\n      if (open) drawCal();\n      cal.classList.toggle("show", open);\n    };\n    document.addEventListener("click", () => document.getElementById("cal").classList.remove("show"));\n    boot().catch((e) => { document.getElementById("freshTime").textContent = e.message; });\n  </script>\n</body>\n</html>\n';
