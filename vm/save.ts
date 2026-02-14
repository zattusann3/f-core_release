// vm/save.ts
import type { Value } from "../ir/types.ts";
import { createSafeRecord, isReservedKey } from "../util/safe_dict.ts";

export type SaveData = {
  schemaVersion: 1;
  engineVersion: string;
  vars: Record<string, Value>;
};

export type SaveResult =
  | { ok: true; value: SaveData }
  | { ok: false; message: string };

export function serializeSave(data: SaveData): string {
  const normalized = {
    schemaVersion: data.schemaVersion,
    engineVersion: data.engineVersion,
    vars: data.vars,
  };
  return JSON.stringify(normalized, null, 2) + "\n";
}

export function parseSave(text: string): SaveResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "invalid JSON" };
  }

  if (!isRecord(raw)) return { ok: false, message: "save must be an object" };
  if (raw.schemaVersion !== 1) return { ok: false, message: "unsupported save schemaVersion" };
  if (typeof raw.engineVersion !== "string") return { ok: false, message: "engineVersion must be string" };
  if (!isRecord(raw.vars)) return { ok: false, message: "vars must be an object" };

  const safeVars = createSafeRecord<Value>();
  for (const [key, value] of Object.entries(raw.vars)) {
    if (isReservedKey(key)) {
      return { ok: false, message: `reserved var name: ${key}` };
    }
    if (!isValidValue(value)) return { ok: false, message: `invalid value for var: ${key}` };
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { ok: false, message: `invalid number for var: ${key}` };
    }
    safeVars[key] = value;
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      engineVersion: raw.engineVersion,
      vars: safeVars,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidValue(value: unknown): value is Value {
  return typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}
