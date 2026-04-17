import type { PluginArgs, PluginContext } from "../types.ts";

interface MenuChoice {
  text: string;
  to: string;
}

export function execute(context: PluginContext, args: PluginArgs): void {
  const choices = parseChoices(args["choices"]);
  const lastInput = context.vars.get("_last_input");

  if (lastInput === null || lastInput === undefined) {
    const previousSeq = context.vars.get("menu_seq");
    const menuSeq = typeof previousSeq === "number" ? previousSeq + 1 : 1;
    context.vars.set("menu_seq", menuSeq);

    context.ui.dispatch({
      type: "ClearSubtree",
      targetId: "fc-text-layer",
    });

    for (let i = 0; i < choices.length; i += 1) {
      const choice = choices[i];
      context.ui.dispatch({
        type: "AppendNode",
        parentId: "fc-text-layer",
        nodeId: `fc-menu-${menuSeq}-${i + 1}`,
        tag: "button",
        text: choice.text,
        onClickInput: choice.to,
      });
    }

    context.suspend();
    return;
  }

  const inputTo = String(lastInput);
  if (!choices.some((choice) => choice.to === inputTo)) {
    throw new Error("invalid menu input");
  }
  context.jump(inputTo);
}

function parseChoices(value: unknown): MenuChoice[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("menu.choices must be a non-empty array");
  }

  const choices: MenuChoice[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("menu.choices must contain objects");
    }

    const text = (entry as Record<string, unknown>)["text"];
    const to = (entry as Record<string, unknown>)["to"];
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("menu choice text must be a non-empty string");
    }
    if (typeof to !== "string" || !/^[A-Za-z0-9_]+$/.test(to)) {
      throw new Error("menu choice to must be a valid label");
    }
    choices.push({ text, to });
  }

  return choices;
}
