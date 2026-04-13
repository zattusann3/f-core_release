import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, args: PluginArgs): void {
  const to = args["to"];
  if (typeof to !== "string" || to.length === 0) {
    throw new Error("choice.to must be a non-empty string");
  }

  context.jump(to);
}
