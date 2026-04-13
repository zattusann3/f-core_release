import type { PluginContext, VarsApi, VarValue } from "./types.ts";

export interface RuntimeState {
  vars: Record<string, VarValue>;
}

export interface FlowControl {
  jumpTo: string | null;
  requestedNext: boolean;
}

export function createPluginContext(state: RuntimeState, flow: FlowControl): PluginContext {
  const varsApi: VarsApi = Object.freeze({
    get(name: string): VarValue | undefined {
      return state.vars[name];
    },
    set(name: string, value: VarValue): void {
      if (name.startsWith("_")) {
        throw new Error(`Permission denied: Cannot write to reserved variable '${name}'`);
      }
      state.vars[name] = value;
    },
    snapshot(): Readonly<Record<string, VarValue>> {
      return Object.freeze({ ...state.vars });
    },
  });

  return Object.freeze({
    vars: varsApi,
    jump(label: string): void {
      if (flow.requestedNext || flow.jumpTo !== null) {
        throw new Error("Conflict: flow action already requested");
      }
      flow.jumpTo = label;
    },
    next(): void {
      if (flow.jumpTo !== null || flow.requestedNext) {
        throw new Error("Conflict: flow action already requested");
      }
      flow.requestedNext = true;
    },
  });
}
