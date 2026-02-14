// parser/parse.ts
import { tokenize } from "./tokenize.ts";
import type {
  Span,
  Token,
  TextLineToken,
  ChoiceItemToken,
  SetTagToken,
  IfTagToken,
  JumpTagToken,
  PluginTagToken,
} from "./token.ts";
import type { TokenizeError } from "./tokenize.ts";
import type {
  ChoiceNode,
  ChoiceOptionNode,
  IfNode,
  JumpNode,
  LabelNode,
  Node,
  PluginDeclNode,
  PluginNode,
  SayNode,
  ScriptNode,
  SetNode,
} from "./ast.ts";

export type ParseError = {
  message: string;
  span: Span;
  code?: string;
};

export type ParseResult = {
  ast: ScriptNode;
  errors: ParseError[];
};

export function parse(input: string): ParseResult {
  const { tokens, errors: tokenErrors } = tokenize(input);
  const errors: ParseError[] = tokenErrors.map(toParseError);

  let idx = 0;

  const body: Node[] = [];
  while (idx < tokens.length) {
    const tok = tokens[idx];
    switch (tok.kind) {
      case "LabelStart": {
        const label = parseLabel(tokens, () => idx, (n) => (idx = n), errors);
        body.push(label);
        break;
      }
      case "PluginDecl": {
        body.push(pluginDeclFromToken(tok.name, tok.span));
        idx++;
        break;
      }
      case "TextLine": {
        if (tok.text.trim() === "") {
          idx++;
          break;
        }
        errors.push({ message: "text outside label", span: tok.span });
        idx = skipToNextTag(tokens, idx + 1);
        break;
      }
      case "ChoiceStart":
      case "ChoiceItem":
      case "SetTag":
      case "IfTag":
      case "JumpTag":
      case "PluginTag":
      case "End":
        errors.push({ message: "unexpected token outside label", span: tok.span });
        idx = skipToNextTag(tokens, idx + 1);
        break;
      default:
        idx++;
        break;
    }
  }

  const scriptSpan = makeScriptSpan(tokens);
  return { ast: { kind: "Script", body, span: scriptSpan }, errors };
}

function parseLabel(
  tokens: Token[],
  getIdx: () => number,
  setIdx: (n: number) => void,
  errors: ParseError[],
): LabelNode {
  const startTok = tokens[getIdx()];
  const name = startTok.kind === "LabelStart" ? startTok.name : "";
  setIdx(getIdx() + 1);

  const body: Node[] = [];

  while (getIdx() < tokens.length) {
    const tok = tokens[getIdx()];

    if (tok.kind === "End") {
      setIdx(getIdx() + 1);
      return {
        kind: "Label",
        name,
        body,
        span: spanFrom(startTok.span, tok.span),
      };
    }

    if (tok.kind === "LabelStart") {
      errors.push({ message: "label not terminated with end", span: tok.span, code: "E0302" });
      return {
        kind: "Label",
        name,
        body,
        span: spanFrom(startTok.span, prevSpan(tokens, getIdx())),
      };
    }

    switch (tok.kind) {
      case "ChoiceStart": {
        const choice = parseChoice(tokens, getIdx, setIdx, errors);
        body.push(choice);
        break;
      }
      case "SetTag": {
        body.push(setFromToken(tok as SetTagToken));
        setIdx(getIdx() + 1);
        break;
      }
      case "IfTag": {
        body.push(ifFromToken(tok as IfTagToken));
        setIdx(getIdx() + 1);
        break;
      }
      case "JumpTag": {
        body.push(jumpFromToken(tok as JumpTagToken));
        setIdx(getIdx() + 1);
        break;
      }
      case "PluginTag": {
        body.push(pluginFromToken(tok as PluginTagToken));
        setIdx(getIdx() + 1);
        break;
      }
      case "PluginDecl":
        errors.push({ message: "plugin allowlist declaration is top-level only", span: tok.span });
        setIdx(skipToNextTag(tokens, getIdx() + 1));
        break;
      case "TextLine": {
        if (tok.text.trim() === "") {
          setIdx(getIdx() + 1);
          break;
        }
        const say = parseSay(tokens, getIdx, setIdx);
        body.push(say);
        break;
      }
      case "ChoiceItem":
        errors.push({ message: "choice item outside choice", span: tok.span });
        setIdx(skipToNextTag(tokens, getIdx() + 1));
        break;
      default:
        setIdx(getIdx() + 1);
        break;
    }
  }

  errors.push({ message: "label not terminated with end", span: startTok.span, code: "E0302" });
  return {
    kind: "Label",
    name,
    body,
    span: spanFrom(startTok.span, prevSpan(tokens, tokens.length)),
  };
}

function parseChoice(
  tokens: Token[],
  getIdx: () => number,
  setIdx: (n: number) => void,
  errors: ParseError[],
): ChoiceNode {
  const startTok = tokens[getIdx()];
  setIdx(getIdx() + 1);

  const options: ChoiceOptionNode[] = [];

  while (getIdx() < tokens.length) {
    const tok = tokens[getIdx()];

    if (tok.kind === "End") {
      setIdx(getIdx() + 1);
      return {
        kind: "Choice",
        options,
        span: spanFrom(startTok.span, tok.span),
      };
    }

    if (tok.kind === "LabelStart" || tok.kind === "ChoiceStart") {
      errors.push({ message: "choice not terminated with end", span: tok.span, code: "E0302" });
      return {
        kind: "Choice",
        options,
        span: spanFrom(startTok.span, prevSpan(tokens, getIdx())),
      };
    }

    switch (tok.kind) {
      case "ChoiceItem": {
        options.push(choiceOptionFromToken(tok));
        setIdx(getIdx() + 1);
        break;
      }
      case "SetTag":
      case "IfTag":
      case "JumpTag":
      case "PluginTag": {
        errors.push({ message: "tag not allowed inside choice", span: tok.span });
        setIdx(skipToNextTag(tokens, getIdx() + 1));
        break;
      }
      case "PluginDecl": {
        errors.push({ message: "plugin allowlist declaration is top-level only", span: tok.span });
        setIdx(skipToNextTag(tokens, getIdx() + 1));
        break;
      }
      case "TextLine": {
        errors.push({ message: "invalid line inside choice", span: tok.span });
        setIdx(skipToNextTag(tokens, getIdx() + 1));
        break;
      }
      default:
        setIdx(getIdx() + 1);
        break;
    }
  }

  errors.push({ message: "choice not terminated with end", span: startTok.span, code: "E0302" });
  return {
    kind: "Choice",
    options,
    span: spanFrom(startTok.span, prevSpan(tokens, tokens.length)),
  };
}

function parseSay(
  tokens: Token[],
  getIdx: () => number,
  setIdx: (n: number) => void,
): SayNode {
  const lines: TextLineToken[] = [];
  const startTok = tokens[getIdx()] as TextLineToken;

  while (getIdx() < tokens.length) {
    const tok = tokens[getIdx()];
    if (tok.kind !== "TextLine") break;
    if (tok.text.trim() === "") {
      setIdx(getIdx() + 1); // consume blank line
      break;
    }
    lines.push(tok);
    setIdx(getIdx() + 1);
  }

  const text = lines.map((l) => l.text).join("\n");
  const endSpan = lines.length > 0 ? lines[lines.length - 1].span : startTok.span;

  return {
    kind: "Say",
    text,
    span: spanFrom(startTok.span, endSpan),
  };
}

function choiceOptionFromToken(tok: ChoiceItemToken): ChoiceOptionNode {
  return {
    kind: "ChoiceOption",
    text: tok.text,
    to: tok.to,
    span: tok.span,
  };
}

function setFromToken(tok: SetTagToken): SetNode {
  return {
    kind: "Set",
    name: tok.name,
    value: literalToValue(tok.value),
    span: tok.span,
  };
}

function literalToValue(value: SetTagToken["value"]): SetNode["value"] {
  switch (value.kind) {
    case "Boolean":
      return value.value;
    case "Number":
      return value.value;
    case "String":
      return value.value;
  }
}

function ifFromToken(tok: IfTagToken): IfNode {
  return {
    kind: "If",
    name: tok.name,
    negated: tok.negated,
    equals: tok.equals ? literalToValue(tok.equals) : undefined,
    to: tok.to,
    span: tok.span,
  };
}

function jumpFromToken(tok: JumpTagToken): JumpNode {
  return {
    kind: "Jump",
    to: tok.to,
    span: tok.span,
  };
}

function pluginDeclFromToken(name: string, span: Span): PluginDeclNode {
  return {
    kind: "PluginDecl",
    name,
    span,
  };
}

function pluginFromToken(tok: PluginTagToken): PluginNode {
  return {
    kind: "Plugin",
    name: tok.name,
    attrs: tok.attrs.map((attr) => ({ key: attr.key, value: attr.value })),
    span: tok.span,
  };
}

function toParseError(err: TokenizeError): ParseError {
  return { message: err.message, span: err.span };
}

function spanFrom(start: Span, end: Span): Span {
  return { start: start.start, end: end.end };
}

function prevSpan(tokens: Token[], idx: number): Span {
  if (idx <= 0) return tokens[0]?.span ?? fallbackSpan();
  return tokens[idx - 1]?.span ?? fallbackSpan();
}

function fallbackSpan(): Span {
  return { start: { line: 1, col: 1 }, end: { line: 1, col: 1 } };
}

function makeScriptSpan(tokens: Token[]): Span {
  if (tokens.length === 0) return fallbackSpan();
  return spanFrom(tokens[0].span, tokens[tokens.length - 1].span);
}

function skipToNextTag(tokens: Token[], start: number): number {
  for (let i = start; i < tokens.length; i++) {
    const k = tokens[i].kind;
    if (k === "LabelStart" || k === "PluginDecl" || k === "ChoiceStart" || k === "End") return i;
  }
  return tokens.length;
}
