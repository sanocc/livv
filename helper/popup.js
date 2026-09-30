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
      $("#error").textContent = e.message;
    }
  };
async function load() {
  const s = await send({ type: "STATE" });
  $("#status").textContent =
    `${s.cloud?.name ?? "未命名设备"} · ${s.cloud?.status ?? "注册中"}${s.active ? " · " + s.active.phase + " · " + s.active.count + "家" : ""}`;
  $("#device").textContent = "Device ID：" + s.device_id;
  $("#auto").checked = s.auto;
  $("#error").textContent = s.error ?? "";
  $("#logs").textContent = (s.logs ?? [])
    .slice(-15)
    .map((x) => `${x.at} ${x.event} ${x.message}`)
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
    const t = await send({ type: "TASK", task });
    $("#error").textContent = "云端任务已创建：" + t.id;
  });
};
action(load);
