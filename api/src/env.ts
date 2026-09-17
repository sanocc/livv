export interface Env {
  DB: D1Database;
  APP_VERSION?: string;
  ACCESS_ISSUER?: string;
  ACCESS_AUD?: string;
  INTERNAL_SCHEDULER_SECRET?: string;
  AI?: unknown;
}

export interface AppContext {
  env: Env;
  executionCtx: ExecutionContext;
  request: Request;
  requestId: string;
  startedAt: number;
  params: Record<string, string>;
  identity?: Identity;
}

export type AuthType = "public" | "access_user" | "device" | "internal";

export interface AccessIdentity {
  type: "access_user";
  sub: string;
  email: string;
  role: Role;
}

export interface DeviceIdentity {
  type: "device";
  deviceRowId: string;
  deviceId: string;
  status: "pending" | "authorized" | "revoked";
}

export interface InternalIdentity {
  type: "internal";
  name: string;
}

export type Identity = AccessIdentity | DeviceIdentity | InternalIdentity;

export type Role = "owner" | "admin" | "manager" | "viewer";
