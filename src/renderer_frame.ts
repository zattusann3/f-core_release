import { applyRenderCommands } from "./renderer.ts";

console.debug("[iframe] renderer_frame.ts loaded and event listeners attached.");

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const data = event.data;
  if (!isRenderMessage(data)) return;

  applyRenderCommands(data.renderCommands);
});

window.addEventListener("click", (event) => {
  console.debug("[iframe] window clicked", event.target);
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("button")) return;

  window.parent.postMessage({ type: "fcore.step" }, "*");
}, { capture: true });

window.addEventListener("contextmenu", (event) => {
  console.debug("[iframe] window right-clicked", event.target);
  event.preventDefault();
  window.parent.postMessage({ type: "fcore.toggleSystemMenu" }, "*");
}, { capture: true });

window.parent.postMessage({ type: "RendererReady" }, "*");

function isRenderMessage(
  value: unknown,
): value is { type: "fcore.renderCommands"; renderCommands: unknown[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record["type"] !== "fcore.renderCommands") return false;
  return Array.isArray(record["renderCommands"]);
}
