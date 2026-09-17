import type { AppContext, AuthType } from "./env";
import { getAccessIdentity } from "./auth/access";
import { getDeviceIdentity } from "./auth/device";
import { getInternalIdentity } from "./auth/internal";
import { AppError } from "./errors/app-error";
import { ErrorCodes } from "./errors/codes";
import { fail } from "./utils/response";

type Handler = (ctx: AppContext) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: string;
  auth: AuthType;
  handler: Handler;
}

export class Router {
  private readonly routes: Route[] = [];

  on(method: string, pattern: string, auth: AuthType, handler: Handler): void {
    this.routes.push({ method: method.toUpperCase(), pattern, auth, handler });
  }

  async handle(ctx: AppContext): Promise<Response> {
    const url = new URL(ctx.request.url);
    const pathMatches = this.routes
      .map((route) => ({ route, params: matchPath(route.pattern, url.pathname) }))
      .filter((match) => match.params !== null);

    if (pathMatches.length === 0) {
      return fail(new AppError(ErrorCodes.NOT_FOUND, "Route not found", 404), ctx.requestId);
    }

    const matched = pathMatches.find((match) => match.route.method === ctx.request.method.toUpperCase());
    if (!matched) {
      return fail(new AppError(ErrorCodes.METHOD_NOT_ALLOWED, "Method not allowed", 405), ctx.requestId);
    }

    ctx.params = matched.params ?? {};
    const identity = await authenticate(matched.route.auth, ctx);
    if (identity) {
      ctx.identity = identity;
    }
    return matched.route.handler(ctx);
  }
}

async function authenticate(auth: AuthType, ctx: AppContext) {
  if (auth === "public") return undefined;
  if (auth === "access_user") return getAccessIdentity(ctx);
  if (auth === "device") return getDeviceIdentity(ctx);
  return getInternalIdentity(ctx);
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}
