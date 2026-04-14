import { assertEquals, assertThrows } from "jsr:@std/assert";
import { createPluginContext } from "../src/context.ts";

Deno.test("createPluginContext: exposes only vars/jump/next/suspend", () => {
  const state = { vars: { hp: 100 }, renderCommands: [] };
  const flow = { jumpTo: null as string | null, requestedNext: false, suspended: false };
  const context = createPluginContext(state, flow);

  const keys = Object.keys(context).sort();
  assertEquals(keys, ["jump", "next", "suspend", "ui", "vars"]);

  context.vars.set("hp", 95);
  context.ui.dispatch({
    type: "AppendNode",
    parentId: "fc_text_layer",
    nodeId: "line_1",
    tag: "span",
    text: "hello",
  });
  context.next();

  assertEquals(state.vars.hp, 95);
  assertEquals(state.renderCommands.length, 1);
  assertEquals(flow.requestedNext, true);
});

Deno.test("createPluginContext: does not expose runtime globals", () => {
  const state = { vars: {}, renderCommands: [] };
  const flow = { jumpTo: null as string | null, requestedNext: false, suspended: false };
  const context = createPluginContext(state, flow);

  assertEquals("Deno" in context, false);
  assertEquals("fetch" in context, false);
  assertEquals("readTextFile" in context, false);
});

Deno.test("createPluginContext: rejects writes to reserved vars", () => {
  const state = { vars: {}, renderCommands: [] };
  const flow = { jumpTo: null as string | null, requestedNext: false, suspended: false };
  const context = createPluginContext(state, flow);

  assertThrows(
    () => context.vars.set("_system_lang", "ja"),
    Error,
    "Cannot write to reserved variable",
  );
});

Deno.test("createPluginContext: rejects mixed flow actions", () => {
  const state = { vars: {}, renderCommands: [] };
  const flow = { jumpTo: null as string | null, requestedNext: false, suspended: false };
  const context = createPluginContext(state, flow);

  context.jump("route_a");
  assertThrows(() => context.next(), Error, "flow action already requested");
  assertThrows(() => context.suspend(), Error, "flow action already requested");

  const flow2 = { jumpTo: null as string | null, requestedNext: false, suspended: false };
  const context2 = createPluginContext(state, flow2);
  context2.next();
  assertThrows(() => context2.jump("route_b"), Error, "flow action already requested");
  assertThrows(() => context2.suspend(), Error, "flow action already requested");

  const flow3 = { jumpTo: null as string | null, requestedNext: false, suspended: false };
  const context3 = createPluginContext(state, flow3);
  context3.suspend();
  assertThrows(() => context3.next(), Error, "flow action already requested");
  assertThrows(() => context3.jump("route_c"), Error, "flow action already requested");
});

Deno.test("createPluginContext: rejects invalid render commands", () => {
  const state = { vars: {}, renderCommands: [] };
  const flow = { jumpTo: null as string | null, requestedNext: false, suspended: false };
  const context = createPluginContext(state, flow);

  assertThrows(
    () =>
      context.ui.dispatch({
        type: "AppendNode",
        parentId: "fc_text_layer",
        nodeId: "line_1",
        tag: "script" as "span",
      }),
    Error,
    "invalid render command",
  );
});
