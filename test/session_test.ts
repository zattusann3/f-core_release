import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { ScenarioSession } from "../src/session.ts";
import type { CommandIR } from "../src/runtime.ts";

Deno.test("ScenarioSession: step advances index and handles jump", async () => {
  const scenario: Record<string, CommandIR[]> = {
    start: [
      { op: "say", args: { text: "line 1" } },
      { op: "choice", args: { to: "end" } },
    ],
    end: [
      { op: "say", args: { text: "line 2" } },
    ],
  };

  const session = new ScenarioSession();
  try {
    await session.loadScenario(scenario, "start");

    const firstRender = await session.step();
    assertEquals(firstRender?.length, 1);
    assertEquals(session.currentLabel, "start");
    assertEquals(session.currentIndex, 1);

    const secondRender = await session.step();
    assertEquals(secondRender, []);
    assertEquals(session.currentLabel, "end");
    assertEquals(session.currentIndex, 0);

    const thirdRender = await session.step();
    assertEquals(thirdRender?.length, 1);
    assertEquals(session.currentLabel, "end");
    assertEquals(session.currentIndex, 1);

    const done = await session.step();
    assertEquals(done, null);
  } finally {
    session.close();
  }
});

Deno.test("ScenarioSession: save and load restore cursor and vars", async () => {
  const scenario: Record<string, CommandIR[]> = {
    start: [
      { op: "set", args: { target: "hp", expression: "3 ^+ 4" } },
      { op: "choice", args: { to: "end" } },
    ],
    end: [
      { op: "say", args: { text: "done" } },
    ],
  };

  const source = new ScenarioSession();
  let restored: ScenarioSession | null = null;
  try {
    await source.loadScenario(scenario, "start");
    await source.step();
    await source.step();
    const saveData = source.exportSaveData();

    restored = new ScenarioSession();
    await restored.loadScenario(scenario, "start");
    restored.importSaveData(saveData);

    assertEquals(restored.currentLabel, "end");
    assertEquals(restored.currentIndex, 0);
    assertEquals(restored.runtimeState.vars.hp, 7);
    assertEquals(restored.runtimeState.vars._last_input, null);

    const render = await restored.step();
    assertEquals(render?.length, 1);
    assertEquals(restored.currentIndex, 1);
  } finally {
    source.close();
    restored?.close();
  }
});

Deno.test("ScenarioSession: suspend keeps PC, input resumes with jump", async () => {
  const scenario: Record<string, CommandIR[]> = {
    start: [
      {
        op: "menu",
        args: {
          choices: [
            { text: "To End", to: "end" },
          ],
        },
      },
      { op: "say", args: { text: "unreachable" } },
    ],
    end: [
      { op: "say", args: { text: "done" } },
    ],
  };

  const session = new ScenarioSession();
  try {
    await session.loadScenario(scenario, "start");

    const first = await session.step();
    assertEquals(first?.length, 2);
    assertEquals(session.currentLabel, "start");
    assertEquals(session.currentIndex, 0);
    assertEquals(session.runtimeState.vars._last_input, null);

    session.provideInput("end");
    assertEquals(session.runtimeState.vars._last_input, "end");

    const second = await session.step();
    assertEquals(second, []);
    assertEquals(session.currentLabel, "end");
    assertEquals(session.currentIndex, 0);
    assertEquals(session.runtimeState.vars._last_input, null);
  } finally {
    session.close();
  }
});

Deno.test("ScenarioSession: save/load restores suspended render commands", async () => {
  const scenario: Record<string, CommandIR[]> = {
    start: [
      {
        op: "menu",
        args: {
          choices: [
            { text: "To End", to: "end" },
          ],
        },
      },
      { op: "say", args: { text: "unreachable" } },
    ],
    end: [
      { op: "say", args: { text: "done" } },
    ],
  };

  const source = new ScenarioSession();
  let restored: ScenarioSession | null = null;
  try {
    await source.loadScenario(scenario, "start");
    const suspendedCommands = await source.step();
    const saveData = source.exportSaveData();

    restored = new ScenarioSession();
    await restored.loadScenario(scenario, "start");
    restored.importSaveData(saveData);

    assertEquals(restored.getSuspendedRenderCommands(), suspendedCommands);
    assertEquals(restored.currentLabel, "start");
    assertEquals(restored.currentIndex, 0);

    restored.provideInput("end");
    const resumed = await restored.step();
    assertEquals(resumed, []);
    assertEquals(restored.currentLabel, "end");
    assertEquals(restored.currentIndex, 0);
  } finally {
    source.close();
    restored?.close();
  }
});

Deno.test("ScenarioSession: importSaveData rejects invalid payloads", async () => {
  const scenario: Record<string, CommandIR[]> = {
    start: [{ op: "say", args: { text: "x" } }],
  };

  const session = new ScenarioSession();
  try {
    await session.loadScenario(scenario, "start");

    assertThrows(
      () =>
        session.importSaveData(
          JSON.stringify({ currentLabel: "missing", currentIndex: 0, vars: {} }),
        ),
      Error,
      "invalid save data",
    );
    assertThrows(
      () =>
        session.importSaveData(
          JSON.stringify({ currentLabel: "start", currentIndex: 99, vars: {} }),
        ),
      Error,
      "invalid save data",
    );
    assertThrows(
      () =>
        session.importSaveData(
          JSON.stringify({ currentLabel: "start", currentIndex: 0, vars: { _hack: 1 } }),
        ),
      Error,
      "invalid save data",
    );
    assertThrows(
      () =>
        session.importSaveData(
          '{"currentLabel":"start","currentIndex":0,"vars":{"__proto__":1}}',
        ),
      Error,
      "invalid save data",
    );
    assertThrows(
      () =>
        session.importSaveData(
          '{"currentLabel":"start","currentIndex":0,"vars":{"constructor":1}}',
        ),
      Error,
      "invalid save data",
    );
    assertThrows(
      () =>
        session.importSaveData(
          '{"currentLabel":"start","currentIndex":0,"vars":{"prototype":1}}',
        ),
      Error,
      "invalid save data",
    );
  } finally {
    session.close();
  }
});

Deno.test("ScenarioSession: step rejects before scenario start", async () => {
  const session = new ScenarioSession();
  try {
    await assertRejects(
      () => session.step(),
      Error,
      "session not started",
    );
  } finally {
    session.close();
  }
});

Deno.test("ScenarioSession: executes release_assets in evaluator layer", async () => {
  const released: string[][] = [];
  const scenario: Record<string, CommandIR[]> = {
    start: [
      { op: "release_assets", args: { ids: ["bg/intro.jpg", "se/click.ogg"] } },
      { op: "say", args: { text: "next" } },
    ],
  };

  const session = new ScenarioSession(
    undefined,
    undefined,
    {
      onReleaseAssets: (ids) => {
        released.push([...ids]);
      },
    },
  );

  try {
    await session.loadScenario(scenario, "start");

    const first = await session.step();
    assertEquals(first, []);
    assertEquals(released, [["bg/intro.jpg", "se/click.ogg"]]);
    assertEquals(session.currentLabel, "start");
    assertEquals(session.currentIndex, 1);

    const second = await session.step();
    assertEquals(second?.length, 1);
    assertEquals(session.currentIndex, 2);
  } finally {
    session.close();
  }
});

Deno.test("ScenarioSession: rejects oversized release_assets payload", async () => {
  const ids = Array.from({ length: 33 }, (_, index) => `bg/${index}.png`);
  const scenario: Record<string, CommandIR[]> = {
    start: [
      { op: "release_assets", args: { ids } },
    ],
  };

  const session = new ScenarioSession();
  try {
    await session.loadScenario(scenario, "start");
    await assertRejects(
      () => session.step(),
      Error,
      "invalid scenario",
    );
  } finally {
    session.close();
  }
});
