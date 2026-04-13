import type { PluginArgs, VarValue } from "./types.ts";

export interface WorkerExecuteRequest {
  type: "execute";
  requestId: string;
  op: string;
  args: PluginArgs;
  vars: Record<string, VarValue>;
  pluginSource: string;
}

export interface WorkerExecuteSuccess {
  ok: true;
  requestId: string;
  varsPatch: Record<string, VarValue>;
  jumpTo: string | null;
  requestedNext: boolean;
}

export interface WorkerExecuteFailure {
  ok: false;
  requestId: string;
  reason: string;
}

export type WorkerExecuteResponse = WorkerExecuteSuccess | WorkerExecuteFailure;
