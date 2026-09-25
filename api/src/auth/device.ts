import { constantTimeEqual, hmacHex, sha256Hex } from '../utils/crypto.ts';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export async function canonicalRequest(request, timestamp, nonce, body) {
  return [request.method.toUpperCase(), new URL(request.url).pathname, timestamp, nonce, await sha256Hex(body)].join('\n');
}

export async function verifyDeviceRequest(request, device, body, now = Date.now(), repository) {
  const timestamp = request.headers.get('X-LIVV-Timestamp');
  const nonce = request.headers.get('X-LIVV-Nonce');
  const signature = request.headers.get('X-LIVV-Signature');
  if (!timestamp || !nonce || !signature) return { ok: false, code: 'INVALID_DEVICE_SIGNATURE', message: 'Device signature headers are required' };
  const numericTimestamp = Number(timestamp);
  const timestampMs = numericTimestamp > 1e12 ? numericTimestamp : numericTimestamp * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return { ok: false, code: 'REQUEST_EXPIRED', message: 'Device request timestamp is outside the allowed window' };
  const message = await canonicalRequest(request, timestamp, nonce, body);
  const expected = await hmacHex(device.device_secret_hash, message);
  if (!constantTimeEqual(expected, signature)) return { ok: false, code: 'INVALID_DEVICE_SIGNATURE', message: 'Device signature is invalid' };
  if (!repository?.claimNonce) return { ok: false, code: 'INTERNAL_ERROR', message: 'Durable replay protection is unavailable' };
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + MAX_CLOCK_SKEW_MS).toISOString();
  await repository.cleanupExpiredNonces?.(createdAt).catch(() => {});
  const claimed = await repository.claimNonce(device.device_id, nonce, createdAt, expiresAt);
  if (!claimed) return { ok: false, code: 'REPLAY_DETECTED', message: 'Device nonce was already used' };
  return { ok: true };
}
