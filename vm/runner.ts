// vm/runner.ts
import type {
  ChoiceInstruction,
  ChoiceOption,
  EndInstruction,
  IfInstruction,
  Instruction,
  IR,
  JumpInstruction,
  LabelName,
  PluginInstruction,
  SayMeta,
  SayInstruction,
  SetInstruction,
  Value,
} from "../ir/types.ts";
import { createSafeRecord, isReservedKey, safeHas } from "../util/safe_dict.ts";
import type { PluginManifest, PrimitiveToCapability } from "../plugin/capability.ts";
import { validateManifest, validatePrimitiveAccess } from "../plugin/capability.ts";

export type TraceEvent =
  | TraceStepEvent
  | TraceSayEvent
  | TraceChoicePresentEvent
  | TraceChoiceSelectEvent
  | TraceEndEvent;

export type ChooseFn = (options: ReadonlyArray<ChoiceOption>) => number | Promise<number>;

export type TraceSink = (event: TraceEvent) => void;
export type UISink = (event: UIEvent) => void;

export type RunResult =
  | {
    ok: true;
    reason: "end";
    label: string;
    ip: number;
    steps: number;
    vars: Record<string, Value>;
  }
  | {
    ok: false;
    reason: "error";
    label?: string;
    ip?: number;
    steps: number;
    error: RunError;
    vars: Record<string, Value>;
  };

export type RunOptions = {
  choose: ChooseFn;
  trace?: TraceSink;
  ui?: UISink;
  onPresentationDegraded?: (event: PresentationDegradedEvent) => void;
  vars?: Record<string, Value>;
  pluginRuntime?: PluginRuntime;
  pluginManifests?: Record<string, PluginManifest>;
  pluginTimeoutMs?: number;
  isCancelled?: () => boolean;
};

export type RunnerState = {
  vars: Record<string, Value>;
};

export async function run(ir: IR, options: RunOptions): Promise<RunResult> {
  let label: LabelName = ir.entry;
  let ip = 0;
  let steps = 0;
  const state: RunnerState = { vars: copyVarsSafe(options.vars) };

  const trace = options.trace;
  const ui = options.ui;
  const onPresentationDegraded = options.onPresentationDegraded;
  const pluginTimeoutMs = options.pluginTimeoutMs ?? DEFAULT_PLUGIN_TIMEOUT_MS;
  const isCancelled = options.isCancelled ?? (() => false);
  const runtimeCheck = preparePluginRuntime(ir, options.pluginRuntime, options.pluginManifests);
  if (!runtimeCheck.ok) {
    return errorResult(steps, state.vars, runtimeCheck.code, runtimeCheck.message, label, ip);
  }
  const pluginRuntime = runtimeCheck.value;

  while (true) {
    const instructions = ir.labels[label];
    if (!instructions) {
      return errorResult(steps, state.vars, "E0401", "undefined label reference", label, ip);
    }

    const inst = instructions[ip] as Instruction | undefined;
    if (!inst) {
      return errorResult(steps, state.vars, "E0302", "label not terminated with end", label, ip);
    }

    trace?.({ traceVersion: 1, event: "vm.step", step: steps, label, ip, op: inst.op });

    switch (inst.op) {
      case "say": {
        const say = inst as SayInstruction;
        handleSay(say, steps, label, ip, trace, ui);
        steps++;
        ip++;
        break;
      }
      case "set": {
        const setInst = inst as SetInstruction;
        state.vars[setInst.name] = setInst.value;
        steps++;
        ip++;
        break;
      }
      case "if": {
        const ifInst = inst as IfInstruction;
        const current = state.vars[ifInst.name] ?? false;
        if (ifInst.equals !== undefined) {
          const shouldJump = isStrictEqual(current, ifInst.equals);
          steps++;
          if (shouldJump) {
            label = ifInst.to;
            ip = 0;
          } else {
            ip++;
          }
          break;
        }
        if (typeof current !== "boolean") {
          return errorResult(
            steps,
            state.vars,
            "E0314",
            "if without equality requires a boolean value",
            label,
            ip,
          );
        }
        const shouldJump = ifInst.negated ? !current : current;
        steps++;
        if (shouldJump) {
          label = ifInst.to;
          ip = 0;
        } else {
          ip++;
        }
        break;
      }
      case "jump": {
        const jumpInst = inst as JumpInstruction;
        steps++;
        label = jumpInst.to;
        ip = 0;
        break;
      }
      case "choice": {
        const choice = inst as ChoiceInstruction;
        const next = await handleChoice(choice, steps, label, ip, options.choose, trace, ui);
        if (!next.ok) {
          return errorResult(
            steps,
            state.vars,
            next.error.code,
            next.error.message,
            label,
            ip,
            next.error.requestId,
            next.error.uiBridge,
          );
        }
        steps++;
        label = next.label;
        ip = 0;
        break;
      }
      case "plugin": {
        const pluginInst = inst as PluginInstruction;
        if (!ir.plugins.includes(pluginInst.name)) {
          return errorResult(steps, state.vars, "E0322", "plugin is not allowlisted", label, ip);
        }
        let invoked: PluginInvokeResult;
        try {
          invoked = await pluginRuntime.invoke(pluginInst.name, pluginInst.attrs, {
            timeoutMs: pluginTimeoutMs,
            isCancelled,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return errorResult(steps, state.vars, "E0704", message, label, ip);
        }
        if (!invoked.ok) {
          const code = invoked.code ?? "E0704";
          if (isPresentationPlugin(pluginInst.name) && code !== "E0705" && code !== "E0706") {
            const event: PresentationDegradedEvent = {
              schemaVersion: 1,
              event: "ui.presentation.degraded",
              label,
              ip,
              plugin: pluginInst.name,
              code,
              message: invoked.message,
            };
            ui?.(event);
            onPresentationDegraded?.(event);
            steps++;
            ip++;
            break;
          }
          return errorResult(steps, state.vars, code, invoked.message, label, ip);
        }
        steps++;
        ip++;
        break;
      }
      case "end": {
        const end = inst as EndInstruction;
        handleEnd(end, steps, label, ip, trace);
        steps++;
        return { ok: true, reason: "end", label, ip, steps, vars: state.vars };
      }
      default: {
        return errorResult(steps, state.vars, "E0202", "unknown instruction op", label, ip);
      }
    }
  }
}

function handleSay(
  inst: SayInstruction,
  step: number,
  label: string,
  ip: number,
  trace?: TraceSink,
  ui?: UISink,
): void {
  trace?.({ traceVersion: 1, event: "vm.say", step, label, ip, text: inst.text });
  ui?.({
    schemaVersion: 1,
    event: "ui.say",
    label,
    ip,
    text: inst.text,
    ...(inst.meta !== undefined ? { meta: inst.meta } : {}),
  });
}

async function handleChoice(
  inst: ChoiceInstruction,
  step: number,
  label: string,
  ip: number,
  choose: ChooseFn,
  trace?: TraceSink,
  ui?: UISink,
): Promise<{ ok: true; label: LabelName } | { ok: false; error: RunError }> {
  trace?.({ traceVersion: 1, event: "vm.choice.present", step, label, ip, choices: inst.options });
  ui?.({ schemaVersion: 1, event: "ui.choice.present", label, ip, choices: inst.options });

  let index: number;
  try {
    index = await choose(inst.options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        code: "E0704",
        message,
        requestId: getErrorRequestId(error),
        uiBridge: getErrorIsUiBridge(error),
      },
    };
  }
  if (!Number.isInteger(index)) {
    return { ok: false, error: { code: "E0305", message: "choice index must be an integer" } };
  }
  if (index < 0 || index >= inst.options.length) {
    return { ok: false, error: { code: "E0306", message: "choice index out of range" } };
  }

  const selected = inst.options[index];
  trace?.({
    traceVersion: 1,
    event: "vm.choice.select",
    step,
    label,
    ip,
    index,
    to: selected.to,
    nextLabel: selected.to,
  });
  ui?.({
    schemaVersion: 1,
    event: "ui.choice.select",
    label,
    ip,
    index,
    to: selected.to,
    nextLabel: selected.to,
  });

  return { ok: true, label: selected.to };
}

function getErrorRequestId(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const requestId = (error as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
}

function getErrorIsUiBridge(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { uiBridge?: unknown }).uiBridge === true;
}

function handleEnd(
  _inst: EndInstruction,
  step: number,
  label: string,
  ip: number,
  trace?: TraceSink,
): void {
  trace?.({ traceVersion: 1, event: "vm.end", step, label, ip });
}

function isStrictEqual(a: Value, b: Value): boolean {
  return typeof a === typeof b && a === b;
}

function copyVarsSafe(vars?: Record<string, Value>): Record<string, Value> {
  const out = createSafeRecord<Value>();
  if (!vars) return out;
  for (const [key, value] of Object.entries(vars)) {
    if (isReservedKey(key)) continue;
    out[key] = value;
  }
  return out;
}

export type RunError = {
  code: string;
  message: string;
  requestId?: string;
  uiBridge?: boolean;
};

function errorResult(
  steps: number,
  vars: Record<string, Value>,
  code: string,
  message: string,
  label?: string,
  ip?: number,
  requestId?: string,
  uiBridge?: boolean,
): RunResult {
  return {
    ok: false,
    reason: "error",
    label,
    ip,
    steps,
    error: { code, message, requestId, uiBridge },
    vars,
  };
}

export type TraceStepEvent = {
  traceVersion: 1;
  event: "vm.step";
  step: number;
  label: string;
  ip: number;
  op: "say" | "choice" | "end" | "set" | "if" | "jump" | "plugin";
};

export type TraceSayEvent = {
  traceVersion: 1;
  event: "vm.say";
  step: number;
  label: string;
  ip: number;
  text: string;
};

export type TraceChoicePresentEvent = {
  traceVersion: 1;
  event: "vm.choice.present";
  step: number;
  label: string;
  ip: number;
  choices: ReadonlyArray<ChoiceOption>;
};

export type TraceChoiceSelectEvent = {
  traceVersion: 1;
  event: "vm.choice.select";
  step: number;
  label: string;
  ip: number;
  index: number;
  to: LabelName;
  nextLabel: LabelName;
};

export type TraceEndEvent = {
  traceVersion: 1;
  event: "vm.end";
  step: number;
  label: string;
  ip: number;
};

export type UIEvent =
  | UISayEvent
  | UIChoicePresentEvent
  | UIChoiceSelectEvent
  | UIPresentationDegradedEvent;
export type PresentationDegradedEvent = UIPresentationDegradedEvent;

export type UISayEvent = {
  schemaVersion: 1;
  event: "ui.say";
  label: string;
  ip: number;
  text: string;
  meta?: SayMeta;
};

export type UIChoicePresentEvent = {
  schemaVersion: 1;
  event: "ui.choice.present";
  label: string;
  ip: number;
  choices: ReadonlyArray<ChoiceOption>;
};

export type UIChoiceSelectEvent = {
  schemaVersion: 1;
  event: "ui.choice.select";
  label: string;
  ip: number;
  index: number;
  to: LabelName;
  nextLabel: LabelName;
};

export type UIPresentationDegradedEvent = {
  schemaVersion: 1;
  event: "ui.presentation.degraded";
  label: string;
  ip: number;
  plugin: string;
  code: string;
  message: string;
};

export type PluginInvokeErrorCode = "E0704" | "E0705" | "E0706";
export type PluginInvokeResult = { ok: true } | {
  ok: false;
  message: string;
  code?: PluginInvokeErrorCode;
};
export type PluginInvokeContext = {
  timeoutMs: number;
  isCancelled: () => boolean;
};

export type PluginRuntime = {
  invoke: (
    name: string,
    attrs: Record<string, string>,
    context: PluginInvokeContext,
  ) => PluginInvokeResult | Promise<PluginInvokeResult>;
};

type PreparedPluginRuntime =
  | { ok: true; value: PluginRuntime }
  | { ok: false; code: string; message: string };

export const DEFAULT_PRIMITIVE_TO_CAPABILITY: PrimitiveToCapability = {
  "ui.render": "ui",
  "time.sleep": "timer",
  "debug.log": "debug",
};

export const DEFAULT_PLUGIN_TIMEOUT_MS = 5000;

export function preparePluginRuntime(
  ir: IR,
  pluginRuntime?: PluginRuntime,
  manifests?: Record<string, PluginManifest>,
  primitiveToCapability: PrimitiveToCapability = DEFAULT_PRIMITIVE_TO_CAPABILITY,
): PreparedPluginRuntime {
  if (ir.plugins.length === 0) {
    return {
      ok: true,
      value: pluginRuntime ?? {
        invoke: () => ({ ok: true }),
      },
    };
  }

  if (!pluginRuntime) {
    return { ok: false, code: "E0701", message: "plugin runtime is required for this IR" };
  }

  if (!manifests) {
    return { ok: false, code: "E0702", message: "plugin manifests are required for this IR" };
  }

  const degradedPlugins = createSafeRecord<string>();

  for (const pluginName of ir.plugins) {
    if (!safeHas(manifests as Record<string, unknown>, pluginName)) {
      if (isPresentationPlugin(pluginName)) {
        degradedPlugins[pluginName] = `missing manifest for plugin: ${pluginName}`;
        continue;
      }
      return { ok: false, code: "E0702", message: `missing manifest for plugin: ${pluginName}` };
    }
    const manifest = manifests[pluginName];
    const validation = validateManifest(manifest, primitiveToCapability);
    if (!validation.ok) {
      if (isPresentationPlugin(pluginName)) {
        degradedPlugins[pluginName] = `invalid manifest for plugin ${pluginName}: ${
          validation.errors.join("; ")
        }`;
        continue;
      }
      return {
        ok: false,
        code: "E0703",
        message: `invalid manifest for plugin ${pluginName}: ${validation.errors.join("; ")}`,
      };
    }
    const access = validatePrimitiveAccess(manifest, pluginName, primitiveToCapability);
    if (!access.ok) {
      if (isPresentationPlugin(pluginName)) {
        degradedPlugins[pluginName] = `manifest denies plugin ${pluginName}: ${access.message}`;
        continue;
      }
      return {
        ok: false,
        code: "E0703",
        message: `manifest denies plugin ${pluginName}: ${access.message}`,
      };
    }
  }

  return {
    ok: true,
    value: {
      invoke: (name, attrs, context) => {
        if (safeHas(degradedPlugins, name)) {
          return { ok: false, code: "E0704", message: degradedPlugins[name] };
        }
        return pluginRuntime.invoke(name, attrs, context);
      },
    },
  };
}

function isPresentationPlugin(name: string): boolean {
  return name === "ui.render";
}
