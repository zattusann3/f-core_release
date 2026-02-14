import { assertEquals } from "@std/assert";
import {
  createChoiceRequestTracker,
  DEFAULT_PROGRESS_NOTICE_MS,
  parseArgs,
  resolveProgressNoticeMs,
} from "./main.ts";

Deno.test("parseArgs: compile with output", () => {
  const result = parseArgs(["compile", "scenario.md", "-o", "game.ir.json"]);
  assertEquals(result.ok, true);
  if (result.ok && result.command === "compile") {
    assertEquals(result.input, "scenario.md");
    assertEquals(result.output, "game.ir.json");
  }
});

Deno.test("parseArgs: validate needs input", () => {
  const result = parseArgs(["validate"]);
  assertEquals(result.ok, false);
});

Deno.test("parseArgs: run with --auto", () => {
  const result = parseArgs(["run", "game.ir.json", "--auto", "--ui-jsonl"]);
  assertEquals(result.ok, true);
  if (result.ok && result.command === "run") {
    assertEquals(result.input, "game.ir.json");
    assertEquals(result.auto, true);
    assertEquals(result.uiJsonl, true);
  }
});

Deno.test("parseArgs: run with save/load", () => {
  const result = parseArgs([
    "run",
    "game.ir.json",
    "--load",
    "save.json",
    "--save",
    "save_out.json",
  ]);
  assertEquals(result.ok, true);
  if (result.ok && result.command === "run") {
    assertEquals(result.load, "save.json");
    assertEquals(result.save, "save_out.json");
    assertEquals(result.uiJsonl, false);
  }
});

Deno.test("parseArgs: run rejects --ui-jsonl without --auto", () => {
  const result = parseArgs(["run", "game.ir.json", "--ui-jsonl"]);
  assertEquals(result.ok, false);
});

Deno.test("parseArgs: run with plugin manifests", () => {
  const result = parseArgs(["run", "game.ir.json", "--plugin-manifests", "plugins.json"]);
  assertEquals(result.ok, true);
  if (result.ok && result.command === "run") {
    assertEquals(result.pluginManifests, "plugins.json");
  }
});

Deno.test("parseArgs: run with --gui-bridge", () => {
  const result = parseArgs(["run", "game.ir.json", "--gui-bridge"]);
  assertEquals(result.ok, true);
  if (result.ok && result.command === "run") {
    assertEquals(result.guiBridge, true);
    assertEquals(result.uiJsonl, false);
  }
});

Deno.test("parseArgs: --help", () => {
  const result = parseArgs(["--help"]);
  assertEquals(result, { ok: true, command: "help" });
});

Deno.test("parseArgs: --version", () => {
  const result = parseArgs(["--version"]);
  assertEquals(result, { ok: true, command: "version" });
});

Deno.test("parseArgs: trace --seq", () => {
  const result = parseArgs([
    "trace",
    "game.ir.json",
    "--seq",
    "--plugin-manifests",
    "plugins.json",
  ]);
  assertEquals(result.ok, true);
  if (result.ok && result.command === "trace") {
    assertEquals(result.input, "game.ir.json");
    assertEquals(result.seq, true);
    assertEquals(result.pluginManifests, "plugins.json");
  }
});

Deno.test("startup: main.ts does not use broad directory discovery", () => {
  const source = Deno.readTextFileSync(new URL("./main.ts", import.meta.url));
  assertEquals(source.includes("Deno.readDir("), false);
  assertEquals(source.includes("Deno.readDirSync("), false);
});

Deno.test("operations: progress notice default is 3000ms", () => {
  assertEquals(DEFAULT_PROGRESS_NOTICE_MS, 3000);
  assertEquals(resolveProgressNoticeMs(), 3000);
});

Deno.test("gui bridge request tracker: rejects choice.select without pending choice", () => {
  const tracker = createChoiceRequestTracker();
  const result = tracker.acceptRequestId("choice-1");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.message, "unexpected choice.select without pending choice");
  }
});

Deno.test("gui bridge request tracker: accepts only matching pending requestId", () => {
  const tracker = createChoiceRequestTracker();
  tracker.setExpectedRequestId("choice-1");
  const mismatch = tracker.acceptRequestId("choice-x");
  assertEquals(mismatch.ok, false);
  tracker.setExpectedRequestId("choice-1");
  const ok = tracker.acceptRequestId("choice-1");
  assertEquals(ok.ok, true);
  assertEquals(tracker.consumeLastAcceptedRequestId(), "choice-1");
  assertEquals(tracker.consumeLastAcceptedRequestId(), undefined);
});
