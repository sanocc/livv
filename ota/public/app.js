import {
  diagnosticsView,
  errorLabel,
  statusLabel,
} from "./device-diagnostics.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "—").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const categories = {
  mine: "我的酒店",
  core: "核心竞品",
  competitor: "竞品酒店",
  watch: "观察酒店",
  other: "市场其他",
};
const advice = {
  raise: "↑ 建议关注涨价",
  observe: "— 建议观望",
  lower: "↓ 建议关注降价",
};
let page = "market",
  filter = {
    city: "咸宁",
    keyword: "中心花坛",
    scope: "top30",
    horizon: 30,
    inclusive: 1,
  },
  marketData = null,
  marketRequest = 0,
  chartHorizon = 14,
  chartRequest = 0;
async function api(path, method = "GET", body) {
  const r = await fetch("/api/v1/admin/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      data.error?.message ?? data.error?.code ?? `HTTP ${r.status}`,
    );
  return data;
}
function table(headers, rows) {
  return `<div class="table"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" class="empty">暂无真实数据</td></tr>`}</tbody></table></div>`;
}
const money = (x) =>
  x == null
    ? "—"
    : `¥${Number(x).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const datetime = (x) =>
  x ? new Date(x).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—";
const platformName = (id) => ({ ctrip: "携程" })[id] ?? id;
const priceSeries = [
  ["myPrice", "#3169df", "我的酒店起售价"],
  ["maximum", "#c79554", "市场最高价"],
  ["median", "#39958a", "市场中位价"],
  ["minimum", "#95a4b8", "市场最低价"],
];
// Official 2026 China holiday breaks; unknown years stay explicitly unconfirmed.
// https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
const holidayBreaks = [
  ["2026-01-01", "2026-01-03", "元旦假期"],
  ["2026-02-15", "2026-02-23", "春节假期"],
  ["2026-04-04", "2026-04-06", "清明节假期"],
  ["2026-05-01", "2026-05-05", "劳动节假期"],
  ["2026-06-19", "2026-06-21", "端午节假期"],
  ["2026-09-25", "2026-09-27", "中秋节假期"],
  ["2026-10-01", "2026-10-07", "国庆节假期"],
];
const holidayWorkdays = new Set([
  "2026-01-04",
  "2026-02-14",
  "2026-02-28",
  "2026-05-09",
  "2026-09-20",
  "2026-10-10",
]);
function dateLabel(date, origin) {
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  const holiday = holidayBreaks.find(
    ([start, end]) => date >= start && date <= end,
  )?.[2];
  const workday = holidayWorkdays.has(date);
  return {
    week: "周" + "日一二三四五六"[weekday],
    offset: Math.round((Date.parse(date) - Date.parse(origin)) / 86400000),
    holiday:
      holiday ??
      (workday
        ? "调休上班"
        : date.startsWith("2026-")
          ? ""
          : "节假日安排未确认"),
    color: holiday
      ? "holiday-date"
      : !workday && [5, 6].includes(weekday)
        ? "weekend-date"
        : "ordinary-date",
  };
}
// Monotone cubic segments: shape only, never bridge missing observations or overshoot prices.
function smoothPath(points) {
  let path = `M${points[0][0]},${points[0][1]}`;
  const slopes = points
    .slice(1)
    .map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0]));
  const tangents = points.map((p, i) => {
    if (i === 0) return slopes[0];
    if (i === points.length - 1) return slopes.at(-1);
    const a = slopes[i - 1],
      b = slopes[i];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  points.slice(1).forEach((p, i) => {
    const previous = points[i],
      dx = (p[0] - previous[0]) / 3;
    path += ` C${previous[0] + dx},${previous[1] + dx * tangents[i]} ${p[0] - dx},${p[1] - dx * tangents[i + 1]} ${p[0]},${p[1]}`;
  });
  return path;
}
function chart(curve) {
  const values = curve
    .flatMap((v) => priceSeries.map(([k]) => v[k]))
    .filter((v) => v != null);
  const max = Math.ceil((Math.max(1, ...values) * 1.12) / 100) * 100;
  const width = 80 + curve.length * 64;
  const x = (i) => 60 + (i + 0.5) * 64,
    y = (p) => 215 - (p / max) * 190;
  let svg = `<svg class="chart" style="min-width:${width}px" viewBox="0 0 ${width} 260" preserveAspectRatio="none" role="group" aria-label="未来日期价格走势，缺失数据不插值"><defs><linearGradient id="mine-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3169df" stop-opacity=".12"/><stop offset="100%" stop-color="#3169df" stop-opacity="0"/></linearGradient></defs>`;
  curve.forEach((v, i) => {
    const meta = dateLabel(v.checkin, curve[0].checkin);
    svg += `<rect class="date-band ${meta.color}" x="${60 + i * 64}" y="20" width="64" height="235"/>`;
  });
  for (let i = 0; i <= 4; i++) {
    const p = (max * i) / 4;
    svg += `<line x1="60" y1="${y(p)}" x2="${width - 20}" y2="${y(p)}"/><text x="46" y="${y(p) + 4}" text-anchor="end">${money(p)}</text>`;
  }
  for (const [k, color] of priceSeries) {
    let segment = [];
    const flush = () => {
      if (segment.length > 1) {
        const d = smoothPath(segment);
        if (k === "myPrice")
          svg += `<path class="price-area" d="${d} L${segment.at(-1)[0]},215 L${segment[0][0]},215 Z" fill="url(#mine-fill)"/>`;
        svg += `<path class="price-line" fill="none" stroke="${color}" stroke-width="${k === "myPrice" ? 3 : 2}" d="${d}"/>`;
      }
      segment = [];
    };
    curve.forEach((v, i) => {
      if (v[k] == null) {
        flush();
        return;
      }
      segment.push([x(i), y(v[k])]);
      svg += `<circle class="price-dot" data-day="${i}" cx="${x(i)}" cy="${y(v[k])}" r="3" fill="${color}"><title>${esc(v.checkin)} ${money(v[k])}</title></circle>`;
    });
    flush();
  }
  curve.forEach((v, i) => {
    const meta = dateLabel(v.checkin, curve[0].checkin);
    svg += `<text class="date-text" x="${x(i)}" y="244" text-anchor="middle">${esc(v.checkin.slice(5).replace("-", "/"))}</text>`;
    const heading = [
      v.checkin.slice(5).replace("-", "/"),
      meta.week,
      meta.offset ? `T+${meta.offset}` : "T",
      meta.holiday,
    ]
      .filter(Boolean)
      .join(" · ");
    const tip = [
      heading,
      ...priceSeries.map(
        ([k, , name]) =>
          `${name === "我的酒店起售价" ? "我的酒店" : name}：${money(v[k])}`,
      ),
    ].join("\n");
    svg += `<g class="chart-day"><rect class="column-highlight" x="${60 + i * 64}" y="20" width="64" height="235"/><line class="crosshair" x1="${x(i)}" x2="${x(i)}" y1="20" y2="215"/><rect class="chart-hit tip" data-day="${i}" x="${60 + i * 64}" y="20" width="64" height="235" fill="transparent" tabindex="0" data-tip="${esc(tip)}" data-date="${esc(v.checkin)}" aria-label="${esc(tip)}"/></g>`;
  });
  return `<div class="legend">${priceSeries.map(([, c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div><div class="chart-wrap"><div class="chart-scroll">${svg}</svg></div>${values.length ? "" : '<p class="chart-empty">暂无真实价格数据</p>'}</div>`;
}
async function setChartHorizon(horizon) {
  if (![14, 30].includes(horizon)) return;
  const request = ++chartRequest,
    version = marketRequest;
  const params = new URLSearchParams({ ...filter, horizon, inclusive: 1 });
  const m = await api("market?" + params);
  if (
    request !== chartRequest ||
    version !== marketRequest ||
    page !== "market"
  )
    return;
  chartHorizon = horizon;
  const tooltip = $("#market-tooltip");
  if (tooltip) tooltip.hidden = true;
  $("#trend-chart").innerHTML = chart(m.curve);
  document
    .querySelectorAll("[data-horizon]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(Number(b.dataset.horizon) === horizon),
      ),
    );
  bindTips($("#trend-chart"));
}
// Viewport coordinates; keep the entire tooltip in the visible plot, away from the date column.
function chartTipPosition(bounds, column, pointer, width, height) {
  const gap = 16,
    pad = 6;
  const right = Math.max(pointer.x, column.right) + gap;
  const left = Math.min(pointer.x, column.left) - width - gap;
  const preferRight = pointer.x < (bounds.left + bounds.right) / 2;
  let x = preferRight ? right : left;
  if (x < bounds.left + pad || x + width > bounds.right - pad)
    x = preferRight ? left : right;
  x = Math.max(bounds.left + pad, Math.min(x, bounds.right - width - pad));
  let y = pointer.y + gap;
  if (y + height > bounds.bottom - pad) y = pointer.y - height - gap;
  y = Math.max(bounds.top + pad, Math.min(y, bounds.bottom - height - pad));
  return { x, y };
}
function bindChartTips(root) {
  const wrap = root.querySelector(".chart-wrap");
  if (!wrap) return;
  const tip = wrap.appendChild(
    Object.assign(document.createElement("div"), {
      className: "chart-tooltip",
      role: "tooltip",
      hidden: true,
    }),
  );
  tip.id = "chart-tooltip";
  let current = null;
  const hide = () => {
    tip.hidden = true;
    if (current) {
      current.removeAttribute("aria-describedby");
      current.parentElement.classList.remove("active-day");
    }
    current = null;
    root
      .querySelectorAll(".price-dot")
      .forEach((p) => p.classList.remove("active-dot"));
  };
  const move = (cell, e) => {
    const r = wrap.getBoundingClientRect(),
      column = cell.getBoundingClientRect();
    const bounds = {
      left: Math.max(r.left, 0),
      right: Math.min(r.right, window.innerWidth),
      top: Math.max(r.top, 0),
      bottom: Math.min(r.bottom, window.innerHeight),
    };
    tip.style.width =
      Math.max(0, Math.min(250, bounds.right - bounds.left - 12)) + "px";
    const pointer =
      e?.clientX != null
        ? { x: e.clientX, y: e.clientY }
        : { x: (column.left + column.right) / 2, y: bounds.top + 30 };
    const pos = chartTipPosition(
      bounds,
      column,
      pointer,
      tip.offsetWidth,
      tip.offsetHeight,
    );
    tip.style.left = pos.x - r.left + "px";
    tip.style.top = pos.y - r.top + "px";
  };
  root.querySelectorAll(".chart-hit").forEach((cell) => {
    const show = (e) => {
      if (current !== cell) {
        if (current) {
          current.removeAttribute("aria-describedby");
          current.parentElement.classList.remove("active-day");
        }
        current = cell;
        current.parentElement.classList.add("active-day");
        const [heading, ...rows] = cell.dataset.tip.split("\n");
        const parts = heading.split(" · "),
          calendar = parts.slice(3).join(" · "),
          badge = calendar.replace("国庆节假期", "国庆假期");
        tip.innerHTML = `<div class="chart-tip-heading"><strong>${esc(parts.slice(0, 3).join(" · "))}</strong>${calendar ? `<span class="chart-tip-badge ${calendar === "调休上班" || calendar === "节假日安排未确认" ? "neutral-badge" : ""}">${esc(badge)}</span>` : ""}</div><div class="chart-tip-prices">${rows
          .map((row, i) => {
            const at = row.indexOf("：");
            return `<div class="${i === 0 ? "mine-tip" : ""}"><span>${esc(row.slice(0, at).replace("市场最高价", "市场最高").replace("市场中位价", "市场中位").replace("市场最低价", "市场最低"))}</span><b>${esc(row.slice(at + 1))}</b></div>`;
          })
          .join("")}</div>`;
        root
          .querySelectorAll(".price-dot")
          .forEach((p) =>
            p.classList.toggle(
              "active-dot",
              p.dataset.day === cell.dataset.day,
            ),
          );
        cell.setAttribute("aria-describedby", tip.id);
      }
      tip.hidden = false;
      move(cell, e);
    };
    cell.onmouseenter = cell.onfocus = show;
    cell.onmousemove = show;
    cell.onmouseleave = cell.onblur = hide;
    cell.onkeydown = (e) => {
      if (e.key === "Escape") hide();
    };
  });
  wrap.querySelector(".chart-scroll").onscroll = hide;
}
function bindTips(root) {
  bindChartTips(root);
  root.querySelectorAll(".tip:not(.chart-hit)").forEach((cell) => {
    const hide = () => {
      const tip = $("#market-tooltip");
      if (tip) tip.hidden = true;
    };
    const show = () => {
      const tip =
        $("#market-tooltip") ??
        document.body.appendChild(
          Object.assign(document.createElement("div"), {
            id: "market-tooltip",
            role: "tooltip",
          }),
        );
      tip.textContent = cell.dataset.tip;
      tip.hidden = false;
      cell.setAttribute("aria-describedby", tip.id);
      const rect = cell.getBoundingClientRect();
      tip.style.left =
        Math.max(
          8,
          Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8),
        ) + "px";
      tip.style.top =
        Math.max(
          8,
          Math.min(rect.bottom + 8, window.innerHeight - tip.offsetHeight - 8),
        ) + "px";
    };
    cell.onmouseenter = cell.onfocus = show;
    cell.onmouseleave = cell.onblur = hide;
    cell.onkeydown = (e) => {
      if (e.key === "Escape") hide();
    };
  });
}
async function market() {
  const request = ++marketRequest;
  ++chartRequest;
  const params = new URLSearchParams(filter);
  const [m, runtime] = await Promise.all([
    api("market?" + params),
    api("runtime"),
  ]);
  if (request !== marketRequest || page !== "market") return;
  marketData = m;
  const s = m.snapshot,
    f = s?.facts ?? {},
    mine = m.hotels.find((h) => h.category === "mine");
  const extremeName = (value) => {
    if (value == null) return "暂无价格数据";
    const hotels = m.hotels.filter((h) => h.display_price === value);
    return hotels.length
      ? `${hotels[0].standard_name}${hotels.length > 1 ? ` 等${hotels.length}家` : ""}`
      : "—";
  };
  const status = s
    ? s.market_status === "SUCCESS"
      ? "列表采集成功"
      : "列表部分采集"
    : "该日期暂无快照";
  $("#view").innerHTML = `
    <div class="market-toolbar">
      <div class="market-identity"><span class="eyebrow">当前市场</span><h2>${esc(m.city)} <span>·</span> ${esc(m.keyword || "全城")}</h2><details class="market-edit"><summary>切换市场</summary><div><label>城市<input id="city" value="${esc(filter.city)}"></label><label>关键词<input id="keyword" value="${esc(filter.keyword)}"></label><button id="query" class="primary">查询市场</button></div></details></div>
      <div class="filters"><label>入住日期<select id="checkin">${m.curve.map((v) => `<option value="${v.checkin}">${v.checkin}${v.snapshot_id ? " · 有数据" : ""}</option>`).join("")}</select></label><label>市场范围<select id="scope"><option value="top30">30家市场</option><option value="all">全市场</option></select></label></div>
    </div>
    <div class="market-status"><span class="status-dot ${s?.market_status === "SUCCESS" ? "ok" : "pending"}"></span><span>${status}${s ? ` · 详情 ${s.detail_success}/${s.detail_total} · 当前快照 ${datetime(s.observed_at)}` : ""}</span><span class="status-divider"></span><span>生产最近成功 ${datetime(runtime.last_success_at)}</span><span class="device-status"><span class="status-dot ${runtime.online_devices.length ? "ok" : "pending"}"></span>在线设备 ${runtime.online_devices.length}</span></div>
    <div class="metrics market-metrics">
      <article class="card mine-card"><div class="metric-label">我的酒店起售价 <span class="card-caption">${esc(platformName(m.platform))}</span></div><div class="metric">${money(mine?.display_price)}</div><div class="metric-subtitle" title="${esc(mine?.standard_name)}">${esc(mine?.standard_name ?? "当前列表暂无我的酒店")}</div><small class="muted">${mine ? `${platformName(mine.platform)} · 当前排名 ${mine.rank}` : "—"}</small></article>
      <article class="card"><div class="metric-label">市场起售价中位数</div><div class="metric">${money(f.median)}</div><div class="metric-subtitle">${s ? `${f.priced ?? m.hotels.filter((h) => h.display_price != null).length}家有价样本` : "暂无真实数据"}</div><small class="muted">${s ? `${s.market_count}家真实酒店` : "等待自然采集"}</small></article>
      <article class="card"><div class="metric-label">市场最高价</div><div class="metric">${money(f.maximum)}</div><div class="metric-subtitle" title="${esc(extremeName(f.maximum))}">${esc(extremeName(f.maximum))}</div><small class="muted">当前入住日期 · ${m.scope === "all" ? "全市场" : "30家市场"}</small></article>
      <article class="card"><div class="metric-label">市场最低价</div><div class="metric">${money(f.minimum)}</div><div class="metric-subtitle" title="${esc(extremeName(f.minimum))}">${esc(extremeName(f.minimum))}</div><small class="muted">当前入住日期 · ${m.scope === "all" ? "全市场" : "30家市场"}</small></article>
      <article class="card strategy-card"><div class="metric-label">市场策略建议</div><div class="strategy-value ${esc(s?.recommendation ?? "observe")}">${s ? esc(advice[s.recommendation] ?? "暂无建议") : "— 暂无建议"}</div><div class="metric-subtitle">${esc(s?.reason ?? "等待真实采集数据")}</div><details class="strategy-reason"><summary>查看判断依据</summary><p>${esc(s?.reason ?? "暂无判断依据")}</p>${s ? `<p>有价样本 ${f.priced ?? "—"} · 可比样本 ${f.comparable ?? "—"}<br>上涨 ${f.up ?? "—"} / 下跌 ${f.down ?? "—"}<br>策略时间 ${datetime(s.observed_at)}</p>` : ""}</details></article>
    </div>
    <section class="card trend-card"><div class="section-heading"><div><div class="trend-title"><h2>未来价格走势</h2><div class="period-control" role="group" aria-label="走势观察周期">${[14, 30].map((n) => `<button data-horizon="${n}" aria-pressed="${chartHorizon === n}">未来${n}天</button>`).join("")}</div></div><p class="muted">按入住日期观察</p></div><span class="quiet-label">人民币 / 元</span></div><div id="trend-chart">${chart(m.curve.slice(0, chartHorizon + 1))}</div><p class="chart-note">缺失日期留空，不插值。每个日期使用独立真实快照，30家市场与全市场分别统计。</p></section>
    <section class="hotel-section"><div class="section-heading"><div><h2>酒店市场</h2><p class="muted">${esc(m.checkin)} 入住 · ${m.hotels.length}家真实酒店</p></div><span class="quiet-label">平台排名与起售价</span></div><div class="category-tabs" role="group" aria-label="酒店分类"><button data-category="" aria-pressed="true" class="active">全部 <span>${m.hotels.length}</span></button>${Object.entries(
      categories,
    )
      .map(
        ([k, n]) =>
          `<button data-category="${k}" aria-pressed="false">${n} <span>${m.hotels.filter((h) => h.category === k).length}</span></button>`,
      )
      .join("")}</div><div id="hotel-table"></div></section>
    <details class="strategy-history"><summary>策略历史 <span>${m.strategy_history.length}条真实记录</span></summary>${table(
      ["产生时间", "建议", "依据", "当时我的酒店价格"],
      m.strategy_history.map(
        (v) =>
          `<tr><td>${datetime(v.created_at)}</td><td>${esc(advice[v.recommendation])}</td><td>${esc(v.reason)}</td><td>${money(v.my_price)}</td></tr>`,
      ),
    )}</details>`;
  $("#scope").value = filter.scope;
  document
    .querySelectorAll("[data-horizon]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          action(() => setChartHorizon(Number(b.dataset.horizon)))),
    );
  $("#checkin").value = m.checkin;
  const query = () => {
    filter = {
      scope: $("#scope").value,
      horizon: 30,
      inclusive: 1,
      city: $("#city").value,
      keyword: $("#keyword").value,
      checkin: $("#checkin").value,
    };
    load();
  };
  $("#query").onclick = query;
  ["scope", "checkin"].forEach((id) => ($("#" + id).onchange = query));
  document.querySelectorAll("[data-category]").forEach(
    (button) =>
      (button.onclick = () => {
        document.querySelectorAll("[data-category]").forEach((b) => {
          b.classList.toggle("active", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
        renderMarketHotels(button.dataset.category);
      }),
  );
  renderMarketHotels();
  bindTips($("#view"));
}
function renderMarketHotels(category = "") {
  const list = marketData.hotels.filter(
    (h) => !category || h.category === category,
  );
  const platforms = [
    ...new Set([
      marketData.platform,
      ...marketData.hotels.map((h) => h.platform),
    ]),
  ];
  const groups = new Map();
  list.forEach((h) => {
    const key = h.standard_hotel_id ?? `${h.platform}/${h.hotel_id}`;
    if (!groups.has(key))
      groups.set(key, {
        name: h.standard_name ?? h.hotel_name,
        category: h.category,
        cells: new Map(),
      });
    groups.get(key).cells.set(h.platform, h);
  });
  const tip = (h) =>
    esc(
      `${platformName(h.platform)}\n${h.hotel_name}\nHotel ID: ${h.hotel_id}\n划线价: ${money(h.original_price)}\n活动: ${(h.activity_tags ?? []).join(" / ") || "—"}\n起售价: ${money(h.display_price)}`,
    );
  $("#hotel-table").innerHTML =
    `<div class="table market-table"><table><thead><tr><th rowspan="2" scope="col" class="hotel-name-head">酒店名称</th>${platforms.map((p) => `<th colspan="2" scope="colgroup">${esc(platformName(p))}</th>`).join("")}</tr><tr>${platforms.map((p) => `<th scope="col">${esc(platformName(p))}排名</th><th scope="col">${esc(platformName(p))}起售价</th>`).join("")}</tr></thead><tbody>${
      [...groups.values()]
        .map(
          (row) =>
            `<tr class="${row.category === "mine" ? "mine-row" : ""}"><td><div class="hotel-name">${esc(row.name)}</div><span class="category-label ${esc(row.category)}">${categories[row.category] ?? categories.other}</span></td>${platforms
              .map((p) => {
                const h = row.cells.get(p);
                return h
                  ? `<td><span tabindex="0" class="tip rank" data-tip="${tip(h)}">${h.rank}<small class="ad-label">${h.is_ad ? "广告" : ""}</small></span></td><td><span tabindex="0" class="tip price" data-tip="${tip(h)}">${money(h.display_price)}</span></td>`
                  : "<td>—</td><td>—</td>";
              })
              .join("")}</tr>`,
        )
        .join("") ||
      `<tr><td colspan="${1 + platforms.length * 2}" class="empty">暂无真实数据</td></tr>`
    }</tbody></table></div>`;
  bindTips($("#hotel-table"));
}
const scopeFields = `<label>采集范围<select name="scope"><option value="top30">30家</option><option value="custom">自定义</option><option value="all">全市场</option></select></label><label>自定义数量<input type="number" name="limit" value="30" min="1" max="2000"></label>`;
const targetFields = `<label>平台<select name="platform"><option value="ctrip">携程</option></select></label><label>城市<input name="city" value="咸宁" required></label><label>关键词<input name="keyword" value="中心花坛"></label>`;
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
const nextDay = (d) =>
  new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
async function tasks() {
  const [tasks, plans, runtime] = await Promise.all([
    api("tasks"),
    api("plans"),
    api("runtime"),
  ]);
  $("#view").innerHTML =
    `<h2>今日生产运行状态</h2><p class="muted">${runtime.day} · Asia/Shanghai · 当前启用计划的今日窗口任务，含尚未到期任务；独立任务与停用验收计划不计入。${datetime(runtime.at)} 更新，使用页面刷新获取最新状态。</p>${table(["计划任务", "COMPLETED", "PARTIAL", "FAILED", "待执行 / 运行中", "成功率（终态）", "关联Attempt次数"], [`<tr><td>${runtime.total}</td><td>${runtime.statuses.COMPLETED}</td><td>${runtime.statuses.PARTIAL}</td><td>${runtime.statuses.FAILED}</td><td>${runtime.statuses.PENDING} / ${runtime.statuses.RUNNING}</td><td>${runtime.success_rate == null ? "—" : (runtime.success_rate * 100).toFixed(1) + "%"}<small>COMPLETED / ${runtime.terminal}个终态任务；PARTIAL不算成功</small></td><td>${runtime.attempts}</td></tr>`])}<p>最近成功采集：${datetime(runtime.last_success_at)}（当前启用计划，COMPLETED上传时间）</p><h3>当前在线设备（${runtime.online_devices.length}）</h3>${table(
      ["设备", "状态", "最近心跳", "最近错误"],
      runtime.online_devices.map(
        (d) =>
          `<tr><td>${esc(d.name ?? "未命名")}<small>${esc(d.id)}</small></td><td>${d.running ? "执行中" : "空闲"}</td><td>${datetime(d.last_seen_at)}</td><td>${esc(d.last_error)}</td></tr>`,
      ),
    )}<h3>主要错误代码</h3>${table(
      ["来源", "错误代码", "次数"],
      runtime.errors.map(
        (e) =>
          `<tr><td>${esc(e.source)}</td><td>${esc(e.code)}</td><td>${e.count}</td></tr>`,
      ),
    )}<p class="muted">Task与Attempt错误分别计数，不相加；保留真实失败。ATTEMPT_TIMEOUT为生产观察项。</p><h2>立即采集</h2><form id="task-form" class="form">${targetFields}<label>入住<input type="date" name="checkin" value="${nextDay(today())}" min="${today()}" required></label><label>退房<input type="date" name="checkout" value="${nextDay(nextDay(today()))}" required></label>${scopeFields}<button class="primary">发布任务</button></form><h2>自动计划 · 滚动日期窗口</h2><p class="muted">业务时区 Asia/Shanghai；D0 10次；D+1 6次；D+2～3 4次；D+4～7 2次；D+8～14 1次；D+15～30 隔日1次。窗口内按设备负载错峰，最多5次Attempt，窗口过期不补采。06:00–08:00无默认窗口。</p><form id="plan-form" class="form">${targetFields}${scopeFields}<label>今日及未来日期<select name="horizon"><option value="14">14天</option><option value="30">30天</option></select></label><button>建立启用计划</button></form>${table(
      ["计划", "城市 / 关键词", "范围", "启用状态"],
      plans.map(
        (p) =>
          `<tr><td>${esc(p.id)}<small>今日及未来${p.horizon}天</small></td><td>${esc(p.city)} / ${esc(p.keyword)}</td><td>${p.scope === "all" ? "全市场" : p.collection_limit + "家"}</td><td><button data-plan="${p.id}" data-enabled="${p.enabled}">${p.enabled ? "停用" : "启用"}</button></td></tr>`,
      ),
    )}<h2>任务记录</h2>${table(
      ["创建时间", "任务 / 状态", "目标", "阶段结果", "Attempt", "窗口截止"],
      tasks.map(
        (t) =>
          `<tr><td>${datetime(t.created_at)}</td><td><button data-task="${t.id}">${t.status}</button><small>${esc(t.id)}</small></td><td>${esc(t.city)} / ${esc(t.keyword)}<small>${t.checkin} · ${t.scope === "all" ? "全市场" : t.collection_limit + "家"}</small></td><td>${esc(t.market_status)} / 详情${t.detail_success ?? 0}/${t.detail_total ?? 0}<small>${esc(t.error_code)}</small></td><td>${t.attempts}/5${t.capacity_warning ? " · 容量不足" : ""}</td><td>${datetime(t.window_end)}</td></tr>`,
      ),
    )}<div id="task-detail"></div>`;
  $("#task-form [name=checkin]").onchange = (e) => {
    $("#task-form [name=checkout]").value = nextDay(e.target.value);
  };
  for (const [id, path] of [
    ["task-form", "tasks"],
    ["plan-form", "plans"],
  ])
    $("#" + id).onsubmit = (e) => {
      e.preventDefault();
      action(async () => {
        const b = Object.fromEntries(new FormData(e.target));
        await api(path, "POST", b);
        await load();
      });
    };
  document.querySelectorAll("[data-plan]").forEach(
    (b) =>
      (b.onclick = () =>
        action(async () => {
          await api("plans/" + b.dataset.plan, "PATCH", {
            enabled: b.dataset.enabled !== "1",
          });
          await load();
        })),
  );
  document.querySelectorAll("[data-task]").forEach(
    (b) =>
      (b.onclick = () =>
        action(async () => {
          const d = await api("tasks/" + b.dataset.task);
          $("#task-detail").innerHTML =
            `<div class="card detail"><h2>完整 Attempt 时间线</h2><pre>${esc(JSON.stringify(d, null, 2))}</pre></div>`;
        })),
  );
}
async function devices() {
  const data = await api("devices");
  $("#view").innerHTML =
    `<p class="muted">首次安装待批准。设备凭证独立于设备 ID，禁用立即阻止正式工作。</p>${table(
      ["设备", "永久设备 ID", "状态", "最近心跳", "操作"],
      data.map(
        (d) =>
          `<tr><td>${esc(d.name ?? "未命名")}<small>${esc(d.version)}</small></td><td>${esc(d.id)}</td><td>${esc(d.display_status)}<small>${esc(errorLabel(d.last_error))}</small></td><td>${datetime(d.last_seen_at)}</td><td><button data-diagnostics="${d.id}">运行概况</button> <button data-name="${d.id}">改名</button> <button data-device="${d.id}" data-status="${d.status === "approved" ? "disabled" : "approved"}">${d.status === "pending" ? "批准" : d.status === "approved" ? "禁用" : "恢复"}</button></td></tr>`,
      ),
    )}`;
  $("#view").insertAdjacentHTML(
    "beforeend",
    '<div id="device-diagnostics"></div>',
  );
  document.querySelectorAll("[data-diagnostics]").forEach(
    (b) =>
      (b.onclick = () =>
        action(async () => {
          const data = await api(
            "devices/" +
              encodeURIComponent(b.dataset.diagnostics) +
              "/diagnostics",
          );
          $("#device-diagnostics").innerHTML = diagnosticsView(data);
        })),
  );
  document.querySelectorAll("[data-device]").forEach(
    (b) =>
      (b.onclick = () =>
        action(async () => {
          await api("devices/" + b.dataset.device, "PATCH", {
            status: b.dataset.status,
          });
          await load();
        })),
  );
  document.querySelectorAll("[data-name]").forEach(
    (b) =>
      (b.onclick = () => {
        const name = prompt("云端设备名称");
        if (name)
          action(async () => {
            await api("devices/" + b.dataset.name, "PATCH", { name });
            await load();
          });
      }),
  );
}
async function hotels() {
  const d = await api("hotels");
  $("#view").innerHTML =
    `<h2>POAI 标准酒店</h2><form class="form" id="hotel-form"><label>标准名称<input name="name" required></label><label>分类<select name="category">${Object.entries(
      categories,
    )
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join("")}</select></label><button>创建酒店</button></form>${table(
      ["永久 标准酒店 ID", "标准名称", "分类", "操作"],
      d.standard_hotels.map(
        (h) =>
          `<tr><td>${esc(h.id)}</td><td>${esc(h.name)}</td><td>${categories[h.category]}</td><td><button data-edit="${h.id}">修改</button></td></tr>`,
      ),
    )}<h2>真实平台酒店 · 映射由你确认</h2>${table(
      ["平台原始名称", "平台 / Hotel ID", "映射 / 分类", "操作"],
      d.platform_hotels.map(
        (h) =>
          `<tr><td>${esc(h.original_name)}</td><td>${esc(h.platform)} / ${esc(h.hotel_id)}</td><td>${esc(h.standard_name)}<small>${categories[h.category] ?? "市场其他"}</small></td><td>${h.standard_hotel_id ? `<button data-unlink="${esc(h.hotel_id)}" data-platform="${esc(h.platform)}">解除映射</button>` : `<select data-choice="${esc(h.hotel_id)}"><option value="">选择 标准酒店</option>${d.standard_hotels.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select> <button data-link="${esc(h.hotel_id)}" data-platform="${esc(h.platform)}">确认关联</button>`}</td></tr>`,
      ),
    )}`;
  $("#hotel-form").onsubmit = (e) => {
    e.preventDefault();
    action(async () => {
      await api(
        "standard-hotels",
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      await load();
    });
  };
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        const h = d.standard_hotels.find((x) => x.id === b.dataset.edit),
          name = prompt("标准名称", h.name),
          category = prompt(
            "分类：mine我的酒店 / core核心竞品 / competitor竞品 / watch观察 / other其他",
            h.category,
          );
        if (name && category)
          action(async () => {
            await api("standard-hotels/" + h.id, "PATCH", { name, category });
            await load();
          });
      }),
  );
  document.querySelectorAll("[data-link]").forEach(
    (b) =>
      (b.onclick = () =>
        action(async () => {
          const select = [...document.querySelectorAll("[data-choice]")].find(
            (x) => x.dataset.choice === b.dataset.link,
          );
          if (!select.value) throw new Error("先选择 标准酒店");
          await api("mappings", "POST", {
            platform: b.dataset.platform,
            hotel_id: b.dataset.link,
            standard_hotel_id: select.value,
            confirm: true,
          });
          await load();
        })),
  );
  document.querySelectorAll("[data-unlink]").forEach(
    (b) =>
      (b.onclick = () =>
        action(async () => {
          await api(
            `mappings?platform=${encodeURIComponent(b.dataset.platform)}&hotel_id=${encodeURIComponent(b.dataset.unlink)}`,
            "DELETE",
          );
          await load();
        })),
  );
}
async function action(fn) {
  const tooltip = $("#market-tooltip");
  if (tooltip) tooltip.hidden = true;
  $("#error").textContent = "";
  try {
    await fn();
  } catch (e) {
    $("#error").textContent = e.message;
  }
}
async function load() {
  await action(async () => {
    $("#title").textContent = {
      market: "市场",
      tasks: "任务",
      hotels: "酒店",
      devices: "设备",
    }[page];
    document
      .querySelectorAll("[data-page]")
      .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    await { market, tasks, hotels, devices }[page]();
  });
}
document.querySelectorAll("[data-page]").forEach(
  (b) =>
    (b.onclick = () => {
      page = b.dataset.page;
      load();
    }),
);
$("#refresh").onclick = load;
load();
