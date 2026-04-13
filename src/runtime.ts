import type { RuntimeState } from "./context.ts";
import { PLUGIN_MANIFEST } from "./plugin_manifest.ts";
import type { PluginArgs, VarValue } from "./types.ts";
import type {
  WorkerExecuteRequest,
  WorkerExecuteResponse,
  WorkerExecuteSuccess,
} from "./worker_protocol.ts";

const DEFAULT_TIMEOUT_MS = 1000;
const OP_NAME_RE = /^[a-z0-9_]+$/;

export interface CommandIR {
  op: string;
  args?: PluginArgs;
}

export interface CommandResult {
  vars: Readonly<Record<string, VarValue>>;
  jumpTo: string | null;
  requestedNext: boolean;
}

export interface ExecuteOptions {
  timeoutMs?: number;
}

export async function executeCommand(
  state: RuntimeState,
  command: CommandIR,
  options: ExecuteOptions = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const pluginAsset = await readPluginAsset(command.op);
    const request: WorkerExecuteRequest = {
      type: "execute",
      op: command.op,
      args: command.args ?? {},
      vars: { ...state.vars },
      pluginSource: pluginAsset.source,
      pluginModuleUrl: pluginAsset.moduleUrl,
    };
    const workerResult = await runInWorker(request, timeoutMs);
    applyWorkerResult(state, workerResult);

    return {
      vars: Object.freeze({ ...state.vars }),
      jumpTo: workerResult.jumpTo,
      requestedNext: workerResult.requestedNext,
    };
  } catch (err) {
    console.error("[Engine Internal] Plugin execution failed:", {
      op: command.op,
      timeoutMs,
      err,
    });
    throw new Error("operation rejected");
  }
}

async function runInWorker(
  request: WorkerExecuteRequest,
  timeoutMs: number,
): Promise<WorkerExecuteSuccess> {
  const worker = new Worker(new URL("./worker_runner.ts", import.meta.url).href, {
    type: "module",
    deno: { permissions: "none" },
  });

  return await new Promise<WorkerExecuteSuccess>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      worker.terminate();
      reject(new Error(`worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    };

    worker.onmessage = (event: MessageEvent<WorkerExecuteResponse>) => {
      cleanup();
      worker.terminate();

      const payload = event.data;
      if (!isWorkerResponse(payload)) {
        reject(new Error("invalid worker response"));
        return;
      }
      if (!payload.ok) {
        reject(new Error(payload.reason || "worker rejected"));
        return;
      }
      if (!isWorkerSuccess(payload)) {
        reject(new Error("invalid worker success payload"));
        return;
      }
      resolve(payload);
    };

    worker.onerror = (event) => {
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "worker error"));
    };

    worker.onmessageerror = () => {
      cleanup();
      worker.terminate();
      reject(new Error("worker message error"));
    };

    worker.postMessage(request);
  });
}

async function readPluginAsset(opName: string): Promise<{ source: string; moduleUrl: string }> {
  if (!OP_NAME_RE.test(opName)) {
    throw new Error("operation denied");
  }
  const manifestEntry = PLUGIN_MANIFEST[opName];
  if (!manifestEntry) {
    throw new Error(`integrity violation: ${opName} not in manifest`);
  }
  const moduleUrl = new URL(`./plugins/${opName}.ts`, import.meta.url);
  const source = await Deno.readTextFile(moduleUrl);
  const hashHex = await sha256Hex(source);
  if (hashHex !== manifestEntry.sha256) {
    throw new Error(`integrity violation: ${opName} hash mismatch`);
  }
  return { source, moduleUrl: moduleUrl.href };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function applyWorkerResult(state: RuntimeState, result: WorkerExecuteSuccess): void {
  if (result.jumpTo !== null && result.requestedNext) {
    throw new Error("conflicting flow result");
  }

  for (const [name, value] of Object.entries(result.varsPatch)) {
    if (!isValidVarName(name)) {
      throw new Error(`invalid variable name from worker: ${name}`);
    }
    if (!isVarValue(value)) {
      throw new Error(`invalid variable value from worker: ${name}`);
    }
    if (name.startsWith("_")) {
      throw new Error(`reserved variable write from worker: ${name}`);
    }
    state.vars[name] = value;
  }
}

function isWorkerResponse(value: unknown): value is WorkerExecuteResponse {
  return typeof value === "object" && value !== null && "ok" in value;
}

function isWorkerSuccess(value: unknown): value is WorkerExecuteSuccess {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if ((value as { ok?: unknown }).ok !== true) return false;
  const candidate = value as WorkerExecuteSuccess;
  if (typeof candidate.requestedNext !== "boolean") return false;
  if (!(candidate.jumpTo === null || typeof candidate.jumpTo === "string")) return false;
  if (!isVarPatch(candidate.varsPatch)) return false;
  return true;
}

function isVarPatch(value: unknown): value is Record<string, VarValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const v of Object.values(value)) {
    if (!isVarValue(v)) return false;
  }
  return true;
}

function isVarValue(value: unknown): value is VarValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isValidVarName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
