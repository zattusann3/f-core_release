import { evaluateExpression } from "../expression.ts";
import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, args: PluginArgs): void {
  const target = args["target"];
  const expression = args["expression"];

  if (typeof target !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) {
    throw new Error("set.target must be a valid variable name");
  }
  if (typeof expression !== "string") {
    throw new Error("set.expression must be a string");
  }

  const value = evaluateExpression(expression, context.vars.snapshot());
  context.vars.set(target, value);
  context.next();
}
