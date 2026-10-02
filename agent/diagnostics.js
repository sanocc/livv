// Allowlisted, bounded exception evidence. Never retain query strings or credentials.
export function safeText(value, limit = 500) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s)]+/gi, (s) => {
      try {
        const u = new URL(s);
        return u.origin + u.pathname;
      } catch {
        return "[url]";
      }
    })
    .replace(/chrome-extension:\/\/[^/]+\//g, "extension:///")
    .replace(/(?:Bearer\s+)[^\s]+/gi, "Bearer [redacted]")
    .replace(
      /(credential|token|secret|password|cookie|authorization)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/\b[a-f0-9]{64,}\b/gi, "[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:[A-Z]:\\|\/Users\/|\/home\/)[^\s)]+/gi, "[local path]")
    .slice(0, limit);
}
export function errorSummary(error, context = {}) {
  let pathname = "";
  try {
    pathname = new URL(context.url).pathname;
  } catch {}
  return {
    error_name: safeText(error?.name, 80),
    error_message: safeText(error?.message),
    error_code: /^[A-Z][A-Z0-9_]{1,79}$/.test(error?.code ?? "")
      ? error.code
      : "",
    stack_summary: safeText(
      String(error?.stack ?? "")
        .split("\n")
        .slice(0, 4)
        .join("\n"),
      800,
    ),
    phase: safeText(context.phase, 80),
    pathname: safeText(pathname, 160),
    request_path: safeText(context.request_path, 160),
    browser: safeText(context.browser, 180),
  };
}
export function registrationRetry(previous = {}, now = Date.now()) {
  const count = Math.min(5, (previous.count ?? 0) + 1);
  const minutes = [2, 5, 10, 15, 30][count - 1];
  return { count, next_at: now + minutes * 60000 };
}
