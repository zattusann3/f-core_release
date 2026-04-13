import { assertRejects } from "jsr:@std/assert";
import { executeCommand } from "../src/runtime.ts";

Deno.test("worker runtime: rejects invalid op names", async () => {
  const state = { vars: {} };
  await assertRejects(
    () => executeCommand(state, { op: "Say" }),
    Error,
    "operation rejected",
  );
});

Deno.test("worker runtime: rejects missing plugins", async () => {
  const state = { vars: {} };
  await assertRejects(
    () => executeCommand(state, { op: "missing" }),
    Error,
    "operation rejected",
  );
});

Deno.test("worker runtime: rejects conflicting flow actions", async () => {
  const state = { vars: {} };
  await assertRejects(
    () => executeCommand(state, { op: "conflict" }),
    Error,
    "operation rejected",
  );
});

Deno.test("worker runtime: rejects integrity mismatch", async () => {
  const state = { vars: {} };
  await assertRejects(
    () => executeCommand(state, { op: "badhash" }),
    Error,
    "operation rejected",
  );
});

Deno.test("worker runtime: terminates hung plugin by timeout", async () => {
  const state = { vars: {} };
  await assertRejects(
    () => executeCommand(state, { op: "hang" }, { timeoutMs: 100 }),
    Error,
    "operation rejected",
  );
});
