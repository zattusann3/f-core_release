import { assertEquals, assertStringIncludes } from "@std/assert";

const DENO = Deno.execPath();
const ROOT = new URL(".", import.meta.url).pathname;
const CAN_RUN = Deno.permissions.querySync({ name: "run" }).state === "granted";

async function runCli(args: string[], env?: Record<string, string>) {
  const p = new Deno.Command(DENO, {
    args: [
      "run",
      "--allow-run",
      "--allow-read",
      "--allow-write",
      "--allow-env=F_CORE_PROGRESS_NOTICE_MS",
      "main.ts",
      ...args,
    ],
    cwd: ROOT,
    env,
    stdout: "piped",
    stderr: "piped",
  });
  const out = await p.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
}

async function runCliWithInput(
  args: string[],
  stdinText: string,
  env?: Record<string, string>,
) {
  const p = new Deno.Command(DENO, {
    args: [
      "run",
      "--allow-run",
      "--allow-read",
      "--allow-write",
      "--allow-env=F_CORE_PROGRESS_NOTICE_MS",
      "main.ts",
      ...args,
    ],
    cwd: ROOT,
    env,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = p.stdin.getWriter();
  await writer.write(new TextEncoder().encode(stdinText));
  await writer.close();
  const out = await p.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
  };
}

Deno.test({
  name: "cli validate: OK for L2 scenario",
  ignore: !CAN_RUN,
  fn: async () => {
    const result = await runCli(["validate", "scenario_l2.md"]);
    assertEquals(result.code, 0);
    assertStringIncludes(result.stdout, "OK");
  },
});

Deno.test({
  name: "cli validate: warnings exit 0",
  ignore: !CAN_RUN,
  fn: async () => {
    const result = await runCli(["validate", "scenario_l2_warn.md"]);
    assertEquals(result.code, 0);
    assertStringIncludes(result.stdout, "OK (warnings: 1)");
    assertStringIncludes(result.stderr, "WARN W0301");
  },
});

Deno.test({
  name: "cli compile: writes JSON to stdout",
  ignore: !CAN_RUN,
  fn: async () => {
    const result = await runCli(["compile", "scenario_l2.md"]);
    assertEquals(result.code, 0);
    assertStringIncludes(result.stdout, '"schemaVersion"');
  },
});

Deno.test({
  name: "cli run: --ui-jsonl requires --auto",
  ignore: !CAN_RUN,
  fn: async () => {
    const result = await runCli(["run", "game.ir.json", "--ui-jsonl"]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stdout, "Usage:");
    assertStringIncludes(result.stderr, "--ui-jsonl requires --auto");
  },
});

Deno.test({
  name: "cli run: --ui-jsonl emits JSONL only",
  ignore: !CAN_RUN,
  fn: async () => {
    const outputFile = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const compile = await runCli(["compile", "scenario_l2.md", "-o", outputFile]);
    assertEquals(compile.code, 0);

    const result = await runCli(["run", outputFile, "--auto", "--ui-jsonl"]);
    assertEquals(result.code, 0);
    const lines = result.stdout.trim().split("\n").filter((line) => line.length > 0);
    assertEquals(lines.length > 0, true);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { schemaVersion?: number; event?: string };
      assertEquals(parsed.schemaVersion, 1);
      assertEquals(typeof parsed.event, "string");
    }
  },
});

Deno.test({
  name: "cli run: --ui-jsonl forwards ui.say meta when present in IR",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "say",
            text: "HELLO",
            meta: {
              mouth: { mode: "phoneme", mou: "oaou" },
            },
          },
          { op: "end" },
        ],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const result = await runCli(["run", irPath, "--auto", "--ui-jsonl"]);
    assertEquals(result.code, 0);

    const events = result.stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { event?: string; text?: string; meta?: unknown });
    const say = events.find((event) => event.event === "ui.say" && event.text === "HELLO");
    assertEquals(say?.meta, { mouth: { mode: "phoneme", mou: "oaou" } });
  },
});

Deno.test({
  name: "cli run: --auto selects first choice index (0)",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "choice",
            options: [
              { text: "A", to: "route_a" },
              { text: "B", to: "route_b" },
            ],
          },
          { op: "end" },
        ],
        route_a: [{ op: "say", text: "ROUTE_A" }, { op: "end" }],
        route_b: [{ op: "say", text: "ROUTE_B" }, { op: "end" }],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const result = await runCli(["run", irPath, "--auto", "--ui-jsonl"]);
    assertEquals(result.code, 0);

    const events = result.stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { event?: string; index?: number; text?: string });

    const presentIndex = events.findIndex((event) => event.event === "ui.choice.present");
    const selectIndex = events.findIndex((event) => event.event === "ui.choice.select");
    assertEquals(presentIndex >= 0, true);
    assertEquals(selectIndex >= 0, true);
    assertEquals(selectIndex > presentIndex, true);
    assertEquals(events[selectIndex]?.index, 0);
    assertEquals(events.some((event) => event.event === "ui.say" && event.text === "ROUTE_A"), true);
    assertEquals(events.some((event) => event.event === "ui.say" && event.text === "ROUTE_B"), false);
  },
});

Deno.test({
  name: "cli run: failure emits machine-readable vm.error log",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const manifestsPath = Deno.makeTempFileSync({ suffix: ".json" });

    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: ["demoPlugin"],
      labels: {
        start: [
          { op: "plugin", name: "demoPlugin", attrs: { text: "hi" } },
          { op: "end" },
        ],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));
    Deno.writeTextFileSync(manifestsPath, JSON.stringify({}, null, 2));

    const result = await runCli(["run", irPath, "--auto", "--plugin-manifests", manifestsPath]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "ERROR E0702");
    assertStringIncludes(result.stderr, '"event":"vm.error"');
  },
});

Deno.test({
  name: "cli run: readIR failure emits machine-readable vm.error log",
  ignore: !CAN_RUN,
  fn: async () => {
    const result = await runCli(["run", "missing.ir.json", "--auto"]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "ERROR E0602");
    assertStringIncludes(result.stderr, '"event":"vm.error"');
    assertStringIncludes(result.stderr, '"command":"run"');
  },
});

Deno.test({
  name: "cli run: load failure emits machine-readable vm.error log",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [{ op: "end" }],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const result = await runCli(["run", irPath, "--auto", "--load", "missing.save.json"]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "ERROR E0601");
    assertStringIncludes(result.stderr, '"event":"vm.error"');
    assertStringIncludes(result.stderr, '"command":"run"');
  },
});

Deno.test({
  name: "cli trace: failure emits machine-readable vm.error log",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const manifestsPath = Deno.makeTempFileSync({ suffix: ".json" });

    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: ["demoPlugin"],
      labels: {
        start: [
          { op: "plugin", name: "demoPlugin", attrs: { text: "hi" } },
          { op: "end" },
        ],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));
    Deno.writeTextFileSync(manifestsPath, JSON.stringify({}, null, 2));

    const result = await runCli(["trace", irPath, "--plugin-manifests", manifestsPath]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "ERROR E0702");
    assertStringIncludes(result.stderr, '"event":"vm.error"');
    assertStringIncludes(result.stderr, '"command":"trace"');
    assertEquals(result.stderr.includes('"event":"ui.error"'), false);
  },
});

Deno.test({
  name: "cli trace: readIR failure emits machine-readable vm.error log",
  ignore: !CAN_RUN,
  fn: async () => {
    const result = await runCli(["trace", "missing.ir.json"]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "ERROR E0602");
    assertStringIncludes(result.stderr, '"event":"vm.error"');
    assertStringIncludes(result.stderr, '"command":"trace"');
  },
});

Deno.test({
  name: "cli run: long execution emits progress info messages",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const manifestsPath = Deno.makeTempFileSync({ suffix: ".json" });

    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: ["time.sleep"],
      labels: {
        start: [
          { op: "plugin", name: "time.sleep", attrs: { ms: "20" } },
          { op: "end" },
        ],
      },
    };
    const manifests = {
      "time.sleep": {
        capabilities: ["timer"],
        primitives: ["time.sleep"],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));
    Deno.writeTextFileSync(manifestsPath, JSON.stringify(manifests, null, 2));

    const result = await runCli(
      ["run", irPath, "--auto", "--plugin-manifests", manifestsPath],
      { F_CORE_PROGRESS_NOTICE_MS: "1" },
    );
    assertEquals(result.code, 0);
    assertStringIncludes(result.stderr, "INFO I0001");
    assertStringIncludes(result.stderr, "INFO I0002");
  },
});

Deno.test({
  name: "cli run: presentation degradation emits fallback signal and continues",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const manifestsPath = Deno.makeTempFileSync({ suffix: ".json" });

    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: ["ui.render"],
      labels: {
        start: [
          { op: "plugin", name: "ui.render", attrs: { text: "Hello" } },
          { op: "say", text: "Continues." },
          { op: "end" },
        ],
      },
    };
    const manifests = {
      "ui.render": {
        capabilities: [],
        primitives: ["ui.render"],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));
    Deno.writeTextFileSync(manifestsPath, JSON.stringify(manifests, null, 2));

    const result = await runCli(["run", irPath, "--auto", "--plugin-manifests", manifestsPath]);
    assertEquals(result.code, 0);
    assertStringIncludes(result.stdout, "Continues.");
    assertStringIncludes(result.stderr, "INFO I0002");
    assertStringIncludes(result.stderr, "presentation degraded");
  },
});

Deno.test({
  name: "[GATE_GUI_BRIDGE:STDOUT_JSONL_PURITY] cli run: gui bridge keeps stdout JSONL only",
  ignore: !CAN_RUN,
  fn: async () => {
    const outputFile = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const compile = await runCli(["compile", "scenario_l2.md", "-o", outputFile]);
    assertEquals(compile.code, 0);

    const result = await runCli(["run", outputFile, "--auto", "--gui-bridge"]);
    assertEquals(result.code, 0);
    const lines = result.stdout.trim().split("\n").filter((line) => line.length > 0);
    assertEquals(lines.length > 0, true);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { schemaVersion?: number; event?: string };
      assertEquals(parsed.schemaVersion, 1);
      assertEquals(typeof parsed.event, "string");
    }
  },
});

Deno.test({
  name:
    "[GATE_GUI_BRIDGE:STDERR_DIAGNOSTICS] cli run: gui bridge errors emit diagnostics on stderr",
  ignore: !CAN_RUN,
  fn: async () => {
    const result = await runCli(["run", "missing.ir.json", "--gui-bridge"]);
    assertEquals(result.code, 1);
    assertEquals(result.stdout.trim(), "");
    assertStringIncludes(result.stderr, "ERROR E0602");
    assertStringIncludes(result.stderr, '"event":"vm.error"');
  },
});

Deno.test({
  name: "cli run: gui bridge honors stdin choice index even with --auto",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "choice",
            options: [
              { text: "A", to: "route_a" },
              { text: "B", to: "route_b" },
            ],
          },
          { op: "end" },
        ],
        route_a: [{ op: "say", text: "ROUTE_A" }, { op: "end" }],
        route_b: [{ op: "say", text: "ROUTE_B" }, { op: "end" }],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const stdinCommand = `${JSON.stringify({
      schemaVersion: 1,
      command: "choice.select",
      requestId: "choice-1",
      index: 1,
    })}\n`;
    const result = await runCliWithInput(["run", irPath, "--auto", "--gui-bridge"], stdinCommand);
    assertEquals(result.code, 0);

    const events = result.stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { event?: string; index?: number; text?: string });
    const selected = events.find((event) => event.event === "ui.choice.select");
    assertEquals(selected?.index, 1);
    assertEquals(events.some((event) => event.event === "ui.say" && event.text === "ROUTE_B"), true);
    assertEquals(events.some((event) => event.event === "ui.say" && event.text === "ROUTE_A"), false);
  },
});

Deno.test({
  name: "cli run: gui bridge ui.error includes requestId for correlated input failure",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "choice",
            options: [{ text: "A", to: "end_label" }],
          },
          { op: "end" },
        ],
        end_label: [{ op: "end" }],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const stdinCommand =
      `${JSON.stringify({ schemaVersion: 1, command: "choice.select", requestId: "req-99", index: 9 })}\n`;
    const result = await runCliWithInput(["run", irPath, "--gui-bridge"], stdinCommand);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, '"event":"ui.error"');
    assertStringIncludes(result.stderr, '"requestId":"req-99"');
    assertStringIncludes(result.stderr, '"event":"vm.error"');
  },
});

Deno.test({
  name: "cli run: gui bridge rejects mismatched requestId",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "choice",
            options: [{ text: "A", to: "end_label" }],
          },
          { op: "end" },
        ],
        end_label: [{ op: "end" }],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const stdinCommand =
      `${JSON.stringify({ schemaVersion: 1, command: "choice.select", requestId: "totally-unrelated", index: 0 })}\n`;
    const result = await runCliWithInput(["run", irPath, "--gui-bridge"], stdinCommand);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, '"event":"ui.error"');
    assertStringIncludes(result.stderr, '"requestId":"totally-unrelated"');
    assertStringIncludes(result.stderr, "requestId mismatch for pending choice");
    const uiErrorCount = (result.stderr.match(/"event":"ui\.error"/g) ?? []).length;
    assertEquals(uiErrorCount, 1);
  },
});

Deno.test({
  name: "cli run: gui bridge rejects oversize engine->ui event with E0704",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "say",
            text: "x".repeat(70_000),
          },
          { op: "end" },
        ],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));
    const result = await runCli(["run", irPath, "--auto", "--gui-bridge"]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "ERROR E0704");
    assertStringIncludes(result.stderr, '"event":"vm.error"');
  },
});

Deno.test({
  name: "cli run: --ui-jsonl failure path does not emit ui.error",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "say",
            text: "x".repeat(70_000),
          },
          { op: "end" },
        ],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));
    const result = await runCli(["run", irPath, "--auto", "--ui-jsonl"]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, '"event":"vm.error"');
    assertEquals(result.stderr.includes('"event":"ui.error"'), false);
  },
});

Deno.test({
  name: "cli run: gui bridge sanitizes runner error line for untrusted key text",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "choice",
            options: [{ text: "A", to: "end_label" }],
          },
          { op: "end" },
        ],
        end_label: [{ op: "end" }],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const badKey = "bad\\nkey";
    const stdinCommand =
      `{"schemaVersion":1,"command":"choice.select","requestId":"choice-1","index":0,"${badKey}":true}\n`;
    const result = await runCliWithInput(["run", irPath, "--gui-bridge"], stdinCommand);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "unknown top-level field: bad\\nkey");
    assertEquals(result.stderr.includes("unknown top-level field: bad\nkey"), false);
  },
});

Deno.test({
  name: "cli run: gui bridge emits plugin ui.render event on stdout JSONL",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const manifestsPath = Deno.makeTempFileSync({ suffix: ".json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: ["ui.render"],
      labels: {
        start: [
          { op: "plugin", name: "ui.render", attrs: { text: "GUI hello" } },
          { op: "end" },
        ],
      },
    };
    const manifests = {
      "ui.render": {
        capabilities: ["ui"],
        primitives: ["ui.render"],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));
    Deno.writeTextFileSync(manifestsPath, JSON.stringify(manifests, null, 2));
    const result = await runCli([
      "run",
      irPath,
      "--auto",
      "--gui-bridge",
      "--plugin-manifests",
      manifestsPath,
    ]);
    assertEquals(result.code, 0);
    assertStringIncludes(result.stdout, '"event":"ui.render"');
    assertStringIncludes(result.stdout, '"text":"GUI hello"');
  },
});

Deno.test({
  name: "cli run: gui bridge rejects oversized trailing payload (fail-closed)",
  ignore: !CAN_RUN,
  fn: async () => {
    const irPath = Deno.makeTempFileSync({ suffix: ".ir.json" });
    const ir = {
      schemaVersion: 1,
      engineVersion: "0.1.0",
      entry: "start",
      plugins: [],
      labels: {
        start: [
          {
            op: "choice",
            options: [{ text: "A", to: "mid_label" }],
          },
          { op: "end" },
        ],
        mid_label: [
          {
            op: "choice",
            options: [{ text: "B", to: "end_label" }],
          },
          { op: "end" },
        ],
        end_label: [{ op: "end" }],
      },
    };
    Deno.writeTextFileSync(irPath, JSON.stringify(ir, null, 2));

    const validLine = JSON.stringify({
      schemaVersion: 1,
      command: "choice.select",
      requestId: "choice-1",
      index: 0,
    }) + "\n";
    const oversizedTail = "x".repeat(70_000);
    const result = await runCliWithInput(["run", irPath, "--gui-bridge"], validLine + oversizedTail);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "ui command exceeds max bytes");
    assertStringIncludes(result.stderr, '"event":"ui.error"');
    assertStringIncludes(result.stderr, '"event":"vm.error"');
  },
});
