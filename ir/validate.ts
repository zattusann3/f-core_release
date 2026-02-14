// ir/validate.ts
import type {
  IR,
  Instruction,
  ChoiceInstruction,
  SayInstruction,
  EndInstruction,
  ChoiceOption,
  SetInstruction,
  IfInstruction,
  JumpInstruction,
  PluginInstruction,
  JsonValue,
} from "./types.ts";
import { createSafeRecord, isReservedKey } from "../util/safe_dict.ts";

export type ValidationError = {
  code: string;
  message: string;
  path?: string;
  suggestions?: string[];
};

export type ValidationWarning = {
  code: string;
  message: string;
  path?: string;
  suggestions?: string[];
};

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: ValidationWarning[] }
  | { ok: false; errors: ValidationError[]; warnings: ValidationWarning[] };

export function isIR(value: unknown): value is IR {
  return validateIR(value).ok;
}

export function validateIR(value: unknown): ValidationResult<IR> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!isRecord(value)) {
    return fail(errors, warnings, "E0500", "IR must be an object", "$");
  }

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== 1) {
    errors.push({
      code: "E0501",
      message: "schemaVersion must be 1",
      path: "$.schemaVersion",
    });
  }

  const engineVersion = value.engineVersion;
  if (typeof engineVersion !== "string") {
    errors.push({
      code: "E0502",
      message: "engineVersion must be a string",
      path: "$.engineVersion",
    });
  }

  if (value.entry !== "start") {
    errors.push({
      code: "E0503",
      message: "entry must be \"start\"",
      path: "$.entry",
    });
  }

  const pluginAllowlist = new Set<string>();
  if (!Array.isArray(value.plugins)) {
    errors.push({
      code: "E0507",
      message: "plugins must be an array",
      path: "$.plugins",
    });
  } else {
    for (let i = 0; i < value.plugins.length; i++) {
      const pluginName = value.plugins[i];
      if (typeof pluginName !== "string") {
        errors.push({
          code: "E0507",
          message: "plugin allowlist entries must be strings",
          path: `$.plugins[${i}]`,
        });
        continue;
      }
      if (!isValidPluginName(pluginName)) {
        errors.push({
          code: "E0320",
          message: "invalid plugin name",
          path: `$.plugins[${i}]`,
        });
        continue;
      }
      if (pluginAllowlist.has(pluginName)) {
        errors.push({
          code: "E0321",
          message: "duplicate plugin allowlist entry",
          path: `$.plugins[${i}]`,
        });
        continue;
      }
      pluginAllowlist.add(pluginName);
    }
  }

  if (!isRecord(value.labels)) {
    errors.push({
      code: "E0504",
      message: "labels must be an object",
      path: "$.labels",
    });
  } else {
    const labelNameList = Object.keys(value.labels);
    const validLabelNames = labelNameList.filter((name) => !isReservedKey(name));
    const labelNames = new Set(validLabelNames);
    const setVars = new Set<string>();

    for (const name of labelNameList) {
      if (isReservedKey(name)) {
        errors.push({
          code: "E0505",
          message: "reserved label name not allowed",
          path: `$.labels.${escapePath(name)}`,
        });
      }
    }

    if (!labelNames.has("start")) {
      errors.push({
        code: "E0301",
        message: "missing start label",
        path: "$.labels",
      });
    }

    for (const [label, instructions] of Object.entries(value.labels)) {
      if (isReservedKey(label)) continue;
      if (!Array.isArray(instructions)) {
        errors.push({
          code: "E0205",
          message: "label must map to an instruction array",
          path: `$.labels.${escapePath(label)}`,
        });
        continue;
      }

      validateLabelTermination(label, instructions, errors);

      instructions.forEach((inst, idx) => {
        const path = `$.labels.${escapePath(label)}[${idx}]`;
        if (!validateInstruction(inst, path, errors, setVars, pluginAllowlist)) return;
      });
    }

    // After instruction validation, resolve label references.
    for (const [label, instructions] of Object.entries(value.labels)) {
      if (!Array.isArray(instructions)) continue;
      instructions.forEach((inst, idx) => {
        if (!isRecord(inst)) return;
        if (inst.op === "choice") {
          if (!Array.isArray(inst.options)) return;
          inst.options.forEach((opt, optIdx) => {
            if (!isRecord(opt)) return;
            if (typeof opt.to !== "string") return;
            if (!labelNames.has(opt.to)) {
              const suggestions = suggestClosest(opt.to, labelNameList);
              errors.push({
                code: "E0401",
                message: "undefined label reference",
                path: `$.labels.${escapePath(label)}[${idx}].options[${optIdx}].to`,
                suggestions: suggestions.length > 0 ? suggestions : undefined,
              });
            }
          });
          return;
        }
        if (inst.op === "jump" || inst.op === "if") {
          const to = (inst as { to?: unknown }).to;
          if (typeof to !== "string") return;
          if (!labelNames.has(to)) {
            const suggestions = suggestClosest(to, labelNameList);
            errors.push({
              code: "E0401",
              message: "undefined label reference",
              path: `$.labels.${escapePath(label)}[${idx}].to`,
              suggestions: suggestions.length > 0 ? suggestions : undefined,
            });
          }
        }
        if (inst.op === "plugin") {
          const name = (inst as { name?: unknown }).name;
          if (typeof name !== "string") return;
          if (!pluginAllowlist.has(name)) {
            const suggestions = suggestClosest(name, Array.from(pluginAllowlist));
            errors.push({
              code: "E0322",
              message: "plugin is not allowlisted",
              path: `$.labels.${escapePath(label)}[${idx}].name`,
              suggestions: suggestions.length > 0 ? suggestions : undefined,
            });
          }
        }
      });
    }

    // Never-set variable reads are warnings.
    for (const [label, instructions] of Object.entries(value.labels)) {
      if (!Array.isArray(instructions)) continue;
      instructions.forEach((inst, idx) => {
        if (!isRecord(inst) || inst.op !== "if") return;
        const name = (inst as { name?: unknown }).name;
        if (typeof name !== "string") return;
        if (!setVars.has(name)) {
          const suggestions = suggestClosest(name, Array.from(setVars));
          warnings.push({
            code: "W0301",
            message: "variable referenced before any set",
            path: `$.labels.${escapePath(label)}[${idx}].name`,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
          });
        }
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  // Normalize externally-keyed maps into null-prototype records to avoid
  // prototype collisions (e.g. "toString") and keep runtime lookups safe.
  const labelsSafe = createSafeRecord<Instruction[]>();
  if (isRecord(value.labels)) {
    for (const [label, instructions] of Object.entries(value.labels)) {
      if (isReservedKey(label)) continue;
      if (!Array.isArray(instructions)) continue;
      labelsSafe[label] = instructions as Instruction[];
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      engineVersion: engineVersion as string,
      entry: "start",
      plugins: Array.from(pluginAllowlist),
      labels: labelsSafe,
    },
    warnings,
  };
}

function validateInstruction(
  value: unknown,
  path: string,
  errors: ValidationError[],
  setVars: Set<string>,
  pluginAllowlist: Set<string>,
): value is Instruction {
  if (!isRecord(value)) {
    errors.push({ code: "E0201", message: "instruction must be an object", path });
    return false;
  }

  switch (value.op) {
    case "say":
      return validateSay(value, path, errors);
    case "choice":
      return validateChoice(value, path, errors);
    case "end":
      return validateEnd(value, path, errors);
    case "set":
      return validateSet(value, path, errors, setVars);
    case "if":
      return validateIf(value, path, errors);
    case "jump":
      return validateJump(value, path, errors);
    case "plugin":
      return validatePlugin(value, path, errors, pluginAllowlist);
    default:
      errors.push({
        code: "E0202",
        message: "unknown instruction op",
        path: `${path}.op`,
      });
      return false;
  }
}

function validateSay(
  value: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
): value is SayInstruction {
  if (typeof value.text !== "string") {
    errors.push({
      code: "E0206",
      message: "say.text must be a string",
      path: `${path}.text`,
    });
    return false;
  }
  if (!validateSayMeta(value.meta, `${path}.meta`, errors)) {
    return false;
  }
  return true;
}

const SAY_META_LIMITS = {
  maxDepth: 6,
  maxNodes: 256,
};

function validateSayMeta(
  value: unknown,
  path: string,
  errors: ValidationError[],
): value is JsonValue | undefined {
  if (value === undefined) return true;
  if (!isJsonMetaObject(value)) {
    errors.push({
      code: "E0206",
      message: "say.meta must be an object when provided",
      path,
    });
    return false;
  }
  const counter = { nodes: 0 };
  return validateJsonValue(value, path, errors, 0, counter);
}

function validateJsonValue(
  value: unknown,
  path: string,
  errors: ValidationError[],
  depth: number,
  counter: { nodes: number },
): value is JsonValue {
  if (depth > SAY_META_LIMITS.maxDepth) {
    errors.push({
      code: "E0206",
      message: `say.meta nesting is too deep (max ${SAY_META_LIMITS.maxDepth})`,
      path,
    });
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return true;
    errors.push({
      code: "E0206",
      message: "say.meta numbers must be finite JSON numbers",
      path,
    });
    return false;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      counter.nodes++;
      if (counter.nodes > SAY_META_LIMITS.maxNodes) {
        errors.push({
          code: "E0206",
          message: `say.meta is too large (max ${SAY_META_LIMITS.maxNodes} nodes)`,
          path,
        });
        return false;
      }
      if (!validateJsonValue(value[i], `${path}[${i}]`, errors, depth + 1, counter)) return false;
    }
    return true;
  }
  if (!isJsonMetaObject(value)) {
    errors.push({
      code: "E0206",
      message: "say.meta must contain JSON-compatible values",
      path,
    });
    return false;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (isReservedKey(key)) {
      errors.push({
        code: "E0206",
        message: "reserved key is not allowed in say.meta",
        path: `${path}.${escapePath(key)}`,
      });
      return false;
    }
    counter.nodes++;
    if (counter.nodes > SAY_META_LIMITS.maxNodes) {
      errors.push({
        code: "E0206",
        message: `say.meta is too large (max ${SAY_META_LIMITS.maxNodes} nodes)`,
        path,
      });
      return false;
    }
    if (!validateJsonValue(nested, `${path}.${escapePath(key)}`, errors, depth + 1, counter)) {
      return false;
    }
  }
  return true;
}

function isJsonMetaObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateChoice(
  value: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
): value is ChoiceInstruction {
  if (!Array.isArray(value.options)) {
    errors.push({
      code: "E0203",
      message: "choice.options must be an array",
      path: `${path}.options`,
    });
    return false;
  }

  if (value.options.length === 0) {
    errors.push({
      code: "E0203",
      message: "choice.options must be non-empty",
      path: `${path}.options`,
    });
    return false;
  }

  value.options.forEach((opt, idx) => {
    validateChoiceOption(opt, `${path}.options[${idx}]`, errors);
  });

  return true;
}

function validateChoiceOption(
  value: unknown,
  path: string,
  errors: ValidationError[],
): value is ChoiceOption {
  if (!isRecord(value)) {
    errors.push({
      code: "E0204",
      message: "choice option must be an object",
      path,
    });
    return false;
  }

  if (typeof value.text !== "string") {
    errors.push({
      code: "E0204",
      message: "choice option.text must be a string",
      path: `${path}.text`,
    });
  }

  if (typeof value.to !== "string") {
    errors.push({
      code: "E0204",
      message: "choice option.to must be a string",
      path: `${path}.to`,
    });
  }

  return true;
}

function validateLabelTermination(
  label: string,
  instructions: unknown[],
  errors: ValidationError[],
): void {
  const endIndex = instructions.findIndex((inst) =>
    isRecord(inst) && inst.op === "end"
  );

  if (endIndex === -1) {
    errors.push({
      code: "E0302",
      message: "label not terminated with end",
      path: `$.labels.${escapePath(label)}`,
    });
    return;
  }

  if (endIndex !== instructions.length - 1) {
    errors.push({
      code: "E0303",
      message: "content after end",
      path: `$.labels.${escapePath(label)}[${endIndex + 1}]`,
    });
  }
}

function validateEnd(
  _value: Record<string, unknown>,
  _path: string,
  _errors: ValidationError[],
): _value is EndInstruction {
  return true;
}

function validateSet(
  value: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
  setVars: Set<string>,
): value is SetInstruction {
  const name = value.name;
  if (typeof name !== "string" || !isValidVarName(name)) {
    errors.push({
      code: "E0307",
      message: "invalid variable name",
      path: `${path}.name`,
    });
    return false;
  }

  if (!isValidValue(value.value)) {
    errors.push({
      code: "E0312",
      message: "set value must be boolean | number | string",
      path: `${path}.value`,
    });
    return false;
  }

  if (typeof value.value === "number" && !Number.isFinite(value.value)) {
    errors.push({
      code: "E0312",
      message: "set value must be a finite number",
      path: `${path}.value`,
    });
    return false;
  }

  setVars.add(name);
  return true;
}

function validateIf(
  value: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
): value is IfInstruction {
  const name = value.name;
  if (typeof name !== "string" || !isValidVarName(name)) {
    errors.push({
      code: "E0307",
      message: "invalid variable name",
      path: `${path}.name`,
    });
    return false;
  }

  if (typeof value.negated !== "boolean") {
    errors.push({
      code: "E0309",
      message: "if.negated must be boolean",
      path: `${path}.negated`,
    });
    return false;
  }

  if (value.equals !== undefined) {
    if (!isValidValue(value.equals)) {
      errors.push({
        code: "E0312",
        message: "if.equals must be boolean | number | string",
        path: `${path}.equals`,
      });
      return false;
    }
    if (typeof value.equals === "number" && !Number.isFinite(value.equals)) {
      errors.push({
        code: "E0312",
        message: "if.equals must be a finite number",
        path: `${path}.equals`,
      });
      return false;
    }
    if (value.negated) {
      errors.push({
        code: "E0313",
        message: "if.negated cannot be used with equality",
        path: `${path}.negated`,
      });
      return false;
    }
  }

  if (typeof value.to !== "string") {
    errors.push({
      code: "E0310",
      message: "if.to must be a string",
      path: `${path}.to`,
    });
    return false;
  }

  return true;
}

function validateJump(
  value: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
): value is JumpInstruction {
  if (typeof value.to !== "string") {
    errors.push({
      code: "E0311",
      message: "jump.to must be a string",
      path: `${path}.to`,
    });
    return false;
  }
  return true;
}

function validatePlugin(
  value: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
  pluginAllowlist: Set<string>,
): value is PluginInstruction {
  if (typeof value.name !== "string" || !isValidPluginName(value.name)) {
    errors.push({
      code: "E0320",
      message: "invalid plugin name",
      path: `${path}.name`,
    });
    return false;
  }

  if (!pluginAllowlist.has(value.name)) {
    errors.push({
      code: "E0322",
      message: "plugin is not allowlisted",
      path: `${path}.name`,
    });
    return false;
  }

  if (!isRecord(value.attrs)) {
    errors.push({
      code: "E0323",
      message: "plugin.attrs must be an object",
      path: `${path}.attrs`,
    });
    return false;
  }

  for (const [key, attrValue] of Object.entries(value.attrs)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
      errors.push({
        code: "E0323",
        message: "invalid plugin attribute key",
        path: `${path}.attrs.${escapePath(key)}`,
      });
      continue;
    }
    if (typeof attrValue !== "string") {
      errors.push({
        code: "E0323",
        message: "plugin attribute values must be strings",
        path: `${path}.attrs.${escapePath(key)}`,
      });
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapePath(key: string): string {
  return key.replaceAll(".", "\\.");
}

function fail(
  errors: ValidationError[],
  warnings: ValidationWarning[],
  code: string,
  message: string,
  path?: string,
): ValidationResult<never> {
  errors.push({ code, message, path });
  return { ok: false, errors, warnings };
}

function isValidVarName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value) && !isReservedKey(value);
}

function isValidPluginName(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(value)) return false;
  if (value === "plugin") return false;
  return !CORE_TAG_NAMES.has(value);
}

function isValidValue(value: unknown): value is boolean | number | string {
  return typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}

const CORE_TAG_NAMES = new Set(["label", "choice", "end", "set", "if", "jump", "plugin"]);

function suggestClosest(input: string, candidates: string[], max = 3): string[] {
  // Best-effort: avoid expensive scoring when candidate list is huge.
  if (candidates.length > 500) return [];

  const scored = candidates
    .filter((c) => c !== input)
    .map((c) => ({ c, d: levenshtein(input, c) }))
    .sort((a, b) => a.d - b.d || a.c.localeCompare(b.c));

  const best = scored.slice(0, max);
  if (best.length === 0) return [];

  const threshold = Math.max(2, Math.floor(input.length / 3));
  return best.filter((x) => x.d <= threshold).map((x) => x.c);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}
