const app = document.querySelector("#app");
let activeTab = "execution";
let runtimeState = null;
let probeResult = null;
let probeBusy = false;

function send(type) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function text(value) {
  return value === null || value === undefined ? "null" : String(value);
}

function appendLine(parent, label, value, className = "") {
  const line = document.createElement("div");
  if (className) line.className = className;
  const labelNode = document.createElement("strong");
  labelNode.textContent = `${label}: `;
  line.append(labelNode, document.createTextNode(text(value)));
  parent.append(line);
}

function appendField(parent, label, value) {
  const field = document.createElement("div");
  field.className = "field";
  const labelNode = document.createElement("div");
  labelNode.className = "field-label";
  labelNode.textContent = label;
  field.append(labelNode);
  appendLine(field, "value", value?.state === "unknown" ? "unknown" : value?.value ?? "null");
  appendLine(field, "state", value?.state ?? "unknown");
  appendLine(field, "evidence", value?.evidence_source ?? "unknown");
  parent.append(field);
}

function renderDevice(parent, state) {
  const errorCode = state?.error_code ?? null;
  const cloudDevice = state?.device ?? null;
  const connection = cloudDevice?.status
    ?? (errorCode === "NETWORK_ERROR" ? "API 未连接" : errorCode ? `API 不可用（${errorCode}）` : "未获取");
  appendLine(parent, "本地 device_id", state?.device_id ?? "未生成");
  appendLine(parent, "云端注册", cloudDevice ? "已注册" : "未确认（不代表已注册）");
  appendLine(parent, "设备状态", connection);
  appendLine(parent, "runtime", state?.state ?? "unknown");
  appendLine(parent, "错误", errorCode ?? "无");

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "probe";
  button.disabled = probeBusy;
  button.textContent = probeBusy ? "检测中…" : "检测当前页面";
  parent.append(button);

  if (probeResult) renderProbe(parent, probeResult);
}

function renderProbe(parent, result) {
  const section = document.createElement("section");
  section.className = "field";
  const title = document.createElement("h2");
  title.textContent = "当前页面检测结果";
  section.append(title);

  if (result?.context) {
    const context = result.context;
    appendLine(section, "platform", context.platform);
    appendField(section, "page_type", context.page_type);
    appendField(section, "city", context.city);
    appendField(section, "keyword", context.keyword);
    appendField(section, "check_in", context.check_in);
    appendField(section, "check_out", context.check_out);
    appendLine(section, "source_url", context.source_url);
    const probeVersion = document.createElement("div");
    probeVersion.className = "muted";
    probeVersion.textContent = `probe_version: ${result.probe?.probe_version ?? "unknown"}`;
    section.append(probeVersion);
    const evidence = result.probe?.page_type_evidence;
    const candidateTitle = document.createElement("div");
    candidateTitle.className = "field-label";
    candidateTitle.textContent = "page_type_evidence";
    section.append(candidateTitle);
    const evidenceNode = document.createElement("div");
    evidenceNode.className = "probe-evidence";
    evidenceNode.textContent = JSON.stringify(evidence ?? {});
    section.append(evidenceNode);
  } else {
    appendLine(section, "结果", result?.code ?? "PROBE_FAILED", "error");
    if (result?.source_url !== undefined) appendLine(section, "source_url", result.source_url);
  }
  parent.append(section);
}

function renderExecution(parent, state) {
  const task = state?.task;
  appendLine(parent, "设备状态", state?.device?.status ?? (state?.error_code ? "API 未连接" : "未获取"));
  appendLine(parent, "runtime", state?.state ?? "unknown");
  appendLine(parent, "当前任务", task?.task_id ?? "无");
  appendLine(parent, "执行能力", state?.task_execution_ready === true ? "已启用" : "未启用");
}

function renderStatus(parent, state) {
  const task = state?.task;
  appendLine(parent, "当前任务", task?.task_id ?? "无");
  appendLine(parent, "Attempt", task?.attempt_number ?? "无");
  appendLine(parent, "Lease", task?.lease_expires_at ?? "无");
  appendLine(parent, "progress", state?.progress ? `${state.progress.current ?? "-"}/${state.progress.target ?? "-"}` : "无");
}

function render(state = runtimeState) {
  runtimeState = state && typeof state === "object" ? state : { error_code: "RUNTIME_STATE_UNAVAILABLE" };
  app.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = activeTab === "device" ? "设备" : activeTab === "status" ? "任务状态" : "任务执行";
  app.append(title);
  if (activeTab === "device") renderDevice(app, runtimeState);
  else if (activeTab === "status") renderStatus(app, runtimeState);
  else renderExecution(app, runtimeState);
}

async function refresh() {
  try {
    render(await send("REFRESH_STATUS"));
  } catch (error) {
    render({ ...runtimeState, error_code: error.message || "RUNTIME_UNAVAILABLE" });
  }
}

async function probe() {
  probeBusy = true;
  render();
  try {
    probeResult = await send("PROBE_CURRENT_PAGE");
  } catch (error) {
    probeResult = { kind: "error", code: "PROBE_MESSAGE_FAILED", source_url: null, message: error.message };
  } finally {
    probeBusy = false;
    render();
  }
}

document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
  activeTab = button.dataset.tab;
  render();
  void refresh();
}));
app.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.action === "probe") void probe();
});

void send("GET_RUNTIME_STATE").then(render).catch((error) => render({ error_code: error.message || "RUNTIME_UNAVAILABLE" }));
