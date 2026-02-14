// ir/serialize.ts
import type {
  IR,
  Instruction,
  SayInstruction,
  ChoiceInstruction,
  EndInstruction,
  ChoiceOption,
  LabelName,
  SetInstruction,
  IfInstruction,
  JumpInstruction,
  PluginInstruction,
  JsonValue,
} from "./types.ts";

const SAY_META_LIMITS = {
  maxDepth: 6,
  maxNodes: 256,
};

/**
 * Serialize IR as human-readable JSON with:
 * - stable key order
 * - stable label order (sorted)
 * - stable instruction/option field order
 * - 2-space indentation
 * - trailing newline
 */
export function serializeIR(ir: IR): string {
  const normalized = normalizeIR(ir);
  return JSON.stringify(normalized, null, 2) + "\n";
}

function normalizeIR(ir: IR): object {
  const labelsSorted = sortRecordKeys(ir.labels);

  const normalizedLabels: Record<string, object[]> = {};
  for (const [label, instructions] of Object.entries(labelsSorted)) {
    normalizedLabels[label] = instructions.map(normalizeInstruction);
  }

  // Root key order MUST be stable: schemaVersion -> engineVersion -> entry -> plugins -> labels
  return {
    schemaVersion: ir.schemaVersion,
    engineVersion: ir.engineVersion,
    entry: ir.entry,
    plugins: [...ir.plugins].sort((a, b) => a.localeCompare(b)),
    labels: normalizedLabels,
  };
}

function normalizeInstruction(inst: Instruction): object {
  switch (inst.op) {
    case "say":
      return normalizeSay(inst);
    case "choice":
      return normalizeChoice(inst);
    case "end":
      return normalizeEnd(inst);
    case "set":
      return normalizeSet(inst);
    case "if":
      return normalizeIf(inst);
    case "jump":
      return normalizeJump(inst);
    case "plugin":
      return normalizePlugin(inst);
    default: {
      // Exhaustiveness check (L1 is closed)
      const _never: never = inst;
      return _never;
    }
  }
}

function normalizeSay(inst: SayInstruction): object {
  // op -> text -> meta
  const out: { op: "say"; text: string; meta?: JsonValue } = {
    op: inst.op,
    text: inst.text,
  };
  if (inst.meta !== undefined) {
    out.meta = normalizeJsonValue(inst.meta, 0, { nodes: 0 });
  }
  return out;
}

function normalizeChoice(inst: ChoiceInstruction): object {
  // op -> options (and each option stable fields)
  return {
    op: inst.op,
    options: inst.options.map(normalizeChoiceOption),
  };
}

function normalizeChoiceOption(opt: ChoiceOption): object {
  // text -> to
  return {
    text: opt.text,
    to: opt.to,
  };
}

function normalizeEnd(inst: EndInstruction): object {
  // op only
  return {
    op: inst.op,
  };
}

function normalizeSet(inst: SetInstruction): object {
  // op -> name -> value
  return {
    op: inst.op,
    name: inst.name,
    value: inst.value,
  };
}

function normalizeIf(inst: IfInstruction): object {
  // op -> name -> negated -> to
  return {
    op: inst.op,
    name: inst.name,
    negated: inst.negated,
    equals: inst.equals,
    to: inst.to,
  };
}

function normalizeJump(inst: JumpInstruction): object {
  // op -> to
  return {
    op: inst.op,
    to: inst.to,
  };
}

function normalizePlugin(inst: PluginInstruction): object {
  // op -> name -> attrs (sorted key order)
  const attrs: Record<string, string> = {};
  const keys = Object.keys(inst.attrs).sort((a, b) => a.localeCompare(b));
  for (const key of keys) attrs[key] = inst.attrs[key];
  return {
    op: inst.op,
    name: inst.name,
    attrs,
  };
}

function sortRecordKeys<T>(
  record: Record<LabelName, T>,
): Record<LabelName, T> {
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  const out: Record<string, T> = {};
  for (const k of keys) out[k] = record[k];
  return out as Record<LabelName, T>;
}

function normalizeJsonValue(value: JsonValue, depth: number, counter: { nodes: number }): JsonValue {
  if (depth > SAY_META_LIMITS.maxDepth) {
    throw new Error(`say.meta nesting is too deep for serialization (max ${SAY_META_LIMITS.maxDepth})`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      counter.nodes++;
      if (counter.nodes > SAY_META_LIMITS.maxNodes) {
        throw new Error(`say.meta is too large for serialization (max ${SAY_META_LIMITS.maxNodes} nodes)`);
      }
      return normalizeJsonValue(item, depth + 1, counter);
    });
  }
  const out: Record<string, JsonValue> = {};
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    counter.nodes++;
    if (counter.nodes > SAY_META_LIMITS.maxNodes) {
      throw new Error(`say.meta is too large for serialization (max ${SAY_META_LIMITS.maxNodes} nodes)`);
    }
    out[key] = normalizeJsonValue(value[key], depth + 1, counter);
  }
  return out;
}
