// parser/ast.ts
import type { Span } from "./token.ts";

export type Node =
  | ScriptNode
  | LabelNode
  | PluginDeclNode
  | SayNode
  | ChoiceNode
  | SetNode
  | IfNode
  | JumpNode
  | PluginNode;

export type ScriptNode = {
  kind: "Script";
  body: Node[];
  span: Span;
};

export type LabelNode = {
  kind: "Label";
  name: string;
  body: Node[];
  span: Span;
};

export type PluginDeclNode = {
  kind: "PluginDecl";
  name: string;
  span: Span;
};

export type SayNode = {
  kind: "Say";
  text: string;
  span: Span;
};

export type ChoiceNode = {
  kind: "Choice";
  options: ChoiceOptionNode[];
  span: Span;
};

export type ChoiceOptionNode = {
  kind: "ChoiceOption";
  text: string;
  to: string;
  span: Span;
};

export type SetNode = {
  kind: "Set";
  name: string;
  value: SetValue;
  span: Span;
};

export type IfNode = {
  kind: "If";
  name: string;
  negated: boolean;
  equals?: SetValue;
  to: string;
  span: Span;
};

export type JumpNode = {
  kind: "Jump";
  to: string;
  span: Span;
};

export type PluginNode = {
  kind: "Plugin";
  name: string;
  attrs: PluginAttrNode[];
  span: Span;
};

export type PluginAttrNode = {
  key: string;
  value: string;
};

export type SetValue = boolean | number | string;
