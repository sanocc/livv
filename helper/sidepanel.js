import { esc, time, taskCard, historyCards } from "./sidepanel-view.js";
const $ = (s) => document.querySelector(s);
let state = null,
  updating = false,
  submitting = false;
const send = async (m) => {
  const r = await chrome.runtime.sendMessage(m);
  if (r?.error) throw new Error(r.error);
  return r;
};
const action = async (fn) => {
  try {
    $("#error").hidden = true;
    await fn();
  } catch (e) {
    $("#error").textContent = e.message;
    $("#error").hidden = false;
  }
};
function render(s) {
  state = s;
  const age = s.cloud_at ? Date.now() - s.cloud_at : Infinity,
    online = age < 120000;
  $("#version").textContent = `v${s.version}`;
  $("#online").textContent = online ? "● 在线" : "○ 离线";
  $("#online").className = "badge " + (online ? "good" : "neutral");
  $("#auto").checked = !!s.auto;
  $("#current").innerHTML = taskCard(s.active, s.logs);
  const openTasks = new Set(
    Array.from(document.querySelectorAll("#history details[open]")).map(
      (d) => d.dataset.taskId,
    ),
  );
  $("#history").innerHTML = historyCards(s.history);
  document.querySelectorAll("#history details").forEach((d) => {
    d.open = openTasks.has(d.dataset.taskId);
  });
  const active = !!s.active,
    approved = s.cloud?.status === "approved";
  $("#request-card").hidden = active;
  $("#start").disabled = !approved || submitting;
  $("#start").title = approved ? "" : "设备批准后方可创建任务";
  $("#log-list").textContent =
    s.logs
      .slice()
      .reverse()
      .map((l) => `${time(l.at)} ${l.event}\n${l.message}`)
      .join("\n\n") || "暂无本地日志";
  const profiles = s.logs.filter((l) =>
    ["PERF_FINAL", "PERF_CHECKPOINT"].includes(l.event),
  );
  $("#performance").textContent = profiles.length
    ? profiles
        .slice(-3)
        .map((l) => `${time(l.at)} ${l.message}`)
        .join("\n")
    : "暂无阶段计时；性能剖析尚未部署。";
  $("#device").innerHTML =
    `<div><strong>设备：${esc(s.cloud?.name ?? "未命名设备")}</strong> · ${online ? "● 在线" : "○ 离线"}</div><div title="${esc(s.device_id)}" class="id">Device ID：${esc(s.device_id)}</div><div>批准状态：${esc({ approved: "已批准", pending: "待批准", disabled: "已禁用" }[s.cloud?.status] ?? "未确认")} · API：${online ? "最近心跳正常" : "连接未确认"}</div><div>浏览器：${s.last_error?.startsWith("INPUT_") || s.last_error === "MANAGED_TAB_NAVIGATED" ? "存在执行错误" : "未报告浏览器错误"} · 最近心跳：${time(s.cloud?.server_time)}</div>`;
  if (s.last_error) {
    $("#error").textContent = s.last_error;
    $("#error").hidden = false;
  }
}
async function load() {
  if (updating) return;
  updating = true;
  try {
    render(await send({ type: "STATE" }));
  } finally {
    updating = false;
  }
}
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      for (const id of ["collect", "tasks", "logs"])
        $("#" + id).hidden = id !== b.dataset.tab;
    }),
);
const next = (d) =>
  new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
}).format(new Date());
$("#task [name=checkin]").value = next(today);
$("#task [name=checkout]").value = next(next(today));
$("#task [name=checkin]").onchange = (e) => {
  $("#task [name=checkout]").value = next(e.target.value);
};
$("#task [name=scope]").onchange = (e) => {
  $("#custom-limit").hidden = e.target.value !== "custom";
};
$("#task").onsubmit = (e) => {
  e.preventDefault();
  if (submitting) return;
  action(async () => {
    const task = Object.fromEntries(new FormData(e.target));
    if (task.checkout <= task.checkin)
      throw new Error("退房日期必须晚于入住日期");
    if (task.scope !== "custom") delete task.limit;
    submitting = true;
    $("#start").disabled = true;
    try {
      const t = await send({ type: "TASK", task });
      $("#created").textContent =
        "已创建云端Task：" + t.id + "；等待当前设备依序领取。";
      await load();
    } finally {
      submitting = false;
      $("#start").disabled = state?.cloud?.status !== "approved";
    }
  });
};
$("#auto").onchange = (e) =>
  action(async () => {
    await send({ type: "AUTO", enabled: e.target.checked });
    await load();
  });
$("#poll").onclick = () =>
  action(async () => {
    await send({ type: "POLL" });
    await load();
  });
$("#copy").onclick = () =>
  action(() =>
    navigator.clipboard.writeText(
      state.logs.map((l) => `${l.at} ${l.event} ${l.message}`).join("\n"),
    ),
  );
$("#clear").onclick = () =>
  action(async () => {
    await send({ type: "CLEAR_LOGS" });
    await load();
  });
$("#debug").onclick = () =>
  action(async () => {
    $("#dom").textContent = JSON.stringify(
      await send({ type: "DEBUG_DOM" }),
      null,
      2,
    );
  });
$("#input-permission").onclick = () =>
  action(async () => {
    if (!(await chrome.permissions.contains({ permissions: ["debugger"] })))
      throw new Error("INPUT_PERMISSION_REQUIRED");
    $("#dom").textContent = "自动操作权限已启用。";
  });
$("#probe").onclick = () =>
  action(async () => {
    await send({ type: "PROBE_DISABLED" });
    await load();
  });
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") action(load);
});
const timer = setInterval(() => action(load), 3000);
window.addEventListener("unload", () => clearInterval(timer));
action(load);
