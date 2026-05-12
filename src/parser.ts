import type { CommandIR } from "./runtime.ts";

const LABEL_OPEN_RE = /^{{#\s*label:\s*([A-Za-z0-9_]+)\s*}}$/;
const CHOICE_OPEN_RE = /^{{#\s*choice\s*}}$/;
const END_RE = /^{{\s*end\s*}}$/;
const CHOICE_ITEM_RE = /^-\s*(.+?)\s*->\s*([A-Za-z0-9_]+)\s*$/;
const INLINE_COMMAND_RE = /^{{\s*@([A-Za-z0-9_]+)(?:\s+(.+?))?\s*}}$/;
const JSON_BLOCK_OPEN_RE = /^```fcore:([A-Za-z0-9_]+)\s*$/;
const JSON_BLOCK_CLOSE_RE = /^```\s*$/;
const RELEASE_DIRECTIVE_RE = /^@release(?:\s+(.+))?$/;
const MAX_RELEASE_ASSET_IDS = 32;
const MAX_RELEASE_ARGS_BYTES = 4096;

interface MenuChoice {
  text: string;
  to: string;
}

export function parseScenario(markdown: string): Record<string, CommandIR[]> {
  const lines = markdown.split(/\r?\n/);
  const scenario: Record<string, CommandIR[]> = {};

  let currentLabel: string | null = null;
  let currentCommands: CommandIR[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (currentLabel === null) {
      const open = trimmed.match(LABEL_OPEN_RE);
      if (!open) continue;

      const labelName = open[1];
      if (scenario[labelName]) {
        throw new Error("parse error");
      }

      currentLabel = labelName;
      currentCommands = [];
      continue;
    }

    if (END_RE.test(trimmed)) {
      scenario[currentLabel] = currentCommands;
      currentLabel = null;
      currentCommands = [];
      continue;
    }

    if (trimmed.length === 0) {
      continue;
    }

    if (CHOICE_OPEN_RE.test(trimmed)) {
      const { command, nextIndex } = parseChoiceBlock(lines, i + 1);
      currentCommands.push(command);
      i = nextIndex;
      continue;
    }

    const jsonBlockOpen = trimmed.match(JSON_BLOCK_OPEN_RE);
    if (jsonBlockOpen) {
      const { command, nextIndex } = parseJsonCommandBlock(lines, i + 1, jsonBlockOpen[1]);
      currentCommands.push(command);
      i = nextIndex;
      continue;
    }

    const inlineCommand = parseInlineCommand(trimmed);
    if (inlineCommand) {
      currentCommands.push(inlineCommand);
      continue;
    }

    const releaseCommand = parseReleaseCommand(trimmed);
    if (releaseCommand) {
      currentCommands.push(releaseCommand);
      continue;
    }

    if (trimmed.startsWith("{{#") || trimmed.startsWith("{{")) {
      throw new Error("parse error");
    }

    currentCommands.push({
      op: "say",
      args: { text: line },
    });
  }

  if (currentLabel !== null) {
    throw new Error("parse error");
  }

  return scenario;
}

function parseChoiceBlock(
  lines: string[],
  startIndex: number,
): { command: CommandIR; nextIndex: number } {
  const choices: MenuChoice[] = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (trimmed.length === 0) {
      continue;
    }

    if (END_RE.test(trimmed)) {
      if (choices.length === 0) {
        throw new Error("parse error");
      }
      return {
        command: {
          op: "menu",
          args: { choices },
        },
        nextIndex: i,
      };
    }

    if (trimmed.startsWith("{{#") || trimmed.startsWith("{{")) {
      throw new Error("parse error");
    }

    const choiceMatch = trimmed.match(CHOICE_ITEM_RE);
    if (!choiceMatch) {
      throw new Error("parse error");
    }

    choices.push({
      text: choiceMatch[1],
      to: choiceMatch[2],
    });
  }

  throw new Error("parse error");
}

function parseInlineCommand(line: string): CommandIR | null {
  const match = line.match(INLINE_COMMAND_RE);
  if (!match) {
    return null;
  }
  const op = match[1];
  const rawArgs = match[2] ?? "";

  return {
    op,
    args: parseInlineArgs(rawArgs),
  };
}

function parseReleaseCommand(line: string): CommandIR | null {
  const match = line.match(RELEASE_DIRECTIVE_RE);
  if (!match) {
    return null;
  }

  const raw = (match[1] ?? "").trim();
  if (raw.length === 0) {
    throw new Error("parse error");
  }

  const ids = raw.split(/\s+/g).flatMap((token) => token.split(",")).map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map(stripReleaseTokenWrapper)
    .map(sanitizeReleaseAssetId);

  if (ids.length === 0) {
    throw new Error("parse error");
  }
  if (ids.length > MAX_RELEASE_ASSET_IDS) {
    throw new Error("parse error");
  }
  if (byteLength(JSON.stringify({ ids })) > MAX_RELEASE_ARGS_BYTES) {
    throw new Error("parse error");
  }

  return {
    op: "release_assets",
    args: { ids },
  };
}

function stripReleaseTokenWrapper(token: string): string {
  const value = token.trim();
  if (
    (value.startsWith("[") && value.endsWith("]")) ||
    (value.startsWith("(") && value.endsWith(")")) ||
    (value.startsWith("{") && value.endsWith("}"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function sanitizeReleaseAssetId(rawId: string): string {
  const value = rawId.trim();
  if (value.length === 0) {
    throw new Error("parse error");
  }
  if (value.includes("\0")) {
    throw new Error("parse error");
  }
  if (value.includes("..")) {
    throw new Error("parse error");
  }
  if (value.includes("\\")) {
    throw new Error("parse error");
  }
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(value)) {
    throw new Error("parse error");
  }
  if (value.startsWith("//")) {
    throw new Error("parse error");
  }

  const normalized = value.startsWith("/assets/")
    ? value.slice("/assets/".length)
    : value.startsWith("assets/")
    ? value.slice("assets/".length)
    : value.startsWith("/")
    ? value.slice(1)
    : value;

  if (normalized.length === 0) {
    throw new Error("parse error");
  }
  if (!/^[A-Za-z0-9._\-\/]+$/.test(normalized)) {
    throw new Error("parse error");
  }
  return normalized;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function parseInlineArgs(input: string): Record<string, string> {
  const args: Record<string, string> = {};
  let i = 0;

  while (i < input.length) {
    i = skipSpaces(input, i);
    if (i >= input.length) break;

    const keyStart = i;
    while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) {
      i += 1;
    }
    if (keyStart === i) {
      throw new Error("parse error");
    }
    const key = input.slice(keyStart, i);

    i = skipSpaces(input, i);
    if (input[i] !== "=") {
      throw new Error("parse error");
    }
    i += 1;

    i = skipSpaces(input, i);
    if (input[i] !== '"') {
      throw new Error("parse error");
    }
    i += 1;

    let value = "";
    let closedQuote = false;
    while (i < input.length) {
      const ch = input[i];
      if (ch === '"') {
        i += 1;
        closedQuote = true;
        break;
      }
      if (ch === "\\") {
        const next = input[i + 1];
        if (next === '"' || next === "\\") {
          value += next;
          i += 2;
          continue;
        }
        throw new Error("parse error");
      }
      value += ch;
      i += 1;
    }

    if (!closedQuote) {
      throw new Error("parse error");
    }
    args[key] = value;
  }

  return args;
}

function skipSpaces(input: string, start: number): number {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) {
    i += 1;
  }
  return i;
}

function parseJsonCommandBlock(
  lines: string[],
  startIndex: number,
  op: string,
): { command: CommandIR; nextIndex: number } {
  const bodyLines: string[] = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    if (JSON_BLOCK_CLOSE_RE.test(lines[i].trim())) {
      const args = parseJsonArgs(bodyLines.join("\n"));
      return {
        command: { op, args },
        nextIndex: i,
      };
    }
    bodyLines.push(lines[i]);
  }

  throw new Error("parse error");
}

function parseJsonArgs(input: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("parse error");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("parse error");
  }
  return parsed as Record<string, unknown>;
}
