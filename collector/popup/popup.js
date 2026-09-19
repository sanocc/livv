const app = document.querySelector("#app");
let activeTab = "execution";

function send(type) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type }, resolve));
}

function render(state) {
  const status = state.device?.status ?? "unknown";
  const task = state.task;
  const message = status === "pending" ? "等待设备授权" : status === "revoked" ? "设备已撤销" : task ? `${task.platform} ${task.check_in} → ${task.check_out}` : "等待云端任务";
  const detail = activeTab === "device" ? `device_id: ${state.device?.device_id ?? "未注册"}<br>状态: ${status}<br>runtime: ${state.state}`
    : activeTab === "status" ? `当前任务: ${task?.task_id ?? "无"}<br>Attempt: ${task?.attempt_number ?? "无"}<br>Lease: ${task?.lease_expires_at ?? "无"}`
      : `${message}<br>${task ? `目标: ${task.target_hotels}<br>stage: ${state.state}<br>progress: ${state.progress?.current ?? "-"}/${state.progress?.target ?? "-"}` : "执行器尚未启用"}`;
  app.textContent = detail.replaceAll("<br>", "\n");
}

async function refresh() { render(await send("REFRESH_STATUS")); }
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { activeTab = button.dataset.tab; void refresh(); }));
void send("GET_RUNTIME_STATE").then(render);
