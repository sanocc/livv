import {
  errorLabel,
  statusLabel,
  businessLog,
  technicalError,
} from "./i18n.js";
import {
  esc,
  time,
  taskCard,
  historyCards,
  updateHTML,
  updateText,
} from "./sidepanel-view.js";
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
    await fn();
  } catch (e) {
    $("#error").textContent = errorLabel(e.message);
    $("#technical-error").textContent = technicalError(e.message);
    $("#error").hidden = false;
  }
};
function render(s) {
  const scroll = document.scrollingElement?.scrollTop;
  state = s;
  const age = s.cloud_at ? Date.now() - s.cloud_at : Infinity,
    online = age < 120000;
  updateText($("#version"), `v${s.version}`);
  updateText($("#online"), online ? "● 在线" : "○ 离线");
  $("#online").className = "badge " + (online ? "good" : "neutral");
  $("#auto").checked = !!s.auto;
  const openTasks = new Set(
    Array.from(
      document.querySelectorAll(
        "#current details[open], #history details[open]",
      ),
    ).map((d) =>
      d.dataset.taskId
        ? `task:${d.dataset.taskId}`
        : `tech:${d.dataset.technicalId}`,
    ),
  );
  updateHTML($("#current"), taskCard(s.active, s.logs));
  updateHTML($("#history"), historyCards(s.history, s.logs));
  document
    .querySelectorAll("#current details, #history details")
    .forEach((d) => {
      d.open = openTasks.has(
        d.dataset.taskId
          ? `task:${d.dataset.taskId}`
          : `tech:${d.dataset.technicalId}`,
      );
    });
  const active = !!s.active,
    approved = s.cloud?.status === "approved";
  $("#request-card").hidden = active;
  $("#start").disabled = !approved || submitting;
  $("#start").title = approved ? "" : "设备批准后方可创建任务";
  updateText(
    $("#log-list"),
    s.logs
      .slice()
      .reverse()
      .map((l) => `${time(l.at)} ${businessLog(l)}`)
      .join("\n\n") || "暂无本地日志",
  );
  updateText(
    $("#technical-logs"),
    s.logs
      .slice()
      .reverse()
      .map((l) => `${time(l.at)} ${businessLog(l)}\n${l.event}\n${l.message}`)
      .join("\n\n") || "暂无技术日志",
  );
  updateText($("#technical-error"), technicalError(s.last_error));
  const profiles = s.logs.filter((l) =>
    ["PERF_FINAL", "PERF_CHECKPOINT"].includes(l.event),
  );
  updateText(
    $("#performance"),
    profiles.length
      ? profiles
          .slice(-3)
          .map((l) => `${time(l.at)} ${l.message}`)
          .join("\n")
      : "暂无阶段计时；性能剖析尚未部署。",
  );
  updateHTML(
    $("#device"),
    `<div><strong>设备：${esc(s.cloud?.name ?? "未命名设备")}</strong> · ${online ? "● 在线" : "○ 离线"}</div><div title="${esc(s.device_id)}" class="id">采集设备 ID：${esc(s.device_id)}</div><div>批准状态：${esc(s.cloud?.status ? statusLabel(s.cloud.status) : "未确认")} · 接口：${online ? "最近心跳正常" : "连接未确认"}</div><div>浏览器：${s.last_error?.startsWith("INPUT_") || s.last_error === "MANAGED_TAB_NAVIGATED" ? "存在执行错误" : "未报告浏览器错误"} · 最近心跳：${time(s.cloud?.server_time)}</div>`,
  );
  updateText($("#error"), errorLabel(s.last_error));
  $("#error").hidden = !s.last_error;
  if (scroll != null) document.scrollingElement.scrollTop = scroll;
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
      await send({ type: "TASK", task });
      $("#created").textContent = "云端任务已创建，等待当前设备依序领取。";
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
      state.logs.map((l) => `${time(l.at)} ${businessLog(l)}`).join("\n"),
    ),
  );
$("#copy-technical").onclick = () =>
  action(() =>
    navigator.clipboard.writeText(
      state.logs
        .map((l) => `${l.at} ${businessLog(l)}\n${l.event} ${l.message}`)
        .join("\n\n"),
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
let storageTimer;
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "local" &&
    Object.keys(changes).some((k) =>
      ["active", "ui_history", "auto", "cloud", "cloud_at", "error"].includes(
        k,
      ),
    )
  ) {
    clearTimeout(storageTimer);
    storageTimer = setTimeout(() => action(load), 150);
  }
});
const timer = setInterval(() => action(load), 3000);
window.addEventListener("unload", () => {
  clearInterval(timer);
  clearTimeout(storageTimer);
});
action(load);
