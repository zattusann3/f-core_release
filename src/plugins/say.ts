import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, args: PluginArgs): void {
  const text = args["text"];
  if (typeof text !== "string") {
    throw new Error("say.text must be a string");
  }

  context.vars.set("_last_say", text);
  context.next();
}
