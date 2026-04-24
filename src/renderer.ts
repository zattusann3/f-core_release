// @ts-nocheck

/**
 * @typedef {import("./types.ts").RenderCommand} RenderCommand
 */

/**
 * @param {ReadonlyArray<RenderCommand>} commands
 */
export function applyRenderCommands(commands) {
  for (const command of commands) {
    switch (command.type) {
      case "AppendNode":
        appendNode(command);
        break;
      case "UpdateCSSVar":
        updateCssVars(command);
        break;
      case "ClearSubtree":
        clearSubtree(command);
        break;
      default:
        throw new Error("unsupported command");
    }
  }
}

/**
 * @param {Extract<RenderCommand, { type: "AppendNode" }>} command
 */
function appendNode(command) {
  const parent = document.getElementById(command.parentId);
  if (!parent) return;
  if (command.parentId === "fc-text-layer" && command.tag === "span") {
    parent.replaceChildren();
  }

  const node = document.createElement(command.tag);
  node.id = command.nodeId;
  if (command.tag === "img" && typeof command.src === "string") {
    node.setAttribute("src", resolveAssetSrc(command.src));
    node.setAttribute("alt", "");
  }
  if (command.onClickInput !== undefined) {
    node.onclick = () => {
      window.parent.postMessage(
        { type: "fcore.input", value: command.onClickInput },
        "*",
      );
    };
  }
  if (typeof command.text === "string") {
    node.textContent = command.text;
  }
  if (command.cssVars) {
    for (const [key, value] of Object.entries(command.cssVars)) {
      node.style.setProperty(key, String(value));
    }
  }
  parent.appendChild(node);
}

/**
 * @param {Extract<RenderCommand, { type: "UpdateCSSVar" }>} command
 */
function updateCssVars(command) {
  const target = document.getElementById(command.targetId);
  if (!target) return;

  for (const [key, value] of Object.entries(command.vars)) {
    target.style.setProperty(key, String(value));
  }
}

/**
 * @param {Extract<RenderCommand, { type: "ClearSubtree" }>} command
 */
function clearSubtree(command) {
  const target = document.getElementById(command.targetId);
  if (!target) return;
  target.replaceChildren();
}

function resolveAssetSrc(rawSrc) {
  const trimmed = String(rawSrc).trim();
  if (trimmed.length === 0) {
    throw new Error("invalid asset src");
  }

  if (trimmed.startsWith("/assets/")) {
    return trimmed;
  }
  if (trimmed.startsWith("assets/")) {
    return `/${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `/assets/${encodeURIComponent(trimmed.slice(1))}`;
  }
  return `/assets/${encodeURIComponent(trimmed)}`;
}
