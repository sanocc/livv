import type { AppContext } from "../env";
import { ok } from "../utils/response";
import { nowIso } from "../utils/time";

export function scheduledNoop(ctx: AppContext): Response {
  return ok({
    status: "noop",
    message: "Scheduler skeleton is present; task generation is disabled in M02.",
    timestamp: nowIso()
  });
}
