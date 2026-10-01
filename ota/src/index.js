const safeHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "same-origin",
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health")
      return Response.json({ ok: true, service: "poai-ota" });
    const headers = new Headers();
    for (const name of ["CF-Access-Jwt-Assertion", "Content-Type", "Origin"])
      if (request.headers.has(name))
        headers.set(name, request.headers.get(name));
    if (env.ENVIRONMENT === "local" && env.LOCAL_ADMIN_TOKEN)
      headers.set("Authorization", `Bearer ${env.LOCAL_ADMIN_TOKEN}`);
    if (url.pathname.startsWith("/api/")) {
      if (!url.pathname.startsWith("/api/v1/admin/"))
        return new Response("Not found", { status: 404 });
      const target = new URL(
        url.pathname.slice(4) + url.search,
        env.ENVIRONMENT === "local"
          ? "http://localhost"
          : "https://api.poai.cc",
      );
      return env.API.fetch(
        new Request(target, {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method)
            ? undefined
            : request.body,
          redirect: "manual",
        }),
      );
    }
    const session = await env.API.fetch(
      new Request(
        (env.ENVIRONMENT === "local"
          ? "http://localhost"
          : "https://api.poai.cc") + "/v1/admin/session",
        { headers },
      ),
    );
    if (!session.ok)
      return new Response(
        "请通过 Cloudflare Access 登录 POAI。管理员验证未通过。",
        { status: session.status, headers: safeHeaders },
      );
    const r = await env.ASSETS.fetch(request);
    const out = new Response(r.body, r);
    for (const [k, v] of Object.entries(safeHeaders)) out.headers.set(k, v);
    return out;
  },
};
