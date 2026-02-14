import { assertEquals } from "@std/assert";

import { preparePluginRuntime, run } from "./runner.ts";
import type { ChoiceOption, IR } from "../ir/types.ts";

function baseIR(): IR {
  return {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [{ op: "say", text: "Hi" }, { op: "end" }],
    },
  };
}

Deno.test("run: end returns ok result", async () => {
  const result = await run(baseIR(), {
    choose: () => 0,
  });

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.reason, "end");
    assertEquals(result.label, "start");
    assertEquals(result.ip, 1);
    assertEquals(result.steps, 2);
    assertEquals(result.vars !== undefined, true);
  }
});

Deno.test("run: emits trace events", async () => {
  const events: Array<{ event: string; step: number }> = [];
  await run(baseIR(), {
    choose: () => 0,
    trace: (event) => events.push({ event: event.event, step: event.step }),
  });

  assertEquals(events.map((e) => e.event), ["vm.step", "vm.say", "vm.step", "vm.end"]);
  assertEquals(events.map((e) => e.step), [0, 0, 1, 1]);
});

Deno.test("run: emits ui events (say + choice.present + choice.select)", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        { op: "say", text: "Hi" },
        {
          op: "choice",
          options: [{ text: "Go", to: "end_label" } as ChoiceOption],
        },
        { op: "end" },
      ],
      end_label: [{ op: "end" }],
    },
  };

  const events: string[] = [];
  await run(ir, {
    choose: () => 0,
    ui: (event) => events.push(event.event),
  });

  assertEquals(events, ["ui.say", "ui.choice.present", "ui.choice.select"]);
});

Deno.test("run: ui.say includes optional meta when provided", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        {
          op: "say",
          text: "Hi",
          meta: {
            mouth: {
              mode: "phoneme",
              mou: "oaou",
            },
          },
        },
        { op: "end" },
      ],
    },
  };

  let sayEvent: { event?: string; meta?: unknown } | undefined;
  await run(ir, {
    choose: () => 0,
    ui: (event) => {
      if (event.event === "ui.say") sayEvent = event;
    },
  });

  assertEquals(sayEvent?.event, "ui.say");
  assertEquals(sayEvent?.meta, {
    mouth: {
      mode: "phoneme",
      mou: "oaou",
    },
  });
});

Deno.test("run: missing label => E0401", async () => {
  const ir: IR = {
    ...baseIR(),
    labels: {},
  };

  const result = await run(ir, { choose: () => 0 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0401");
  }
});

Deno.test("run: choice index out of range => E0306", async () => {
  const ir: IR = {
    ...baseIR(),
    labels: {
      start: [
        {
          op: "choice",
          options: [{ text: "Go", to: "start" } as ChoiceOption],
        },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, { choose: () => 2 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0306");
  }
});

Deno.test("run: set/if/jump", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        { op: "set", name: "hasKey", value: true },
        { op: "if", name: "hasKey", negated: false, to: "opened" },
        { op: "end" },
      ],
      opened: [{ op: "say", text: "Opened" }, { op: "jump", to: "end_label" }],
      end_label: [{ op: "end" }],
    },
  };

  const events: string[] = [];
  const result = await run(ir, {
    choose: () => 0,
    trace: (event) => events.push(event.event),
  });

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.label, "end_label");
    assertEquals(result.vars !== undefined, true);
  }
  assertEquals(events.includes("vm.step"), true);
});

Deno.test("run: if equals compares strictly", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        { op: "set", name: "score", value: 10 },
        { op: "if", name: "score", negated: false, equals: 10, to: "ok" },
        { op: "end" },
      ],
      ok: [{ op: "end" }],
    },
  };

  const result = await run(ir, { choose: () => 0 });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.label, "ok");
  }
});

Deno.test("run: if without equals requires boolean => E0314", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        { op: "set", name: "score", value: 1 },
        { op: "if", name: "score", negated: false, to: "ok" },
        { op: "end" },
      ],
      ok: [{ op: "end" }],
    },
  };

  const result = await run(ir, { choose: () => 0 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0314");
  }
});

Deno.test("run: ignores reserved vars on load", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [{ op: "end" }],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    vars: { __proto__: true, safe: true } as unknown as Record<string, boolean>,
  });

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(Object.prototype.hasOwnProperty.call(result.vars, "__proto__"), false);
    assertEquals(result.vars.safe, true);
  }
});

Deno.test("run: plugin op executes with allowlist and manifest", async () => {
  const calls: Array<{ name: string; attrs: Record<string, string>; timeoutMs: number }> = [];
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["ui.render"],
    labels: {
      start: [
        { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginRuntime: {
      invoke: (name, attrs, context) => {
        calls.push({ name, attrs, timeoutMs: context.timeoutMs });
        return { ok: true };
      },
    },
    pluginManifests: {
      "ui.render": {
        capabilities: ["ui"],
        primitives: ["ui.render"],
      },
    },
  });

  assertEquals(result.ok, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "ui.render");
  assertEquals(calls[0].attrs.text, "Hello");
  assertEquals(calls[0].timeoutMs, 5000);
});

Deno.test("run: presentation plugin failure degrades and continues progression", async () => {
  const degraded: Array<{ plugin: string; code: string }> = [];
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["ui.render"],
    labels: {
      start: [
        { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
        { op: "set", name: "afterDegraded", value: true },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    onPresentationDegraded: (event) => degraded.push({ plugin: event.plugin, code: event.code }),
    pluginRuntime: {
      invoke: () => ({ ok: false, code: "E0704", message: "ui render failed" }),
    },
    pluginManifests: {
      "ui.render": {
        capabilities: ["ui"],
        primitives: ["ui.render"],
      },
    },
  });

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.vars.afterDegraded, true);
  }
  assertEquals(degraded.length, 1);
  assertEquals(degraded[0].plugin, "ui.render");
  assertEquals(degraded[0].code, "E0704");
});

Deno.test("run: missing presentation capability degrades and continues progression", async () => {
  let invoked = false;
  const degraded: string[] = [];
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["ui.render"],
    labels: {
      start: [
        { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
        { op: "set", name: "afterMissingCapability", value: true },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    onPresentationDegraded: (event) => degraded.push(event.message),
    pluginRuntime: {
      invoke: () => {
        invoked = true;
        return { ok: true };
      },
    },
    pluginManifests: {
      "ui.render": {
        capabilities: [],
        primitives: ["ui.render"],
      },
    },
  });

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.vars.afterMissingCapability, true);
  }
  assertEquals(invoked, false);
  assertEquals(degraded.length, 1);
  assertEquals(degraded[0].includes("invalid manifest for plugin ui.render"), true);
});

Deno.test("run: plugin sync throw => E0704", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["ui.render"],
    labels: {
      start: [
        { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginRuntime: {
      invoke: () => {
        throw new Error("boom");
      },
    },
    pluginManifests: {
      "ui.render": {
        capabilities: ["ui"],
        primitives: ["ui.render"],
      },
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0704");
    assertEquals(result.error.message, "boom");
  }
});

Deno.test("run: plugin async timeout => E0705", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["time.sleep"],
    labels: {
      start: [
        { op: "plugin", name: "time.sleep", attrs: { ms: "1000" } },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginTimeoutMs: 20,
    pluginRuntime: {
      invoke: (_name, _attrs, context) => {
        return {
          ok: false,
          code: "E0705",
          message: `async plugin timeout after ${context.timeoutMs}ms`,
        };
      },
    },
    pluginManifests: {
      "time.sleep": {
        capabilities: ["timer"],
        primitives: ["time.sleep"],
      },
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0705");
  }
});

Deno.test("run: presentation timeout remains terminal => E0705", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["ui.render"],
    labels: {
      start: [
        { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
        { op: "set", name: "afterTimeout", value: true },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginRuntime: {
      invoke: () => ({ ok: false, code: "E0705", message: "async plugin timeout after 20ms" }),
    },
    pluginManifests: {
      "ui.render": {
        capabilities: ["ui"],
        primitives: ["ui.render"],
      },
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0705");
    assertEquals(result.vars.afterTimeout, undefined);
  }
});

Deno.test("run: presentation cancel remains terminal => E0706", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["ui.render"],
    labels: {
      start: [
        { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
        { op: "set", name: "afterCancel", value: true },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginRuntime: {
      invoke: () => ({ ok: false, code: "E0706", message: "async plugin cancelled" }),
    },
    pluginManifests: {
      "ui.render": {
        capabilities: ["ui"],
        primitives: ["ui.render"],
      },
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0706");
    assertEquals(result.vars.afterCancel, undefined);
  }
});

Deno.test("run: plugin cancelled by host => E0706", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["time.sleep"],
    labels: {
      start: [
        { op: "plugin", name: "time.sleep", attrs: { ms: "1000" } },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginTimeoutMs: 500,
    isCancelled: () => true,
    pluginRuntime: {
      invoke: () => ({ ok: false, code: "E0706", message: "async plugin cancelled" }),
    },
    pluginManifests: {
      "time.sleep": {
        capabilities: ["timer"],
        primitives: ["time.sleep"],
      },
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0706");
  }
});

Deno.test("run: execution stops after plugin timeout error", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["time.sleep"],
    labels: {
      start: [
        { op: "plugin", name: "time.sleep", attrs: { ms: "1000" } },
        { op: "set", name: "afterTimeout", value: true },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginRuntime: {
      invoke: () => ({ ok: false, code: "E0705", message: "async plugin timeout after 20ms" }),
    },
    pluginManifests: {
      "time.sleep": {
        capabilities: ["timer"],
        primitives: ["time.sleep"],
      },
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0705");
    assertEquals(result.vars.afterTimeout, undefined);
  }
});

Deno.test("run: execution stops after plugin cancel error", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["time.sleep"],
    labels: {
      start: [
        { op: "plugin", name: "time.sleep", attrs: { ms: "1000" } },
        { op: "set", name: "afterCancel", value: true },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, {
    choose: () => 0,
    pluginRuntime: {
      invoke: () => ({ ok: false, code: "E0706", message: "async plugin cancelled" }),
    },
    pluginManifests: {
      "time.sleep": {
        capabilities: ["timer"],
        primitives: ["time.sleep"],
      },
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0706");
    assertEquals(result.vars.afterCancel, undefined);
  }
});

Deno.test("run: execution stops after non-async runtime failure", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: [],
    labels: {
      start: [
        {
          op: "choice",
          options: [{ text: "Go", to: "start" } as ChoiceOption],
        },
        { op: "set", name: "afterChoiceError", value: true },
        { op: "end" },
      ],
    },
  };

  const result = await run(ir, { choose: () => 2 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0306");
    assertEquals(result.vars.afterChoiceError, undefined);
  }
});

Deno.test("run: plugin runtime missing => E0701", async () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["ui.render"],
    labels: {
      start: [{ op: "end" }],
    },
  };

  const result = await run(ir, { choose: () => 0 });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.code, "E0701");
  }
});

Deno.test("preparePluginRuntime: ignores inherited keys when checking manifests", () => {
  const ir: IR = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    entry: "start",
    plugins: ["toString"],
    labels: {
      start: [{ op: "end" }],
    },
  };

  const result = preparePluginRuntime(ir, { invoke: () => ({ ok: true }) }, {});
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "E0702");
  }
});
