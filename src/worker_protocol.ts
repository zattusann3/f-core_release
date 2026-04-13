import type { PluginArgs, VarValue } from "./types.ts";

export interface WorkerExecuteRequest {
  type: "execute";
  op: string;
  args: PluginArgs;
  vars: Record<string, VarValue>;
  pluginSource: string;
  pluginModuleUrl: string;
}

export interface WorkerExecuteSuccess {
  ok: true;
  varsPatch: Record<string, VarValue>;
  jumpTo: string | null;
  requestedNext: boolean;
}

export interface WorkerExecuteFailure {
  ok: false;
  reason: string;
}

export type WorkerExecuteResponse = WorkerExecuteSuccess | WorkerExecuteFailure;
