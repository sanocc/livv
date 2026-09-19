import type { Env } from "./env";
import { errorResponse, requestId } from "./response";
import { route } from "./router";

export async function handleRequest(
  request: Request,
  env: Env,
  accessIdentity?: import("./env").AccessIdentity,
): Promise<Response> {
  const id = requestId();
  try {
    return await route({ env, request, requestId: id, accessIdentity });
  } catch (error) {
    return errorResponse(error, id);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
