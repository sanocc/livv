export const DEVICE_STATUSES = ['pending', 'approved', 'disabled', 'revoked'];
export const APPROVED_STATUS = 'approved';

export function jsonError(code, message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
