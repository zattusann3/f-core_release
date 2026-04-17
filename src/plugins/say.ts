import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, args: PluginArgs): void {
  const text = args["text"];
  if (typeof text !== "string") {
    throw new Error("say.text must be a string");
  }

  const previousSeq = context.vars.get("say_seq");
  const nextSeq = typeof previousSeq === "number" ? previousSeq + 1 : 1;

  context.vars.set("last_say", text);
  context.vars.set("say_seq", nextSeq);
  if (text.trim().length === 0) {
    context.next();
    return;
  }
  context.ui.dispatch({
    type: "AppendNode",
    parentId: "fc-text-layer",
    nodeId: `fc-say-${nextSeq}`,
    tag: "span",
    text,
  });
  context.next();
}
