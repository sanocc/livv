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
  filter = { city: "咸宁", keyword: "中心花坛", scope: "top30", horizon: 14 },
  marketData = null;
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
function chart(curve) {
  const series = [
    ["minimum", "#a0b4bd", "市场最低价"],
    ["median", "#21877f", "市场中位价"],
    ["maximum", "#d6a76a", "市场最高价"],
    ["myPrice", "#596eae", "我的酒店起售价"],
  ];
  const values = curve
      .flatMap((x) => series.map(([k]) => x[k]))
      .filter((x) => x != null),
    max = Math.max(1, ...values) * 1.1,
    w = 1000,
    h = 170,
    x = (i) => 30 + (i * (w - 60)) / Math.max(curve.length - 1, 1),
    y = (p) => h - (p / max) * (h - 20);
  let svg =
    '<svg class="chart" viewBox="0 0 1000 220" role="img" aria-label="未来日期价格走势，缺失数据不插值">';
  for (let i = 0; i < 4; i++)
    svg += `<line x1="30" y1="${20 + i * 50}" x2="970" y2="${20 + i * 50}"/>`;
  for (const [k, color] of series) {
    let segment = [];
    const flush = () => {
      if (segment.length > 1)
        svg += `<polyline fill="none" stroke="${color}" stroke-width="2" points="${segment.join(" ")}"/>`;
      segment = [];
    };
    curve.forEach((v, i) => {
      if (v[k] == null) {
        flush();
        return;
      }
      segment.push(`${x(i)},${y(v[k])}`);
      svg += `<circle cx="${x(i)}" cy="${y(v[k])}" r="3" fill="${color}"><title>${v.checkin} ${money(v[k])}</title></circle>`;
    });
    flush();
  }
  curve.forEach((v, i) => {
    if (curve.length <= 14 || i % 2 === 0)
      svg += `<text x="${x(i)}" y="200" text-anchor="middle">${v.checkin.slice(5)}</text>`;
  });
  return `<div class="legend">${series.map(([, c, n]) => `<span style="color:${c}">${n}</span>`).join("")}</div>${svg}</svg>`;
}
async function market() {
  const params = new URLSearchParams(filter);
  marketData = await api("market?" + params);
  const m = marketData,
    s = m.snapshot,
    f = s?.facts ?? {};
  $("#view").innerHTML =
    `<div class="filters"><label>市场范围<select id="scope"><option value="top30">30家市场</option><option value="all">全市场</option></select></label><label>观察范围<select id="horizon"><option value="14">未来14天</option><option value="30">未来30天</option></select></label><label>城市<input id="city" value="${esc(filter.city)}"></label><label>关键词<input id="keyword" value="${esc(filter.keyword)}"></label><label>入住日期<select id="checkin">${m.curve.map((x) => `<option value="${x.checkin}">${x.checkin}${x.snapshot_id ? " · 有数据" : ""}</option>`).join("")}</select></label><button id="query">查询</button></div><div class="metrics"><div class="card">我的酒店起售价<div class="metric">${money(m.hotels.find((x) => x.category === "mine")?.display_price)}</div><small class="muted">${s ? datetime(s.observed_at) : "未采集"}</small></div><div class="card">市场起售价中位数<div class="metric">${money(f.median)}</div><small class="muted">${s ? `${s.market_count}家真实酒店 · 列表${s.market_status}` : "暂无真实数据"}</small></div><div class="card">市场价格策略建议<div class="metric">${s ? advice[s.recommendation] : "— 暂无建议"}</div><small class="muted">${esc(s?.reason ?? "等待采集数据")}</small></div></div><div class="card detail"><h2>未来${m.horizon}天价格</h2>${chart(m.curve)}<small class="muted">缺失日期留空。30家市场与全市场分别统计。</small></div><div class="row"><h2>酒店市场</h2><select id="category"><option value="">全部分类</option>${Object.entries(
      categories,
    )
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join(
        "",
      )}</select></div><div id="hotel-table"></div><h2>策略历史</h2>${table(
      ["产生时间", "建议", "依据", "当时我的酒店价格"],
      m.strategy_history.map(
        (x) =>
          `<tr><td>${datetime(x.created_at)}</td><td>${advice[x.recommendation]}</td><td>${esc(x.reason)}</td><td>${money(x.my_price)}</td></tr>`,
      ),
    )}`;
  $("#scope").value = filter.scope;
  $("#horizon").value = filter.horizon;
  $("#checkin").value = m.checkin;
  $("#query").onclick = () => {
    filter = {
      scope: $("#scope").value,
      horizon: $("#horizon").value,
      city: $("#city").value,
      keyword: $("#keyword").value,
      checkin: $("#checkin").value,
    };
    load();
  };
  $("#category").onchange = renderMarketHotels;
  renderMarketHotels();
}
function renderMarketHotels() {
  const list = marketData.hotels.filter(
    (x) => !$("#category").value || x.category === $("#category").value,
  );
  const tip = (h) =>
    esc(
      `携程\n${h.hotel_name}\nHotel ID: ${h.hotel_id}\n划线价: ${money(h.original_price)}\n活动: ${(h.activity_tags ?? []).join(" / ") || "—"}\n起售价: ${money(h.display_price)}`,
    );
  $("#hotel-table").innerHTML = table(
    ["酒店名称", "分类", "排名", "起售价"],
    list.map(
      (h) =>
        `<tr><td>${esc(h.standard_name)}<small>${esc(h.hotel_id)}</small></td><td><span class="pill">${categories[h.category]}</span></td><td><span tabindex="0" class="tip" data-tip="${tip(h)}">${h.rank}${h.is_ad ? " · 广告" : ""}</span></td><td><span tabindex="0" class="tip" data-tip="${tip(h)}">${money(h.display_price)}</span></td></tr>`,
    ),
  );
  // One platform group spans its horizontal rank and starting-price columns.
  $("#hotel-table table thead").insertAdjacentHTML(
    "afterbegin",
    '<tr><th colspan="2" scope="colgroup">酒店</th><th colspan="2" scope="colgroup">携程</th></tr>',
  );
  document.querySelectorAll("#hotel-table .tip").forEach((cell) => {
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
          Math.min(rect.bottom + 6, window.innerHeight - tip.offsetHeight - 8),
        ) + "px";
    };
    const hide = () => {
      const tip = $("#market-tooltip");
      if (tip) tip.hidden = true;
    };
    cell.onmouseenter = cell.onfocus = show;
    cell.onmouseleave = cell.onblur = hide;
    cell.onkeydown = (e) => {
      if (e.key === "Escape") hide();
    };
  });
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
    `<p class="muted">首次安装待批准。设备凭证独立于 Device ID，禁用立即阻止正式工作。</p>${table(
      ["设备", "永久 Device ID", "状态", "最近心跳", "操作"],
      data.map(
        (d) =>
          `<tr><td>${esc(d.name ?? "未命名")}<small>${esc(d.version)}</small></td><td>${esc(d.id)}</td><td>${d.display_status}<small>${esc(d.last_error)}</small></td><td>${datetime(d.last_seen_at)}</td><td><button data-name="${d.id}">改名</button> <button data-device="${d.id}" data-status="${d.status === "approved" ? "disabled" : "approved"}">${d.status === "pending" ? "批准" : d.status === "approved" ? "禁用" : "恢复"}</button></td></tr>`,
      ),
    )}`;
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
    `<h2>LIVV 标准酒店</h2><form class="form" id="hotel-form"><label>标准名称<input name="name" required></label><label>分类<select name="category">${Object.entries(
      categories,
    )
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join("")}</select></label><button>创建酒店</button></form>${table(
      ["永久 LIVV Hotel ID", "标准名称", "分类", "操作"],
      d.livv_hotels.map(
        (h) =>
          `<tr><td>${esc(h.id)}</td><td>${esc(h.name)}</td><td>${categories[h.category]}</td><td><button data-edit="${h.id}">修改</button></td></tr>`,
      ),
    )}<h2>真实平台酒店 · 映射由你确认</h2>${table(
      ["平台原始名称", "平台 / Hotel ID", "映射 / 分类", "操作"],
      d.platform_hotels.map(
        (h) =>
          `<tr><td>${esc(h.original_name)}</td><td>${esc(h.platform)} / ${esc(h.hotel_id)}</td><td>${esc(h.standard_name)}<small>${categories[h.category] ?? "市场其他"}</small></td><td>${h.livv_hotel_id ? `<button data-unlink="${esc(h.hotel_id)}" data-platform="${esc(h.platform)}">解除映射</button>` : `<select data-choice="${esc(h.hotel_id)}"><option value="">选择 LIVV Hotel</option>${d.livv_hotels.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select> <button data-link="${esc(h.hotel_id)}" data-platform="${esc(h.platform)}">确认关联</button>`}</td></tr>`,
      ),
    )}`;
  $("#hotel-form").onsubmit = (e) => {
    e.preventDefault();
    action(async () => {
      await api(
        "livv-hotels",
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      await load();
    });
  };
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        const h = d.livv_hotels.find((x) => x.id === b.dataset.edit),
          name = prompt("标准名称", h.name),
          category = prompt(
            "分类：mine我的酒店 / core核心竞品 / competitor竞品 / watch观察 / other其他",
            h.category,
          );
        if (name && category)
          action(async () => {
            await api("livv-hotels/" + h.id, "PATCH", { name, category });
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
          if (!select.value) throw new Error("先选择 LIVV Hotel");
          await api("mappings", "POST", {
            platform: b.dataset.platform,
            hotel_id: b.dataset.link,
            livv_hotel_id: select.value,
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
