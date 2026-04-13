import type { PluginModule } from "./types.ts";

const OP_NAME_RE = /^[a-z0-9_]+$/;

export async function loadPlugin(opName: string): Promise<PluginModule> {
  if (!OP_NAME_RE.test(opName)) {
    throw new Error("operation denied");
  }

  const moduleUrl = new URL(`./plugins/${opName}.ts`, import.meta.url);
  let loaded: Record<string, unknown>;
  try {
    loaded = await import(moduleUrl.href);
  } catch {
    throw new Error("operation unavailable");
  }

  if (!loaded || typeof loaded.execute !== "function") {
    throw new Error("operation unavailable");
  }

  return {
    execute: loaded.execute as PluginModule["execute"],
  };
}
