import {
  statusLabel,
  errorLabel,
  businessLog,
  technicalError,
} from "./i18n.js";
import { stageLabel, time } from "./sidepanel-view.js";
const $ = (s) => document.querySelector(s),
  send = async (m) => {
    const r = await chrome.runtime.sendMessage(m);
    if (r?.error) throw new Error(r.error);
    return r;
  },
  action = async (fn) => {
    try {
      $("#error").textContent = "";
      await fn();
    } catch (e) {
      $("#error").textContent = errorLabel(e.message);
      $("#technical-error").textContent = technicalError(e.message);
    }
  };
async function load() {
  const s = await send({ type: "STATE" });
  $("#status").textContent =
    `${s.cloud?.name ?? "未命名设备"} · ${s.cloud?.status ? statusLabel(s.cloud.status) : "注册中"}${s.active ? " · " + stageLabel(s.active) + " · " + s.active.count + "家" : ""}`;
  $("#device").textContent = "采集设备 ID：" + s.device_id;
  $("#technical-error").textContent = technicalError(s.last_error);
  $("#technical-logs").textContent = (s.logs ?? [])
    .slice(-15)
    .reverse()
    .map(
      (x) =>
        `${time(x.at)} ${businessLog(x)}\n${x.event} ${x.message}${x.error_summary ? "\n" + JSON.stringify(x.error_summary, null, 2) : ""}`,
    )
    .join("\n\n");
  $("#auto").checked = s.auto;
  $("#error").textContent = errorLabel(s.last_error);
  $("#logs").textContent = (s.logs ?? [])
    .slice(-15)
    .reverse()
    .map((x) => `${time(x.at)} ${businessLog(x)}`)
    .join("\n");
}
const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date()),
  next = (d) =>
    new Date(Date.parse(d + "T00:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
$("#task [name=checkin]").value = next(day);
$("#task [name=checkout]").value = next(next(day));
$("#task [name=checkin]").onchange = (e) =>
  ($("#task [name=checkout]").value = next(e.target.value));
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
$("#task").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const task = {
      ...Object.fromEntries(new FormData(e.target)),
      platform: "ctrip",
    };
    await send({ type: "TASK", task });
    $("#error").textContent = "云端任务已创建，等待当前设备领取。";
  });
};
action(load);

$("#input-permission").onclick = () =>
  action(async () => {
    const granted = await chrome.permissions.contains({
      permissions: ["debugger"],
    });
    if (!granted) throw new Error("INPUT_PERMISSION_REQUIRED");
    $("#error").textContent = "自动操作权限已启用；可开启自动接单。";
  });

$("#probe").onclick = () =>
  action(async () => {
    await send({ type: "PROBE_DISABLED" });
    await load();
  });

$("#debug").onclick = () =>
  action(async () => {
    const result = await send({ type: "DEBUG_DOM" });
    $("#dom").replaceChildren(
      ...Object.entries(result).flatMap(([key, value]) => {
        const text = key + ": " + JSON.stringify(value);
        return Array.from(
          { length: Math.ceil(text.length / 450) },
          (_, index) => {
            const entry = document.createElement("p");
            entry.textContent = text.slice(index * 450, (index + 1) * 450);
            return entry;
          },
        );
      }),
    );
  });
