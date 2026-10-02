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
const boolLabel = (v, yes = "正常", no = "缺失") =>
  v == null ? "未知" : v ? yes : no;
const percent = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
export function environmentLabel(e) {
  if (!e?.os) return "系统未知";
  const version = e.os_version === "11+" ? "11 或更新" : e.os_version;
  return `${e.os}${version ? " " + version : "（版本未知）"}`;
}
export function deviceSummary(d) {
  const h = d.health,
    e = d.environment,
    runtime = d.runtime;
  const counts = (s) =>
    h?.task_results?.find((r) => r.status === s)?.count ?? 0;
  return `<tr><td><strong>${esc(d.name ?? "未命名设备")}</strong><small>${esc(environmentLabel(e))} · ${esc(e?.browser_name ?? "浏览器未知")}${e?.browser_major_version ? " " + esc(e.browser_major_version) : ""} · 助手 ${esc(d.version)}</small></td><td>${esc(d.display_status)}<small>${esc(statusLabel(d.status))} · 自动接单${boolLabel(runtime?.auto, "开启", "关闭")}</small><small>${esc(errorLabel(d.last_error))}</small></td><td>${dt(h?.last_success_at)}<small>心跳 ${dt(d.last_seen_at)}</small></td><td>${counts("COMPLETED")} 完成 / ${counts("PARTIAL")} 部分 / ${counts("FAILED")} 失败<small>完全成功率 ${percent(h?.success_rate)} · 平均 ${seconds(h?.market_average_ms)}</small></td><td><button data-diagnostics="${esc(d.id)}">查看详情</button> <button data-name="${esc(d.id)}">改名</button> <button data-device="${esc(d.id)}" data-status="${d.status === "approved" ? "disabled" : "approved"}">${d.status === "pending" ? "批准" : d.status === "approved" ? "禁用" : "恢复"}</button></td></tr>`;
}
function environmentView(d) {
  const e = d.device.environment,
    r = d.device.runtime,
    h = d.health;
  const entries = [
    ["操作系统", environmentLabel(e)],
    ["架构", e?.architecture ?? "未知"],
    [
      "浏览器",
      `${e?.browser_name ?? "未知"} ${e?.browser_version ?? (e?.browser_major_version ? e.browser_major_version + "（完整版本未知）" : "")}`,
    ],
    ["浏览器语言", e?.browser_language ?? "未知"],
    ["助手版本", d.device.version ?? "未知"],
    ["扩展清单版本", e?.manifest_version ?? "未知"],
    ["运行环境", e?.environment === "production" ? "生产环境" : "未知"],
    ["接口地址", e?.api_endpoint ?? "未知"],
    ["调试器权限", boolLabel(r?.debugger_permission)],
    ["侧边栏", boolLabel(r?.side_panel, "支持", "不支持")],
    ["采集标签页", boolLabel(r?.managed_tab, "存在", "不存在")],
    ["自动接单", boolLabel(r?.auto, "开启", "关闭")],
    [
      "携程页面",
      { normal: "正常", not_open: "未打开", abnormal: "异常", unknown: "未知" }[
        r?.ctrip_page_status
      ] ?? "未知",
    ],
    [
      "携程登录",
      { logged_in: "已登录", logged_out: "未登录", unknown: "未知" }[
        r?.ctrip_login_status
      ] ?? "未知",
    ],
  ];
  const names = {
    fast_navigation: "快速导航",
    market_list: "市场列表采集",
    detail_collection: "酒店详情采集",
    debugger_input: "调试器输入",
    side_panel: "侧边栏",
    cloud_telemetry: "云端运行日志",
    mobile_view: "移动端显示",
    ctrip: "携程",
  };
  const phases = {
    FAST_NAVIGATION: "快速导航",
    CITY_OPEN: "选择城市",
    CITY_INPUT: "输入城市",
    CITY_SELECT: "确认城市",
    DATE_CHECKIN: "选择入住日期",
    DATE_CHECKOUT: "选择退房日期",
    KEYWORD_OPEN: "选择关键词",
    KEYWORD_INPUT: "输入关键词",
    KEYWORD_SELECT: "确认关键词",
    SEARCH: "设置搜索条件",
    WAIT_LIST: "等待列表",
    LIST: "采集市场列表",
    UPLOAD: "上传数据",
    DETAIL_FIND: "寻找详情入口",
    DETAIL_READ: "采集房型",
  };
  const active = h?.current_attempt;
  const phase =
    active && r?.attempt_id === active.attempt_id
      ? (phases[r.phase] ?? "执行中（详见技术详情）")
      : "—";
  return `<section><h3>概览与运行健康</h3><p>当前任务：${active ? esc(active.task_id) : "无"}<br>任务类型：${active ? (active.task_type === "MARKET_LIST" ? "市场列表" : "列表与酒店详情") : "—"}<br>当前阶段：${phase}<br>最近成功：${dt(h?.last_success_at)}<br>最近失败：${dt(h?.last_failed_at)}<br>最近任务耗时：${seconds(h?.last_duration_ms)}<br>近24小时任务数：${h?.total ?? 0}<br>完全成功率：${percent(h?.success_rate)}<br>快速导航成功率：${percent(h?.navigation?.success_rate)}（${h?.navigation?.samples ?? 0}次已记录导航）<br>搜索页面回退：${h?.navigation?.fallback_count ?? 0}次</p><p class="muted">任务统计按最后一次执行所属设备归属；成功率只计算已结束任务。导航统计按执行去重，无记录时不推断成功。</p></section><section><h3>运行环境</h3><div class="device-environment">${entries.map(([name, value]) => `<div><span>${esc(name)}</span><strong>${esc(value)}</strong></div>`).join("")}</div><p class="muted">系统版本来自浏览器客户端提示，无法可靠取得时保持未知。登录状态不采集账号或认证信息。</p></section><section><h3>能力</h3><div class="device-environment">${Object.entries(
    names,
  )
    .map(
      ([key, name]) =>
        `<div><span>${name}</span><strong>${boolLabel(e?.capabilities?.[key], "支持", "不支持")}</strong></div>`,
    )
    .join(
      "",
    )}</div><p class="muted">能力表示助手实现支持；权限、登录和导航模板是否可用须结合当前运行环境判断。</p></section><section><h3>生命周期</h3><p>首次注册：${dt(d.device.created_at)}<br>首次批准：${dt(d.device.approved_at)}<br>最近在线：${dt(d.device.last_seen_at)}<br>最近版本变化：${dt(d.device.version_changed_at)}</p></section><details><summary>设备技术详情</summary><pre>${esc(JSON.stringify({ device_id: d.device.id, environment: e, runtime: r, version: d.device.version, version_changed_at: d.device.version_changed_at }, null, 2))}</pre></details>`;
}
export function diagnosticsView(d) {
  const a = d.analytics;
  return `<article class="card detail"><h2>${esc(d.device.name ?? "未命名设备")} · 运行概况</h2><p>${d.device.online ? "在线" : "离线"} · ${esc(statusLabel(d.device.status))} · 版本 ${esc(d.device.version)}<br>最近心跳：${dt(d.device.last_seen_at)}<br>最近错误：${esc(errorLabel(d.device.last_error)) || "无"}</p>${environmentView(d)}<h3>最近任务与运行记录</h3><p>最近24小时任务结果：${results(d.task_results)}<br>执行结果：${results(d.attempt_results)}</p><p>市场列表平均耗时：<strong>${seconds(d.timing.average_ms)}</strong> · ${d.timing.samples}个已完成执行样本（领取至完成，最近24小时）</p><h3>主要执行错误</h3>${d.errors.map((e) => `<p>${esc(errorLabel(e.error_code))} · ${e.count}次<details><summary>技术详情</summary>${esc(e.error_code)}</details></p>`).join("") || "<p>最近24小时无已记录执行错误</p>"}<h3>最近任务</h3>${d.recent.map((r) => `<details><summary>${dt(r.claimed_at)} · ${esc(r.city)} · ${esc(r.keyword)} · 任务${esc(statusLabel(r.task_status))} / 执行${esc(statusLabel(r.attempt_status))}</summary><p>${esc(r.checkin)} → ${esc(r.checkout)}<br>市场列表 ${r.market_count ?? "—"}家<br>错误：${esc(errorLabel(r.error_code)) || "无"}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details></details>`).join("") || "<p>暂无任务记录</p>"}<h3>云端错误与终态日志 · D1</h3><p class="muted">关键事件持久保存，按事件 ID 幂等去重；不依赖 Analytics 采样。</p>${(d.agent_logs ?? []).map((e) => `<details><summary>${dt(e.created_at)} · ${esc(e.message)}</summary><p>版本 ${esc(e.app_version) || "—"} · ${esc({ info: "信息", warn: "警告", error: "错误" }[e.level] ?? "—")}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(e, null, 2))}</pre></details></details>`).join("") || "<p>暂无新版关键日志；下方保留已有执行历史。</p>"}<h3>云端执行日志 · D1</h3><p class="muted">最近100条权威执行记录，原始错误与历史状态保留。历史应用版本未记录时保持缺失。</p>${(d.logs ?? []).map((e) => `<details><summary>${dt(e.created_at)} · ${esc(businessLog({ event: e.error_code || e.event, message: e.message ?? "" }))}</summary><p>${esc(e.message)}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(e, null, 2))}</pre></details></details>`).join("") || "<p>暂无执行日志</p>"}<h3>运行事件</h3><p class="muted">${a.available ? "最近24小时最多100条 Analytics 事件；可能存在写入延迟、采样及重传，不能替代业务终态。" : "Analytics 查询暂不可用；业务状态仍来自D1真实记录。"}</p>${a.events.map((e) => `<details><summary>${dt(e.occurred_at)} · ${esc(businessLog({ event: e.event_code, message: e.hotel_count == null ? "" : JSON.stringify({ count: e.hotel_count }) }))}</summary><p>耗时 ${seconds(e.duration_ms)} · 酒店数 ${e.hotel_count ?? "—"}</p><details><summary>技术详情</summary><pre>${esc(JSON.stringify(e, null, 2))}</pre></details></details>`).join("")}</article>`;
}
export { statusLabel, errorLabel };
