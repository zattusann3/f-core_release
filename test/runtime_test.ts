import { assertEquals, assertRejects } from "jsr:@std/assert";
import { executeCommand } from "../src/runtime.ts";

Deno.test("executeCommand: runs set plugin with safe expression", async () => {
  const state = { vars: { val: 5 } };
  const result = await executeCommand(state, {
    op: "set",
    args: { target: "val", expression: "val ^+ 10" },
  });

  assertEquals(result.vars.val, 15);
  assertEquals(result.requestedNext, true);
  assertEquals(result.jumpTo, null);
});

Deno.test("executeCommand: runs choice plugin", async () => {
  const state = { vars: {} };
  const result = await executeCommand(state, {
    op: "choice",
    args: { to: "route_a" },
  });

  assertEquals(result.jumpTo, "route_a");
  assertEquals(result.requestedNext, false);
});

Deno.test("executeCommand: sanitizes plugin execution errors", async () => {
  const state = { vars: {} };
  await assertRejects(
    () => executeCommand(state, { op: "set", args: { target: "x" } }),
    Error,
    "operation rejected",
  );
});
