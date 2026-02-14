# Parser Specification (L1)

This document defines the tokenizer and AST model for L1 parsing.

L1 recognizes only three tags:

- label
- choice
- end

Anything else is treated as text, but any "{{" inside text is a hard error.

---

## Spans

All tokens and AST nodes carry a span.

Span is a half-open range:

- `start` is the first character (inclusive)
- `end` is the character immediately after the span (exclusive)

Positions are 1-based:

- `line` starts at 1
- `col` starts at 1

---

## Tokenization Rules

Tokenizer is stateless (no knowledge of choice/label context).

### Tag Tokens

#### LabelStart

Matches exactly:

`{{# label: <name> }}`

- `<name>` matches `[A-Za-z][A-Za-z0-9_-]*`

#### ChoiceStart

Matches exactly:

`{{# choice}}`

#### End

Matches exactly:

`{{ end }}`

### Text Tokens

Each input line becomes a `TextLine` token if it is not a tag line.

- TextLine may be empty (blank line).
- If a TextLine contains `{{`, this is an error (strict).

### ChoiceItem Tokens

Tokenizer may emit `ChoiceItem` tokens for lines that match:

`- <text> -> <label>`

Whitespace rules are strict:

- Line must start with `"- "`
- The arrow must be exactly `" -> "`
- Tabs are forbidden

`<label>` uses the same rule as label names.

Note: Tokenizer does not validate whether a ChoiceItem appears inside a choice block.

---

## AST Model

Parser groups tokens into AST nodes.

### Script

```
{
  kind: "Script",
  body: Node[],
  span: Span
}
```

### Label

```
{
  kind: "Label",
  name: string,
  body: Node[],
  span: Span
}
```

### Say

```
{
  kind: "Say",
  text: string,
  span: Span
}
```

### Choice

```
{
  kind: "Choice",
  options: ChoiceOption[],
  span: Span
}
```

### ChoiceOption

```
{
  kind: "ChoiceOption",
  text: string,
  to: string,
  span: Span
}
```

---

## Parser Structure

Recommended state machine:

- TopLevel (outside any label)
- InLabel
- InChoice

Transitions:

- `LabelStart` -> InLabel
- `ChoiceStart` -> InChoice (only valid inside a label)
- `End` inside choice -> InLabel
- `End` inside label -> TopLevel

---

## Error Recovery

On an invalid line or tag:

- Emit an error
- Skip to the next line that matches a tag start or `{{ end }}`
- Continue collecting errors

---

## Say Grouping

Say paragraphs are formed by grouping consecutive non-empty TextLine tokens.
Blank lines terminate a paragraph.
