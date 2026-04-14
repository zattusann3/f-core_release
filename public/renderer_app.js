import { applyRenderCommands } from "../src/renderer.ts";

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!isRenderMessage(data)) return;

  applyRenderCommands(data.renderCommands);
});

function isRenderMessage(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (value.type !== "fcore.renderCommands") return false;
  return Array.isArray(value.renderCommands);
}
