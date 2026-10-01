import { statusLabel, errorLabel, technicalError } from "./i18n.js";
export const esc = (v) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const time = (v) =>
  v ? new Date(v).toLocaleTimeString("zh-CN", { hour12: false }) : "—";
export const scope = (t) =>
  t.scope === "all"
    ? "全市场"
    : t.scope === "custom"
      ? `自定义 ${t.collection_limit ?? t.limit ?? "—"}家`
      : "30家";
export function badge(status) {
  const color =
    {
      COMPLETED: "good",
      PARTIAL: "warn",
      FAILED: "bad",
      RUNNING: "running",
      PENDING: "neutral",
    }[status] ?? "neutral";
  return `<span class="badge ${color}">${esc(statusLabel(status))}</span>`;
}
export function stageLabel(a) {
  if (a.phase === "UPLOAD") return "正在上传数据";
  if (a.phase === "LIST") return "正在采集市场列表";
  if (a.phase === "DETAIL_OPEN") return "正在寻找详情入口";
  if (a.phase === "DETAIL_RETURN") return "正在返回市场列表";
  if (a.phase === "FAST_NAVIGATION") return "正在快速导航并验证搜索条件";
  if (a.phase === "DETAIL_READ")
    return a.waiting_stable ? "等待房型稳定" : "正在读取酒店房型";
  if (["SEARCH", "LIST_KEYWORD_INPUT"].includes(a.phase))
    return "正在等待搜索结果";
  return "正在设置搜索条件";
}
export function taskCard(a, logs = []) {
  if (!a)
    return `<article class="card"><div class="card-title"><h2>采集状态</h2><span class="badge neutral">空闲</span></div><p class="hint">等待自动计划，或创建立即采集任务。</p></article>`;
  const listOnly = a.task.task_type === "MARKET_LIST";
  const target = a.task.collection_limit,
    total = a.detail_total,
    done = a.detail_success + a.detail_failed;
  const events = logs.filter(
    (l) => l.task_id === a.task_id && l.attempt_id === a.attempt_id,
  );
  const claimed = events.find((l) => l.event === "CLAIMED"),
    search = events.find(
      (l) => l.event === "PHASE" && /→ LIST$/.test(l.message),
    ),
    locked = events.find((l) => l.event === "MARKET_LOCKED");
  let index =
    a.phase === "UPLOAD"
      ? 4
      : a.phase.startsWith("DETAIL")
        ? 3
        : a.phase === "LIST"
          ? 2
          : 1;
  let points = [
    ["任务领取", claimed?.at],
    ["搜索条件设置", search?.at],
    ["市场列表采集", locked?.at],
    ["核心酒店详情", null],
    ["数据上传", a.phase === "UPLOAD" ? a.phase_at : null],
    ["任务完成", null],
  ];
  if (listOnly) {
    points.splice(3, 1);
    if (index >= 4) index--;
  }
  return `<article class="card"><div class="card-title"><h2>当前任务</h2>${badge(a.status)}</div><div class="market-name">${esc(a.task.city)} · ${esc(a.task.keyword)}</div><p class="detail-row">${esc(a.task.checkin)} → ${esc(a.task.checkout)} · ${esc(scope(a.task))}</p><div class="progress-title"><span>市场列表</span><strong>${a.count} / ${target ?? "不限"}</strong></div><progress ${target ? `max="${target}" value="${Math.min(a.count, target)}"` : ""} aria-label="市场列表"></progress>${listOnly ? "" : `<div class="progress-title"><span>核心详情</span><strong>${done} / ${total}${a.detail_failed ? ` · 失败${a.detail_failed}` : ""}</strong></div><progress max="${Math.max(1, total)}" value="${done}" aria-label="核心详情"></progress>`}<div class="stage"><strong>${esc(stageLabel(a))}</strong>${a.current_hotel ? `<div class="detail-row">当前酒店：${esc(a.current_hotel.hotel_name)}</div><div class="id">平台酒店 ID：${esc(a.current_hotel.hotel_id)}</div>` : ""}<div class="hint">任务执行中，关闭侧边栏不会停止采集。</div></div><div class="stats"><div>列表酒店<b>${a.count}</b></div>${listOnly ? "" : `<div>详情成功<b>${a.detail_success}</b></div><div>详情失败<b>${a.detail_failed}</b></div>`}</div><ul class="timeline">${points
    .map(([name, at], i) => {
      const failed =
        (!listOnly && i === 3 && a.detail_failed > 0) ||
        (i === 2 && index > 2 && target && a.count < target);
      const error =
        i === 3
          ? a.detail_results?.find((d) => d.status === "FAILED")?.error_code
          : "列表未达到目标";
      return `<li class="${failed ? "failed" : i < index ? "done" : i === index ? "current" : ""}">${failed ? "×" : i < index ? "✓" : i === index ? "●" : "○"} ${name}<span>${failed ? esc(errorLabel(error)) : at ? time(at) : ""}</span></li>`;
    })
    .join("")}</ul>${technicalDetails(a)}</article>`;
}
export function duration(a) {
  const start = Date.parse(a.started_at),
    end = Date.parse(a.finished_at);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? `${Math.round((end - start) / 1000)}秒`
    : "—";
}
export function technicalDetails(a) {
  return `<details class="technical" data-technical-id="${esc(a.task_id)}"><summary>技术详情</summary><div class="id">任务 ID：${esc(a.task_id)}<br>执行 ID：${esc(a.attempt_id)}<br>市场快照 ID：${esc(a.snapshot_id)}<br>原始状态：${esc(a.status)}<br>原始执行状态：${esc(a.attempt_status)}</div><p>原始错误码</p><pre>${esc(technicalError(a.error_code))}</pre>${(a.detail_results ?? []).map((d) => `<p>平台酒店 ID：${esc(d.hotel_id)} · ${esc(statusLabel(d.status))}</p><pre>${esc(d.status)}\n${esc(technicalError(d.error_code))}</pre>`).join("")}${(a.attempts ?? []).length > 1 ? `<h3>本地执行记录</h3>${a.attempts.map((x) => `<p>${esc(statusLabel(x.status))} · ${esc(errorLabel(x.error_code))}</p><div class="id">执行 ID：${esc(x.attempt_id)} · 原始状态：${esc(x.status)}</div><pre>${esc(technicalError(x.error_code))}</pre>`).join("")}` : ""}</details>`;
}
export function historyCards(history, logs = []) {
  if (!history.length)
    return '<article class="card empty">暂无当前采集设备的本地任务记录</article>';
  return history
    .map((a) => {
      // Older local records omitted task_type. Read existing timing evidence without rewriting history.
      const timing = logs.findLast(
        (l) => l.task_id === a.task_id && l.event === "TASK_TIMING",
      );
      let taskType = a.task.task_type;
      if (!taskType && timing) {
        try {
          taskType = JSON.parse(timing.message).task_type;
        } catch {}
      }
      const listOnly = taskType === "MARKET_LIST";
      const showDetails =
        !listOnly &&
        (taskType === "LEGACY_MARKET_DETAIL" ||
          a.detail_total > 0 ||
          a.rooms > 0 ||
          a.detail_results?.length > 0);
      return `<article class="card history-card"><div class="card-title"><strong>${time(a.started_at ?? a.created_at)} · 携程</strong>${badge(a.status)}</div><p>${esc(a.task.city)} · ${esc(a.task.keyword)}<br>${esc(a.task.checkin)} → ${esc(a.task.checkout)}</p><div class="task-metrics"><span>市场列表</span><strong>${esc(a.count ?? "—")}家</strong><span>耗时</span><strong>${duration(a)}</strong></div>${!showDetails ? "" : `<p>详情 ${a.detail_success ?? "—"} / ${a.detail_total ?? "—"} · 房型 ${a.rooms ?? "—"}</p>`}${a.error_code ? `<p class="bad">${esc(errorLabel(a.error_code))}</p>` : ""}<details data-task-id="${esc(a.task_id)}"><summary>查看详情</summary><p>任务状态：${esc(statusLabel(a.status))}<br>执行状态：${esc(statusLabel(a.attempt_status))}</p><p>范围：${esc(scope(a.task))}<br>开始 ${time(a.started_at)} · 结束 ${time(a.finished_at)}</p>${technicalDetails(a)}</details></article>`;
    })
    .join("");
}
