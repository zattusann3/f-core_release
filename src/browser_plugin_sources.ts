import assetSource from "./plugins/asset.ts?raw";
import choiceSource from "./plugins/choice.ts?raw";
import effectSource from "./plugins/effect.ts?raw";
import menuSource from "./plugins/menu.ts?raw";
import saySource from "./plugins/say.ts?raw";
import setSource from "./plugins/set.ts?raw";

const OP_NAME_RE = /^[a-z0-9_]+$/;

const BUNDLED_PLUGIN_SOURCES: Readonly<Record<string, string>> = Object.freeze({
  asset: assetSource,
  choice: choiceSource,
  effect: effectSource,
  menu: menuSource,
  say: saySource,
  set: setSource,
});

export async function loadBundledPluginSource(opName: string): Promise<string> {
  if (!OP_NAME_RE.test(opName)) {
    throw new Error("operation denied");
  }

  const source = BUNDLED_PLUGIN_SOURCES[opName];
  if (typeof source !== "string") {
    throw new Error("operation denied");
  }
  return source;
}
