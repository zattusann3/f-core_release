import { createPluginContext, type FlowControl, type RuntimeState } from "./context.ts";
import { PLUGIN_MANIFEST } from "./plugin_manifest.ts";
import type { PluginModule, VarValue } from "./types.ts";
import type {
  WorkerExecuteRequest,
  WorkerExecuteResponse,
  WorkerExecuteSuccess,
} from "./worker_protocol.ts";

const OP_NAME_RE = /^[a-z0-9_]+$/;

self.onmessage = (event: MessageEvent<WorkerExecuteRequest>) => {
  run(event.data);
};

async function run(request: unknown): Promise<void> {
  try {
    if (!isExecuteRequest(request)) {
      postFailure("invalid request");
      return;
    }

    if (!OP_NAME_RE.test(request.op)) {
      postFailure("operation denied");
      return;
    }

    const plugin = await loadPluginInWorker(
      request.op,
      request.pluginSource,
      request.pluginModuleUrl,
    );
    const state: RuntimeState = { vars: { ...request.vars } };
    const flow: FlowControl = { jumpTo: null, requestedNext: false };
    const context = createPluginContext(state, flow);

    await plugin.execute(context, request.args);

    const response: WorkerExecuteSuccess = {
      ok: true,
      varsPatch: computeVarsPatch(request.vars, state.vars),
      jumpTo: flow.jumpTo,
      requestedNext: flow.requestedNext,
    };
    self.postMessage(response);
  } catch (err) {
    console.error("[Engine Internal] Worker execution failed:", { err });
    postFailure(errorToReason(err));
  }
}

async function loadPluginInWorker(
  opName: string,
  pluginSource: string,
  pluginModuleUrl: string,
): Promise<PluginModule> {
  const manifestEntry = PLUGIN_MANIFEST[opName];
  if (!manifestEntry) {
    throw new Error("operation unavailable");
  }

  const actualHash = await sha256Hex(pluginSource);
  if (actualHash !== manifestEntry.sha256) {
    console.error("[Engine Internal] Plugin integrity violation:", { op: opName });
    throw new Error("integrity violation");
  }

  if (!pluginModuleUrl.startsWith("file://")) {
    throw new Error("operation denied");
  }
  assertSafeImportSpecifiers(pluginSource);
  const rewrittenSource = rewriteRelativeImportsToFileUrls(pluginSource, pluginModuleUrl);
  const moduleUrl = sourceToDataUrl(rewrittenSource);
  const loaded = await import(moduleUrl) as Record<string, unknown>;
  if (!loaded || typeof loaded.execute !== "function") {
    throw new Error("operation unavailable");
  }
  return { execute: loaded.execute as PluginModule["execute"] };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sourceToDataUrl(source: string): string {
  const bytes = new TextEncoder().encode(source);
  return `data:application/typescript;base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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

function assertSafeImportSpecifiers(source: string): void {
  const importSpecs = [
    ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);

  for (const spec of importSpecs) {
    if (!spec.startsWith("./") && !spec.startsWith("../")) {
      throw new Error("operation denied");
    }
  }
}

function rewriteRelativeImportsToFileUrls(source: string, moduleUrl: string): string {
  const rewriter = (_full: string, prefix: string, spec: string, suffix: string) => {
    if (!spec.startsWith("./") && !spec.startsWith("../")) {
      return `${prefix}${spec}${suffix}`;
    }
    const resolved = new URL(spec, moduleUrl).href;
    return `${prefix}${resolved}${suffix}`;
  };

  return source
    .replace(/(from\s+["'])([^"']+)(["'])/g, rewriter)
    .replace(/(import\(\s*["'])([^"']+)(["']\s*\))/g, rewriter);
}

function isExecuteRequest(value: unknown): value is WorkerExecuteRequest {
  if (!isRecord(value)) return false;
  if (value["type"] !== "execute") return false;
  if (typeof value["op"] !== "string") return false;
  if (!isRecord(value["args"])) return false;
  if (!isVarMap(value["vars"])) return false;
  if (typeof value["pluginSource"] !== "string") return false;
  if (typeof value["pluginModuleUrl"] !== "string") return false;
  return true;
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

function postFailure(reason: string): void {
  const response: WorkerExecuteResponse = { ok: false, reason };
  self.postMessage(response);
}

function errorToReason(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  return "worker error";
}
