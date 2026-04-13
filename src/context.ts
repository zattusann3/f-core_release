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
      state.vars[name] = value;
    },
    snapshot(): Readonly<Record<string, VarValue>> {
      return Object.freeze({ ...state.vars });
    },
  });

  return Object.freeze({
    vars: varsApi,
    jump(label: string): void {
      flow.jumpTo = label;
    },
    next(): void {
      flow.requestedNext = true;
    },
  });
}
