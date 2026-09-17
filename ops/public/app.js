const CN_Q = ["", "第一季度", "第二季度", "第三季度", "第四季度"];
const NAMES = {
  1: "房间数量", 2: "综合出租率", 3: "综合房价", 4: "综合RevPAR", 5: "GOPpar",
  6: "销售间晚数",
  7: "主营业务收入", 8: "客房销售收入", 9: "会员卡销售收入",
  10: "会议销售收入", 11: "商品销售收入", 12: "餐饮收入", 13: "其他服务收入",
  14: "销售折扣与折让", 15: "中央渠道+TMC佣金", 16: "第三方平台", 17: "其他渠道",
  18: "营业净收入",
  19: "可控成本费用", 20: "人力资源费用",
  21: "① 工资", 22: "② 福利费", 23: "③ 保险费", 24: "④ 提成及奖金", 25: "⑤ 附加费用",
  26: "能耗费用", 27: "① 电费", 28: "② 水费", 29: "③ 燃料",
  30: "洗涤费用",
  31: "耗用品", 32: "① 易耗品", 33: "② 客耗品(七小件)", 34: "③ 赠饮成本",
  35: "餐饮材料成本", 36: "① 早餐材料成本", 37: "② 团餐材料成本",
  38: "会员卡进货成本",
  39: "营销费用", 40: "① 品牌推广费", 41: "② 客户维护费", 42: "③ 其他营销活动+会议成本",
  53: "主营业务利润 GOP",
  56: "非可控成本费用",
  57: "租金成本", 58: "① 租金", 59: "② 物业费", 60: "③ 宿舍租金",
  61: "积分兑换成本", 62: "增值税金及附加",
  63: "财务费用", 64: "① 手续费", 65: "② 融资利息支出",
  66: "电梯维保费", 67: "安全监管费用", 68: "收视费用", 69: "网络费用", 70: "电话费"
};
const KIDS = {
  20: [21, 22, 23, 24, 25],
  26: [27, 28, 29],
  31: [32, 33, 34],
  35: [36, 37],
  39: [40, 41, 42],
  57: [58, 59, 60],
  63: [64, 65]
};
const BLOCKS = {
  B: { title: "主营业务收入", code: "B", ids: [7, 8, 9, 10, 11, 12, 13] },
  D: { title: "营业净收入", code: "D", ids: [18] },
  C: { title: "销售折扣与折让", code: "C", ids: [14, 15, 16, 17] },
  E: { title: "可控成本费用", code: "E", ids: [19, 20, 26, 30, 31, 35, 38, 39] },
  I: { title: "非可控成本费用", code: "I", ids: [56, 57, 62, 63, 66, 69] }
};

const months = {};
let hasMonth = [];
const periods = { month: [], quarter: [], year: [] };
let grain = "month";
let cursor = 0;
const open = new Set();

const money = (n, d = 0) => {
  if (n == null || !isFinite(n)) return "—";
  const s = Math.abs(n);
  const t = d ? s.toFixed(d) : Math.round(s).toLocaleString("zh-CN");
  return (n < 0 ? "-" : "") + "¥" + t;
};
const pct = (n) => (n == null || !isFinite(n) ? "—" : (n * 100).toFixed(1) + "%");
const signed = (n, kind) => {
  if (n == null || !isFinite(n)) return '<span class="na">无</span>';
  const cls = n > 0 ? "up" : n < 0 ? "down" : "";
  const sign = n > 0 ? "+" : "";
  if (kind === "pct") return `<span class="${cls}">${sign}${(n * 100).toFixed(1)}pt</span>`;
  if (kind === "money2") return `<span class="${cls}">${sign}${money(n, 2)}</span>`;
  if (kind === "int") return `<span class="${cls}">${sign}${Math.round(n).toLocaleString("zh-CN")}</span>`;
  return `<span class="${cls}">${sign}${money(n)}</span>`;
};
const qOf = (ym) => ({ y: +ym.slice(0, 4), q: Math.ceil(+ym.slice(5) / 3) });
const list = () => periods[grain];

function cell(ws, r, c) {
  const ref = XLSX.utils.encode_cell({ r, c });
  const hit = ws[ref];
  if (hit && hit.v != null && hit.v !== "") return hit.v;
  const merges = ws["!merges"] || [];
  for (const m of merges) {
    if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
      const src = ws[XLSX.utils.encode_cell(m.s)];
      return src ? src.v : null;
    }
  }
  return null;
}
function num(v) {
  if (v == null || v === "" || v === "#DIV/0!" || v === "#Div0" || v === "#N/A") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(n) ? n : null;
}
function monthName(name) {
  const s = String(name).replace(/\s/g, "");
  const m = s.match(/^(\d{1,2})月$/);
  return m ? +m[1] : 0;
}
function yearFromName(filename, wb) {
  const m = String(filename || "").match(/(20\d{2})年/);
  if (m) return +m[1];
  const first = wb.SheetNames.find((n) => monthName(n));
  if (first) {
    const ws = wb.Sheets[first];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 12; c++) {
        const v = String(cell(ws, r, c) || "");
        const y = v.match(/(20\d{2})/);
        if (y) return +y[1];
      }
    }
  }
  return new Date().getFullYear();
}
function parseSheet(ws) {
  const byRow = {};
  for (let r = 0; r <= 120; r++) {
    const id = num(cell(ws, r, 0));
    if (!id || id < 1 || id > 90) continue;
    let name = "";
    for (let c = 4; c >= 1; c--) {
      const v = cell(ws, r, c);
      if (v != null && String(v).trim() && !/^[A-Z]$/.test(String(v).trim()) && !/^[0-9]+$/.test(String(v).trim()) && !/^[①②③④⑤]$/.test(String(v).trim())) {
        name = String(v).trim();
        break;
      }
    }
    byRow[id] = { name: NAMES[id] || name, b: num(cell(ws, r, 6)), a: num(cell(ws, r, 7)) };
  }
  return byRow;
}
function parseBook(wb, filename) {
  const y = yearFromName(filename, wb);
  const found = [];
  wb.SheetNames.forEach((name) => {
    const mon = monthName(name);
    if (!mon) return;
    const byRow = parseSheet(wb.Sheets[name]);
    if (!byRow[7] && !byRow[1] && !byRow[6]) return;
    const ym = y + "-" + String(mon).padStart(2, "0");
    found.push({
      ym, mon, year: y,
      rooms: byRow[1]?.a ?? 66,
      roomsB: byRow[1]?.b ?? 66,
      nights: byRow[6]?.a ?? 0,
      nightsB: byRow[6]?.b ?? 0,
      occ: byRow[2]?.a, occB: byRow[2]?.b,
      adr: byRow[3]?.a, adrB: byRow[3]?.b,
      revpar: byRow[4]?.a, revparB: byRow[4]?.b,
      rev: byRow[7]?.a ?? 0,
      revB: byRow[7]?.b ?? 0,
      byRow
    });
  });
  found.sort((a, b) => a.mon - b.mon);
  return found;
}

function rebuildPeriods() {
  hasMonth = Object.keys(months).sort();
  periods.month = hasMonth.map((id) => ({
    id, label: `${id.slice(0, 4)}年${+id.slice(5)}月`
  }));
  const qs = [...new Set(hasMonth.map((id) => {
    const { y, q } = qOf(id);
    return `${y}-Q${q}`;
  }))];
  periods.quarter = qs.map((id) => {
    const [y, q] = id.split("-Q");
    return { id, label: `${y}年${CN_Q[+q]}` };
  });
  const ys = [...new Set(hasMonth.map((id) => id.slice(0, 4)))];
  periods.year = ys.map((y) => ({ id: y, label: y + "年" }));
}

function applyUpload(list, filename) {
  if (!list.length) {
    document.getElementById("uploadHint").textContent = "没有读到月份 sheet";
    return;
  }
  list.forEach((x) => {
    months[x.ym] = {
      rooms: x.rooms, roomsB: x.roomsB,
      nights: x.nights, nightsB: x.nightsB,
      rev: x.rev, revB: x.revB,
      occ: x.occ, occB: x.occB,
      adr: x.adr, adrB: x.adrB,
      revpar: x.revpar, revparB: x.revparB,
      rows: x.byRow
    };
  });
  rebuildPeriods();
  grain = "month";
  const lastYm = list[list.length - 1].ym;
  cursor = Math.max(0, periods.month.findIndex((p) => p.id === lastYm));
  const years = [...new Set(hasMonth.map((id) => id.slice(0, 4)))].join("、");
  document.getElementById("uploadHint").textContent =
    "已合并 " + filename + "（现有 " + years + "，共 " + hasMonth.length + " 个月）";
  document.querySelectorAll(".grain").forEach((b) => b.classList.toggle("on", b.dataset.grain === "month"));
  render();
}

function monthKeysForPeriod() {
  const now = list()[cursor];
  if (!now) return [];
  const id = now.id;
  if (grain === "month") return months[id] ? [id] : [];
  if (grain === "year") return hasMonth.filter((ym) => ym.slice(0, 4) === id);
  const [y, qs] = id.split("-Q");
  return hasMonth.filter((ym) => {
    const t = qOf(ym);
    return t.y === +y && t.q === +qs;
  });
}
function metrics() {
  const keys = monthKeysForPeriod();
  if (!keys.length) return null;
  if (keys.length === 1) return months[keys[0]];
  const acc = { rooms: 66, roomsB: 66, nights: 0, nightsB: 0, rev: 0, revB: 0, days: 0 };
  const mdays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  keys.forEach((k) => {
    const m = months[k];
    acc.nights += m.nights || 0;
    acc.nightsB += m.nightsB || 0;
    acc.rev += m.rev || 0;
    acc.revB += m.revB || 0;
    acc.rooms = m.rooms || acc.rooms;
    acc.roomsB = m.roomsB || acc.roomsB;
    acc.days += mdays[+k.slice(5) - 1];
  });
  const avail = acc.rooms * acc.days;
  return {
    rooms: acc.rooms, roomsB: acc.roomsB,
    nights: acc.nights, nightsB: acc.nightsB,
    rev: acc.rev, revB: acc.revB,
    occ: avail ? acc.nights / avail : null,
    occB: avail ? acc.nightsB / avail : null,
    adr: acc.nights ? acc.rev / acc.nights : null,
    adrB: acc.nightsB ? acc.revB / acc.nightsB : null,
    revpar: avail ? acc.rev / avail : null,
    revparB: avail ? acc.revB / avail : null
  };
}
function rate(a, b) { return b ? pct(a / b) : "—"; }
function cardFmt(k, n) {
  if (n == null) return "—";
  if (k === "pct") return pct(n);
  if (k === "money2") return money(n, 2);
  if (k === "int") return Math.round(n).toLocaleString("zh-CN");
  return money(n);
}
function renderCards() {
  const m = metrics();
  const empty = !m;
  const specs = [
    ["主营业务收入", empty ? null : m.rev, empty ? null : m.revB, "money"],
    ["综合出租率", empty ? null : m.occ, empty ? null : m.occB, "pct"],
    ["综合房价", empty ? null : m.adr, empty ? null : m.adrB, "money2"],
    ["综合 RevPAR", empty ? null : m.revpar, empty ? null : m.revparB, "money2"],
    ["销售间晚数", empty ? null : m.nights, empty ? null : m.nightsB, "int"],
    ["房间数量", empty ? null : m.rooms, empty ? null : m.roomsB, "int"]
  ];
  document.getElementById("cards").innerHTML = specs.map(([n, a, b, k]) =>
    `<article class="stat"><h3>${n}</h3><div class="act">${cardFmt(k, a)}</div>
      <div class="row"><span>预算</span><b>${cardFmt(k, b)}</b></div>
      <div class="row"><span>与预算差</span><b>${a == null || b == null ? "—" : signed(a - b, k)}</b></div>
      <div class="row"><span>完成率</span><b>${a == null || b == null ? "—" : rate(a, b)}</b></div></article>`
  ).join("");
}
function sumRows(keys, id) {
  let a = 0, b = 0, hasA = false, hasB = false, name = NAMES[id];
  keys.forEach((k) => {
    const r = months[k] && months[k].rows && months[k].rows[id];
    if (!r) return;
    if (r.a != null) { a += r.a; hasA = true; }
    if (r.b != null) { b += r.b; hasB = true; }
    name = r.name || name;
  });
  return { name, a: hasA ? a : null, b: hasB ? b : null };
}
function prevKeys() {
  if (grain !== "month" || cursor <= 0) return [];
  return [list()[cursor - 1].id];
}
function yoyKeys() {
  if (grain !== "month") return [];
  const id = list()[cursor] && list()[cursor].id;
  if (!id) return [];
  const yoy = String(+id.slice(0, 4) - 1) + id.slice(4);
  return months[yoy] ? [yoy] : [];
}
function lineRow(r, i, group) {
  const has = r.kids && r.kids.length;
  const id = group + "-" + i;
  const opened = open.has(id);
  const name = has
    ? `<span class="tog" data-id="${id}"><span class="chev">${opened ? "▼" : "▶"}</span>${r.name}</span>`
    : r.name;
  const yoy = r.y == null || r.a == null ? '<span class="na">无</span>' : signed(r.a - r.y, "money");
  let html = `<tr class="${i === 0 ? "sum" : ""}"><td>${name}</td><td>${money(r.b)}</td><td>${money(r.a)}</td><td>${rate(r.a, r.b)}</td><td>${signed(r.p == null || r.a == null ? null : r.a - r.p, "money")}</td><td>${yoy}</td></tr>`;
  if (has && opened) {
    r.kids.forEach((k) => {
      const ky = k.y == null || k.a == null ? '<span class="na">无</span>' : signed(k.a - k.y, "money");
      html += `<tr class="child"><td>${k.name}</td><td>${money(k.b)}</td><td>${money(k.a)}</td><td>${rate(k.a, k.b)}</td><td>${signed(k.p == null || k.a == null ? null : k.a - k.p, "money")}</td><td>${ky}</td></tr>`;
    });
  }
  return html;
}
function panelFrom(code) {
  const meta = BLOCKS[code];
  const keys = monthKeysForPeriod();
  const prev = prevKeys();
  const yoy = yoyKeys();
  const rows = meta.ids.map((id, i) => {
    const cur = sumRows(keys, id);
    const pv = prev.length ? sumRows(prev, id) : { a: null };
    const yy = yoy.length ? sumRows(yoy, id) : { a: null };
    const kids = (KIDS[id] || []).map((kid) => {
      const c = sumRows(keys, kid);
      const p = prev.length ? sumRows(prev, kid) : { a: null };
      const y = yoy.length ? sumRows(yoy, kid) : { a: null };
      return { name: NAMES[kid] || c.name, a: c.a, b: c.b, p: p.a, y: y.a };
    });
    return {
      name: i === 0 ? "合计" : (NAMES[id] || cur.name),
      a: cur.a, b: cur.b, p: pv.a, y: yy.a,
      kids: kids.length ? kids : null
    };
  });
  return `<article class="panel"><header class="panel-h"><span>${meta.code}</span><h2>${meta.title}</h2></header>
    <div class="panel-table"><table><thead><tr><th>明细</th><th>预算</th><th>实际</th><th>完成率</th><th>较上月</th><th>较上年</th></tr></thead>
    <tbody>${rows.map((r, i) => lineRow(r, i, meta.code)).join("")}</tbody></table></div></article>`;
}
function seriesForView() {
  const keys = monthKeysForPeriod();
  const y = keys[0] ? keys[0].slice(0, 4) : (hasMonth[hasMonth.length - 1] || "").slice(0, 4);
  const actR = Array(12).fill(null), budR = Array(12).fill(null);
  const actC = Array(12).fill(null), budC = Array(12).fill(null);
  const actG = Array(12).fill(null), budG = Array(12).fill(null);
  hasMonth.filter((ym) => ym.slice(0, 4) === y).forEach((ym) => {
    const i = +ym.slice(5) - 1;
    const m = months[ym];
    actR[i] = m.rev; budR[i] = m.revB;
    actC[i] = m.rows[19] ? m.rows[19].a : null;
    budC[i] = m.rows[19] ? m.rows[19].b : null;
    actG[i] = m.rows[53] ? m.rows[53].a : null;
    budG[i] = m.rows[53] ? m.rows[53].b : null;
  });
  return { y, actR, budR, actC, budC, actG, budG };
}
function draw(id, act, bud) {
  const c = document.getElementById(id);
  const g = c.getContext("2d");
  const w = c.width = Math.max(280, c.parentElement.clientWidth - 8);
  const h = c.height = 180;
  g.clearRect(0, 0, w, h);
  let last = 0;
  for (let i = 0; i < 12; i++) if (act[i] != null || bud[i] != null) last = i + 1;
  const n = Math.max(last, 1);
  const pad = 28;
  const vals = [];
  for (let i = 0; i < n; i++) {
    if (act[i] != null) vals.push(act[i]);
    if (bud[i] != null) vals.push(bud[i]);
  }
  const max = (Math.max(0, ...vals) || 1) * 1.15;
  const x = (i) => pad + (w - pad * 2) * (n === 1 ? 0.5 : i / (n - 1));
  const y = (v) => h - 18 - (h - 36) * (v / max);
  g.strokeStyle = "#d0d5dd";
  g.beginPath(); g.moveTo(pad, h - 18); g.lineTo(w - pad, h - 18); g.stroke();
  g.setLineDash([5, 5]); g.strokeStyle = "#9db0ff"; g.beginPath();
  let started = false;
  for (let i = 0; i < n; i++) {
    if (bud[i] == null) continue;
    const X = x(i), Y = y(bud[i]);
    started ? g.lineTo(X, Y) : g.moveTo(X, Y);
    started = true;
  }
  g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#0c1222"; g.lineWidth = 2; g.beginPath();
  started = false;
  for (let i = 0; i < n; i++) {
    if (act[i] == null) continue;
    const X = x(i), Y = y(act[i]);
    started ? g.lineTo(X, Y) : g.moveTo(X, Y);
    started = true;
  }
  g.stroke();
  const cur = list()[cursor];
  let hi = last - 1;
  if (grain === "month" && cur) hi = +cur.id.slice(5) - 1;
  if (hi >= 0 && act[hi] != null) {
    g.fillStyle = "#2f5bff";
    g.beginPath(); g.arc(x(hi), y(act[hi]), 4, 0, 6.28); g.fill();
  }
  g.fillStyle = "#6b7385"; g.font = "11px sans-serif";
  for (let i = 0; i < n; i++) g.fillText(String(i + 1), x(i) - 3, h - 4);
}
function render() {
  const items = list();
  if (!items.length) {
    document.getElementById("periodLabel").textContent = "暂无数据";
    document.getElementById("prevBtn").hidden = true;
    document.getElementById("nextBtn").hidden = true;
  } else {
    if (cursor >= items.length) cursor = items.length - 1;
    document.getElementById("periodLabel").textContent = items[cursor].label;
    document.getElementById("prevBtn").hidden = cursor <= 0;
    document.getElementById("nextBtn").hidden = cursor >= items.length - 1;
  }
  renderCards();
  document.getElementById("revSplit").innerHTML =
    panelFrom("B") + `<div class="split-r">${panelFrom("D")}${panelFrom("C")}</div>`;
  document.getElementById("costSplit").innerHTML = panelFrom("E") + panelFrom("I");
  const s = seriesForView();
  draw("cRev", s.actR, s.budR);
  draw("cCost", s.actC, s.budC);
  draw("cGop", s.actG, s.budG);
  document.querySelectorAll(".tog").forEach((el) => {
    el.onclick = () => {
      const id = el.dataset.id;
      open.has(id) ? open.delete(id) : open.add(id);
      render();
    };
  });
}
document.getElementById("prevBtn").onclick = () => { if (cursor > 0) { cursor--; render(); } };
document.getElementById("nextBtn").onclick = () => { if (cursor < list().length - 1) { cursor++; render(); } };
document.querySelectorAll(".grain").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".grain").forEach((b) => b.classList.toggle("on", b === btn));
    grain = btn.dataset.grain;
    cursor = Math.max(0, list().length - 1);
    render();
  };
});
document.getElementById("xlsx").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  document.getElementById("uploadHint").textContent = "正在读取 " + f.name;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (typeof XLSX === "undefined") throw new Error("未加载 xlsx 库");
      const wb = XLSX.read(reader.result, { type: "array" });
      applyUpload(parseBook(wb, f.name), f.name);
    } catch (err) {
      document.getElementById("uploadHint").textContent = "读取失败：" + err.message;
    }
  };
  reader.readAsArrayBuffer(f);
  e.target.value = "";
};
window.addEventListener("resize", render);
rebuildPeriods();
render();