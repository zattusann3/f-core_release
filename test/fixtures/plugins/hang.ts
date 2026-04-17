import type { PluginArgs, PluginContext } from "../../../src/types.ts";

export function execute(_context: PluginContext, _args: PluginArgs): void {
  while (true) {
    // intentional infinite loop for timeout termination tests
  }
}
