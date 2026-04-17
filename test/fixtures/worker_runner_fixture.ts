import { createPluginContext, type FlowControl, type RuntimeState } from "../../src/context.ts";
import { execute as sayExecute } from "../../src/plugins/say.ts";
import type { PluginModule, VarValue } from "../../src/types.ts";
import type {
  WorkerExecuteRequest,
  WorkerExecuteResponse,
  WorkerExecuteSuccess,
} from "../../src/worker_protocol.ts";
import { execute as conflictExecute } from "./plugins/conflict.ts";
import { execute as hangExecute } from "./plugins/hang.ts";

const FIXTURE_MODE_KEY = "__fixture";
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerExecuteRequest>) => void) | null;
  postMessage: (message: WorkerExecuteResponse | WorkerExecuteSuccess) => void;
};

workerScope.onmessage = (event: MessageEvent<WorkerExecuteRequest>) => {
  run(event.data);
};

async function run(request: unknown): Promise<void> {
  const requestId = extractRequestId(request);
  try {
    if (!isExecuteRequest(request)) {
      postFailure(requestId, "invalid request");
      return;
    }

    const plugin = resolveFixturePlugin(request.args);
    const state: RuntimeState = { vars: { ...request.vars }, renderCommands: [] };
    const flow: FlowControl = { jumpTo: null, requestedNext: false, suspended: false };
    const context = createPluginContext(state, flow);

    await plugin.execute(context, request.args);

    const response: WorkerExecuteSuccess = {
      ok: true,
      requestId: request.requestId,
      varsPatch: computeVarsPatch(request.vars, state.vars),
      jumpTo: flow.jumpTo,
      requestedNext: flow.requestedNext,
      suspended: flow.suspended,
      renderCommands: state.renderCommands ?? [],
    };
    workerScope.postMessage(response);
  } catch (err) {
    postFailure(requestId, errorToReason(err));
  }
}

function resolveFixturePlugin(args: Record<string, unknown>): PluginModule {
  const mode = args[FIXTURE_MODE_KEY];
  if (mode === "hang") {
    return { execute: hangExecute };
  }
  if (mode === "conflict") {
    return { execute: conflictExecute };
  }
  return { execute: sayExecute };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function postFailure(requestId: string, reason: string): void {
  const response: WorkerExecuteResponse = { ok: false, requestId, reason };
  workerScope.postMessage(response);
}

function errorToReason(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  return "worker error";
}

function extractRequestId(value: unknown): string {
  if (isRecord(value) && typeof value["requestId"] === "string" && value["requestId"].length > 0) {
    return value["requestId"];
  }
  return "unknown";
}
