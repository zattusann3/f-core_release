import type { RuntimeState } from "./context.ts";
import { sha256Hex, verifyManifestSignature } from "./manifest_crypto.ts";
import { PLUGIN_MANIFEST, PLUGIN_MANIFEST_SIGNATURE_BASE64 } from "./plugin_manifest.ts";
import { MANIFEST_VERIFY_KEY_RAW_BASE64 } from "./manifest_trust_anchor.ts";
import {
  jsonByteLength,
  MAX_ARGS_BYTES,
  MAX_JUMP_LABEL_BYTES,
  MAX_VARS_BYTES,
  MAX_VARS_ENTRIES,
  MAX_VARS_PATCH_BYTES,
  MAX_VARS_PATCH_ENTRIES,
  textByteLength,
} from "./runtime_limits.ts";
import type { PluginArgs, VarValue } from "./types.ts";
import type {
  WorkerExecuteRequest,
  WorkerExecuteResponse,
  WorkerExecuteSuccess,
} from "./worker_protocol.ts";

const DEFAULT_TIMEOUT_MS = 1000;
const OP_NAME_RE = /^[a-z0-9_]+$/;
const EXECUTION_MUTEX = createAsyncMutex();
let manifestIntegrityPromise: Promise<void> | null = null;

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
  const release = await EXECUTION_MUTEX.acquire();
  const requestId = crypto.randomUUID();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = performance.now();

  try {
    await assertManifestIntegrity();
    requireManifestOp(command.op);

    const args = command.args ?? {};
    assertInputLimits(args, state.vars);

    const pluginAsset = await readPluginAsset(command.op);
    const request: WorkerExecuteRequest = {
      type: "execute",
      requestId,
      op: command.op,
      args,
      vars: { ...state.vars },
      pluginSource: pluginAsset.source,
    };

    const workerResult = await runInWorker(request, timeoutMs);
    assertOutputLimits(workerResult);
    applyWorkerResult(state, workerResult);

    return {
      vars: Object.freeze({ ...state.vars }),
      jumpTo: workerResult.jumpTo,
      requestedNext: workerResult.requestedNext,
    };
  } catch (err) {
    logInternal("runtime.execute.failed", {
      requestId,
      op: command.op,
      timeoutMs,
      durationMs: Math.round(performance.now() - startedAt),
      error: errorToLog(err),
    });
    throw new Error("operation rejected");
  } finally {
    release();
  }
}

function requireManifestOp(opName: string): void {
  if (!(opName in PLUGIN_MANIFEST)) {
    throw new Error(`integrity violation: ${opName} not in manifest`);
  }
}

async function assertManifestIntegrity(): Promise<void> {
  if (!manifestIntegrityPromise) {
    manifestIntegrityPromise = (async () => {
      const ok = await verifyManifestSignature(
        PLUGIN_MANIFEST,
        PLUGIN_MANIFEST_SIGNATURE_BASE64,
        MANIFEST_VERIFY_KEY_RAW_BASE64,
      );
      if (!ok) {
        throw new Error("integrity violation");
      }
    })();
  }
  await manifestIntegrityPromise;
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
      reject(new Error("worker timeout"));
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
      if (payload.requestId !== request.requestId) {
        reject(new Error("request correlation mismatch"));
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

async function readPluginAsset(opName: string): Promise<{ source: string }> {
  if (!OP_NAME_RE.test(opName)) {
    throw new Error("operation denied");
  }
  requireManifestOp(opName);
  const manifestEntry = PLUGIN_MANIFEST[opName];
  const pluginUrl = new URL(`./plugins/${opName}.ts`, import.meta.url);
  const source = await Deno.readTextFile(pluginUrl);
  const hashHex = await sha256Hex(source);
  if (hashHex !== manifestEntry.sha256) {
    throw new Error("integrity violation");
  }
  return { source };
}

function applyWorkerResult(state: RuntimeState, result: WorkerExecuteSuccess): void {
  if (result.jumpTo !== null && result.requestedNext) {
    throw new Error("conflicting flow result");
  }

  for (const [name, value] of Object.entries(result.varsPatch)) {
    if (!isValidVarName(name)) {
      throw new Error("invalid variable name");
    }
    if (!isVarValue(value)) {
      throw new Error("invalid variable value");
    }
    if (name.startsWith("_")) {
      throw new Error("reserved variable write");
    }
    state.vars[name] = value;
  }
}

function assertInputLimits(args: PluginArgs, vars: Readonly<Record<string, VarValue>>): void {
  const varsEntries = Object.keys(vars).length;
  if (varsEntries > MAX_VARS_ENTRIES) {
    throw new Error("resource limit exceeded");
  }
  if (safeJsonByteLength(args) > MAX_ARGS_BYTES) {
    throw new Error("resource limit exceeded");
  }
  if (safeJsonByteLength(vars) > MAX_VARS_BYTES) {
    throw new Error("resource limit exceeded");
  }
}

function assertOutputLimits(result: WorkerExecuteSuccess): void {
  const patchEntries = Object.keys(result.varsPatch).length;
  if (patchEntries > MAX_VARS_PATCH_ENTRIES) {
    throw new Error("resource limit exceeded");
  }
  if (safeJsonByteLength(result.varsPatch) > MAX_VARS_PATCH_BYTES) {
    throw new Error("resource limit exceeded");
  }
  if (result.jumpTo !== null && textByteLength(result.jumpTo) > MAX_JUMP_LABEL_BYTES) {
    throw new Error("resource limit exceeded");
  }
}

function safeJsonByteLength(value: unknown): number {
  try {
    return jsonByteLength(value);
  } catch {
    throw new Error("resource limit exceeded");
  }
}

function isWorkerResponse(value: unknown): value is WorkerExecuteResponse {
  return typeof value === "object" && value !== null && "ok" in value;
}

function isWorkerSuccess(value: unknown): value is WorkerExecuteSuccess {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if ((value as { ok?: unknown }).ok !== true) return false;
  const candidate = value as WorkerExecuteSuccess;
  if (typeof candidate.requestId !== "string" || candidate.requestId.length === 0) return false;
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

function logInternal(event: string, detail: Record<string, unknown>): void {
  console.error(JSON.stringify({
    level: "error",
    scope: "engine-internal",
    event,
    ...detail,
  }));
}

function errorToLog(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { message: String(err) };
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
