export type VarValue = string | number | boolean | null;
export type PluginArgs = Record<string, unknown>;
export type SafeCSSVarKey = `--fc-${string}`;
export type SafeTag = "div" | "span" | "img" | "p" | "button";

export type RenderCommand =
  | {
    type: "AppendNode";
    parentId: string;
    nodeId: string;
    tag: SafeTag;
    text?: string;
    src?: string;
    onClickInput?: string | number;
    cssVars?: Record<SafeCSSVarKey, string | number>;
  }
  | {
    type: "UpdateCSSVar";
    targetId: string;
    vars: Record<SafeCSSVarKey, string | number>;
  }
  | {
    type: "ClearSubtree";
    targetId: string;
  };

export interface VarsApi {
  get(name: string): VarValue | undefined;
  set(name: string, value: VarValue): void;
  snapshot(): Readonly<Record<string, VarValue>>;
}

export interface PluginContext {
  vars: VarsApi;
  ui: {
    dispatch(command: RenderCommand): void;
  };
  jump(label: string): void;
  next(): void;
  suspend(): void;
}

export interface PluginModule {
  execute(context: PluginContext, args: PluginArgs): unknown | Promise<unknown>;
}
