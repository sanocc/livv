// A separate, non-admin credential. Private signing keys never belong in Cloud/API.
import { requireThat } from "./domain.js";
export const CAPABILITY_ISSUER = "poai-acceptance-issuer-v1";
export const CAPABILITY_AUDIENCE = "poai-acceptance-control-v1";
export const MAX_CAPABILITY_SECONDS = 1800;
const encode = new TextEncoder();
export const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export function unb64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw Error("invalid encoding");
  const bytes = Uint8Array.from(
    atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
  if (b64url(bytes) !== value) throw Error("noncanonical encoding");
  return bytes;
}
export const capabilityParts = (header, claims) =>
  [header, claims]
    .map((v) => b64url(encode.encode(JSON.stringify(v))))
    .join(".");
export const validGrantID = (id) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    id,
  );
const exactKeys = (obj, keys) =>
  obj &&
  typeof obj === "object" &&
  !Array.isArray(obj) &&
  Object.keys(obj).length === keys.length &&
  keys.every((k) => Object.hasOwn(obj, k));
export const controlInputKeys = [
  "platform",
  "city",
  "checkin",
  "checkout",
  "keyword",
  "purpose",
];
export function validControlContext(c) {
  return (
    exactKeys(c, controlInputKeys) &&
    c.platform === "ctrip" &&
    c.purpose === "PLATFORM_ACCEPTANCE" &&
    typeof c.city === "string" &&
    c.city.length > 0 &&
    c.city.length <= 100 &&
    c.city === c.city.trim() &&
    typeof c.keyword === "string" &&
    c.keyword.length <= 100 &&
    c.keyword === c.keyword.trim() &&
    [c.checkin, c.checkout].every(
      (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v),
    )
  );
}
export async function verifyAcceptanceCapability(
  req,
  env,
  now = Math.floor(Date.now() / 1000),
) {
  requireThat(
    env.ACCEPTANCE_CONTROL_ENABLED === "true",
    "ACCEPTANCE_CONTROL_UNAVAILABLE",
    503,
  );
  // Configuration errors also fail closed. No external JWK fetch or fallback to admin/device auth.
  let keys, revoked;
  try {
    keys = JSON.parse(env.ACCEPTANCE_CONTROL_PUBLIC_KEYS);
    revoked = JSON.parse(env.ACCEPTANCE_CONTROL_REVOKED_IDS);
    if (
      !Array.isArray(keys) ||
      keys.length < 1 ||
      keys.length > 4 ||
      !Array.isArray(revoked) ||
      revoked.length > 256 ||
      !revoked.every(validGrantID)
    )
      throw Error("invalid config");
    if (
      !keys.every(
        (k) =>
          exactKeys(k, ["kid", "kty", "crv", "x"]) &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(k.kid) &&
          k.kty === "OKP" &&
          k.crv === "Ed25519" &&
          unb64url(k.x).length === 32,
      ) ||
      new Set(keys.map((k) => k.kid)).size !== keys.length
    )
      throw Error("invalid keys");
  } catch {
    requireThat(false, "ACCEPTANCE_CONTROL_UNAVAILABLE", 503);
  }
  const token = req.headers
    .get("Authorization")
    ?.match(/^Bearer ([A-Za-z0-9_.-]{1,4096})$/)?.[1];
  requireThat(token, "ACCEPTANCE_CONTROL_DENIED", 401);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw Error("invalid token");
    const decode = (v) =>
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(unb64url(v)));
    const header = decode(parts[0]),
      claims = decode(parts[1]);
    if (
      !exactKeys(header, ["alg", "typ", "kid"]) ||
      header.alg !== "EdDSA" ||
      header.typ !== "poai-acceptance-capability+JWT"
    )
      throw Error("invalid header");
    const key = keys.find((k) => k.kid === header.kid);
    if (!key) throw Error("unknown key");
    const pub = await crypto.subtle.importKey(
      "jwk",
      { kty: key.kty, crv: key.crv, x: key.x },
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "Ed25519",
        pub,
        unb64url(parts[2]),
        encode.encode(parts.slice(0, 2).join(".")),
      ))
    )
      throw Error("invalid signature");
    if (
      !exactKeys(claims, [
        "iss",
        "aud",
        "sub",
        "jti",
        "iat",
        "nbf",
        "exp",
        "scope",
        "os",
        "context",
      ]) ||
      claims.iss !== CAPABILITY_ISSUER ||
      claims.aud !== CAPABILITY_AUDIENCE ||
      claims.sub !== "codex-acceptance" ||
      !validGrantID(claims.jti) ||
      revoked.includes(claims.jti) ||
      !["macOS", "Windows"].includes(claims.os) ||
      !validControlContext(claims.context)
    )
      throw Error("invalid scope");
    if (
      !Array.isArray(claims.scope) ||
      claims.scope.length !== 2 ||
      claims.scope[0] !== "acceptance:create" ||
      claims.scope[1] !== "acceptance:read"
    )
      throw Error("invalid scope");
    if (
      ![claims.iat, claims.nbf, claims.exp].every(Number.isSafeInteger) ||
      claims.nbf !== claims.iat ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > MAX_CAPABILITY_SECONDS ||
      claims.iat > now ||
      claims.exp <= now
    )
      throw Error("expired or future token");
    return claims;
  } catch {
    requireThat(false, "ACCEPTANCE_CONTROL_DENIED", 401);
  }
}
