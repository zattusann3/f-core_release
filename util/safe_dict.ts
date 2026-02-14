// util/safe_dict.ts
//
// Helpers for safely handling externally keyed dictionaries.
// Use null-prototype records and reject reserved keys to avoid prototype pollution.

export const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function isReservedKey(key: string): boolean {
  return RESERVED_KEYS.has(key);
}

export function createSafeRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function safeSet<T>(
  record: Record<string, T>,
  key: string,
  value: T,
): { ok: true } | { ok: false; message: string } {
  if (isReservedKey(key)) return { ok: false, message: `reserved key not allowed: ${key}` };
  (record as Record<string, T>)[key] = value;
  return { ok: true };
}

export function safeHas(record: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(record, key);
}
