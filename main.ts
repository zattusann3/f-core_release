import { compileScenario } from "./compile/compile.ts";
import { DEFAULT_PLUGIN_TIMEOUT_MS, run } from "./vm/runner.ts";
import type { UIEvent } from "./vm/runner.ts";
import type { ChoiceOption, IR, Value } from "./ir/types.ts";
import { validateIR } from "./ir/validate.ts";
import type { ValidationError } from "./ir/validate.ts";
import { parseSave, serializeSave } from "./vm/save.ts";
import type { PluginManifest } from "./plugin/capability.ts";
import { createSafeRecord, isReservedKey } from "./util/safe_dict.ts";
import { createIsolatedPluginRuntime } from "./plugin/isolated_runtime.ts";
import { GUI_BRIDGE_MAX_MESSAGE_BYTES, parseUiCommandLine } from "./gui_bridge.ts";

const ENGINE_VERSION = "0.1.0";
export const DEFAULT_PROGRESS_NOTICE_MS = 3000;
const PROGRESS_NOTICE_ENV = "F_CORE_PROGRESS_NOTICE_MS";
const CORE_TAG_NAMES = new Set(["label", "choice", "end", "set", "if", "jump", "plugin"]);
type BridgeUIEvent = UIEvent & { requestId?: string };

export type ParsedArgs =
  | { ok: true; command: "validate"; input: string }
  | { ok: true; command: "compile"; input: string; output?: string }
  | {
    ok: true;
    command: "run";
    input: string;
    auto: boolean;
    uiJsonl: boolean;
    guiBridge: boolean;
    save?: string;
    load?: string;
    pluginManifests?: string;
  }
  | { ok: true; command: "trace"; input: string; seq: boolean; pluginManifests?: string }
  | { ok: true; command: "help" }
  | { ok: true; command: "version" }
  | { ok: false; message: string };

export function parseArgs(args: string[]): ParsedArgs {
  if (args.length === 0) return { ok: false, message: "missing command" };

  const command = args[0];
  if (command === "--help" || command === "-h" || command === "help") {
    return { ok: true, command: "help" };
  }
  if (command === "--version" || command === "-V" || command === "version") {
    return { ok: true, command: "version" };
  }
  switch (command) {
    case "validate": {
      const input = args[1];
      if (!input) return { ok: false, message: "validate requires input file" };
      return { ok: true, command: "validate", input };
    }
    case "compile": {
      const input = args[1];
      if (!input) return { ok: false, message: "compile requires input file" };
      let output: string | undefined;
      for (let i = 2; i < args.length; i++) {
        const a = args[i];
        if (a === "-o") {
          const next = args[i + 1];
          if (!next) return { ok: false, message: "-o requires output path" };
          output = next;
          i++;
        } else {
          return { ok: false, message: `unknown arg: ${a}` };
        }
      }
      return { ok: true, command: "compile", input, output };
    }
    case "run": {
      const input = args[1];
      if (!input) return { ok: false, message: "run requires IR file" };
      let auto = false;
      let uiJsonl = false;
      let guiBridge = false;
      let save: string | undefined;
      let load: string | undefined;
      let pluginManifests: string | undefined;
      for (let i = 2; i < args.length; i++) {
        const a = args[i];
        if (a === "--auto") {
          auto = true;
        } else if (a === "--ui-jsonl") {
          uiJsonl = true;
        } else if (a === "--gui-bridge") {
          guiBridge = true;
        } else if (a === "--save") {
          const next = args[i + 1];
          if (!next) return { ok: false, message: "--save requires path" };
          save = next;
          i++;
        } else if (a === "--load") {
          const next = args[i + 1];
          if (!next) return { ok: false, message: "--load requires path" };
          load = next;
          i++;
        } else if (a === "--plugin-manifests") {
          const next = args[i + 1];
          if (!next) return { ok: false, message: "--plugin-manifests requires path" };
          pluginManifests = next;
          i++;
        } else {
          return { ok: false, message: `unknown arg: ${a}` };
        }
      }
      if (uiJsonl && !auto && !guiBridge) {
        return { ok: false, message: "--ui-jsonl requires --auto" };
      }
      return {
        ok: true,
        command: "run",
        input,
        auto,
        uiJsonl,
        guiBridge,
        save,
        load,
        pluginManifests,
      };
    }
    case "trace": {
      const input = args[1];
      if (!input) return { ok: false, message: "trace requires IR file" };
      let seq = false;
      let pluginManifests: string | undefined;
      for (let i = 2; i < args.length; i++) {
        const a = args[i];
        if (a === "--seq") {
          seq = true;
        } else if (a === "--plugin-manifests") {
          const next = args[i + 1];
          if (!next) return { ok: false, message: "--plugin-manifests requires path" };
          pluginManifests = next;
          i++;
        } else {
          return { ok: false, message: `unknown arg: ${a}` };
        }
      }
      return { ok: true, command: "trace", input, seq, pluginManifests };
    }
    default:
      return { ok: false, message: `unknown command: ${command}` };
  }
}

if (import.meta.main) {
  const parsed = parseArgs(Deno.args);
  if (!parsed.ok) {
    printUsage(parsed.message);
    Deno.exit(1);
  }

  switch (parsed.command) {
    case "help":
      printUsage();
      break;
    case "version":
      console.log(ENGINE_VERSION);
      break;
    case "validate":
      await handleValidate(parsed.input);
      break;
    case "compile":
      await handleCompile(parsed.input, parsed.output);
      break;
    case "run":
      await handleRun(
        parsed.input,
        parsed.auto,
        parsed.uiJsonl,
        parsed.guiBridge,
        parsed.save,
        parsed.load,
        parsed.pluginManifests,
      );
      break;
    case "trace":
      await handleTrace(parsed.input, parsed.seq, parsed.pluginManifests);
      break;
  }
}

function printUsage(message?: string): void {
  if (message) console.error(`ERROR ${message}`);
  console.log(
    [
      "Usage:",
      "  f-core --help",
      "  f-core --version",
      "  f-core validate <scenario.md>",
      "  f-core compile <scenario.md> [-o game.ir.json]",
      "  f-core run <game.ir.json> [--auto] [--ui-jsonl] [--gui-bridge] [--load save.json] [--save save.json] [--plugin-manifests plugins.json]",
      "  f-core trace <game.ir.json> [--seq] [--plugin-manifests plugins.json]",
    ].join("\n"),
  );
}

async function handleValidate(inputPath: string): Promise<void> {
  const source = await Deno.readTextFile(inputPath);
  const result = compileScenario(source, { engineVersion: ENGINE_VERSION });
  if (!result.ok) {
    printCompileErrors(result.errors, inputPath);
    Deno.exit(1);
  }
  printWarnings(result.warnings, inputPath);
  if (result.warnings.length > 0) {
    console.log(`OK (warnings: ${result.warnings.length})`);
  } else {
    console.log("OK");
  }
}

async function handleCompile(inputPath: string, outputPath?: string): Promise<void> {
  const source = await Deno.readTextFile(inputPath);
  const result = compileScenario(source, { engineVersion: ENGINE_VERSION });
  if (!result.ok) {
    printCompileErrors(result.errors, inputPath);
    Deno.exit(1);
  }

  if (outputPath) {
    await Deno.writeTextFile(outputPath, result.json);
  } else {
    console.log(result.json.trimEnd());
  }

  printWarnings(result.warnings, inputPath);
}

async function handleRun(
  inputPath: string,
  auto: boolean,
  uiJsonl: boolean,
  guiBridge: boolean,
  savePath?: string,
  loadPath?: string,
  pluginManifestPath?: string,
): Promise<void> {
  const ir = await readIR(inputPath);
  if (!ir.ok) {
    printIrErrors(ir.errors, inputPath);
    for (const err of ir.errors) {
      printRunnerErrorJsonl(
        { code: err.code, message: err.message },
        inputPath,
        undefined,
        undefined,
        "run",
      );
    }
    Deno.exit(1);
  }

  let loadedVars: { ok: true; vars: Record<string, Value> } | undefined;
  if (loadPath) {
    const loaded = await loadVars(loadPath);
    if (!loaded.ok) {
      console.error(`ERROR E0601 ${loadPath} ${loaded.message}`);
      printRunnerErrorJsonl(
        { code: "E0601", message: loaded.message },
        inputPath,
        undefined,
        undefined,
        "run",
      );
      Deno.exit(1);
    }
    loadedVars = loaded;
  }

  const manifests = await loadPluginManifests(pluginManifestPath);
  if (!manifests.ok) {
    console.error(`ERROR E0702 ${manifests.message}`);
    printRunnerErrorJsonl(
      { code: "E0702", message: manifests.message },
      inputPath,
      undefined,
      undefined,
      "run",
    );
    Deno.exit(1);
  }

  const useJsonlUi = uiJsonl || guiBridge;
  const bridgeReader = guiBridge ? createGuiChoiceReader() : undefined;
  const ui = createRunUiSink(useJsonlUi, guiBridge, bridgeReader);
  const cancellation = createCancellationState();
  const progressNotice = createProgressNotice(inputPath, resolveProgressNoticeMs());

  try {
    let result: Awaited<ReturnType<typeof run>>;
    try {
      result = await run(ir.value, {
        choose: parsedChoose(auto, guiBridge, bridgeReader),
        ui,
        onPresentationDegraded: (event) => printPresentationDegradedNotice(inputPath, "run", event),
        vars: loadedVars ? loadedVars.vars : undefined,
        pluginManifests: manifests.value,
        pluginRuntime: createIsolatedPluginRuntime(getPluginRenderSink(useJsonlUi)),
        pluginTimeoutMs: DEFAULT_PLUGIN_TIMEOUT_MS,
        isCancelled: cancellation.isCancelled,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalized = { code: "E0704", message };
      if (guiBridge) {
        printUiErrorJsonl(inputPath, "run", "E0704", message, getErrorRequestId(error));
      }
      printRunnerError(normalized, inputPath);
      printRunnerErrorJsonl(normalized, inputPath, undefined, undefined, "run");
      Deno.exit(1);
    }
    progressNotice.done();

    if (!result.ok) {
      if (guiBridge && result.error.uiBridge) {
        printUiErrorJsonl(
          inputPath,
          "run",
          result.error.code,
          result.error.message,
          result.error.requestId,
        );
      }
      printRunnerError(result.error, inputPath, result.label, result.ip);
      printRunnerErrorJsonl(result.error, inputPath, result.label, result.ip, "run");
      Deno.exit(1);
    }

    if (savePath) {
      const json = serializeVars(result.vars, ir.value.engineVersion);
      await Deno.writeTextFile(savePath, json);
    }
  } finally {
    bridgeReader?.dispose();
    progressNotice.done();
    cancellation.dispose();
  }
}

function parsedChoose(
  auto: boolean,
  guiBridge: boolean,
  bridgeReader?: { nextChoice: (optionsLength: number) => Promise<number> },
): (options: ReadonlyArray<ChoiceOption>) => number | Promise<number> {
  if (guiBridge) {
    if (!bridgeReader) {
      return () => {
        throw new Error("gui bridge reader missing");
      };
    }
    return async (options: ReadonlyArray<ChoiceOption>) => {
      try {
        return await bridgeReader.nextChoice(options.length);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw createUiBridgeError(message, getErrorRequestId(error));
      }
    };
  }
  if (auto) return () => 0;
  return (options) => chooseInteractive(options.length);
}

async function handleTrace(
  inputPath: string,
  withSeq: boolean,
  pluginManifestPath?: string,
): Promise<void> {
  const ir = await readIR(inputPath);
  if (!ir.ok) {
    printIrErrors(ir.errors, inputPath);
    for (const err of ir.errors) {
      printRunnerErrorJsonl(
        { code: err.code, message: err.message },
        inputPath,
        undefined,
        undefined,
        "trace",
      );
    }
    Deno.exit(1);
  }

  const manifests = await loadPluginManifests(pluginManifestPath);
  if (!manifests.ok) {
    console.error(`ERROR E0702 ${manifests.message}`);
    printRunnerErrorJsonl(
      { code: "E0702", message: manifests.message },
      inputPath,
      undefined,
      undefined,
      "trace",
    );
    Deno.exit(1);
  }

  const encoder = new TextEncoder();
  let seq = 0;
  const cancellation = createCancellationState();
  const progressNotice = createProgressNotice(inputPath, resolveProgressNoticeMs());
  try {
    let result: Awaited<ReturnType<typeof run>>;
    try {
      result = await run(ir.value, {
        choose: () => 0,
        onPresentationDegraded: (event) => printPresentationDegradedNotice(inputPath, "trace", event),
        pluginManifests: manifests.value,
        pluginRuntime: createIsolatedPluginRuntime(),
        pluginTimeoutMs: DEFAULT_PLUGIN_TIMEOUT_MS,
        isCancelled: cancellation.isCancelled,
        trace: (event) => {
          const out = withSeq ? { seq: seq++, ...event } : event;
          Deno.stdout.writeSync(encoder.encode(JSON.stringify(out) + "\n"));
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalized = { code: "E0704", message };
      printRunnerError(normalized, inputPath);
      printRunnerErrorJsonl(normalized, inputPath, undefined, undefined, "trace");
      Deno.exit(1);
    }
    progressNotice.done();

    if (!result.ok) {
      printRunnerError(result.error, inputPath, result.label, result.ip);
      printRunnerErrorJsonl(result.error, inputPath, result.label, result.ip, "trace");
      Deno.exit(1);
    }
  } finally {
    progressNotice.done();
    cancellation.dispose();
  }
}

function chooseInteractive(optionsLength: number): number {
  if (optionsLength === 0) return -1;
  while (true) {
    const raw = prompt(`Choose 1-${optionsLength}`);
    if (raw === null) return -1;
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 1 && n <= optionsLength) return n - 1;
  }
}

type ReadIrResult =
  | { ok: true; value: IR }
  | { ok: false; errors: ValidationError[] };

async function readIR(inputPath: string): Promise<ReadIrResult> {
  let text: string;
  try {
    text = await Deno.readTextFile(inputPath);
  } catch {
    return {
      ok: false,
      errors: [{ code: "E0602", message: "failed to read IR file", path: "$" }],
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [{ code: "E0506", message: "invalid IR JSON", path: "$" }],
    };
  }

  const validated = validateIR(json);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  return { ok: true, value: validated.value };
}

function printCompileErrors(
  errors: Array<{
    code?: string;
    message: string;
    span?: { start: { line: number; col: number } };
    path?: string;
    suggestions?: string[];
  }>,
  file: string,
): void {
  for (const err of errors) {
    const code = err.code ?? "E0000";
    const loc = err.span
      ? `${file}:${err.span.start.line}:${err.span.start.col}`
      : ("path" in err && typeof err.path === "string")
      ? `${file} ${err.path}`
      : file;
    console.error(`ERROR ${code} ${loc} ${err.message}`);
    if (err.suggestions && err.suggestions.length > 0) {
      console.error(`SUGGEST ${err.suggestions.join(", ")}`);
    }
  }
}

function printWarnings(
  errors: Array<{
    code?: string;
    message: string;
    span?: { start: { line: number; col: number } };
    path?: string;
    suggestions?: string[];
  }>,
  file: string,
): void {
  for (const err of errors) {
    const code = err.code ?? "W0000";
    const loc = err.span
      ? `${file}:${err.span.start.line}:${err.span.start.col}`
      : ("path" in err && typeof err.path === "string")
      ? `${file} ${err.path}`
      : file;
    console.error(`WARN ${code} ${loc} ${err.message}`);
    if (err.suggestions && err.suggestions.length > 0) {
      console.error(`SUGGEST ${err.suggestions.join(", ")}`);
    }
  }
}

function printIrErrors(
  errors: Array<{ code: string; message: string; path?: string; suggestions?: string[] }>,
  file: string,
): void {
  for (const err of errors) {
    const loc = err.path ? `${file} ${err.path}` : file;
    console.error(`ERROR ${err.code} ${loc} ${err.message}`);
    if (err.suggestions && err.suggestions.length > 0) {
      console.error(`SUGGEST ${err.suggestions.join(", ")}`);
    }
  }
}

function printRunnerError(
  err: { code: string; message: string },
  file: string,
  label?: string,
  ip?: number,
): void {
  const loc = label !== undefined && ip !== undefined ? `${file} ${label}:${ip}` : file;
  const safeLoc = sanitizeSingleLineLogValue(loc);
  const safeMessage = sanitizeSingleLineLogValue(err.message);
  console.error(`ERROR ${err.code} ${safeLoc} ${safeMessage}`);
}

function printRunnerErrorJsonl(
  err: { code: string; message: string },
  file: string,
  label: string | undefined,
  ip: number | undefined,
  command: "run" | "trace",
): void {
  const payload = {
    traceVersion: 1,
    event: "vm.error",
    command,
    code: err.code,
    message: err.message,
    file,
    label,
    ip,
  };
  console.error(JSON.stringify(payload));
}

function printUiErrorJsonl(
  file: string,
  command: "run" | "trace",
  code: string,
  message: string,
  requestId?: string,
): void {
  const payload = {
    schemaVersion: 1,
    event: "ui.error",
    command,
    requestId,
    code,
    message,
    file,
  };
  console.error(JSON.stringify(payload));
}

function printPresentationDegradedNotice(
  file: string,
  command: "run" | "trace",
  event: { plugin: string; code: string; message: string; label: string; ip: number },
): void {
  const safeFile = sanitizeSingleLineLogValue(file);
  const safePlugin = sanitizeSingleLineLogValue(event.plugin);
  const safeCode = sanitizeSingleLineLogValue(event.code);
  const safeLabel = sanitizeSingleLineLogValue(event.label);
  const safeMessage = sanitizeSingleLineLogValue(event.message);
  console.error(
    `INFO I0002 ${safeFile} presentation degraded; command=${command} plugin=${safePlugin} code=${safeCode} label=${safeLabel} ip=${event.ip} message=${safeMessage}`,
  );
}

function sanitizeSingleLineLogValue(value: string): string {
  return value
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "?");
}

function createProgressNotice(file: string, delayMs: number): { done: () => void } {
  const safeFile = sanitizeSingleLineLogValue(file);
  let emitted = false;
  let closed = false;
  const timer = setTimeout(() => {
    emitted = true;
    console.error(`INFO I0001 ${safeFile} operation is still running...`);
  }, delayMs);
  return {
    done: () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (emitted) {
        console.error(`INFO I0002 ${safeFile} operation finished.`);
      }
    },
  };
}

export function resolveProgressNoticeMs(): number {
  let raw: string | undefined;
  try {
    raw = Deno.env.get(PROGRESS_NOTICE_ENV);
  } catch {
    return DEFAULT_PROGRESS_NOTICE_MS;
  }
  if (raw === undefined) return DEFAULT_PROGRESS_NOTICE_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_PROGRESS_NOTICE_MS;
  return parsed;
}

function createGuiChoiceReader(): {
  nextChoice: (optionsLength: number) => Promise<number>;
  setExpectedRequestId: (requestId: string) => void;
  consumeLastAcceptedRequestId: () => string | undefined;
  dispose: () => void;
} {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = Deno.stdin.readable.getReader();
  let buffered = "";
  const requestTracker = createChoiceRequestTracker();

  async function readLine(): Promise<string> {
    while (true) {
      const newlineIndex = buffered.indexOf("\n");
      if (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex);
        buffered = buffered.slice(newlineIndex + 1);
        if (encoder.encode(line).byteLength > GUI_BRIDGE_MAX_MESSAGE_BYTES) {
          throw new Error("ui command exceeds max bytes");
        }
        return line;
      }

      const { value, done } = await reader.read();
      if (done) {
        throw new Error("ui bridge stdin closed");
      }
      buffered += decoder.decode(value, { stream: true });
      if (encoder.encode(buffered).byteLength > GUI_BRIDGE_MAX_MESSAGE_BYTES) {
        throw new Error("ui command exceeds max bytes");
      }
    }
  }

  return {
    nextChoice: async (optionsLength: number) => {
      const line = await readLine();
      const parsed = parseUiCommandLine(line);
      if (!parsed.ok) {
        throw createUiBridgeError(parsed.message, parsed.requestId);
      }
      if (parsed.value.command !== "choice.select") {
        throw createUiBridgeError("unsupported ui command", parsed.value.requestId);
      }
      const accepted = requestTracker.acceptRequestId(parsed.value.requestId);
      if (!accepted.ok) {
        throw createUiBridgeError(accepted.message, parsed.value.requestId);
      }
      if (parsed.value.index < 0 || parsed.value.index >= optionsLength) {
        throw createUiBridgeError("choice index out of range", parsed.value.requestId);
      }
      return parsed.value.index;
    },
    setExpectedRequestId: requestTracker.setExpectedRequestId,
    consumeLastAcceptedRequestId: requestTracker.consumeLastAcceptedRequestId,
    dispose: () => reader.releaseLock(),
  };
}

export function createChoiceRequestTracker(): {
  setExpectedRequestId: (requestId: string) => void;
  acceptRequestId: (requestId: string) => { ok: true } | { ok: false; message: string };
  consumeLastAcceptedRequestId: () => string | undefined;
} {
  let expectedRequestId: string | undefined;
  let lastAcceptedRequestId: string | undefined;
  return {
    setExpectedRequestId: (requestId: string) => {
      expectedRequestId = requestId;
    },
    acceptRequestId: (requestId: string) => {
      if (!expectedRequestId) {
        return { ok: false, message: "unexpected choice.select without pending choice" };
      }
      if (requestId !== expectedRequestId) {
        return { ok: false, message: "requestId mismatch for pending choice" };
      }
      lastAcceptedRequestId = requestId;
      expectedRequestId = undefined;
      return { ok: true };
    },
    consumeLastAcceptedRequestId: () => {
      const value = lastAcceptedRequestId;
      lastAcceptedRequestId = undefined;
      return value;
    },
  };
}

async function loadVars(
  path: string,
): Promise<{ ok: true; vars: Record<string, Value> } | { ok: false; message: string }> {
  try {
    const text = await Deno.readTextFile(path);
    const parsed = parseSave(text);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    return { ok: true, vars: parsed.value.vars };
  } catch {
    return { ok: false, message: "failed to read save file" };
  }
}

function serializeVars(vars: Record<string, Value>, engineVersion: string): string {
  return serializeSave({ schemaVersion: 1, engineVersion, vars });
}

function createCancellationState(): { isCancelled: () => boolean; dispose: () => void } {
  let cancelled = false;
  const onSigInt = () => {
    cancelled = true;
  };
  Deno.addSignalListener("SIGINT", onSigInt);
  return {
    isCancelled: () => cancelled,
    dispose: () => Deno.removeSignalListener("SIGINT", onSigInt),
  };
}

async function loadPluginManifests(
  path?: string,
): Promise<{ ok: true; value: Record<string, PluginManifest> } | { ok: false; message: string }> {
  if (!path) return { ok: true, value: createSafeRecord<PluginManifest>() };

  let raw: unknown;
  try {
    raw = JSON.parse(await Deno.readTextFile(path));
  } catch {
    return { ok: false, message: `failed to read plugin manifests: ${path}` };
  }

  if (!isRecord(raw)) return { ok: false, message: "plugin manifests must be a JSON object" };
  const out = createSafeRecord<PluginManifest>();
  for (const [name, manifestRaw] of Object.entries(raw)) {
    if (isReservedKey(name)) {
      return { ok: false, message: `reserved plugin name not allowed: ${name}` };
    }
    if (!isValidPluginName(name)) return { ok: false, message: `invalid plugin name: ${name}` };
    if (!isRecord(manifestRaw)) return { ok: false, message: `manifest must be object: ${name}` };
    if (
      !Array.isArray(manifestRaw.capabilities) ||
      !manifestRaw.capabilities.every((v) => typeof v === "string")
    ) {
      return { ok: false, message: `manifest.capabilities must be string[]: ${name}` };
    }
    if (
      !Array.isArray(manifestRaw.primitives) ||
      !manifestRaw.primitives.every((v) => typeof v === "string")
    ) {
      return { ok: false, message: `manifest.primitives must be string[]: ${name}` };
    }
    out[name] = {
      capabilities: manifestRaw.capabilities,
      primitives: manifestRaw.primitives,
    };
  }
  return { ok: true, value: out };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPluginName(name: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(name)) return false;
  return !CORE_TAG_NAMES.has(name);
}

function makeUiAdapter(asJsonl: boolean): (event: BridgeUIEvent) => void {
  if (asJsonl) return (event: UIEvent) => writeUiJsonlLine(event);

  return (event: UIEvent) => {
    switch (event.event) {
      case "ui.say":
        console.log(event.text);
        break;
      case "ui.choice.present":
        for (let i = 0; i < event.choices.length; i++) {
          console.log(`[${i + 1}] ${event.choices[i].text}`);
        }
        break;
      case "ui.choice.select":
        break;
      case "ui.presentation.degraded":
        break;
    }
  };
}

function writeUiJsonlLine(payload: unknown): void {
  const encoder = new TextEncoder();
  const line = JSON.stringify(payload);
  const bytes = encoder.encode(`${line}\n`);
  if (bytes.byteLength > GUI_BRIDGE_MAX_MESSAGE_BYTES) {
    throw new Error("ui event exceeds max bytes");
  }
  Deno.stdout.writeSync(bytes);
}

function getPluginRenderSink(useJsonlUi: boolean): ((text: string) => void) | undefined {
  if (useJsonlUi) {
    return (text: string) => {
      writeUiJsonlLine({
        schemaVersion: 1,
        event: "ui.render",
        text,
      });
    };
  }
  return (text: string) => console.log(text);
}

function createRunUiSink(
  asJsonl: boolean,
  guiBridge: boolean,
  bridgeReader?: {
    setExpectedRequestId: (requestId: string) => void;
    consumeLastAcceptedRequestId: () => string | undefined;
  },
): (event: UIEvent) => void {
  const sink = makeUiAdapter(asJsonl);
  if (!guiBridge || !bridgeReader) return sink;

  let nextRequestId = 1;
  return (event: UIEvent) => {
    if (event.event === "ui.choice.present") {
      const requestId = `choice-${nextRequestId++}`;
      bridgeReader.setExpectedRequestId(requestId);
      sink({ ...event, requestId });
      return;
    }
    if (event.event === "ui.choice.select") {
      const requestId = bridgeReader.consumeLastAcceptedRequestId();
      sink(requestId ? { ...event, requestId } : event);
      return;
    }
    sink(event);
  };
}

function createUiBridgeError(message: string, requestId?: string): Error {
  const error = new Error(message) as Error & { requestId?: string; uiBridge?: boolean };
  error.requestId = requestId;
  error.uiBridge = true;
  return error;
}

function getErrorRequestId(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const requestId = (error as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
}
