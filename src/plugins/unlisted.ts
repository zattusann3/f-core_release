import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, _args: PluginArgs): void {
  context.vars.set("should_not_run", true);
  context.next();
}
