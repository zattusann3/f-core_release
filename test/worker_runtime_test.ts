import { assertRejects } from "jsr:@std/assert";
import { executeCommand } from "../src/runtime.ts";
import { WorkerHost } from "../src/worker_host.ts";
import { loadFixturePluginSource } from "./fixtures/plugin_source_loader.ts";

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
      () =>
        executeCommand(
          state,
          { op: "unlisted" },
          workerHost,
          { loadPluginSource: loadFixturePluginSource },
        ),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("worker runtime: rejects conflicting flow actions", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () =>
        executeCommand(
          state,
          { op: "say", args: { text: "conflict", __fixture: "conflict" } },
          workerHost,
        ),
      Error,
      "operation rejected",
    );
  }, fixtureWorkerOptions());
});

Deno.test("worker runtime: rejects test-only plugin outside allowlist", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () =>
        executeCommand(
          state,
          { op: "badhash" },
          workerHost,
          { loadPluginSource: loadFixturePluginSource },
        ),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("worker runtime: terminates hung plugin by timeout", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () =>
        executeCommand(
          state,
          { op: "say", args: { text: "hang", __fixture: "hang" } },
          workerHost,
          { timeoutMs: 100 },
        ),
      Error,
      "operation rejected",
    );
  }, fixtureWorkerOptions());
});

async function withWorkerHost(
  run: (workerHost: WorkerHost) => Promise<void>,
  options?: ConstructorParameters<typeof WorkerHost>[0],
): Promise<void> {
  const workerHost = new WorkerHost(options);
  try {
    await run(workerHost);
  } finally {
    workerHost.close();
  }
}

function fixtureWorkerOptions(): ConstructorParameters<typeof WorkerHost>[0] {
  return { workerUrl: new URL("./fixtures/worker_runner_fixture.ts", import.meta.url) };
}
