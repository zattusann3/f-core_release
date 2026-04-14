import type { PluginContext, RenderCommand, SafeCSSVarKey, VarsApi, VarValue } from "./types.ts";

export interface RuntimeState {
  vars: Record<string, VarValue>;
  renderCommands?: RenderCommand[];
}

export interface FlowControl {
  jumpTo: string | null;
  requestedNext: boolean;
  suspended: boolean;
}

export function createPluginContext(state: RuntimeState, flow: FlowControl): PluginContext {
  const renderCommands = getRenderCommandBuffer(state);

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
    ui: Object.freeze({
      dispatch(command: RenderCommand): void {
        assertValidRenderCommand(command);
        renderCommands.push(command);
      },
    }),
    jump(label: string): void {
      if (flow.requestedNext || flow.jumpTo !== null || flow.suspended) {
        throw new Error("Conflict: flow action already requested");
      }
      flow.jumpTo = label;
    },
    next(): void {
      if (flow.jumpTo !== null || flow.requestedNext || flow.suspended) {
        throw new Error("Conflict: flow action already requested");
      }
      flow.requestedNext = true;
    },
    suspend(): void {
      if (flow.jumpTo !== null || flow.requestedNext || flow.suspended) {
        throw new Error("Conflict: flow action already requested");
      }
      flow.suspended = true;
    },
  });
}

function getRenderCommandBuffer(state: RuntimeState): RenderCommand[] {
  if (!Array.isArray(state.renderCommands)) {
    state.renderCommands = [];
  }
  return state.renderCommands;
}

function assertValidRenderCommand(command: RenderCommand): void {
  if (typeof command !== "object" || command === null || Array.isArray(command)) {
    throw new Error("invalid render command");
  }

  if (command.type === "AppendNode") {
    assertValidId(command.parentId);
    assertValidId(command.nodeId);
    assertValidTag(command.tag);
    if (command.text !== undefined && typeof command.text !== "string") {
      throw new Error("invalid render command");
    }
    if (command.src !== undefined) {
      assertValidAssetRef(command.src);
    }
    if (command.onClickInput !== undefined) {
      assertValidOnClickInput(command.onClickInput);
    }
    if (command.cssVars !== undefined) {
      assertValidCssVars(command.cssVars);
    }
    return;
  }

  if (command.type === "UpdateCSSVar") {
    assertValidId(command.targetId);
    assertValidCssVars(command.vars);
    return;
  }

  if (command.type === "ClearSubtree") {
    assertValidId(command.targetId);
    return;
  }

  throw new Error("invalid render command");
}

function assertValidId(id: string): void {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error("invalid render command");
  }
}

function assertValidTag(tag: string): void {
  if (tag !== "div" && tag !== "span" && tag !== "img" && tag !== "p" && tag !== "button") {
    throw new Error("invalid render command");
  }
}

function assertValidOnClickInput(value: string | number): void {
  if (!(typeof value === "string" || typeof value === "number")) {
    throw new Error("invalid render command");
  }
}

function assertValidCssVars(vars: Record<SafeCSSVarKey, string | number>): void {
  if (typeof vars !== "object" || vars === null || Array.isArray(vars)) {
    throw new Error("invalid render command");
  }

  for (const [key, value] of Object.entries(vars)) {
    if (!/^--fc-[A-Za-z0-9_-]+$/.test(key)) {
      throw new Error("invalid render command");
    }
    if (!(typeof value === "string" || typeof value === "number")) {
      throw new Error("invalid render command");
    }
  }
}

function assertValidAssetRef(src: string): void {
  if (typeof src !== "string" || src.length === 0 || src.length > 256) {
    throw new Error("invalid render command");
  }
  if (src.includes("..") || src.includes("\\") || /[\u0000-\u001F]/.test(src)) {
    throw new Error("invalid render command");
  }
}
