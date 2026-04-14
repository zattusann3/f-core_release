import { assertRejects } from "jsr:@std/assert";
import { executeCommand } from "../src/runtime.ts";
import { WorkerHost } from "../src/worker_host.ts";

Deno.test("worker runtime: rejects invalid op names", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () => executeCommand(state, { op: "Say" }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("worker runtime: rejects missing plugins", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () => executeCommand(state, { op: "missing" }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("worker runtime: rejects unlisted plugin even if file exists", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () => executeCommand(state, { op: "unlisted" }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("worker runtime: rejects conflicting flow actions", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () => executeCommand(state, { op: "conflict" }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("worker runtime: rejects test-only plugin outside allowlist", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () => executeCommand(state, { op: "badhash" }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("worker runtime: terminates hung plugin by timeout", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () => executeCommand(state, { op: "hang" }, workerHost, { timeoutMs: 100 }),
      Error,
      "operation rejected",
    );
  });
});

async function withWorkerHost(run: (workerHost: WorkerHost) => Promise<void>): Promise<void> {
  const workerHost = new WorkerHost();
  try {
    await run(workerHost);
  } finally {
    workerHost.close();
  }
}
