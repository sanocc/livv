import { errorLabel, statusLabel } from "./helper-labels.js";
const esc = (value) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  value == null
    ? "—"
    : `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
export const timeLabel = (value) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
const dayLabel = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
const nextDay = (date) =>
  new Date(Date.parse(date + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
const name = (h) => h.standard_name ?? h.hotel_name;
const platformName = (p) => (p === "ctrip" ? "携程" : p);
const colors = [
  "#3169df",
  "#39958a",
  "#b4773f",
  "#865ab7",
  "#bc526d",
  "#657d31",
  "#357f9f",
  "#7d6854",
  "#63718e",
  "#a3781c",
  "#985579",
];
export function changeSummary(point, hotels = point.prices) {
  const keys = new Set(hotels.map((h) => `${h.platform}/${h.hotel_id}`));
  const prices = point.prices.filter((h) =>
    keys.has(`${h.platform}/${h.hotel_id}`),
  );
  const count = (condition) => prices.filter(condition).length;
  return `${prices.length} 家中 ${count((p) => p.change != null && p.change > 0)} 家涨价 · ${count((p) => p.change != null && p.change < 0)} 家降价 · ${count((p) => p.change === 0)} 家无变化 · ${count((p) => p.change == null)} 家缺价或无基准`;
}
export function historyChart(data) {
  const width = 960,
    left = 60,
    right = 930,
    bottom = 244;
  const start = Date.parse(data.observation_date + "T00:00:00+08:00");
  const x = (time) =>
    left + ((Date.parse(time) - start) / 86400000) * (right - left);
  const prices = data.observations
    .flatMap((o) => o.prices.map((p) => p.display_price))
    .filter((p) => p != null);
  const maximum = Math.ceil((Math.max(1, ...prices) * 1.1) / 100) * 100;
  const y = (price) => bottom - (price / maximum) * 210;
  let svg = `<svg class="intraday-chart" viewBox="0 0 ${width} 290" role="group" aria-label="日内酒店列表起售价，按真实观察时间绘制，缺失点断线">`;
  for (let i = 0; i <= 4; i++) {
    const price = (maximum * i) / 4;
    svg += `<line class="history-grid" x1="${left}" x2="${right}" y1="${y(price)}" y2="${y(price)}"/><text x="48" y="${y(price) + 4}" text-anchor="end">${money(price)}</text>`;
    const axisX = left + (i * (right - left)) / 4;
    svg += `<text x="${axisX}" y="278" text-anchor="middle">${String(i * 6).padStart(2, "0")}:00</text>`;
  }
  data.hotels.forEach((hotel, index) => {
    let segment = [];
    const flush = () => {
      if (segment.length > 1)
        svg += `<path class="history-line" d="${segment.map(([a, b], i) => `${i ? "L" : "M"}${a},${b}`).join(" ")}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="${hotel.category === "mine" ? 3 : 2}"/>`;
      segment = [];
    };
    data.observations.forEach((point, i) => {
      const before = data.observations[i - 1];
      if (
        before &&
        (data.unobserved_tasks ?? []).some(
          (task) =>
            task.due_at >= before.observed_at &&
            task.due_at <= point.observed_at,
        )
      )
        flush();
      const price =
        point.prices.find(
          (p) => p.platform === hotel.platform && p.hotel_id === hotel.hotel_id,
        )?.display_price ?? null;
      if (price == null) {
        flush();
        return;
      }
      segment.push([x(point.observed_at), y(price)]);
      svg += `<circle class="history-dot" data-index="${i}" cx="${x(point.observed_at)}" cy="${y(price)}" r="3.5" fill="${colors[index % colors.length]}"/>`;
    });
    flush();
  });
  data.observations.forEach((point, i) => {
    const here = x(point.observed_at),
      previous = i ? x(data.observations[i - 1].observed_at) : left,
      next =
        i < data.observations.length - 1
          ? x(data.observations[i + 1].observed_at)
          : right;
    const a = i ? (previous + here) / 2 : left,
      b = i < data.observations.length - 1 ? (next + here) / 2 : right;
    svg += `<g class="history-column"><line class="history-crosshair" x1="${here}" x2="${here}" y1="25" y2="${bottom}"/><rect class="intraday-hit" data-index="${i}" x="${a}" y="25" width="${Math.max(1, b - a)}" height="${bottom - 25}" fill="transparent" tabindex="0" aria-label="${esc(timeLabel(point.observed_at))}，${esc(point.market_status)}，${esc(changeSummary(point))}"/></g>`;
  });
  svg += "</svg>";
  return `<div class="intraday-legend">${data.hotels.map((h, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${esc(name(h))}${h.category === "mine" ? " · 我的酒店" : ""}<small>${esc(platformName(h.platform))} / ${esc(h.hotel_id)}</small></span>`).join("")}</div><div class="intraday-plot"><div class="intraday-scroll">${svg}</div>${prices.length ? "" : '<p class="intraday-empty">暂无真实价格数据；请调整日期或酒店选择</p>'}</div>`;
}
export function historyTooltip(point, competitors) {
  const status =
    point.market_status === "SUCCESS"
      ? "列表成功"
      : point.market_status === "PARTIAL"
        ? "列表部分采集"
        : point.market_status;
  return `<strong>${esc(dayLabel(point.observed_at))} ${esc(timeLabel(point.observed_at))}</strong><p>${esc(status)} · 任务${esc(statusLabel(point.task_status))}</p><div class="history-tip-table"><table><thead><tr><th>酒店 / 平台身份</th><th>当前 / 前价</th><th>变化 / 幅度</th></tr></thead><tbody>${point.prices.map((p) => `<tr><td>${esc(name(p))}<small>${esc(platformName(p.platform))} · Hotel ID: ${esc(p.hotel_id)}</small></td><td><b>${money(p.display_price)}</b><small>前价 ${money(p.previous_price)}</small></td><td>${p.change == null ? "—" : `${p.change > 0 ? "+" : p.change < 0 ? "−" : ""}${money(Math.abs(p.change))}`}<small>${p.change_ratio == null ? "—" : `${p.change_ratio > 0 ? "+" : ""}${(p.change_ratio * 100).toFixed(1)}%`}</small></td></tr><tr class="history-baseline"><td colspan="3">${p.missing_reason === "OBSERVATION_MISSING" ? "本次未观察到该酒店 · " : p.missing_reason === "PRICE_MISSING" ? "本次价格缺失 · " : ""}${p.previous_observed_at ? `基准 ${esc(dayLabel(p.previous_observed_at))} ${esc(timeLabel(p.previous_observed_at))}` : "暂无此前有效观察"}</td></tr>`).join("")}</tbody></table></div><p class="history-tip-summary">${esc(changeSummary(point, competitors))}</p>`;
}
let version = 0;
let saved = null;
export function dispose() {
  version++;
}
export async function mount(root, { api, context }) {
  const generation = ++version;
  const active = () => generation === version && root.isConnected;
  let request = 0,
    candidates = [],
    selected = new Set(),
    mine = null;
  const state = saved
    ? { ...saved }
    : {
        observation_date: dayLabel(new Date()),
        checkin: context.checkin ?? dayLabel(new Date()),
        platform: context.platform ?? "ctrip",
        city: context.city,
        keyword: context.keyword,
        scope: context.scope,
        collection_limit:
          context.scope === "top30" ? 30 : (context.limit ?? 30),
      };
  state.checkout ??= nextDay(state.checkin);
  root.innerHTML = `<section class="intraday-page"><form class="history-filters"><label>观察日期<input name="observation_date" type="date" value="${esc(state.observation_date)}" required></label><label>入住日期<input name="checkin" type="date" value="${esc(state.checkin)}" required></label><label>退房日期<input name="checkout" type="date" value="${esc(state.checkout)}" required></label><label>平台<select name="platform"></select></label><label>城市<input name="city" value="${esc(state.city)}" required></label><label>关键词<input name="keyword" value="${esc(state.keyword)}"></label><label>市场范围<select name="scope"><option value="top30">30家市场</option><option value="all">全市场</option><option value="custom">自定义</option></select></label><label class="history-limit">采集数量<input name="collection_limit" type="number" min="1" max="2000" value="${esc(state.collection_limit)}"></label><button class="primary" type="submit">查询轨迹</button></form><details class="history-selector" open><summary>选择酒店 <span class="history-selection-count"></span></summary><div class="history-select-tools"><label>搜索酒店<input class="history-hotel-search" type="search" placeholder="酒店名称 / Hotel ID"></label><div class="history-presets" role="group" aria-label="快捷选择竞品">${[3, 5, 10].map((n) => `<button type="button" data-count="${n}" aria-pressed="false">${n} 家</button>`).join("")}</div><span class="history-mine"></span></div><p class="history-selection-note">优先选择当前核心竞品；最多 10 家。可靠映射的我的酒店单独显示，不占竞品数量。</p><div class="history-hotel-options"></div></details><p class="history-error" role="alert"></p><div class="history-results" aria-live="polite"></div><p class="history-semantics">酒店列表起售价历史 · 人民币；不是完整 Rate Plan，也不是严格同房型同套餐比较。观察时间为列表快照级时间，不代表每家酒店在同一秒读取。缺失留空，不补零、不插值。</p><details class="history-schedule"><summary>实际采集时间说明</summary><p>D0 默认 10 个窗口；D+1 为 6 个；D+2～3 为 4 个；D+4～7 为 2 个；D+8～14 为 1 个；D+15～30 隔日 1 次。没有默认 06–08 窗口。实际时间受窗口内错峰、设备状态、领取和重试影响，不保证整点或每窗成功。</p></details></section>`;
  const find = (s) => root.querySelector(s),
    form = find("form"),
    results = find(".history-results");
  const field = (n) => form.elements.namedItem(n);
  field("scope").value = state.scope;
  const visibleHotels = () =>
    candidates.filter(
      (h) =>
        h.platform === state.platform &&
        (mine == null || h.hotel_id !== mine.hotel_id),
    );
  const updateScope = () => {
    find(".history-limit").hidden = field("scope").value !== "custom";
  };
  updateScope();
  const defaultSelection = (count) => {
    selected = new Set(
      visibleHotels()
        .slice(0, count)
        .map((h) => h.hotel_id),
    );
    root
      .querySelectorAll("[data-count]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.count) === count),
        ),
      );
  };
  const renderOptions = () => {
    const query = find(".history-hotel-search")
      .value.trim()
      .toLocaleLowerCase("zh-CN");
    const options = visibleHotels().filter((h) =>
      [h.standard_name, h.original_name, h.hotel_id].some((v) =>
        String(v ?? "")
          .toLocaleLowerCase("zh-CN")
          .includes(query),
      ),
    );
    find(".history-selection-count").textContent =
      `${selected.size} 家竞品${mine ? " + 我的酒店" : ""}`;
    find(".history-mine").textContent = mine
      ? `固定显示：${mine.standard_name}`
      : "暂无唯一可靠的我的酒店映射";
    find(".history-hotel-options").innerHTML =
      options
        .map(
          (h) =>
            `<label><input type="checkbox" value="${esc(h.hotel_id)}" ${selected.has(h.hotel_id) ? "checked" : ""} ${selected.size >= 10 && !selected.has(h.hotel_id) ? "disabled" : ""}><span>${esc(h.standard_name ?? h.original_name)}<small>${h.category === "core" ? "核心竞品 · " : ""}${esc(platformName(h.platform))} · ${esc(h.hotel_id)}</small></span></label>`,
        )
        .join("") || '<p class="muted">没有匹配的酒店</p>';
    find(".history-hotel-options")
      .querySelectorAll("input")
      .forEach(
        (box) =>
          (box.onchange = () => {
            if (box.checked) selected.add(box.value);
            else selected.delete(box.value);
            root
              .querySelectorAll("[data-count]")
              .forEach((b) => b.setAttribute("aria-pressed", "false"));
            renderOptions();
            void reload();
          }),
      );
  };
  const preparePlatform = () => {
    const mineMatches = candidates.filter(
      (h) =>
        h.platform === state.platform &&
        h.standard_hotel_id &&
        h.category === "mine",
    );
    mine = mineMatches.length === 1 ? mineMatches[0] : null;
    defaultSelection(5);
    renderOptions();
  };
  const draw = (data) => {
    const competitors = data.hotels.filter(
      (h) =>
        !mine || h.hotel_id !== mine.hotel_id || h.platform !== mine.platform,
    );
    const latest = data.observations.at(-1);
    const effective = data.observations.filter((o) =>
      o.prices.some((p) => p.display_price != null),
    ).length;
    results.innerHTML = `<div class="history-summary"><span>${competitors.length} 家竞品${mine ? " + 我的酒店" : ""}</span><span>当日 ${effective} / ${data.observations.length} 个快照有价格</span><span>最新观察 ${latest ? esc(timeLabel(latest.observed_at)) : "—"}</span></div><p class="history-latest">${latest ? `最新点：${esc(changeSummary(latest, competitors))}` : "该观察日暂无符合口径的快照"}</p><section class="history-chart-card"><div class="section-heading"><h2>日内价格轨迹</h2><span class="muted">${esc(data.observation_date)} · Asia/Shanghai</span></div>${historyChart(data)}${data.unobserved_tasks?.length ? `<p class="history-gap-note">当日 ${data.unobserved_tasks.length} 项任务尚未形成快照（含失败、取消、待执行或执行中）；没有真实观察时间，不生成价格点。</p>` : ""}<p class="chart-note">横轴为真实时间间隔。可悬停、点击或用 Tab / 方向键查看观察点；缺价、酒店未观察到或中间任务未形成快照时断线；计划时间不作为价格点。连线不表示持续报价，涨跌基准时间见详情。</p></section>`;
    const plot = find(".intraday-plot");
    const tip = document.createElement("div");
    tip.className = "intraday-tooltip";
    tip.id = "intraday-tooltip";
    tip.role = "tooltip";
    tip.hidden = true;
    plot.append(tip);
    let current = null;
    const hide = () => {
      tip.hidden = true;
      if (current) {
        current.removeAttribute("aria-describedby");
        current.parentElement.classList.remove("active");
      }
      current = null;
      results
        .querySelectorAll(".history-dot")
        .forEach((d) => d.classList.remove("active"));
    };
    const show = (cell, event) => {
      hide();
      current = cell;
      cell.parentElement.classList.add("active");
      const index = Number(cell.dataset.index);
      tip.innerHTML = historyTooltip(data.observations[index], competitors);
      tip.hidden = false;
      cell.setAttribute("aria-describedby", tip.id);
      results
        .querySelectorAll(`.history-dot[data-index="${index}"]`)
        .forEach((d) => d.classList.add("active"));
      const bounds = plot.getBoundingClientRect(),
        rect = cell.getBoundingClientRect();
      const px = event?.clientX ?? (rect.left + rect.right) / 2,
        py = event?.clientY ?? Math.max(8, bounds.top);
      tip.style.left =
        Math.max(
          8,
          Math.min(
            px + 16 + tip.offsetWidth <= window.innerWidth - 8
              ? px + 16
              : px - tip.offsetWidth - 16,
            window.innerWidth - tip.offsetWidth - 8,
          ),
        ) + "px";
      tip.style.top =
        Math.max(
          8,
          Math.min(
            py + 16 + tip.offsetHeight <= window.innerHeight - 8
              ? py + 16
              : py - tip.offsetHeight - 16,
            window.innerHeight - tip.offsetHeight - 8,
          ),
        ) + "px";
    };
    tip.onmouseleave = () => {
      if (!current || document.activeElement !== current) hide();
    };
    const cells = [...results.querySelectorAll(".intraday-hit")];
    cells.forEach((cell, index) => {
      cell.onmouseenter = cell.onfocus = cell.onclick = (e) => show(cell, e);
      cell.onmousemove = (e) => show(cell, e);
      cell.onmouseleave = (event) => {
        if (tip.contains(event.relatedTarget)) return;
        if (document.activeElement !== cell && current === cell) hide();
      };
      cell.onblur = () => {
        if (current === cell) hide();
      };
      cell.onkeydown = (e) => {
        if (e.key === "Escape") hide();
        if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          cells[
            Math.max(
              0,
              Math.min(
                cells.length - 1,
                index + (e.key === "ArrowRight" ? 1 : -1),
              ),
            )
          ].focus();
        }
      };
    });
    find(".intraday-scroll").onscroll = () => {
      if (current && document.activeElement === current) show(current);
      else hide();
    };
  };
  const reload = async () => {
    const current = ++request;
    find(".history-error").textContent = "";
    results.setAttribute("aria-busy", "true");
    results.innerHTML = '<p class="muted">正在读取真实历史…</p>';
    const ids = [
      ...(mine ? [mine.hotel_id] : []),
      ...visibleHotels()
        .filter((h) => selected.has(h.hotel_id))
        .map((h) => h.hotel_id),
    ];
    if (!ids.length) {
      results.innerHTML = '<p class="muted">请选择至少一家酒店</p>';
      results.setAttribute("aria-busy", "false");
      return;
    }
    const params = new URLSearchParams({ ...state, hotel_ids: ids.join(",") });
    if (state.scope === "all") params.delete("collection_limit");
    if (state.scope === "top30") params.set("collection_limit", "30");
    try {
      const data = await api("market/price-history?" + params);
      if (active() && current === request) draw(data);
    } catch (error) {
      if (active() && current === request) {
        find(".history-error").textContent = /^[A-Z_]+$/.test(error.message)
          ? errorLabel(error.message)
          : error.message;
        results.innerHTML =
          '<p class="muted">未能读取历史，请检查筛选条件后重新查询。</p>';
      }
    } finally {
      if (active() && current === request)
        results.setAttribute("aria-busy", "false");
    }
  };
  const readForm = () => {
    const oldPlatform = state.platform;
    Object.assign(state, Object.fromEntries(new FormData(form)));
    saved = { ...state };
    if (oldPlatform !== state.platform) preparePlatform();
    updateScope();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    readForm();
    void reload();
  };
  [
    "observation_date",
    "checkin",
    "checkout",
    "platform",
    "scope",
    "collection_limit",
  ].forEach(
    (key) =>
      (field(key).onchange = () => {
        if (
          key === "checkin" &&
          field("checkout").value <= field("checkin").value
        )
          field("checkout").value = nextDay(field("checkin").value);
        readForm();
        void reload();
      }),
  );
  find(".history-hotel-search").oninput = renderOptions;
  root.querySelectorAll("[data-count]").forEach(
    (b) =>
      (b.onclick = () => {
        defaultSelection(Number(b.dataset.count));
        renderOptions();
        void reload();
      }),
  );
  try {
    const data = await api("hotels");
    if (!active()) return;
    candidates = data.platform_hotels.toSorted(
      (a, b) =>
        Number(b.category === "core") - Number(a.category === "core") ||
        String(a.standard_name ?? a.original_name).localeCompare(
          String(b.standard_name ?? b.original_name),
          "zh-CN",
        ),
    );
    const platforms = [
      ...new Set([state.platform, ...candidates.map((h) => h.platform)]),
    ];
    field("platform").innerHTML = platforms
      .map((p) => `<option value="${esc(p)}">${esc(platformName(p))}</option>`)
      .join("");
    field("platform").value = state.platform;
    preparePlatform();
    await reload();
  } catch (error) {
    if (active())
      find(".history-error").textContent = /^[A-Z_]+$/.test(error.message)
        ? errorLabel(error.message)
        : error.message;
  }
}
