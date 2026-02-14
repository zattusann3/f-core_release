// parser/validate_ast.ts
import type { Span } from "./token.ts";
import type { ChoiceNode, LabelNode, PluginDeclNode, PluginNode, ScriptNode } from "./ast.ts";
import { isReservedKey } from "../util/safe_dict.ts";

export type AstValidationError = {
  code: string;
  message: string;
  span: Span;
};

export function validateAst(ast: ScriptNode): AstValidationError[] {
  const errors: AstValidationError[] = [];
  const seen = new Set<string>();
  const allowlist = new Set<string>();
  let hasStart = false;

  for (const node of ast.body) {
    if (node.kind !== "PluginDecl") continue;
    const decl = node as PluginDeclNode;
    if (!isValidPluginName(decl.name)) {
      errors.push({
        code: "E0320",
        message: "invalid plugin name",
        span: decl.span,
      });
      continue;
    }
    if (allowlist.has(decl.name)) {
      errors.push({
        code: "E0321",
        message: "duplicate plugin allowlist entry",
        span: decl.span,
      });
      continue;
    }
    allowlist.add(decl.name);
  }

  for (const node of ast.body) {
    if (node.kind !== "Label") continue;
    const label = node as LabelNode;

    if (isReservedKey(label.name)) {
      errors.push({
        code: "E0505",
        message: "reserved label name not allowed",
        span: label.span,
      });
    }

    if (seen.has(label.name)) {
      errors.push({
        code: "E0304",
        message: "duplicate label",
        span: label.span,
      });
    } else {
      seen.add(label.name);
    }

    if (label.name === "start") hasStart = true;

    for (const child of label.body) {
      if (child.kind !== "Choice") continue;
      const choice = child as ChoiceNode;
      if (choice.options.length === 0) {
        errors.push({
          code: "E0203",
          message: "choice.options must be non-empty",
          span: choice.span,
        });
      }
    }

    for (const child of label.body) {
      if (child.kind !== "Plugin") continue;
      const plugin = child as PluginNode;
      if (!isValidPluginName(plugin.name)) {
        errors.push({
          code: "E0320",
          message: "invalid plugin name",
          span: plugin.span,
        });
        continue;
      }
      if (!allowlist.has(plugin.name)) {
        errors.push({
          code: "E0322",
          message: "plugin is not allowlisted",
          span: plugin.span,
        });
      }
    }
  }

  if (!hasStart) {
    errors.push({
      code: "E0301",
      message: "missing start label",
      span: ast.span,
    });
  }

  return errors;
}

const CORE_TAG_NAMES = new Set(["label", "choice", "end", "set", "if", "jump", "plugin"]);

function isValidPluginName(name: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(name)) return false;
  if (name === "plugin") return false;
  return !CORE_TAG_NAMES.has(name);
}
