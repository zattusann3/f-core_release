import { parseScenario } from "../src/parser.ts";
import { type CommandIR, executeCommand } from "../src/runtime.ts";
import { ScenarioSession } from "../src/session.ts";
import { WorkerHost } from "../src/worker_host.ts";

const HOST = "127.0.0.1";
const PORT = 8000;

const runtimeState = { vars: {} };
const workerHost = new WorkerHost();
const scenarioSession = new ScenarioSession(workerHost);

const PUBLIC_DIR = new URL("../public/", import.meta.url);
const SRC_DIR = new URL("../src/", import.meta.url);
const ASSETS_DIR = new URL("../assets/", import.meta.url);

const DEMO_SCENARIO_MARKDOWN = `
Session comments are ignored.

{{# label: start }}
{{ @asset type="bg" src="sample.jpg" }}
Welcome to ScenarioSession demo.
{{# choice}}
- Go next -> middle
{{ end }}
{{ end }}

{{# label: middle }}
This is the second label.
{{ @effect type="color" targetId="fc-text-layer" value="#ffee99" }}
{{# choice}}
- Finish -> end
- Return -> start
{{ end }}
{{ end }}

{{# label: end }}
Done.
{{ end }}
`;

console.log(`f-core demo server listening on http://${HOST}:${PORT}`);

Deno.serve({ hostname: HOST, port: PORT }, async (request) => {
  const url = new URL(request.url);

  if (url.pathname === "/api/execute") {
    return await handleExecute(request);
  }
  if (url.pathname === "/api/session/start") {
    return await handleSessionStart(request);
  }
  if (url.pathname === "/api/session/step") {
    return await handleSessionStep(request);
  }
  if (url.pathname === "/api/session/save") {
    return await handleSessionSave(request);
  }
  if (url.pathname === "/api/session/load") {
    return await handleSessionLoad(request);
  }
  if (url.pathname === "/api/session/input") {
    return await handleSessionInput(request);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return await serveFile(new URL("index.html", PUBLIC_DIR));
  }
  if (url.pathname === "/renderer.html") {
    return await serveFile(new URL("renderer.html", PUBLIC_DIR));
  }
  if (url.pathname === "/inspector.js") {
    return await serveFile(new URL("inspector.js", PUBLIC_DIR));
  }
  if (url.pathname === "/renderer_app.js") {
    return await serveFile(new URL("renderer_app.js", PUBLIC_DIR));
  }
  if (url.pathname === "/src/renderer.ts") {
    return await serveFile(new URL("renderer.ts", SRC_DIR));
  }
  if (url.pathname.startsWith("/assets/")) {
    return await serveAsset(url.pathname);
  }

  return jsonResponse({ error: "not found" }, 404);
});

async function handleExecute(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const body = await request.json();
    if (!isCommandIR(body)) {
      return jsonResponse({ error: "invalid command" }, 400);
    }

    const result = await executeCommand(runtimeState, body, workerHost);
    return jsonResponse(result, 200);
  } catch (_err) {
    return jsonResponse({ error: "operation rejected" }, 400);
  }
}

async function handleSessionStart(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const scenario = parseScenario(DEMO_SCENARIO_MARKDOWN);
    scenarioSession.loadScenario(scenario, "start");
    return jsonResponse({
      started: true,
      currentLabel: scenarioSession.currentLabel,
      currentIndex: scenarioSession.currentIndex,
      labels: Object.keys(scenario),
    }, 200);
  } catch {
    return jsonResponse({ error: "operation rejected" }, 400);
  }
}

async function handleSessionStep(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const renderCommands = await scenarioSession.step();
    if (renderCommands === null) {
      return jsonResponse({
        done: true,
        renderCommands: [],
        currentLabel: scenarioSession.currentLabel,
        currentIndex: scenarioSession.currentIndex,
      }, 200);
    }
    return jsonResponse({
      done: false,
      renderCommands,
      currentLabel: scenarioSession.currentLabel,
      currentIndex: scenarioSession.currentIndex,
    }, 200);
  } catch {
    return jsonResponse({ error: "operation rejected" }, 400);
  }
}

async function handleSessionSave(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    return jsonResponse({
      saveData: scenarioSession.exportSaveData(),
    }, 200);
  } catch {
    return jsonResponse({ error: "operation rejected" }, 400);
  }
}

async function handleSessionLoad(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const body = await request.json();
    const saveData = (body as { saveData?: unknown })?.saveData;
    if (typeof saveData !== "string") {
      return jsonResponse({ error: "invalid save payload" }, 400);
    }
    scenarioSession.importSaveData(saveData);
    return jsonResponse({
      loaded: true,
      currentLabel: scenarioSession.currentLabel,
      currentIndex: scenarioSession.currentIndex,
    }, 200);
  } catch {
    return jsonResponse({ error: "operation rejected" }, 400);
  }
}

async function handleSessionInput(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const body = await request.json();
    const value = (body as { value?: unknown })?.value;
    if (!isVarValue(value)) {
      return jsonResponse({ error: "invalid input payload" }, 400);
    }

    scenarioSession.provideInput(value);
    return jsonResponse({ accepted: true }, 200);
  } catch {
    return jsonResponse({ error: "operation rejected" }, 400);
  }
}

function isCommandIR(value: unknown): value is CommandIR {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["op"] !== "string") return false;
  if (!("args" in record)) return true;
  return typeof record["args"] === "object" && record["args"] !== null &&
    !Array.isArray(record["args"]);
}

function isVarValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

async function serveFile(fileUrl: URL): Promise<Response> {
  try {
    const data = await Deno.readFile(fileUrl);
    return new Response(data, {
      status: 200,
      headers: { "content-type": contentTypeFromPath(fileUrl.pathname) },
    });
  } catch {
    return jsonResponse({ error: "not found" }, 404);
  }
}

async function serveAsset(pathname: string): Promise<Response> {
  const relativePath = pathname.slice("/assets/".length);
  if (!/^[A-Za-z0-9._-]+$/.test(relativePath) || relativePath.includes("..")) {
    return jsonResponse({ error: "not found" }, 404);
  }
  return await serveFile(new URL(relativePath, ASSETS_DIR));
}

function contentTypeFromPath(pathname: string): string {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js") || pathname.endsWith(".ts")) {
    return "application/javascript; charset=utf-8";
  }
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
