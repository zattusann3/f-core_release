import { assertEquals, assertRejects } from "jsr:@std/assert";
import { executeCommand } from "../src/runtime.ts";
import { WorkerHost } from "../src/worker_host.ts";

Deno.test("executeCommand: runs set plugin with safe expression", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: { val: 5 } };
    const result = await executeCommand(state, {
      op: "set",
      args: { target: "val", expression: "val ^+ 10" },
    }, workerHost);

    assertEquals(result.vars.val, 15);
    assertEquals(result.requestedNext, true);
    assertEquals(result.suspended, false);
    assertEquals(result.jumpTo, null);
    assertEquals(result.renderCommands, []);
  });
});

Deno.test("executeCommand: runs choice plugin", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    const result = await executeCommand(state, {
      op: "choice",
      args: { to: "route_a" },
    }, workerHost);

    assertEquals(result.jumpTo, "route_a");
    assertEquals(result.requestedNext, false);
    assertEquals(result.suspended, false);
    assertEquals(result.renderCommands, []);
  });
});

Deno.test("executeCommand: runs say plugin", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    const result = await executeCommand(state, {
      op: "say",
      args: { text: "hello" },
    }, workerHost);

    assertEquals(result.vars.last_say, "hello");
    assertEquals(result.vars.say_seq, 1);
    assertEquals(result.requestedNext, true);
    assertEquals(result.suspended, false);
    assertEquals(result.jumpTo, null);
    assertEquals(result.renderCommands.length, 1);
    assertEquals(result.renderCommands[0], {
      type: "AppendNode",
      parentId: "fc-text-layer",
      nodeId: "fc-say-1",
      tag: "span",
      text: "hello",
    });
  });
});

Deno.test("executeCommand: say plugin skips DOM append for blank text", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    const result = await executeCommand(state, {
      op: "say",
      args: { text: "   " },
    }, workerHost);

    assertEquals(result.vars.last_say, "   ");
    assertEquals(result.vars.say_seq, 1);
    assertEquals(result.requestedNext, true);
    assertEquals(result.suspended, false);
    assertEquals(result.jumpTo, null);
    assertEquals(result.renderCommands, []);
  });
});

Deno.test("executeCommand: runs effect plugin and emits UpdateCSSVar", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    const result = await executeCommand(state, {
      op: "effect",
      args: { type: "shake", targetId: "fc-text-layer", value: 4 },
    }, workerHost);

    assertEquals(result.requestedNext, true);
    assertEquals(result.suspended, false);
    assertEquals(result.jumpTo, null);
    assertEquals(result.renderCommands.length, 1);
    assertEquals(result.renderCommands[0], {
      type: "UpdateCSSVar",
      targetId: "fc-text-layer",
      vars: {
        "--fc-shake-intensity": 4,
        "--fc-shake-play-state": "running",
      },
    });
  });
});

Deno.test("executeCommand: runs asset plugin and emits layer image commands", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    const result = await executeCommand(state, {
      op: "asset",
      args: { type: "bg", src: "sample.jpg" },
    }, workerHost);

    assertEquals(result.requestedNext, true);
    assertEquals(result.suspended, false);
    assertEquals(result.jumpTo, null);
    assertEquals(result.renderCommands.length, 2);
    assertEquals(result.renderCommands[0], {
      type: "ClearSubtree",
      targetId: "fc-bg-layer",
    });
    assertEquals(result.renderCommands[1], {
      type: "AppendNode",
      parentId: "fc-bg-layer",
      nodeId: "fc-bg-asset-1",
      tag: "img",
      src: "sample.jpg",
    });
  });
});

Deno.test("executeCommand: asset plugin rejects disallowed file extension", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () =>
        executeCommand(state, { op: "asset", args: { type: "bg", src: "sample.txt" } }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("executeCommand: runs menu plugin and suspends without input", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    const result = await executeCommand(state, {
      op: "menu",
      args: {
        choices: [
          { text: "Go", to: "end_label" },
        ],
      },
    }, workerHost);

    assertEquals(result.requestedNext, false);
    assertEquals(result.suspended, true);
    assertEquals(result.jumpTo, null);
    assertEquals(result.renderCommands.length, 2);
    assertEquals(result.renderCommands[0], {
      type: "ClearSubtree",
      targetId: "fc-text-layer",
    });
    assertEquals(result.renderCommands[1], {
      type: "AppendNode",
      parentId: "fc-text-layer",
      nodeId: "fc-menu-1-1",
      tag: "button",
      text: "Go",
      onClickInput: "end_label",
    });
  });
});

Deno.test("executeCommand: menu plugin rejects tampered input", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: { _last_input: "hacked" } };
    await assertRejects(
      () =>
        executeCommand(state, {
          op: "menu",
          args: {
            choices: [
              { text: "Go", to: "end_label" },
              { text: "Stay", to: "start" },
            ],
          },
        }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("executeCommand: sanitizes plugin execution errors", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () => executeCommand(state, { op: "set", args: { target: "x" } }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("executeCommand: rejects reserved variable writes from plugin", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: { hp: 10 } };
    await assertRejects(
      () =>
        executeCommand(state, {
          op: "set",
          args: { target: "_current_label", expression: "hp ^+ 1" },
        }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("executeCommand: rejects oversized args payload", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () =>
        executeCommand(state, {
          op: "say",
          args: { text: "x".repeat(9 * 1024) },
        }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("executeCommand: rejects oversized vars snapshot", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = {
      vars: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, i])),
    };
    await assertRejects(
      () => executeCommand(state, { op: "say", args: { text: "ok" } }, workerHost),
      Error,
      "operation rejected",
    );
  });
});

Deno.test("executeCommand: rejects vars patch that exceeds vars entry limit after apply", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = {
      vars: Object.fromEntries(Array.from({ length: 255 }, (_, i) => [`k${i}`, i])),
    };
    await assertRejects(
      () =>
        executeCommand(
          state,
          { op: "say", args: { text: "overflow" } },
          workerHost,
        ),
      Error,
      "operation rejected",
    );
    assertEquals(Object.keys(state.vars).length, 255);
    assertEquals("last_say" in state.vars, false);
    assertEquals("say_seq" in state.vars, false);
  });
});

Deno.test("executeCommand: worker host self-heals after timeout", async () => {
  await withWorkerHost(async (workerHost) => {
    const state = { vars: {} };
    await assertRejects(
      () =>
        executeCommand(
          state,
          {
            op: "say",
            args: { text: "will timeout", __fixture: "hang" },
          },
          workerHost,
          { timeoutMs: 100 },
        ),
      Error,
      "operation rejected",
    );

    const result = await executeCommand(
      state,
      { op: "say", args: { text: "recovered" } },
      workerHost,
    );
    assertEquals(result.vars.last_say, "recovered");
    assertEquals(result.requestedNext, true);
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
