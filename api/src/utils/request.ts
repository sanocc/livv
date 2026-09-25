export async function readJson(request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (_) {
    return null;
  }
}

export function nowISO() { return new Date().toISOString(); }

export function validText(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}
