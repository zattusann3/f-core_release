import { isReservedKey } from "./util/safe_dict.ts";

export const GUI_BRIDGE_SCHEMA_VERSION = 1;
export const GUI_BRIDGE_MAX_MESSAGE_BYTES = 65_536;
export const GUI_BRIDGE_EXT_MAX_DEPTH = 4;
export const GUI_BRIDGE_EXT_MAX_KEYS = 128;

const GUI_COMMAND_ALLOWLIST = new Set(["choice.select"]);
const UI_COMMAND_KEYS = new Set(["schemaVersion", "command", "requestId", "index", "extensions"]);

export type UIChoiceSelectCommand = {
  schemaVersion: 1;
  command: "choice.select";
  requestId: string;
  index: number;
  extensions?: ExtensionObject;
};

export type UICommand = UIChoiceSelectCommand;

export type UICommandParseResult =
  | { ok: true; value: UICommand }
  | { ok: false; message: string; requestId?: string };

type ExtensionValue = string | number | boolean | null | ExtensionObject | ExtensionArray;
interface ExtensionObject {
  [key: string]: ExtensionValue;
}
interface ExtensionArray extends Array<ExtensionValue> {}

export function parseUiCommandLine(line: string): UICommandParseResult {
  const bytes = new TextEncoder().encode(line);
  if (bytes.byteLength > GUI_BRIDGE_MAX_MESSAGE_BYTES) {
    return { ok: false, message: "ui command exceeds max bytes" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, message: "ui command is not valid JSON" };
  }

  if (!isRecord(raw)) return { ok: false, message: "ui command must be an object" };
  const obj = raw as Record<string, unknown>;

  const requestIdHint = getRequestIdHint(obj);

  for (const key of Object.keys(obj)) {
    if (!UI_COMMAND_KEYS.has(key)) {
      return { ok: false, message: `unknown top-level field: ${key}`, requestId: requestIdHint };
    }
  }

  if (obj.schemaVersion !== GUI_BRIDGE_SCHEMA_VERSION) {
    return { ok: false, message: "schemaVersion mismatch", requestId: requestIdHint };
  }
  if (typeof obj.command !== "string" || !GUI_COMMAND_ALLOWLIST.has(obj.command)) {
    return { ok: false, message: "command is not allowlisted", requestId: requestIdHint };
  }
  if (typeof obj.requestId !== "string" || obj.requestId.length === 0) {
    return { ok: false, message: "requestId is required" };
  }

  let extensions: ExtensionObject | undefined;
  if (obj.extensions !== undefined) {
    const normalized = normalizeExtensions(obj.extensions);
    if (!normalized.ok) {
      return { ok: false, message: normalized.message, requestId: requestIdHint };
    }
    extensions = normalized.value;
  }

  if (obj.command === "choice.select") {
    if (!Number.isInteger(obj.index)) return { ok: false, message: "index must be an integer" };
    return {
      ok: true,
      value: {
        schemaVersion: 1,
        command: "choice.select",
        requestId: obj.requestId,
        index: obj.index as number,
        extensions,
      },
    };
  }

  return { ok: false, message: "unsupported command", requestId: requestIdHint };
}

function normalizeExtensions(
  value: unknown,
): { ok: true; value: ExtensionObject } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "extensions must be an object" };
  const state = { totalKeys: 0 };
  const normalized = normalizeExtensionValue(value as Record<string, unknown>, 1, state);
  if (!normalized.ok) return normalized;
  if (!isRecord(normalized.value)) return { ok: false, message: "extensions must be an object" };
  return { ok: true, value: normalized.value as ExtensionObject };
}

function normalizeExtensionValue(
  value: unknown,
  depth: number,
  state: { totalKeys: number },
): { ok: true; value: ExtensionValue } | { ok: false; message: string } {
  if (depth > GUI_BRIDGE_EXT_MAX_DEPTH) {
    return { ok: false, message: "extensions nesting depth exceeds limit" };
  }

  if (Array.isArray(value)) {
    const out: ExtensionValue[] = [];
    for (const item of value) {
      state.totalKeys++;
      if (state.totalKeys > GUI_BRIDGE_EXT_MAX_KEYS) {
        return { ok: false, message: "extensions key count exceeds limit" };
      }
      const normalizedItem = normalizeExtensionValue(item, depth + 1, state);
      if (!normalizedItem.ok) return normalizedItem;
      out.push(normalizedItem.value);
    }
    return { ok: true, value: out };
  }

  if (isRecord(value)) {
    const out = Object.create(null) as Record<string, ExtensionValue>;
    for (const [key, nestedValue] of Object.entries(value)) {
      if (isReservedKey(key)) return { ok: false, message: `reserved key not allowed: ${key}` };
      state.totalKeys++;
      if (state.totalKeys > GUI_BRIDGE_EXT_MAX_KEYS) {
        return { ok: false, message: "extensions key count exceeds limit" };
      }
      const normalized = normalizeExtensionValue(nestedValue, depth + 1, state);
      if (!normalized.ok) return normalized;
      out[key] = normalized.value;
    }
    return { ok: true, value: out };
  }

  if (
    typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean" || value === null
  ) {
    return { ok: true, value };
  }
  return { ok: false, message: "extensions contains unsupported value type" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequestIdHint(value: Record<string, unknown>): string | undefined {
  const requestId = value.requestId;
  if (typeof requestId === "string" && requestId.length > 0) return requestId;
  return undefined;
}
