import { statusLabel, errorLabel, businessLog } from "./helper-labels.js";
const esc = (v) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const dt = (v) =>
  v ? new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—";
const seconds = (v) => (v == null ? "—" : `${(v / 1000).toFixed(1)}秒`);
const results = (rows) =>
  ["COMPLETED", "PARTIAL", "FAILED", "RUNNING", "PENDING"]
    .map(
      (s) =>
        `${statusLabel(s)} ${rows.find((r) => r.status === s)?.count ?? 0}`,
    )
    .join(" · ");
export function diagnosticsView(d) {
  const a = d.analytics;
  return `<article class="card detail"><h2>${esc(d.device.name ?? "未命名设备")} · 运行概况</h2><p>${d.device.online ? "在线" : "离线"} · ${esc(statusLabel(d.device.status))} · 版本 ${esc(d.device.version)}<br>最近心跳：${dt(d.device.last_seen_at)}<br>最近错误：${esc(errorLabel(d.device.last_error)) || "无"}</p><p>最近24小时任务结果：${results(d.task_results)}<br>执行结果：${results(d.attempt_results)}</p><p>市场列表平均耗时：<strong>${seconds(d.timing.average_ms)}</strong> · ${d.timing.samples}个已完成执行样本（领取至完成，最近24小时）</p><h3>主要执行错误</h3>${d.errors.map((e) => `<p>${esc(errorLabel(e.error_code))} · ${e.count}次<details><summary>技术详情</summary>${esc(e.error_code)}</details></p>`).join("") || "<p>最近24小时无已记录执行错误</p>"}<h3>最近任务</h3>${d.recent.map((r) => `<details><summary>${dt(r.claimed_at)} · ${esc(r.city)} · ${esc(r.keyword)} · 任务${esc(statusLabel(r.task_status))} / 执行${esc(statusLabel(r.attempt_status))}</summary><p>${esc(r.checkin)} → ${esc(r.checkout)}<br>市场列表 ${r.market_count ?? "—"}家<br>错误：${esc(errorLabel(r.error_code)) || "无"}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details></details>`).join("") || "<p>暂无任务记录</p>"}<h3>云端错误与终态日志 · D1</h3><p class="muted">关键事件持久保存，按事件 ID 幂等去重；不依赖 Analytics 采样。</p>${(d.agent_logs ?? []).map((e) => `<details><summary>${dt(e.created_at)} · ${esc(e.message)}</summary><p>版本 ${esc(e.app_version) || "—"} · ${esc({ info: "信息", warn: "警告", error: "错误" }[e.level] ?? "—")}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(e, null, 2))}</pre></details></details>`).join("") || "<p>暂无新版关键日志；下方保留已有执行历史。</p>"}<h3>云端执行日志 · D1</h3><p class="muted">最近100条权威执行记录，原始错误与历史状态保留。历史应用版本未记录时保持缺失。</p>${(d.logs ?? []).map((e) => `<details><summary>${dt(e.created_at)} · ${esc(businessLog({ event: e.error_code || e.event, message: e.message ?? "" }))}</summary><p>${esc(e.message)}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(e, null, 2))}</pre></details></details>`).join("") || "<p>暂无执行日志</p>"}<h3>运行事件</h3><p class="muted">${a.available ? "最近24小时最多100条 Analytics 事件；可能存在写入延迟、采样及重传，不能替代业务终态。" : "Analytics 查询暂不可用；业务状态仍来自D1真实记录。"}</p>${a.events.map((e) => `<details><summary>${dt(e.occurred_at)} · ${esc(businessLog({ event: e.event_code, message: e.hotel_count == null ? "" : JSON.stringify({ count: e.hotel_count }) }))}</summary><p>耗时 ${seconds(e.duration_ms)} · 酒店数 ${e.hotel_count ?? "—"}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(e, null, 2))}</pre></details></details>`).join("")}</article>`;
}
export { statusLabel, errorLabel };
