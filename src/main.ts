import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

const workerHost = new WorkerHost();
const session = new ScenarioSession(workerHost, {
  loadPluginSource: loadBundledPluginSource,
});
let cachedMarkdown: string | null = null;
let scenarioChangeUnlisten: (() => void) | null = null;
const MAX_AUTO_FORWARD_STEPS = 4096;
const ACTIVE_SCENARIO_FILE_NAME = "demo_scenario.md";
const DEFAULT_SAVE_SLOT = 1;

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

if (exportPptxButton instanceof HTMLElement && !isTauriRuntime()) {
  exportPptxButton.style.display = "none";
}

void setupScenarioChangeListener();

window.addEventListener("message", async (event) => {
  if (!isTrustedRendererEvent(event, rendererFrame)) return;
  const inputValue = parseInputValue(event.data);
  if (inputValue === undefined) return;

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
    sendRenderCommands(rendererFrame, output.renderCommands);
  } catch {
    renderJson(jsonViewer, { error: "operation rejected" });
  }
});

document.getElementById("session-start")?.addEventListener("click", () => {
  void (async () => {
    try {
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
      sendRenderCommands(rendererFrame, payload.renderCommands);
    } catch {
      renderJson(jsonViewer, { error: "operation rejected" });
    }
  })();
});

document.getElementById("session-step")?.addEventListener("click", async () => {
  try {
    const renderCommands = await stepUntilRenderable();
    const output = {
      done: renderCommands === null,
      renderCommands: renderCommands ?? [],
      currentLabel: session.currentLabel,
      currentIndex: session.currentIndex,
    };
    renderJson(jsonViewer, output);
    sendRenderCommands(rendererFrame, output.renderCommands);
  } catch {
    renderJson(jsonViewer, { error: "operation rejected" });
  }
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
      const saveData = await getStorage().load(DEFAULT_SAVE_SLOT);
      saveDataInput.value = saveData;
      await ensureSessionInitializedForLoad();
      session.importSaveData(saveData);
      const syncCommands = buildRenderSyncCommands(session.runtimeState.vars);
      const suspendedCommands = session.getSuspendedRenderCommands();
      const restoreCommands = suspendedCommands === null
        ? syncCommands
        : [...syncCommands, ...suspendedCommands];
      sendRenderCommands(rendererFrame, restoreCommands);
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
    sendRenderCommands(rendererFrame, output.renderCommands);
  } catch {
    renderJson(jsonViewer, { scenarioChanged: true, error: "operation rejected" });
  }
}

async function loadScenarioMarkdown(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await invoke<string>("load_scenario", { path: "demo" });
    } catch {
      throw new Error("operation rejected");
    }
  }

  const response = await fetch("/assets/demo_scenario.md");
  if (!response.ok) {
    throw new Error("operation rejected");
  }
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
  sendRenderCommands(rendererFrame, clearRendererCommands());
  return await stepUntilRenderable();
}

function clearRendererCommands(): RenderCommand[] {
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

function sendRenderCommands(
  frame: HTMLIFrameElement,
  renderCommands: ReadonlyArray<RenderCommand>,
): void {
  frame.contentWindow?.postMessage(
    { type: "fcore.renderCommands", renderCommands },
    "*",
  );
}

function renderJson(target: HTMLPreElement, data: unknown): void {
  target.textContent = JSON.stringify(data, null, 2);
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
): boolean {
  const frameWindow = frame.contentWindow;
  if (!frameWindow || event.source !== frameWindow) {
    return false;
  }
  return event.origin === window.location.origin || event.origin === "null";
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
