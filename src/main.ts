import { invoke } from "@tauri-apps/api/core";
import { loadBundledPluginSource } from "./browser_plugin_sources.ts";
import { parseScenario } from "./parser.ts";
import type { CommandIR } from "./runtime.ts";
import { ScenarioSession } from "./session.ts";
import { WorkerHost } from "./worker_host.ts";
import type { RenderCommand, VarValue } from "./types.ts";

const workerHost = new WorkerHost();
const session = new ScenarioSession(workerHost, {
  loadPluginSource: loadBundledPluginSource,
});
let cachedMarkdown: string | null = null;

const jsonViewer = document.getElementById("json-viewer");
const saveDataInput = document.getElementById("save-data");
const rendererFrame = document.getElementById("renderer-frame");

if (
  !(jsonViewer instanceof HTMLPreElement) ||
  !(saveDataInput instanceof HTMLTextAreaElement) ||
  !(rendererFrame instanceof HTMLIFrameElement)
) {
  throw new Error("operation rejected");
}

window.addEventListener("message", async (event) => {
  if (!isTrustedRendererEvent(event, rendererFrame)) return;
  if (!isInputMessage(event.data)) return;

  try {
    session.provideInput(event.data.value);
    const renderCommands = await session.step();
    const output = {
      input: event.data.value,
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
      session.loadScenario(scenario, "start");
      sendRenderCommands(rendererFrame, [
        { type: "ClearSubtree", targetId: "fc-bg-layer" },
        { type: "ClearSubtree", targetId: "fc-fg-layer" },
        { type: "ClearSubtree", targetId: "fc-text-layer" },
      ]);

      const firstStepCommands = await session.step();
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
    const renderCommands = await session.step();
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
  try {
    const saveData = session.exportSaveData();
    saveDataInput.value = saveData;
    renderJson(jsonViewer, { saveData });
  } catch {
    renderJson(jsonViewer, { error: "operation rejected" });
  }
});

document.getElementById("session-load")?.addEventListener("click", () => {
  try {
    session.importSaveData(saveDataInput.value);
    renderJson(jsonViewer, {
      loaded: true,
      currentLabel: session.currentLabel,
      currentIndex: session.currentIndex,
    });
  } catch {
    renderJson(jsonViewer, { error: "operation rejected" });
  }
});

document.getElementById("export-pptx")?.addEventListener("click", () => {
  void (async () => {
    try {
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
  session.close();
});

async function loadScenarioMarkdown(): Promise<string> {
  try {
    return await invoke<string>("load_scenario", { path: "demo" });
  } catch {
    throw new Error("operation rejected");
  }
}

async function ensureScenarioMarkdown(): Promise<string> {
  if (cachedMarkdown !== null) {
    return cachedMarkdown;
  }
  cachedMarkdown = await loadScenarioMarkdown();
  return cachedMarkdown;
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

function isInputMessage(value: unknown): value is { type: "fcore.input"; value: VarValue } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record["type"] !== "fcore.input") return false;
  const input = record["value"];
  return (
    input === null ||
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean"
  );
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
