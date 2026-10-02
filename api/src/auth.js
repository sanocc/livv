import { verifyAccessJwt, authorizeAdmin } from "./access.js";
import { HttpError, requireThat } from "./domain.js";
import { first } from "./db.js";
export async function sha256(v) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(v),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function credential() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function human(request, env) {
  const u = new URL(request.url);
  if (
    env.ENVIRONMENT === "local" &&
    ["localhost", "127.0.0.1"].includes(u.hostname) &&
    env.LOCAL_ADMIN_TOKEN &&
    request.headers.get("authorization") === `Bearer ${env.LOCAL_ADMIN_TOKEN}`
  )
    return "local-admin";
  const auth = await verifyAccessJwt(request, env);
  if (!auth.ok) throw new HttpError(auth.status, auth.code);
  const permitted = authorizeAdmin(auth.claims, env);
  if (!permitted.ok) throw new HttpError(permitted.status, permitted.code);
  return permitted.email;
}
export async function deviceAuth(request, db, approved = true) {
  const id = request.headers.get("X-Device-ID"),
    token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  requireThat(id && token, "DEVICE_AUTH_REQUIRED", 401);
  const d = await first(db, "SELECT * FROM devices WHERE id=?", id);
  requireThat(
    d && d.credential_hash === (await sha256(token)),
    "DEVICE_AUTH_INVALID",
    401,
  );
  if (approved)
    requireThat(d.status === "approved", "DEVICE_NOT_APPROVED", 403);
  return d;
}
