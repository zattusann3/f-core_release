import type { RuntimeState } from "./context.ts";
import {
  jsonByteLength,
  MAX_VARS_BYTES,
  MAX_VARS_ENTRIES,
  textByteLength,
} from "./runtime_limits.ts";
import { type CommandIR, executeCommand, type ExecuteOptions } from "./runtime.ts";
import type { RenderCommand, VarValue } from "./types.ts";
import { WorkerHost } from "./worker_host.ts";

const LABEL_NAME_RE = /^[A-Za-z0-9_]+$/;
const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_VAR_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const MAX_SAVE_DATA_BYTES = 64 * 1024;
const MAX_SCENARIO_LABELS = 1024;
const MAX_COMMANDS_PER_LABEL = 4096;

export class ScenarioSession {
  scenario: Record<string, CommandIR[]> = {};
  runtimeState: RuntimeState = { vars: {} };
  currentLabel: string | null = null;
  currentIndex = 0;
  private readonly workerHost: WorkerHost;
  private readonly executeOptions: ExecuteOptions;
  private readonly stepMutex = createAsyncMutex();

  constructor(workerHost = new WorkerHost(), executeOptions: ExecuteOptions = {}) {
    this.workerHost = workerHost;
    this.executeOptions = executeOptions;
  }

  loadScenario(scenario: Record<string, CommandIR[]>, startLabel: string): void {
    const normalizedScenario = normalizeScenario(scenario);
    if (!LABEL_NAME_RE.test(startLabel) || !(startLabel in normalizedScenario)) {
      throw new Error("invalid scenario");
    }

    this.scenario = normalizedScenario;
    this.runtimeState = { vars: { _last_input: null } };
    this.currentLabel = startLabel;
    this.currentIndex = 0;
  }

  async step(): Promise<RenderCommand[] | null> {
    const release = await this.stepMutex.acquire();
    try {
      if (this.currentLabel === null) {
        throw new Error("session not started");
      }
      const commands = this.scenario[this.currentLabel];
      if (!Array.isArray(commands)) {
        throw new Error("invalid session state");
      }

      const command = commands[this.currentIndex];
      if (!command) {
        this.runtimeState.vars["_last_input"] = null;
        return null;
      }

      const result = await executeCommand(
        this.runtimeState,
        command,
        this.workerHost,
        this.executeOptions,
      );
      try {
        if (!result.suspended) {
          if (result.jumpTo !== null) {
            if (!(result.jumpTo in this.scenario)) {
              throw new Error("invalid session state");
            }
            this.currentLabel = result.jumpTo;
            this.currentIndex = 0;
          } else if (result.requestedNext) {
            this.currentIndex += 1;
          }
        }
        return [...result.renderCommands];
      } finally {
        this.runtimeState.vars["_last_input"] = null;
      }
    } finally {
      release();
    }
  }

  provideInput(value: VarValue): void {
    if (this.currentLabel === null) {
      throw new Error("session not started");
    }
    this.runtimeState.vars["_last_input"] = value;
  }

  close(): void {
    this.workerHost.close();
  }

  exportSaveData(): string {
    if (this.currentLabel === null) {
      throw new Error("session not started");
    }

    const payload: SaveData = {
      currentLabel: this.currentLabel,
      currentIndex: this.currentIndex,
      vars: { ...this.runtimeState.vars },
    };

    return JSON.stringify(payload);
  }

  importSaveData(jsonData: string): void {
    if (Object.keys(this.scenario).length === 0) {
      throw new Error("session not started");
    }
    if (typeof jsonData !== "string" || textByteLength(jsonData) > MAX_SAVE_DATA_BYTES) {
      throw new Error("invalid save data");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonData);
    } catch {
      throw new Error("invalid save data");
    }

    const saveData = validateSaveData(parsed, this.scenario);
    this.runtimeState = { vars: { ...saveData.vars, _last_input: null } };
    this.currentLabel = saveData.currentLabel;
    this.currentIndex = saveData.currentIndex;
  }
}

interface SaveData {
  currentLabel: string | null;
  currentIndex: number;
  vars: Record<string, VarValue>;
}

function normalizeScenario(input: Record<string, CommandIR[]>): Record<string, CommandIR[]> {
  if (!isPlainRecord(input)) {
    throw new Error("invalid scenario");
  }
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > MAX_SCENARIO_LABELS) {
    throw new Error("invalid scenario");
  }

  const normalized: Record<string, CommandIR[]> = {};
  for (const [label, commands] of entries) {
    if (!LABEL_NAME_RE.test(label)) {
      throw new Error("invalid scenario");
    }
    if (!Array.isArray(commands) || commands.length > MAX_COMMANDS_PER_LABEL) {
      throw new Error("invalid scenario");
    }

    normalized[label] = commands.map(normalizeCommand);
  }
  return normalized;
}

function normalizeCommand(command: CommandIR): CommandIR {
  if (typeof command !== "object" || command === null || Array.isArray(command)) {
    throw new Error("invalid scenario");
  }
  const op = (command as { op?: unknown }).op;
  if (typeof op !== "string" || !/^[a-z0-9_]+$/.test(op)) {
    throw new Error("invalid scenario");
  }

  const args = (command as { args?: unknown }).args;
  if (args === undefined) {
    return { op };
  }
  if (!isPlainRecord(args)) {
    throw new Error("invalid scenario");
  }
  return { op, args: structuredClone(args) as Record<string, unknown> };
}

function validateSaveData(
  value: unknown,
  scenario: Record<string, CommandIR[]>,
): SaveData {
  if (!isPlainRecord(value)) {
    throw new Error("invalid save data");
  }

  const currentLabel = value["currentLabel"];
  const currentIndex = value["currentIndex"];
  const vars = value["vars"];

  if (
    !(currentLabel === null ||
      (typeof currentLabel === "string" && LABEL_NAME_RE.test(currentLabel)))
  ) {
    throw new Error("invalid save data");
  }
  if (typeof currentLabel === "string" && !(currentLabel in scenario)) {
    throw new Error("invalid save data");
  }
  if (typeof currentIndex !== "number" || !Number.isInteger(currentIndex) || currentIndex < 0) {
    throw new Error("invalid save data");
  }
  const normalizedIndex = currentIndex;

  const validatedVars = validateVars(vars);
  if (safeJsonByteLength(validatedVars) > MAX_VARS_BYTES) {
    throw new Error("invalid save data");
  }

  if (currentLabel === null) {
    if (normalizedIndex !== 0) {
      throw new Error("invalid save data");
    }
  } else {
    const commandLength = scenario[currentLabel].length;
    if (normalizedIndex > commandLength) {
      throw new Error("invalid save data");
    }
  }

  return {
    currentLabel,
    currentIndex: normalizedIndex,
    vars: validatedVars,
  };
}

function validateVars(value: unknown): Record<string, VarValue> {
  if (!isPlainRecord(value)) {
    throw new Error("invalid save data");
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_VARS_ENTRIES) {
    throw new Error("invalid save data");
  }

  const vars: Record<string, VarValue> = {};
  for (const [name, raw] of entries) {
    if (!VAR_NAME_RE.test(name)) {
      throw new Error("invalid save data");
    }
    if (RESERVED_VAR_NAMES.has(name)) {
      throw new Error("invalid save data");
    }
    if (name.startsWith("_")) {
      if (name !== "_last_input" || raw !== null) {
        throw new Error("invalid save data");
      }
      vars[name] = null;
      continue;
    }
    if (!isVarValue(raw)) {
      throw new Error("invalid save data");
    }
    vars[name] = raw;
  }
  return vars;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isVarValue(value: unknown): value is VarValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function safeJsonByteLength(value: unknown): number {
  try {
    return jsonByteLength(value);
  } catch {
    throw new Error("invalid save data");
  }
}

function createAsyncMutex(): { acquire: () => Promise<() => void> } {
  let locked = false;
  const waiters: Array<() => void> = [];

  return {
    async acquire(): Promise<() => void> {
      if (locked) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      locked = true;
      return () => {
        const next = waiters.shift();
        if (next) {
          next();
        } else {
          locked = false;
        }
      };
    },
  };
}
