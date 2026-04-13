import { assertEquals, assertThrows } from "jsr:@std/assert";
import { createPluginContext } from "../src/context.ts";

Deno.test("createPluginContext: exposes only vars/jump/next", () => {
  const state = { vars: { hp: 100 } };
  const flow = { jumpTo: null as string | null, requestedNext: false };
  const context = createPluginContext(state, flow);

  const keys = Object.keys(context).sort();
  assertEquals(keys, ["jump", "next", "vars"]);

  context.vars.set("hp", 95);
  context.next();

  assertEquals(state.vars.hp, 95);
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

Deno.test("createPluginContext: rejects writes to reserved vars", () => {
  const state = { vars: {} };
  const flow = { jumpTo: null as string | null, requestedNext: false };
  const context = createPluginContext(state, flow);

  assertThrows(
    () => context.vars.set("_system_lang", "ja"),
    Error,
    "Cannot write to reserved variable",
  );
});

Deno.test("createPluginContext: rejects mixed flow actions", () => {
  const state = { vars: {} };
  const flow = { jumpTo: null as string | null, requestedNext: false };
  const context = createPluginContext(state, flow);

  context.jump("route_a");
  assertThrows(() => context.next(), Error, "flow action already requested");

  const flow2 = { jumpTo: null as string | null, requestedNext: false };
  const context2 = createPluginContext(state, flow2);
  context2.next();
  assertThrows(() => context2.jump("route_b"), Error, "flow action already requested");
});
