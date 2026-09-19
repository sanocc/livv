/** M01 keeps the Worker environment intentionally free of business bindings. */
import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB?: D1Database;
}

export interface AppContext {
  readonly env: Env;
  readonly request: Request;
  readonly requestId: string;
  /** Test-only identity injection; production Worker requests never read a role header. */
  readonly accessIdentity?: AccessIdentity;
}

export interface AccessIdentity {
  readonly subject: string;
  readonly role: "viewer" | "manager" | "admin" | "owner";
}
