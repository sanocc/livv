const ACCESS_HEADER = 'CF-Access-Jwt-Assertion';

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
}

function accessIssuer(env) {
  const domain = String(env.CF_ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  return domain ? (domain.startsWith('https://') ? domain : `https://${domain}`) : '';
}

export async function verifyAccessJwt(request, env, { fetcher = fetch, now = Math.floor(Date.now() / 1000) } = {}) {
  const token = request.headers.get(ACCESS_HEADER);
  const issuer = accessIssuer(env);
  const audience = String(env.CF_ACCESS_AUD || '');
  if (!issuer || !audience) return { ok: false, code: 'ADMIN_AUTH_NOT_CONFIGURED', message: 'Cloudflare Access configuration is not configured', status: 501 };
  if (!token) return { ok: false, code: 'ADMIN_AUTH_REQUIRED', message: 'Cloudflare Access authentication is required', status: 401 };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, code: 'ADMIN_AUTH_INVALID', message: 'Cloudflare Access JWT is invalid', status: 401 };
  try {
    const header = decodeJson(parts[0]);
    const claims = decodeJson(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid header');
    if (claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience)) throw new Error('invalid claims');
    if (!claims.exp || now >= Number(claims.exp) || (claims.nbf && now < Number(claims.nbf))) throw new Error('expired claims');
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`);
    if (!response.ok) throw new Error('cert fetch failed');
    const certs = await response.json();
    const jwk = (certs.keys || []).find((key) => key.kid === header.kid);
    if (!jwk) throw new Error('unknown key');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput);
    if (!valid) throw new Error('invalid signature');
    return { ok: true, claims };
  } catch (_) {
    return { ok: false, code: 'ADMIN_AUTH_INVALID', message: 'Cloudflare Access JWT is invalid', status: 401 };
  }
}

export function authorizeAdmin(claims, env) {
  const allowed = String(env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const email = String(claims?.email || '').trim().toLowerCase();
  if (!allowed.length) return { ok: false, code: 'ADMIN_AUTH_NOT_CONFIGURED', message: 'Admin authorization is not configured', status: 501 };
  if (!email || !allowed.includes(email)) return { ok: false, code: 'ADMIN_FORBIDDEN', message: 'Administrator identity is not authorized', status: 403 };
  return { ok: true, email };
}
