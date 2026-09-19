const DEFAULT_API_BASE = "http://localhost:8787";

function safeError(response, payload) {
  const code = payload && typeof payload === "object" && payload.error && typeof payload.error.code === "string"
    ? payload.error.code
    : "INTERNAL_ERROR";
  return Object.assign(new Error(code), { code, status: response.status });
}

export function createApiClient({ fetchImpl = globalThis.fetch, baseUrl = DEFAULT_API_BASE, credential = null } = {}) {
  const base = baseUrl.replace(/\/$/u, "");
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("accept", "application/json");
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (credential) headers.set("authorization", `Bearer ${credential}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
    try {
      const response = await fetchImpl(`${base}${path}`, { ...options, headers, signal: controller.signal });
      if (response.status === 204) return { status: 204, data: null };
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok) throw safeError(response, payload);
      return { status: response.status, data: payload?.data ?? payload };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) throw error;
      throw Object.assign(new Error("NETWORK_ERROR"), { code: "NETWORK_ERROR" });
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    register(metadata) { return request("/api/v1/collector/register", { method: "POST", body: JSON.stringify(metadata) }); },
    device() { return request("/api/v1/collector/device"); },
    heartbeat(metadata) { return request("/api/v1/collector/heartbeat", { method: "POST", body: JSON.stringify(metadata) }); },
    claim() { return request("/api/v1/collector/tasks/claim", { method: "POST" }); },
    currentTask() { return request("/api/v1/collector/tasks/current"); },
    progress(taskId, body) { return request(`/api/v1/collector/tasks/${encodeURIComponent(taskId)}/progress`, { method: "POST", body: JSON.stringify(body) }); },
    fail(taskId, body) { return request(`/api/v1/collector/tasks/${encodeURIComponent(taskId)}/fail`, { method: "POST", body: JSON.stringify(body) }); },
  };
}

export { DEFAULT_API_BASE };
