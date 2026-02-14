// compile/compile.ts
import { parse } from "../parser/parse.ts";
import { validateAst } from "../parser/validate_ast.ts";
import type { AstValidationError } from "../parser/validate_ast.ts";
import type { ParseError } from "../parser/parse.ts";
import type { ScriptNode } from "../parser/ast.ts";
import type { IR, Instruction, NonEmptyArray, ChoiceOption } from "../ir/types.ts";
import { validateIR } from "../ir/validate.ts";
import type { ValidationError } from "../ir/validate.ts";
import { serializeIR } from "../ir/serialize.ts";
import { createSafeRecord, safeSet } from "../util/safe_dict.ts";

export type CompileError = {
  phase: "parse" | "ast-validate" | "ir-validate";
  code?: string;
  message: string;
  span?: ParseError["span"];
  path?: string;
  suggestions?: string[];
};

export type CompileResult =
  | { ok: true; ir: IR; json: string; ast: ScriptNode; warnings: CompileError[] }
  | {
      ok: false;
      errors: CompileError[];
      warnings: CompileError[];
      ast?: ScriptNode;
      ir?: IR;
    };

export type CompileOptions = {
  engineVersion: string;
};

const INPUT_LIMITS = {
  maxChars: 1_000_000,
  maxLines: 50_000,
  maxLineChars: 10_000,
};

export function compileScenario(input: string, options: CompileOptions): CompileResult {
  const limitError = checkInputLimits(input);
  if (limitError) {
    return { ok: false, errors: [limitError], warnings: [] };
  }

  const parsed = parse(input);
  const parseErrors = parsed.errors.map(fromParseError);

  const astErrors = validateAst(parsed.ast).map(fromAstError);

  const earlyErrors = [...parseErrors, ...astErrors];
  if (earlyErrors.length > 0) {
    return { ok: false, errors: earlyErrors, warnings: [], ast: parsed.ast };
  }

  let ir: IR;
  try {
    ir = astToIr(parsed.ast, options.engineVersion);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to build IR";
    return {
      ok: false,
      errors: [
        {
          phase: "ir-validate",
          code: "E0505",
          message,
          path: "$.labels",
        },
      ],
      warnings: [],
      ast: parsed.ast,
    };
  }
  const irValidation = validateIR(ir);
  if (!irValidation.ok) {
    return {
      ok: false,
      errors: irValidation.errors.map(fromIrError),
      warnings: irValidation.warnings.map(fromIrWarning),
      ast: parsed.ast,
      ir,
    };
  }

  const json = serializeIR(ir);
  return {
    ok: true,
    ir,
    json,
    ast: parsed.ast,
    warnings: irValidation.warnings.map(fromIrWarning),
  };
}

function checkInputLimits(input: string): CompileError | null {
  if (input.length > INPUT_LIMITS.maxChars) {
    return {
      phase: "parse",
      code: "E0101",
      message: `input too large (max ${INPUT_LIMITS.maxChars} chars)`,
    };
  }

  let lines = 1;
  let lineLen = 0;
  let maxLineLen = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\n") {
      if (lineLen > maxLineLen) maxLineLen = lineLen;
      lines++;
      lineLen = 0;
      if (lines > INPUT_LIMITS.maxLines) {
        return {
          phase: "parse",
          code: "E0102",
          message: `too many lines (max ${INPUT_LIMITS.maxLines})`,
        };
      }
      continue;
    }
    lineLen++;
    if (lineLen > INPUT_LIMITS.maxLineChars) {
      return {
        phase: "parse",
        code: "E0103",
        message: `line too long (max ${INPUT_LIMITS.maxLineChars} chars)`,
      };
    }
  }

  if (lineLen > maxLineLen) maxLineLen = lineLen;
  return null;
}

function astToIr(ast: ScriptNode, engineVersion: string): IR {
  const labels: Record<string, Instruction[]> = createSafeRecord();
  const plugins = new Set<string>();

  for (const node of ast.body) {
    if (node.kind !== "PluginDecl") continue;
    plugins.add(node.name);
  }

  for (const node of ast.body) {
    if (node.kind !== "Label") continue;

    const instructions: Instruction[] = [];
    for (const child of node.body) {
      if (child.kind === "Say") {
        instructions.push({ op: "say", text: child.text });
      } else if (child.kind === "Choice") {
        if (child.options.length === 0) continue;
        const options = child.options.map((opt) => ({ text: opt.text, to: opt.to })) as NonEmptyArray<
          ChoiceOption
        >;
        instructions.push({
          op: "choice",
          options,
        });
      } else if (child.kind === "Set") {
        instructions.push({
          op: "set",
          name: child.name,
          value: child.value,
        });
      } else if (child.kind === "If") {
        instructions.push({
          op: "if",
          name: child.name,
          negated: child.negated,
          equals: child.equals,
          to: child.to,
        });
      } else if (child.kind === "Jump") {
        instructions.push({
          op: "jump",
          to: child.to,
        });
      } else if (child.kind === "Plugin") {
        const attrs = createSafeRecord<string>();
        for (const attr of child.attrs) attrs[attr.key] = attr.value;
        instructions.push({
          op: "plugin",
          name: child.name,
          attrs,
        });
      }
    }

    instructions.push({ op: "end" });
    // Label names come from the parser allowlist, but keep the dictionary safe anyway.
    const r = safeSet(labels, node.name, instructions);
    if (!r.ok) throw new Error(r.message);
  }

  return {
    schemaVersion: 1,
    engineVersion,
    entry: "start",
    plugins: Array.from(plugins),
    labels,
  };
}

function fromParseError(err: ParseError): CompileError {
  return {
    phase: "parse",
    code: err.code,
    message: err.message,
    span: err.span,
  };
}

function fromAstError(err: AstValidationError): CompileError {
  return {
    phase: "ast-validate",
    code: err.code,
    message: err.message,
    span: err.span,
  };
}

function fromIrError(err: ValidationError): CompileError {
  return {
    phase: "ir-validate",
    code: err.code,
    message: err.message,
    path: err.path,
    suggestions: err.suggestions,
  };
}

function fromIrWarning(
  err: { code: string; message: string; path?: string; suggestions?: string[] },
): CompileError {
  return {
    phase: "ir-validate",
    code: err.code,
    message: err.message,
    path: err.path,
    suggestions: err.suggestions,
  };
}
