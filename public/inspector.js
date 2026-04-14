const jsonViewer = document.getElementById("json-viewer");
const saveData = document.getElementById("save-data");
const rendererFrame = document.getElementById("renderer-frame");

window.addEventListener("message", async (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.source !== rendererFrame.contentWindow) return;
  if (!isInputMessage(event.data)) return;

  const inputResult = await fetchJson("/api/session/input", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: event.data.value }),
  });

  const stepResult = await fetchJson("/api/session/step", { method: "POST" });
  renderJson({
    input: inputResult,
    step: stepResult,
  });
  const renderCommands = Array.isArray(stepResult?.renderCommands) ? stepResult.renderCommands : [];
  sendRenderCommands(renderCommands);
});

document.getElementById("session-start")?.addEventListener("click", async () => {
  const result = await fetchJson("/api/session/start", { method: "POST" });
  renderJson(result);
  sendRenderCommands([
    { type: "ClearSubtree", targetId: "fc-bg-layer" },
    { type: "ClearSubtree", targetId: "fc-fg-layer" },
    { type: "ClearSubtree", targetId: "fc-text-layer" },
  ]);
});

document.getElementById("session-step")?.addEventListener("click", async () => {
  const result = await fetchJson("/api/session/step", { method: "POST" });
  renderJson(result);
  const renderCommands = Array.isArray(result?.renderCommands) ? result.renderCommands : [];
  sendRenderCommands(renderCommands);
});

document.getElementById("session-save")?.addEventListener("click", async () => {
  const result = await fetchJson("/api/session/save", { method: "GET" });
  renderJson(result);
  if (typeof result?.saveData === "string") {
    saveData.value = result.saveData;
  }
});

document.getElementById("session-load")?.addEventListener("click", async () => {
  const payload = {
    saveData: typeof saveData.value === "string" ? saveData.value : "",
  };
  const result = await fetchJson("/api/session/load", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  renderJson(result);
});

function sendRenderCommands(renderCommands) {
  rendererFrame.contentWindow?.postMessage(
    { type: "fcore.renderCommands", renderCommands },
    window.location.origin,
  );
}

function renderJson(data) {
  jsonViewer.textContent = JSON.stringify(data, null, 2);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  return await response.json();
}

function isInputMessage(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (value.type !== "fcore.input") return false;
  const input = value.value;
  return input === null || typeof input === "string" || typeof input === "number" ||
    typeof input === "boolean";
}
