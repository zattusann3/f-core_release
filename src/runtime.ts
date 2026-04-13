import { createPluginContext, type FlowControl, type RuntimeState } from "./context.ts";
import { loadPlugin } from "./plugin_loader.ts";
import type { PluginArgs, VarValue } from "./types.ts";

export interface CommandIR {
  op: string;
  args?: PluginArgs;
}

export interface CommandResult {
  vars: Readonly<Record<string, VarValue>>;
  jumpTo: string | null;
  requestedNext: boolean;
}

export async function executeCommand(
  state: RuntimeState,
  command: CommandIR,
): Promise<CommandResult> {
  const plugin = await loadPlugin(command.op);
  const flow: FlowControl = { jumpTo: null, requestedNext: false };
  const context = createPluginContext(state, flow);

  try {
    await plugin.execute(context, command.args ?? {});
  } catch {
    throw new Error("operation rejected");
  }

  return {
    vars: Object.freeze({ ...state.vars }),
    jumpTo: flow.jumpTo,
    requestedNext: flow.requestedNext,
  };
}
