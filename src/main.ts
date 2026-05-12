import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { StandardAudioAdapter } from "./audio/standardAdapter.ts";
import FCoreWorker from "./worker_runner.ts?worker";
import {
  AssetManager,
  type AssetKind,
} from "./assets/asset_manager.ts";
import { loadBundledPluginSource } from "./browser_plugin_sources.ts";
import { parseScenario } from "./parser.ts";
import type { CommandIR } from "./runtime.ts";
import { ScenarioSession } from "./session.ts";
import { getStorage } from "./storage/index.ts";
import { isStorageError } from "./storage/errors.ts";
import { WorkerHost } from "./worker_host.ts";
import type { RenderCommand, VarValue } from "./types.ts";

interface ScenarioChangedPayload {
  path?: unknown;
}

interface RendererReadyLatch {
  readonly promise: Promise<void>;
  isReady(): boolean;
}

const workerHost = new WorkerHost({
  workerFactory: () => new FCoreWorker(),
});
const audioAdapter = new StandardAudioAdapter();
const assetManager = new AssetManager();
const session = new ScenarioSession(workerHost, {
  loadPluginSource: loadBundledPluginSource,
}, {
  onReleaseAssets: (ids) => {
    handleReleaseAssets(ids);
  },
});
const assetOwners = new Map<string, Set<string>>();
const activeAudioByChannel = new Map<string, string>();
let cachedMarkdown: string | null = null;
let scenarioChangeUnlisten: (() => void) | null = null;
let sessionStarted = false;
let advancing = false;
const MAX_AUTO_FORWARD_STEPS = 4096;
const ACTIVE_SCENARIO_FILE_NAME = "demo_scenario.md";
const DEFAULT_SAVE_SLOT = 1;
const IS_PROD_BUILD = import.meta.env.PROD;
// Development can show stack traces by default; production can keep concise output.
const SHOW_VERBOSE_ERRORS = import.meta.env.DEV;
const startupDiagnostics: string[] = [];

const jsonViewer = document.getElementById("json-viewer");
const saveDataInput = document.getElementById("save-data");
const rendererFrame = document.getElementById("renderer-frame");
const exportPptxButton = document.getElementById("export-pptx");

if (
  !(jsonViewer instanceof HTMLPreElement) ||
  !(saveDataInput instanceof HTMLTextAreaElement) ||
  !(rendererFrame instanceof HTMLIFrameElement)
) {
  throw new Error("operation rejected");
}
const rendererReady = createRendererReadyLatch(rendererFrame);

if (IS_PROD_BUILD) {
  document.body.classList.add("prod-mode");
}

if (exportPptxButton instanceof HTMLElement && !isTauriRuntime()) {
  exportPptxButton.style.display = "none";
}

setupGlobalErrorBoundary();
void setupScenarioChangeListener();
setupContextMenuSignal();
setupStartOverlay();

(window as any).testAudio = {
  playBgm: () => playAudioByAsset("play_bgm", "/assets/bgm/test.ogg", "bgm"),
  playSe: () => playAudioByAsset("play_se", "/assets/se/test.ogg", "se"),
  playVoice: () => playAudioByAsset("play_voice", "/assets/voice/test.wav", "voice"),
};

window.addEventListener("message", async (event) => {
  const messageType = readMessageType(event.data);
  console.debug("[main] received message:", event.data, "origin:", event.origin, "type:", messageType);
  if (!isTrustedRendererEvent(event, rendererFrame, messageType)) return;
  if (isToggleSystemMenuSignal(event.data)) {
    window.dispatchEvent(new CustomEvent("fcore:toggle-system-menu"));
    return;
  }
  if (isStepSignal(event.data)) {
    await requestStepAdvance();
    return;
  }

  const inputValue = parseInputValue(event.data);
  if (inputValue === undefined) return;
  if (advancing) return;
  advancing = true;

  try {
    resumeSession(inputValue);
    const renderCommands = await stepUntilRenderable();
    const output = {
      input: inputValue,
      done: renderCommands === null,
      renderCommands: renderCommands ?? [],
      currentLabel: session.currentLabel,
      currentIndex: session.currentIndex,
    };
    renderJson(jsonViewer, output);
    await sendRenderCommands(rendererFrame, output.renderCommands);
  } catch {
    renderJson(jsonViewer, { error: "operation rejected" });
  } finally {
    advancing = false;
  }
});

document.getElementById("session-start")?.addEventListener("click", () => {
  void (async () => {
    try {
      clearStartupDiagnostics();
      await audioAdapter.unlock();
      await startSessionFromStart();
    } catch (error) {
      renderOperationRejected("session-start", error);
    }
  })();
});

document.getElementById("session-step")?.addEventListener("click", async () => {
  await requestStepAdvance();
});

document.getElementById("session-save")?.addEventListener("click", () => {
  void (async () => {
    try {
      const saveData = session.exportSaveData();
      await getStorage().save(DEFAULT_SAVE_SLOT, saveData);
      saveDataInput.value = saveData;
      renderJson(jsonViewer, {
        saved: true,
        slotId: DEFAULT_SAVE_SLOT,
      });
    } catch (error) {
      if (isStorageError(error)) {
        console.error("[Storage] save failed:", { code: error.code, error });
        renderJson(jsonViewer, {
          error: "保存に失敗しました",
          code: error.code,
        });
        return;
      }
      console.error("[Storage] save failed:", error);
      renderJson(jsonViewer, { error: "保存に失敗しました" });
    }
  })();
});

document.getElementById("session-load")?.addEventListener("click", () => {
  void (async () => {
    try {
      await audioAdapter.unlock();
      const saveData = await getStorage().load(DEFAULT_SAVE_SLOT);
      saveDataInput.value = saveData;
      await ensureSessionInitializedForLoad();
      session.importSaveData(saveData);
      sessionStarted = true;
      const syncCommands = buildRenderSyncCommands(session.runtimeState.vars);
      const suspendedCommands = session.getSuspendedRenderCommands();
      const restoreCommands = suspendedCommands === null
        ? syncCommands
        : [...syncCommands, ...suspendedCommands];
      resetActiveAssetsProtection();
      await sendRenderCommands(rendererFrame, restoreCommands);
      renderJson(jsonViewer, {
        loaded: true,
        slotId: DEFAULT_SAVE_SLOT,
        currentLabel: session.currentLabel,
        currentIndex: session.currentIndex,
        suspendedRestored: suspendedCommands !== null,
        renderCommands: restoreCommands,
      });
    } catch (error) {
      if (isStorageError(error)) {
        console.error("[Storage] load failed:", { code: error.code, error });
        renderJson(jsonViewer, {
          error: error.code === "ERR_STORAGE_NOT_FOUND"
            ? "セーブデータが見つかりません"
            : "読み込みに失敗しました",
          code: error.code,
        });
        return;
      }
      console.error("[Storage] load failed:", error);
      renderJson(jsonViewer, { error: "読み込みに失敗しました" });
    }
  })();
});

document.getElementById("export-pptx")?.addEventListener("click", () => {
  void (async () => {
    try {
      if (!isTauriRuntime()) {
        renderJson(jsonViewer, { error: "operation rejected" });
        return;
      }
      const markdown = await ensureScenarioMarkdown();
      const ast = parseScenario(markdown) as Record<string, CommandIR[]>;
      const flatCommands = Object.values(ast).flat();

      const exportedTo = await invoke<string>("export_pptx", {
        ast: flatCommands,
      });
      renderJson(jsonViewer, { exported: true, outputPath: exportedTo });
    } catch {
      renderJson(jsonViewer, { error: "operation rejected" });
    }
  })();
});

window.addEventListener("beforeunload", () => {
  scenarioChangeUnlisten?.();
  session.close();
});

async function setupScenarioChangeListener(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  try {
    scenarioChangeUnlisten = await listen<ScenarioChangedPayload>(
      "scenario-changed",
      (event) => {
        console.log("[HMR] Event received:", event.payload);
        void reloadScenarioAfterChange(event.payload);
      },
    );
  } catch {
    renderJson(jsonViewer, { error: "operation rejected" });
  }
}

async function reloadScenarioAfterChange(
  payload: ScenarioChangedPayload,
): Promise<void> {
  const changedFileName = normalizeChangedPath(payload.path);
  console.log("[HMR] Normalized file name:", changedFileName);
  if (changedFileName !== ACTIVE_SCENARIO_FILE_NAME) {
    console.warn("[HMR] Ignored unrelated file change.");
    return;
  }

  cachedMarkdown = null;
  try {
    clearStartupDiagnostics();
    const markdown = await ensureScenarioMarkdown();
    const scenario = parseScenario(markdown);
    const nextStartLabel = chooseReloadStartLabel(scenario);
    console.log("[HMR] Reloading scenario and updating renderer...");
    const renderCommands = await restartScenario(scenario, nextStartLabel);
    const output = {
      scenarioChanged: true,
      path: normalizeChangedPath(payload.path),
      reloaded: true,
      done: renderCommands === null,
      renderCommands: renderCommands ?? [],
      currentLabel: session.currentLabel,
      currentIndex: session.currentIndex,
      labels: Object.keys(scenario),
    };
    console.log("[HMR] Sending render commands after reload...");
    renderJson(jsonViewer, output);
    await sendRenderCommands(rendererFrame, output.renderCommands);
  } catch (error) {
    renderOperationRejected("scenario-reload", error, { scenarioChanged: true });
  }
}

async function loadScenarioMarkdown(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await invoke<string>("load_scenario", { path: "demo" });
    } catch (error) {
      pushStartupDiagnostic("invoke(load_scenario) failed", error);
      pushStartupDiagnostic(
        "scenario path candidates",
        scenarioPathCandidatesForDiagnostics(),
      );
      const response = await window.fetch("/assets/demo_scenario.md");
      if (!response.ok) {
        pushStartupDiagnostic(
          "fetch(/assets/demo_scenario.md) failed",
          `HTTP ${response.status} ${response.statusText}`,
        );
        throw new Error("operation rejected");
      }
      pushStartupDiagnostic("fallback fetch succeeded", "/assets/demo_scenario.md");
      return await response.text();
    }
  }

  const response = await window.fetch("/assets/demo_scenario.md");
  if (!response.ok) {
    pushStartupDiagnostic(
      "web fetch(/assets/demo_scenario.md) failed",
      `HTTP ${response.status} ${response.statusText}`,
    );
    throw new Error("operation rejected");
  }
  pushStartupDiagnostic("web fetch succeeded", "/assets/demo_scenario.md");
  return await response.text();
}

async function ensureScenarioMarkdown(): Promise<string> {
  if (cachedMarkdown !== null) {
    return cachedMarkdown;
  }
  cachedMarkdown = await loadScenarioMarkdown();
  return cachedMarkdown;
}

async function ensureSessionInitializedForLoad(): Promise<void> {
  if (Object.keys(session.scenario).length > 0) {
    return;
  }
  const markdown = await ensureScenarioMarkdown();
  const scenario = parseScenario(markdown);
  await session.loadScenario(scenario, "start");
}

async function restartScenario(
  scenario: Record<string, CommandIR[]>,
  startLabel: string,
): Promise<RenderCommand[] | null> {
  await session.loadScenario(scenario, startLabel);
  sessionStarted = true;
  await sendRenderCommands(rendererFrame, clearRendererCommands());
  return await stepUntilRenderable();
}

async function startSessionFromStart(): Promise<void> {
  const markdown = await ensureScenarioMarkdown();
  const scenario = parseScenario(markdown);
  const firstStepCommands = await restartScenario(scenario, "start");

  const payload = {
    started: true,
    done: firstStepCommands === null,
    renderCommands: firstStepCommands ?? [],
    currentLabel: session.currentLabel,
    currentIndex: session.currentIndex,
    labels: Object.keys(scenario),
  };
  renderJson(jsonViewer, payload);
  await sendRenderCommands(rendererFrame, payload.renderCommands);
}

function pushStartupDiagnostic(label: string, detail: unknown): void {
  const rendered = typeof detail === "string"
    ? detail
    : safeSerialize(detail);
  startupDiagnostics.push(`${label}: ${rendered}`);
}

function clearStartupDiagnostics(): void {
  startupDiagnostics.length = 0;
}

function scenarioPathCandidatesForDiagnostics(): string[] {
  return [
    "public/assets/demo_scenario.md",
    "assets/demo_scenario.md",
    "demo_scenario.md",
    "_up_/public/assets/demo_scenario.md",
    "_up_/assets/demo_scenario.md",
    "/assets/demo_scenario.md (fetch fallback)",
  ];
}

function renderOperationRejected(
  context: string,
  error: unknown,
  extra: Record<string, unknown> = {},
): void {
  console.error("[f-core] operation rejected", {
    context,
    error,
    extra,
    diagnostics: startupDiagnostics,
  });
  const payload: Record<string, unknown> = {
    ...extra,
    error: "operation rejected",
    context,
    diagnostics: [...startupDiagnostics],
  };
  if (SHOW_VERBOSE_ERRORS) {
    payload["detail"] = safeSerialize(error);
  }
  renderJson(jsonViewer, payload);
}

function clearRendererCommands(): RenderCommand[] {
  resetActiveAssetsProtection();
  return [
    { type: "ClearSubtree", targetId: "fc-bg-layer" },
    { type: "ClearSubtree", targetId: "fc-fg-layer" },
    { type: "ClearSubtree", targetId: "fc-text-layer" },
  ];
}

function chooseReloadStartLabel(scenario: Record<string, CommandIR[]>): string {
  if (session.currentLabel !== null && session.currentLabel in scenario) {
    return session.currentLabel;
  }
  return "start";
}

async function stepUntilRenderable(): Promise<RenderCommand[] | null> {
  let attempts = 0;
  const accumulatedCommands: RenderCommand[] = [];

  while (true) {
    const stepCommands = await session.step();
    if (stepCommands === null) {
      return accumulatedCommands.length > 0 ? accumulatedCommands : null;
    }

    if (stepCommands.length > 0) {
      accumulatedCommands.push(...stepCommands);
    }

    if (hasBlockingRenderCommands(stepCommands)) {
      return accumulatedCommands;
    }

    attempts += 1;
    if (attempts > MAX_AUTO_FORWARD_STEPS) {
      throw new Error("operation rejected");
    }
  }
}

function hasBlockingRenderCommands(commands: ReadonlyArray<RenderCommand>): boolean {
  return commands.some((command) => {
    if (command.type !== "AppendNode") {
      return false;
    }
    if (command.parentId !== "fc-text-layer" && command.parentId !== "fc-menu-layer") {
      return false;
    }
    return command.tag === "span" || command.tag === "button" || command.tag === "p";
  });
}

async function sendRenderCommands(
  frame: HTMLIFrameElement,
  renderCommands: ReadonlyArray<RenderCommand>,
): Promise<void> {
  await rendererReady.promise;
  const prepared = await prepareRenderCommands(renderCommands);
  frame.contentWindow?.postMessage(
    { type: "fcore.renderCommands", renderCommands: prepared },
    "*",
  );
  syncProtectedAssets();
}

function renderJson(target: HTMLPreElement, data: unknown): void {
  target.textContent = JSON.stringify(data, null, 2);
}

function setupStartOverlay(): void {
  const overlay = document.createElement("div");
  overlay.id = "fc-start-overlay";
  overlay.textContent = "Please click to start";
  overlay.setAttribute("role", "button");
  overlay.tabIndex = 0;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.94)",
    color: "#ffffff",
    fontSize: "24px",
    letterSpacing: "0.06em",
    cursor: "pointer",
    zIndex: "2147483647",
    userSelect: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  const startFromOverlay = async () => {
    if (advancing || sessionStarted) return;
    advancing = true;
    try {
      clearStartupDiagnostics();
      await audioAdapter.unlock();
      await startSessionFromStart();
      overlay.remove();
    } catch (error) {
      renderOperationRejected("start-overlay", error);
      overlay.textContent = "Failed to start. Click to retry.";
    } finally {
      advancing = false;
    }
  };

  overlay.addEventListener("click", () => {
    void startFromOverlay();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void startFromOverlay();
    }
  });
  document.body.appendChild(overlay);
}

function setupContextMenuSignal(): void {
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("fcore:toggle-system-menu"));
  });
}

function setupGlobalErrorBoundary(): void {
  window.addEventListener("error", (event: ErrorEvent) => {
    showFatalErrorOverlay({
      title: "Unhandled Runtime Error",
      message: typeof event.message === "string" ? event.message : "Unknown error",
      stack: event.error instanceof Error ? event.error.stack ?? null : null,
      source: typeof event.filename === "string" ? event.filename : null,
      line: typeof event.lineno === "number" ? event.lineno : null,
      column: typeof event.colno === "number" ? event.colno : null,
    });
    // Keep default browser/devtools logging for easier diagnosis.
    // Call event.preventDefault() here only if you intentionally want to suppress it.
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const error = reason instanceof Error ? reason : null;
    const reasonText = error?.message ??
      (typeof reason === "string" ? reason : safeSerialize(reason));
    showFatalErrorOverlay({
      title: "Unhandled Promise Rejection",
      message: reasonText,
      stack: error?.stack ?? null,
      source: null,
      line: null,
      column: null,
    });
    // Keep default browser/devtools logging for easier diagnosis.
    // Call event.preventDefault() here only if you intentionally want to suppress it.
  });
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function showFatalErrorOverlay(payload: {
  title: string;
  message: string;
  stack: string | null;
  source: string | null;
  line: number | null;
  column: number | null;
}): void {
  const text = formatFatalError(payload);
  const details = SHOW_VERBOSE_ERRORS
    ? text
    : [
      `Error: ${payload.message}`,
      "",
      "A runtime error occurred. Please copy this message and report it to the developer.",
    ].join("\n");

  const existing = document.getElementById("fc-fatal-error-overlay");
  if (existing instanceof HTMLDivElement) {
    const pre = existing.querySelector("pre");
    if (pre instanceof HTMLPreElement) {
      pre.textContent = details;
      pre.dataset.rawError = text;
    }
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "fc-fatal-error-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "linear-gradient(180deg, #2e0000 0%, #8a0000 100%)",
    color: "#ffe9e9",
    padding: "24px",
    boxSizing: "border-box",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  } satisfies Partial<CSSStyleDeclaration>);

  const heading = document.createElement("h2");
  heading.textContent = "Runtime Error";
  heading.style.margin = "0";
  heading.style.fontSize = "22px";

  const subtitle = document.createElement("p");
  subtitle.textContent = payload.title;
  subtitle.style.margin = "0";
  subtitle.style.opacity = "0.9";

  const pre = document.createElement("pre");
  pre.textContent = details;
  pre.dataset.rawError = text;
  Object.assign(pre.style, {
    margin: "0",
    padding: "12px",
    border: "1px solid rgba(255, 210, 210, 0.4)",
    borderRadius: "8px",
    background: "rgba(20, 0, 0, 0.35)",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    flex: "1",
  } satisfies Partial<CSSStyleDeclaration>);

  const copyButton = document.createElement("button");
  copyButton.textContent = "Copy Error to Clipboard";
  Object.assign(copyButton.style, {
    alignSelf: "flex-start",
    border: "1px solid #ffd6d6",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.08)",
    color: "#ffe9e9",
    padding: "8px 12px",
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);
  copyButton.addEventListener("click", () => {
    const raw = pre.dataset.rawError ?? pre.textContent ?? "";
    void navigator.clipboard.writeText(raw).then(() => {
      copyButton.textContent = "Copied";
    }).catch(() => {
      copyButton.textContent = "Copy Failed";
    });
  });

  overlay.append(heading, subtitle, pre, copyButton);
  document.body.appendChild(overlay);
}

function formatFatalError(payload: {
  title: string;
  message: string;
  stack: string | null;
  source: string | null;
  line: number | null;
  column: number | null;
}): string {
  const lines = [
    `[${payload.title}]`,
    `Error: ${payload.message}`,
  ];

  if (payload.source !== null) {
    const line = payload.line ?? 0;
    const column = payload.column ?? 0;
    lines.push(`At: ${payload.source}:${line}:${column}`);
  }
  if (payload.stack !== null && payload.stack.length > 0) {
    lines.push("");
    lines.push("Stack Trace:");
    lines.push(payload.stack);
  }
  return lines.join("\n");
}

async function requestStepAdvance(): Promise<void> {
  if (!sessionStarted || advancing) {
    return;
  }
  advancing = true;
  try {
    const renderCommands = await stepUntilRenderable();
    const output = {
      done: renderCommands === null,
      renderCommands: renderCommands ?? [],
      currentLabel: session.currentLabel,
      currentIndex: session.currentIndex,
    };
    renderJson(jsonViewer, output);
    await sendRenderCommands(rendererFrame, output.renderCommands);
  } catch {
    renderJson(jsonViewer, { error: "operation rejected" });
  } finally {
    advancing = false;
  }
}

function parseInputValue(value: unknown): VarValue | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record["type"] === "fcore.input") {
    const input = record["value"];
    return isVarValue(input) ? input : undefined;
  }
  if (record["type"] === "menu_input") {
    const input = record["inputId"];
    return isVarValue(input) ? input : undefined;
  }
  return undefined;
}

function isStepSignal(value: unknown): boolean {
  return readMessageType(value) === "fcore.step";
}

function isToggleSystemMenuSignal(value: unknown): boolean {
  return readMessageType(value) === "fcore.toggleSystemMenu";
}

function isVarValue(input: unknown): input is VarValue {
  return (
    input === null ||
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  );
}

function resumeSession(inputValue: VarValue): void {
  session.provideInput(inputValue);
}

function isTrustedRendererEvent(
  event: MessageEvent<unknown>,
  frame: HTMLIFrameElement,
  messageType: string | null,
): boolean {
  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    return false;
  }

  if (event.source !== frameWindow) {
    return false;
  }

  if (event.origin !== window.location.origin && event.origin !== "null") {
    return false;
  }

  return typeof messageType === "string";
}

function createRendererReadyLatch(frame: HTMLIFrameElement): RendererReadyLatch {
  let ready = false;
  let resolveReady!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const markReady = (): void => {
    if (ready) {
      return;
    }
    ready = true;
    window.removeEventListener("message", onMessage);
    frame.removeEventListener("load", onLoad);
    resolveReady();
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    const messageType = readMessageType(event.data);
    if (messageType !== "RendererReady") {
      return;
    }
    if (!isTrustedRendererEvent(event, frame, messageType)) {
      return;
    }
    markReady();
  };
  const onLoad = (): void => {
    const state = frame.contentDocument?.readyState;
    if (state === "interactive" || state === "complete") {
      markReady();
    }
  };

  window.addEventListener("message", onMessage);
  frame.addEventListener("load", onLoad);
  onLoad();
  return {
    promise,
    isReady: () => ready,
  };
}

function readMessageType(value: unknown): string | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return readMessageType(parsed);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const type = (value as Record<string, unknown>)["type"];
  return typeof type === "string" ? type : null;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeChangedPath(path: unknown): string | null {
  if (typeof path !== "string" || path.trim().length === 0) {
    return null;
  }
  const normalized = path.trim().replace(/\\/g, "/");
  const fileName = normalized.split("/").pop();
  if (!fileName || fileName.length === 0) {
    return null;
  }
  return fileName;
}

function buildRenderSyncCommands(
  vars: Readonly<Record<string, VarValue>>,
): RenderCommand[] {
  const commands: RenderCommand[] = [
    { type: "ClearSubtree", targetId: "fc-bg-layer" },
    { type: "ClearSubtree", targetId: "fc-fg-layer" },
    { type: "ClearSubtree", targetId: "fc-text-layer" },
  ];

  const bgSrc = readAssetSrc(vars, ["current_bg", "last_bg_asset"]);
  if (bgSrc !== null) {
    commands.push({
      type: "AppendNode",
      parentId: "fc-bg-layer",
      nodeId: "fc-bg-restored",
      tag: "img",
      src: bgSrc,
    });
  }

  const fgSrc = readAssetSrc(vars, ["current_fg", "last_fg_asset"]);
  if (fgSrc !== null) {
    commands.push({
      type: "AppendNode",
      parentId: "fc-fg-layer",
      nodeId: "fc-fg-restored",
      tag: "img",
      src: fgSrc,
    });
  }

  const lastSay = vars["last_say"];
  if (typeof lastSay === "string" && lastSay.trim().length > 0) {
    commands.push({
      type: "AppendNode",
      parentId: "fc-text-layer",
      nodeId: "fc-say-restored",
      tag: "span",
      text: lastSay,
    });
  }

  return commands;
}

function readAssetSrc(
  vars: Readonly<Record<string, VarValue>>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = vars[key];
    if (typeof value === "string" && isSafeAssetFileName(value)) {
      return value;
    }
  }
  return null;
}

function isSafeAssetFileName(value: string): boolean {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    return false;
  }
  const lower = value.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex <= 0) {
    return false;
  }
  const ext = lower.slice(dotIndex);
  return (
    ext === ".png" ||
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".webp" ||
    ext === ".svg" ||
    ext === ".gif"
  );
}

async function playAudioByAsset(
  action: "play_bgm" | "play_se" | "play_voice",
  src: string,
  kind: AssetKind,
): Promise<void> {
  const channel = toAudioChannel(action);
  const ownerId = audioOwnerId(channel);
  const previousAssetId = activeAudioByChannel.get(channel);
  const handle = await assetManager.ensure(src, {
    kind,
    priority: "high",
    protect: true,
  });

  addAssetOwner(handle.id, ownerId);
  syncProtectedAssets();

  try {
    await audioAdapter.dispatch({
      namespace: "audio",
      action,
      payload: { src: handle.objectUrl },
    });
  } catch (error) {
    removeAssetOwner(handle.id, ownerId);
    syncProtectedAssets();
    throw error;
  }

  if (previousAssetId !== undefined && previousAssetId !== handle.id) {
    removeAssetOwner(previousAssetId, ownerId);
  }
  activeAudioByChannel.set(channel, handle.id);
  syncProtectedAssets();
}

async function prepareRenderCommands(
  renderCommands: ReadonlyArray<RenderCommand>,
): Promise<RenderCommand[]> {
  const commands: RenderCommand[] = [];

  for (const command of renderCommands) {
    if (command.type === "ClearSubtree") {
      clearLayerAssets(command.targetId);
      commands.push(command);
      continue;
    }

    if (command.type === "AppendNode" && command.tag === "img" && typeof command.src === "string") {
      const kind = inferAssetKind(command.parentId, command.src);
      const handle = await assetManager.ensure(command.src, {
        kind,
        priority: "high",
        protect: true,
      });
      markAssetActive(handle.id, command.parentId);
      commands.push({ ...command, src: handle.objectUrl });
      continue;
    }

    commands.push(command);
  }

  return commands;
}

function handleReleaseAssets(ids: ReadonlyArray<string>): void {
  assetManager.releaseMany(ids);
  for (const id of ids) {
    assetOwners.delete(id);
  }
  for (const [channel, id] of activeAudioByChannel.entries()) {
    if (ids.includes(id)) {
      activeAudioByChannel.delete(channel);
    }
  }
  syncProtectedAssets();
}

function markAssetActive(id: string, parentId?: string): void {
  if (typeof parentId !== "string" || parentId.trim().length === 0) {
    return;
  }
  addAssetOwner(id, layerOwnerId(parentId));
}

function clearLayerAssets(parentId: string): void {
  if (typeof parentId !== "string" || parentId.trim().length === 0) {
    return;
  }
  removeOwnerFromAllAssets(layerOwnerId(parentId));
}

function resetActiveAssetsProtection(): void {
  assetOwners.clear();
  activeAudioByChannel.clear();
  syncProtectedAssets();
}

function syncProtectedAssets(): void {
  assetManager.setProtected(Array.from(assetOwners.keys()));
}

function inferAssetKind(parentId: string, src: string): AssetKind {
  const lower = src.toLowerCase();
  if (lower.includes("/bg/") || parentId === "fc-bg-layer") {
    return "bg";
  }
  if (lower.includes("/fg/") || parentId === "fc-fg-layer") {
    return "fg";
  }
  if (lower.includes("/voice/")) {
    return "voice";
  }
  if (lower.includes("/se/")) {
    return "se";
  }
  if (lower.includes("/bgm/")) {
    return "bgm";
  }
  if (lower.endsWith(".mp4") || lower.endsWith(".webm")) {
    return "video";
  }
  return "generic";
}

function toAudioChannel(action: "play_bgm" | "play_se" | "play_voice"): "bgm" | "se" | "voice" {
  if (action === "play_bgm") {
    return "bgm";
  }
  if (action === "play_se") {
    return "se";
  }
  return "voice";
}

function addAssetOwner(assetId: string, ownerId: string): void {
  let owners = assetOwners.get(assetId);
  if (!owners) {
    owners = new Set<string>();
    assetOwners.set(assetId, owners);
  }
  owners.add(ownerId);
}

function removeAssetOwner(assetId: string, ownerId: string): void {
  const owners = assetOwners.get(assetId);
  if (!owners) {
    return;
  }
  owners.delete(ownerId);
  if (owners.size === 0) {
    assetOwners.delete(assetId);
  }
}

function removeOwnerFromAllAssets(ownerId: string): void {
  for (const [assetId, owners] of assetOwners.entries()) {
    if (!owners.has(ownerId)) {
      continue;
    }
    owners.delete(ownerId);
    if (owners.size === 0) {
      assetOwners.delete(assetId);
    }
  }
}

function layerOwnerId(parentId: string): string {
  return `layer:${parentId}`;
}

function audioOwnerId(channel: "bgm" | "se" | "voice"): string {
  return `audio:${channel}`;
}
