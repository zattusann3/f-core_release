import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, _args: PluginArgs): void {
  context.jump("route_conflict");
  context.next();
}
