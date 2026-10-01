import { csv, normalize, summarize, group, previous, range } from "./model.js";
import { workbookTable } from "./xlsx.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
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
const money = (n) =>
  n == null
    ? "—"
    : "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const count = (n) => (n == null ? "—" : n.toLocaleString("zh-CN"));
let data = [],
  importing = false;
$("#anchor").value = new Date(Date.now() + 8 * 3600000)
  .toISOString()
  .slice(0, 10);
function dates() {
  const custom = $("#mode").value === "custom";
  $("#start").disabled = $("#end").disabled = !custom;
  if (!custom)
    [$("#start").value, $("#end").value] = range(
      $("#anchor").value,
      $("#mode").value,
    );
  render();
}
function render() {
  if (!data.length) return;
  const start = $("#start").value,
    end = $("#end").value;
  if (!start || !end || start > end) {
    $("#report").textContent = "请选择有效时间范围";
    return;
  }
  const selected = data.filter((r) => r.date >= start && r.date <= end),
    s = summarize(selected);
  const metric = (label, value) =>
    `<article class="card metric"><span>${label}</span><strong>${value}</strong></article>`;
  const table = (title, rs) =>
    `<section class="card"><h2>${title}</h2><div class="table-scroll"><table><thead><tr><th>名称</th><th>营收</th><th>房量</th><th>均价</th></tr></thead><tbody>${rs.map((r) => `<tr><td>${esc(r.name)}</td><td>${money(r.revenue)}</td><td>${count(r.rooms)}</td><td>${money(r.adr)}</td></tr>`).join("") || '<tr><td colspan="4">暂无数据</td></tr>'}</tbody></table></div></section>`;
  const anchor = $("#anchor").value,
    today = summarize(data.filter((r) => r.date === anchor));
  const comparison = [
    ["day", "昨日"],
    ["week", "上周同日"],
    ["month", "上月同日"],
  ]
    .map(([kind, label]) => {
      const date = previous(anchor, kind),
        old = summarize(data.filter((r) => r.date === date));
      const delta =
        today.revenue == null || old.revenue == null
          ? "—"
          : (today.revenue - old.revenue >= 0 ? "+" : "−") +
            money(Math.abs(today.revenue - old.revenue));
      return `<span>与${label}（${date}）营收差额：<strong>${delta}</strong></span>`;
    })
    .join("");
  $("#report").innerHTML =
    `<div class="metrics">${metric("营收", money(s.revenue))}${metric("售卖房量", count(s.rooms))}${metric("ADR · 平均房价", money(s.adr))}${metric("OCC · 入住率", s.occ == null ? "—" : (s.occ * 100).toFixed(1) + "%")}</div><p>范围 ${esc(start)} → ${esc(end)} · ${selected.length} 条已导入记录。缺失日期不补零。</p><section class="card"><h2>营业日 ${esc(anchor)} · 同日对比</h2><div class="comparisons">${comparison}</div></section><div class="tables">${table("房型表现", group(selected, "room_type"))}${table("渠道收入与均价", group(selected, "channel"))}</div>${table("逐日经营", group(selected, "date"))}`;
}
$("#file").addEventListener("change", async (e) => {
  if (importing || !e.target.files[0]) return;
  const file = e.target.files[0];
  importing = true;
  e.target.disabled = true;
  $("#status").className = "";
  $("#status").textContent = "正在本机解析文件…";
  try {
    if (file.size > 5 * 1024 * 1024) throw Error("文件请控制在 5 MB 以内");
    let table;
    if (/\.csv$/i.test(file.name)) {
      const bytes = await file.arrayBuffer();
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        text = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
      }
      table = csv(text);
    } else if (/\.xlsx$/i.test(file.name))
      table = workbookTable(await file.arrayBuffer());
    else throw Error("请使用 CSV 或 .xlsx 文件");
    const normalized = normalize(table);
    data = normalized;
    $("#anchor").value = data
      .map((r) => r.date)
      .sort()
      .at(-1);
    dates();
    $("#status").textContent =
      `已导入 ${file.name} · ${data.length} 条记录 · 未上传云端`;
  } catch (error) {
    $("#status").className = "error";
    $("#status").textContent = error.message + "；已有成功导入的数据未变。";
  } finally {
    importing = false;
    e.target.disabled = false;
    e.target.value = "";
  }
});
for (const id of ["mode", "anchor"])
  $("#" + id).addEventListener("change", dates);
for (const id of ["start", "end"])
  $("#" + id).addEventListener("change", render);
dates();
