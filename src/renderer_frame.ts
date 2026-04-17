import { applyRenderCommands } from "./renderer.ts";

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!isRenderMessage(data)) return;

  applyRenderCommands(data.renderCommands);
});

function isRenderMessage(
  value: unknown,
): value is { type: "fcore.renderCommands"; renderCommands: unknown[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record["type"] !== "fcore.renderCommands") return false;
  return Array.isArray(record["renderCommands"]);
}
