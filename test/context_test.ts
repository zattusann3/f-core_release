import { assertEquals } from "jsr:@std/assert";
import { createPluginContext } from "../src/context.ts";

Deno.test("createPluginContext: exposes only vars/jump/next", () => {
  const state = { vars: { hp: 100 } };
  const flow = { jumpTo: null as string | null, requestedNext: false };
  const context = createPluginContext(state, flow);

  const keys = Object.keys(context).sort();
  assertEquals(keys, ["jump", "next", "vars"]);

  context.vars.set("hp", 95);
  context.jump("battle");
  context.next();

  assertEquals(state.vars.hp, 95);
  assertEquals(flow.jumpTo, "battle");
  assertEquals(flow.requestedNext, true);
});

Deno.test("createPluginContext: does not expose runtime globals", () => {
  const state = { vars: {} };
  const flow = { jumpTo: null as string | null, requestedNext: false };
  const context = createPluginContext(state, flow);

  assertEquals("Deno" in context, false);
  assertEquals("fetch" in context, false);
  assertEquals("readTextFile" in context, false);
});
