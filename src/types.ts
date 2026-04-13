export type VarValue = string | number | boolean | null;
export type PluginArgs = Record<string, unknown>;

export interface VarsApi {
  get(name: string): VarValue | undefined;
  set(name: string, value: VarValue): void;
  snapshot(): Readonly<Record<string, VarValue>>;
}

export interface PluginContext {
  vars: VarsApi;
  jump(label: string): void;
  next(): void;
}

export interface PluginModule {
  execute(context: PluginContext, args: PluginArgs): unknown | Promise<unknown>;
}
