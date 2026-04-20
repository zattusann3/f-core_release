import { createPluginContext, type FlowControl, type RuntimeState } from "./context.ts";
import { sha256Hex } from "./manifest_crypto.ts";
import { PLUGIN_MANIFEST } from "./plugin_manifest.ts";
import {
  jsonByteLength,
  MAX_ARGS_BYTES,
  MAX_JUMP_LABEL_BYTES,
  MAX_RENDER_COMMANDS_BYTES,
  MAX_RENDER_COMMANDS_ENTRIES,
  MAX_VARS_BYTES,
  MAX_VARS_ENTRIES,
  MAX_VARS_PATCH_BYTES,
  MAX_VARS_PATCH_ENTRIES,
  textByteLength,
} from "./runtime_limits.ts";
import type { PluginModule, VarValue } from "./types.ts";
import type {
  WorkerExecuteRequest,
  WorkerExecuteResponse,
  WorkerExecuteSuccess,
} from "./worker_protocol.ts";

const OP_NAME_RE = /^[a-z0-9_]+$/;
type PluginFactory = () => Promise<unknown>;

const WORKER_PLUGIN_FACTORIES: Readonly<Record<string, PluginFactory>> = Object.freeze({
  asset: () => import("./plugins/asset.ts"),
  choice: () => import("./plugins/choice.ts"),
  effect: () => import("./plugins/effect.ts"),
  menu: () => import("./plugins/menu.ts"),
  say: () => import("./plugins/say.ts"),
  set: () => import("./plugins/set.ts"),
});

self.onmessage = (event: MessageEvent<WorkerExecuteRequest>) => {
  run(event.data);
};

async function run(request: unknown): Promise<void> {
  const requestId = extractRequestId(request);
  try {
    if (!isExecuteRequest(request)) {
      postFailure(requestId, "invalid request");
      return;
    }

    if (!OP_NAME_RE.test(request.op)) {
      postFailure(request.requestId, "operation denied");
      return;
    }
    if (!hasManifestEntry(request.op)) {
      postFailure(request.requestId, "integrity violation");
      return;
    }

    assertInputLimits(request.args, request.vars);

    const plugin = await loadPluginInWorker(
      request.op,
      request.pluginSource,
    );
    const state: RuntimeState = { vars: { ...request.vars }, renderCommands: [] };
    const renderCommands = state.renderCommands ?? [];
    state.renderCommands = renderCommands;
    const flow: FlowControl = { jumpTo: null, requestedNext: false, suspended: false };
    const context = createPluginContext(state, flow);

    await plugin.execute(context, request.args);
    const varsPatch = computeVarsPatch(request.vars, state.vars);
    assertOutputLimits(varsPatch, flow.jumpTo, renderCommands);

    const response: WorkerExecuteSuccess = {
      ok: true,
      requestId: request.requestId,
      varsPatch,
      jumpTo: flow.jumpTo,
      requestedNext: flow.requestedNext,
      suspended: flow.suspended,
      renderCommands,
    };
    self.postMessage(response);
  } catch (err) {
    logInternal("worker.execute.failed", {
      requestId,
      error: errorToLog(err),
    });
    postFailure(requestId, errorToReason(err));
  }
}

async function loadPluginInWorker(
  opName: string,
  pluginSource: string,
): Promise<PluginModule> {
  const manifestEntry = PLUGIN_MANIFEST[opName];
  if (!manifestEntry) {
    throw new Error("integrity violation");
  }

  const actualHash = await sha256Hex(pluginSource);
  if (actualHash !== manifestEntry.sha256) {
    logInternal("worker.plugin.integrity_violation", { op: opName });
    throw new Error("integrity violation");
  }

  assertNoRuntimeModuleLoading(pluginSource);
  const factory = WORKER_PLUGIN_FACTORIES[opName];
  if (!factory) {
    throw new Error("operation unavailable");
  }
  // Note: There is a theoretical TOCTOU gap between verifying the hash of
  // `pluginSource` and dynamically importing the file. We intentionally accept
  // this risk. Evaluating `pluginSource` directly (e.g., via Data URIs or eval)
  // would violate our strict CSP (`default-src 'self'`). In a production Tauri
  // environment, the assets are bundled in a read-only VFS, making local file
  // tampering during execution practically impossible.
  const imported = await factory();
  const plugin = toPluginModule(imported);
  if (!plugin) {
    throw new Error("operation denied");
  }
  return plugin;
}

function computeVarsPatch(
  before: Readonly<Record<string, VarValue>>,
  after: Readonly<Record<string, VarValue>>,
): Record<string, VarValue> {
  const patch: Record<string, VarValue> = {};
  for (const [key, value] of Object.entries(after)) {
    if (!Object.is(before[key], value)) {
      patch[key] = value;
    }
  }
  return patch;
}

function assertNoRuntimeModuleLoading(source: string): void {
  if (/\bimport\s*\(/.test(source)) {
    throw new Error("operation denied");
  }
  if (/^\s*import\s+(?!type\b)/m.test(source)) {
    throw new Error("operation denied");
  }
  if (/^\s*export\s+.+\s+from\s+["'][^"']+["']/m.test(source)) {
    throw new Error("operation denied");
  }
}

function assertInputLimits(
  args: Record<string, unknown>,
  vars: Readonly<Record<string, VarValue>>,
): void {
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

function assertOutputLimits(
  varsPatch: Record<string, VarValue>,
  jumpTo: string | null,
  renderCommands: unknown[],
): void {
  const patchEntries = Object.keys(varsPatch).length;
  if (patchEntries > MAX_VARS_PATCH_ENTRIES) {
    throw new Error("resource limit exceeded");
  }
  if (safeJsonByteLength(varsPatch) > MAX_VARS_PATCH_BYTES) {
    throw new Error("resource limit exceeded");
  }
  if (jumpTo !== null && textByteLength(jumpTo) > MAX_JUMP_LABEL_BYTES) {
    throw new Error("resource limit exceeded");
  }
  if (renderCommands.length > MAX_RENDER_COMMANDS_ENTRIES) {
    throw new Error("resource limit exceeded");
  }
  if (safeJsonByteLength(renderCommands) > MAX_RENDER_COMMANDS_BYTES) {
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

function isExecuteRequest(value: unknown): value is WorkerExecuteRequest {
  if (!isRecord(value)) return false;
  if (value["type"] !== "execute") return false;
  if (typeof value["requestId"] !== "string") return false;
  if (typeof value["op"] !== "string") return false;
  if (!isRecord(value["args"])) return false;
  if (!isVarMap(value["vars"])) return false;
  if (typeof value["pluginSource"] !== "string") return false;
  return true;
}

function hasManifestEntry(opName: string): boolean {
  return opName in PLUGIN_MANIFEST;
}

function isVarMap(value: unknown): value is Record<string, VarValue> {
  if (!isRecord(value)) return false;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function postFailure(requestId: string, reason: string): void {
  const response: WorkerExecuteResponse = { ok: false, requestId, reason };
  self.postMessage(response);
}

function errorToReason(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  return "worker error";
}

function errorToLog(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { message: String(err) };
}

function logInternal(event: string, detail: Record<string, unknown>): void {
  console.error(JSON.stringify({
    level: "error",
    scope: "engine-internal",
    event,
    ...detail,
  }));
}

function extractRequestId(value: unknown): string {
  if (isRecord(value) && typeof value["requestId"] === "string" && value["requestId"].length > 0) {
    return value["requestId"];
  }
  return "unknown";
}

function toPluginModule(value: unknown): PluginModule | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const execute = (value as Record<string, unknown>)["execute"];
  if (typeof execute !== "function") {
    return null;
  }
  return { execute: execute as PluginModule["execute"] };
}
