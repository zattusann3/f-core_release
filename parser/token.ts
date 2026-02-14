// parser/token.ts

export type Position = {
  line: number; // 1-based
  col: number; // 1-based
};

export type Span = {
  start: Position; // inclusive
  end: Position; // exclusive
};

export type Token =
  | LabelStartToken
  | PluginDeclToken
  | ChoiceStartToken
  | EndToken
  | TextLineToken
  | ChoiceItemToken
  | SetTagToken
  | IfTagToken
  | JumpTagToken
  | PluginTagToken;

export type LabelStartToken = {
  kind: "LabelStart";
  name: string;
  span: Span;
};

export type ChoiceStartToken = {
  kind: "ChoiceStart";
  span: Span;
};

export type PluginDeclToken = {
  kind: "PluginDecl";
  name: string;
  span: Span;
};

export type EndToken = {
  kind: "End";
  span: Span;
};

export type TextLineToken = {
  kind: "TextLine";
  text: string; // may be empty (blank line)
  span: Span;
};

export type ChoiceItemToken = {
  kind: "ChoiceItem";
  text: string;
  to: string;
  span: Span;
};

export type SetTagToken = {
  kind: "SetTag";
  name: string;
  value: SetLiteralValue;
  span: Span;
};

export type IfTagToken = {
  kind: "IfTag";
  name: string;
  negated: boolean;
  equals?: SetLiteralValue;
  to: string;
  span: Span;
};

export type JumpTagToken = {
  kind: "JumpTag";
  to: string;
  span: Span;
};

export type PluginTagToken = {
  kind: "PluginTag";
  name: string;
  attrs: PluginAttr[];
  span: Span;
};

export type PluginAttr = {
  key: string;
  value: string;
};

export type SetLiteralValue =
  | { kind: "Boolean"; value: boolean }
  | { kind: "Number"; value: number }
  | { kind: "String"; value: string };
