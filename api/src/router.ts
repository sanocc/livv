import type { AppContext } from "./env";
import { HttpError, json } from "./response";

const healthBody = { ok: true, service: "livv-api-v2" } as const;

export function route(context: AppContext): Response {
  const url = new URL(context.request.url);

  if (context.request.method === "GET" &&
      (url.pathname === "/health" || url.pathname === "/api/v1/health")) {
    return json(healthBody);
  }

  throw new HttpError(404, "NOT_FOUND", "Route not found");
}
