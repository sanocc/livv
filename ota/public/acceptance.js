import { errorLabel } from "./helper-labels.js";
const esc = (v) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  VERIFIED: "真机采集证据通过",
  SIMULATED_PASS: "隔离模拟通过 · 非真机",
  AWAITING_REAL_AGENT: "等待真实 Agent 执行",
  BLOCKED: "阻塞 · 需人工处理",
  INCONCLUSIVE: "证据不足 · 未通过",
  CANCELLED: "已取消",
};
const blockers = {
  NO_READY_APPROVED_CHROME_AGENT:
    "没有符合条件的在线设备。需要已批准的 Mac/Windows Chrome Agent，开启自动执行和已有 debugger 权限；不会自动批准或重置设备。",
  LOGIN_REQUIRED: "平台需要登录，请在受管真实设备上处理。",
  CAPTCHA_REQUIRED: "平台需要验证码，请在受管真实设备上处理。",
};
export function acceptanceView({ city = "", keyword = "" } = {}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  return `<section class="acceptance"><h2>真实 Agent 平台验收</h2><p class="muted">携程基准：采集 3 家真实酒店列表，沿用现有 Task → Attempt → Snapshot → Observation。自动选择已批准、在线且空闲的指定系统 Chrome Agent；不会抢占正在执行的任务。</p><form id="acceptance-form" class="acceptance-filters"><label>平台<select name="platform"><option value="ctrip">携程 · 现有权限</option></select></label><label>执行环境<select name="os"><option value="macOS">Mac · Chrome</option><option value="Windows">Windows · Chrome</option></select></label><label>城市<input name="city" required maxlength="100" value="${esc(city)}"></label><label>关键词<input name="keyword" maxlength="100" value="${esc(keyword)}"></label><label>入住<input type="date" name="checkin" required min="${today}" value="${today}"></label><label>离店<input type="date" name="checkout" required min="${tomorrow}" value="${tomorrow}"></label><button type="submit">创建携程真机验收</button></form><p id="acceptance-error" role="alert"></p><div id="acceptance-results" aria-live="polite">正在读取验收记录…</div><p class="muted">美团、飞猪、同程/艺龙：现有 Agent 未获这些站点访问权限，暂停浏览器验收。不会绕过登录或验证码；本页不扩大权限。Mac 通过不能代表 Windows 通过。心跳、fixture 和 Cloud Chromium 页面检查均不能代替真机采集证据。</p></section>`;
}
export function acceptanceResults(reports) {
  if (!reports.length)
    return '<p class="muted">暂无远程验收记录，尚未取得本轮真机证据。</p>';
  return reports
    .map(
      (r) =>
        `<article class="acceptance-result" data-acceptance-status="${esc(r.status)}"><div class="section-heading"><h3>携程 · ${esc(r.os)}</h3><strong>${esc(labels[r.status] ?? r.status)}</strong></div><p class="acceptance-identity">Task ${esc(r.task_id)}<br>${esc(r.context.city)} / ${esc(r.context.keyword)} · ${esc(r.context.checkin)} → ${esc(r.context.checkout)} · 状态 ${esc(r.task_status)}</p>${r.blocker ? `<p class="acceptance-blocker">${esc(blockers[r.blocker] ?? r.blocker)}</p>` : ""}${r.snapshot ? `<p>实际观察 ${esc(r.snapshot.observed_at)} · ${esc(r.snapshot.market_status)}<br>设备 ${esc(r.snapshot.device_id)} · ${esc(r.device_at_start.os)} / ${esc(r.device_at_start.browser_name)} ${esc(r.device_at_start.browser_version)} · Agent ${esc(r.device_at_start.agent_version)}<br>Attempt ${esc(r.snapshot.attempt_id)} · Snapshot ${esc(r.snapshot.snapshot_id)}</p><div class="table"><table><thead><tr><th>酒店 / 原始 Hotel ID</th><th>平台</th><th>实际起售价</th></tr></thead><tbody>${r.observations.map((h) => `<tr><td>${esc(h.hotel_name)}<small>${esc(h.hotel_id)}</small></td><td>${esc(h.platform)}</td><td>${h.display_price == null ? "缺失" : `¥${esc(h.display_price)}`}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">尚无 Snapshot；不以在线状态推断成功。</p>'}<p class="muted">自动代码修复 ${esc(r.automatic_repair_count)} 次 · 任务重试 ${esc(r.retry_count)} 次；两者分别记录。${r.simulation ? "当前为隔离环境，结果不计入真机验收。" : "证据来自已批准设备的本次上传，不是硬件远程证明。"}</p><details><summary>安全诊断 / 验收条件</summary><ul>${Object.entries(
          r.checks,
        )
          .map(([k, v]) => `<li>${esc(k)}：${v ? "满足" : "未满足"}</li>`)
          .join(
            "",
          )}</ul><ol>${r.diagnostics.map((e) => `<li>${esc(e.at)} · ${esc(e.event)}${e.code ? ` · ${esc(e.code)}` : ""}</li>`).join("")}</ol></details></article>`,
    )
    .join("");
}
export function mountAcceptance(root, api) {
  const form = root.querySelector("#acceptance-form"),
    results = root.querySelector("#acceptance-results"),
    error = root.querySelector("#acceptance-error");
  let disposed = false,
    timer = null,
    requestID = null,
    requestBody = null,
    busy = false;
  const refresh = async () => {
    if (disposed) return;
    clearTimeout(timer);
    try {
      const { tasks } = await api("acceptance-tasks");
      const reports = await Promise.all(
        tasks
          .slice(0, 10)
          .map((t) => api("acceptance-tasks/" + encodeURIComponent(t.id))),
      );
      if (disposed) return;
      results.innerHTML = acceptanceResults(reports);
      error.textContent = "";
      if (reports.some((r) => r.status === "AWAITING_REAL_AGENT"))
        timer = setTimeout(refresh, 5000);
    } catch (e) {
      if (!disposed) error.textContent = "读取验收记录失败：" + e.message;
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || disposed) return;
    busy = true;
    const button = form.querySelector("button");
    button.disabled = true;
    error.textContent = "";
    const body = Object.fromEntries(new FormData(form));
    // A failed/uncertain network response reuses the same request ID for unchanged input.
    const serialized = JSON.stringify(body);
    if (serialized !== requestBody || !requestID) {
      requestBody = serialized;
      requestID = crypto.randomUUID();
    }
    try {
      await api("acceptance-tasks", "POST", { ...body, request_id: requestID });
      if (!disposed) await refresh();
    } catch (e) {
      if (!disposed) error.textContent = blockers[e.message] ?? errorLabel(e.message);
    } finally {
      busy = false;
      if (!disposed) button.disabled = false;
    }
  };
  void refresh();
  return {
    dispose() {
      disposed = true;
      clearTimeout(timer);
      form.onsubmit = null;
    },
  };
}
