// parser/tokenize.ts
import type {
  ChoiceItemToken,
  ChoiceStartToken,
  EndToken,
  LabelStartToken,
  PluginAttr,
  PluginTagToken,
  Span,
  TextLineToken,
  Token,
  SetLiteralValue,
} from "./token.ts";

export type TokenizeError = {
  message: string;
  span: Span;
};

const LABEL_RE = /^\{\{# label: ([A-Za-z][A-Za-z0-9_-]*) \}\}$/;
const PLUGIN_DECL_RE = /^\{\{# plugin: ([A-Za-z][A-Za-z0-9_.]*) \}\}$/;
const SET_RE =
  /^\{\{ set: ([A-Za-z][A-Za-z0-9_]*) = (true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|"(?:[^"\\]|\\.)*") \}\}$/;
const IF_BOOL_RE =
  /^\{\{ if: (!?)([A-Za-z][A-Za-z0-9_]*) -> ([A-Za-z][A-Za-z0-9_-]*) \}\}$/;
const IF_EQ_RE =
  /^\{\{ if: ([A-Za-z][A-Za-z0-9_]*) == (true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|"(?:[^"\\]|\\.)*") -> ([A-Za-z][A-Za-z0-9_-]*) \}\}$/;
const JUMP_RE = /^\{\{ jump: ([A-Za-z][A-Za-z0-9_-]*) \}\}$/;
const CHOICE_START = "{{# choice}}";
const END_TAG = "{{ end }}";

export function tokenize(input: string): { tokens: Token[]; errors: TokenizeError[] } {
  const tokens: Token[] = [];
  const errors: TokenizeError[] = [];

  const lines = input.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = lines[i];

    // Normalize CRLF to LF by trimming a trailing \r.
    if (line.endsWith("\r")) line = line.slice(0, -1);

    const labelMatch = line.match(LABEL_RE);
    if (labelMatch) {
      tokens.push(makeLabelStart(labelMatch[1], lineNo, line.length));
      continue;
    }

    const pluginDeclMatch = line.match(PLUGIN_DECL_RE);
    if (pluginDeclMatch) {
      tokens.push(makePluginDecl(pluginDeclMatch[1], lineNo, line.length));
      continue;
    }

    if (line === CHOICE_START) {
      tokens.push(makeChoiceStart(lineNo, line.length));
      continue;
    }

    if (line === END_TAG) {
      tokens.push(makeEnd(lineNo, line.length));
      continue;
    }

    const setMatch = line.match(SET_RE);
    if (setMatch) {
      const literal = parseSetLiteral(setMatch[2]);
      if (literal) {
        tokens.push(
          makeSetTag(setMatch[1], literal, lineNo, line.length),
        );
      } else {
        errors.push({
          message: "invalid set literal",
          span: spanLine(lineNo, line.length),
        });
      }
      continue;
    }

    const ifEqMatch = line.match(IF_EQ_RE);
    if (ifEqMatch) {
      const literal = parseSetLiteral(ifEqMatch[2]);
      if (literal) {
        tokens.push(
          makeIfTag(ifEqMatch[1], false, ifEqMatch[3], lineNo, line.length, literal),
        );
      } else {
        errors.push({
          message: "invalid if literal",
          span: spanLine(lineNo, line.length),
        });
      }
      continue;
    }

    const ifBoolMatch = line.match(IF_BOOL_RE);
    if (ifBoolMatch) {
      const negated = ifBoolMatch[1] === "!";
      tokens.push(makeIfTag(ifBoolMatch[2], negated, ifBoolMatch[3], lineNo, line.length));
      continue;
    }

    const jumpMatch = line.match(JUMP_RE);
    if (jumpMatch) {
      tokens.push(makeJumpTag(jumpMatch[1], lineNo, line.length));
      continue;
    }

    const pluginTag = parsePluginTag(line, lineNo, errors);
    if (pluginTag) {
      tokens.push(pluginTag);
      continue;
    }

    const choiceItem = parseChoiceItem(line, lineNo, errors);
    if (choiceItem) {
      tokens.push(choiceItem);
      continue;
    }

    // Default: TextLine
    const textToken = makeTextLine(line, lineNo, line.length);
    tokens.push(textToken);

    const textError = textLineError(line, lineNo);
    if (textError) errors.push(textError);
  }

  return { tokens, errors };
}

function parseChoiceItem(
  line: string,
  lineNo: number,
  errors: TokenizeError[],
): ChoiceItemToken | null {
  if (!line.startsWith("- ")) return null;

  const tabIndex = line.indexOf("\t");
  if (tabIndex >= 0) {
    errors.push({
      message: "tabs are not allowed in choice items",
      span: spanAt(lineNo, tabIndex + 1, tabIndex + 2),
    });
    return null;
  }

  const arrow = " -> ";
  const arrowIndex = line.indexOf(arrow);
  if (arrowIndex < 0) return null;

  const text = line.slice(2, arrowIndex);
  const to = line.slice(arrowIndex + arrow.length);
  if (!isValidLabelName(to)) return null;

  return {
    kind: "ChoiceItem",
    text,
    to,
    span: spanLine(lineNo, line.length),
  };
}

function isValidLabelName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function textLineError(line: string, lineNo: number): TokenizeError | null {
  const idx = line.indexOf("{{");
  if (idx < 0) return null;

  return {
    message: "text line contains tag marker",
    span: spanAt(lineNo, idx + 1, idx + 3),
  };
}

function spanLine(line: number, length: number): Span {
  return {
    start: { line, col: 1 },
    end: { line, col: length + 1 },
  };
}

function spanAt(line: number, startCol: number, endCol: number): Span {
  return {
    start: { line, col: startCol },
    end: { line, col: endCol },
  };
}

function makeLabelStart(name: string, line: number, length: number): LabelStartToken {
  return { kind: "LabelStart", name, span: spanLine(line, length) };
}

function makeChoiceStart(line: number, length: number): ChoiceStartToken {
  return { kind: "ChoiceStart", span: spanLine(line, length) };
}

function makePluginDecl(name: string, line: number, length: number): Token {
  return { kind: "PluginDecl", name, span: spanLine(line, length) };
}

function makeEnd(line: number, length: number): EndToken {
  return { kind: "End", span: spanLine(line, length) };
}

function makeTextLine(text: string, line: number, length: number): TextLineToken {
  return { kind: "TextLine", text, span: spanLine(line, length) };
}

function makeSetTag(name: string, value: SetLiteralValue, line: number, length: number): Token {
  return { kind: "SetTag", name, value, span: spanLine(line, length) };
}

function makeIfTag(
  name: string,
  negated: boolean,
  to: string,
  line: number,
  length: number,
  equals?: SetLiteralValue,
): Token {
  return { kind: "IfTag", name, negated, equals, to, span: spanLine(line, length) };
}

function makeJumpTag(to: string, line: number, length: number): Token {
  return { kind: "JumpTag", to, span: spanLine(line, length) };
}

function parsePluginTag(
  line: string,
  lineNo: number,
  errors: TokenizeError[],
): PluginTagToken | null {
  if (!line.startsWith("{{ plugin: ") || !line.endsWith(" }}")) return null;

  const body = line.slice("{{ plugin: ".length, line.length - " }}".length);
  const firstSpace = body.indexOf(" ");
  const name = firstSpace >= 0 ? body.slice(0, firstSpace) : body;
  const attrsRaw = firstSpace >= 0 ? body.slice(firstSpace + 1) : "";

  if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(name)) {
    errors.push({
      message: "invalid plugin name",
      span: spanLine(lineNo, line.length),
    });
    return null;
  }

  const attrs = parsePluginAttrs(attrsRaw);
  if (!attrs.ok) {
    errors.push({
      message: attrs.message,
      span: spanLine(lineNo, line.length),
    });
    return null;
  }

  return {
    kind: "PluginTag",
    name,
    attrs: attrs.value,
    span: spanLine(lineNo, line.length),
  };
}

function parsePluginAttrs(raw: string): { ok: true; value: PluginAttr[] } | { ok: false; message: string } {
  if (raw.length === 0) return { ok: true, value: [] };
  const attrs: PluginAttr[] = [];
  let i = 0;

  while (i < raw.length) {
    while (i < raw.length && raw[i] === " ") i++;
    if (i >= raw.length) break;

    const keyStart = i;
    while (i < raw.length && /[A-Za-z0-9_]/.test(raw[i])) i++;
    const key = raw.slice(keyStart, i);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
      return { ok: false, message: "invalid plugin attribute key" };
    }

    if (raw[i] !== "=") return { ok: false, message: "plugin attributes must use key=value" };
    i++;

    if (i >= raw.length) return { ok: false, message: "missing plugin attribute value" };
    let value = "";
    if (raw[i] === "\"") {
      i++;
      while (i < raw.length) {
        const ch = raw[i];
        if (ch === "\\") {
          const next = raw[i + 1];
          if (next !== "\"" && next !== "\\") {
            return { ok: false, message: "invalid string escape in plugin attribute" };
          }
          value += next;
          i += 2;
          continue;
        }
        if (ch === "\"") {
          i++;
          break;
        }
        value += ch;
        i++;
      }
      if (i > raw.length) return { ok: false, message: "unterminated plugin attribute string" };
      if (raw[i - 1] !== "\"") return { ok: false, message: "unterminated plugin attribute string" };
    } else {
      const start = i;
      while (i < raw.length && raw[i] !== " ") i++;
      value = raw.slice(start, i);
      if (value.length === 0) return { ok: false, message: "missing plugin attribute value" };
    }

    attrs.push({ key, value });
  }

  return { ok: true, value: attrs };
}

function parseSetLiteral(raw: string): SetLiteralValue | null {
  if (raw === "true") return { kind: "Boolean", value: true };
  if (raw === "false") return { kind: "Boolean", value: false };

  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return { kind: "String", value: parsed };
    } catch {
      return null;
    }
    return null;
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return { kind: "Number", value: num };
}
