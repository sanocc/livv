export function nowIso(): string {
  return new Date().toISOString();
}

export function isBusinessDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
