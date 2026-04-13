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

Deno.test("executeCommand: runs say plugin", async () => {
  const state = { vars: {} };
  const result = await executeCommand(state, {
    op: "say",
    args: { text: "hello" },
  });

  assertEquals(result.vars.last_say, "hello");
  assertEquals(result.requestedNext, true);
  assertEquals(result.jumpTo, null);
});

Deno.test("executeCommand: sanitizes plugin execution errors", async () => {
  const state = { vars: {} };
  await assertRejects(
    () => executeCommand(state, { op: "set", args: { target: "x" } }),
    Error,
    "operation rejected",
  );
});

Deno.test("executeCommand: rejects reserved variable writes from plugin", async () => {
  const state = { vars: { hp: 10 } };
  await assertRejects(
    () =>
      executeCommand(state, {
        op: "set",
        args: { target: "_current_label", expression: "hp ^+ 1" },
      }),
    Error,
    "operation rejected",
  );
});

Deno.test("executeCommand: rejects oversized args payload", async () => {
  const state = { vars: {} };
  await assertRejects(
    () =>
      executeCommand(state, {
        op: "say",
        args: { text: "x".repeat(9 * 1024) },
      }),
    Error,
    "operation rejected",
  );
});

Deno.test("executeCommand: rejects oversized vars snapshot", async () => {
  const state = {
    vars: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, i])),
  };
  await assertRejects(
    () => executeCommand(state, { op: "say", args: { text: "ok" } }),
    Error,
    "operation rejected",
  );
});
