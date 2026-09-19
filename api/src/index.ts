import type { Env } from "./env";
import { errorResponse, requestId } from "./response";
import { route } from "./router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = requestId();

    try {
      return route({ env, request });
    } catch (error) {
      return errorResponse(error, id);
    }
  },
};
