const allowedOrigins = new Set([
  "https://ota.livv.cc",
  "https://admin.livv.cc",
  "https://ops.livv.cc",
  "https://cai.livv.cc",
  "http://localhost:5173",
  "http://localhost:8787"
]);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-livv-device-id,x-livv-device-credential,x-livv-mock-access-sub,x-livv-mock-access-email,x-livv-mock-access-role",
    "access-control-allow-credentials": "true",
    vary: "Origin"
  };
}

export function optionsResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
