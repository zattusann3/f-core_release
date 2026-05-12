# Scenario Tag Reference (EN/JA)

This document is the canonical reference for scenario-writing tags in the current parser (`src/parser.ts`).\
このドキュメントは、現行パーサー（`src/parser.ts`）におけるシナリオ記法タグの正規リファレンスです。

## Overview / 概要

- EN: Scenario is parsed line-by-line.
- JA: シナリオは行単位でパースされます。

- EN: Text outside label blocks is ignored.
- JA: ラベルブロック外のテキストは無視されます。

- EN: Empty lines inside labels are ignored.
- JA: ラベル内の空行は無視されます。

## Supported Tags / 対応タグ

| Tag / Form | EN | JA |
| --- | --- | --- |
| `{{# label: name }}` | Open label block | ラベルブロック開始 |
| `{{ end }}` | Close current block (`label` or `choice`) | 現在ブロック終了（`label` / `choice`） |
| `{{# choice}}` + `- text -> label` | Choice/menu block | 選択肢ブロック |
| `{{ @opName key="value" ... }}` | Generic inline command | 汎用インラインコマンド |
| <code>```fcore:opName ... ```</code> | JSON command block | JSONコマンドブロック |
| `@release ...` | Asset release directive (parser/session handled) | アセット解放ディレクティブ（parser/session処理） |

## Block Syntax / ブロック構文

### Label Block / ラベルブロック

```text
{{# label: start }}
Hello
{{ end }}
```

- EN: Label name regex is `[A-Za-z0-9_]+`.
- JA: ラベル名は `[A-Za-z0-9_]+` に一致する必要があります。

- EN: Duplicate label names are parse errors.
- JA: ラベル名の重複はパースエラーです。

### Choice Block / 選択肢ブロック

```text
{{# choice}}
- Go -> end_label
- Stay -> start
{{ end }}
```

- EN: Choice item format is `- <text> -> <label>`.
- JA: 選択肢1行の形式は `- <text> -> <label>` です。

- EN: Parsed as `op: "menu", args: { choices: [...] }`.
- JA: `op: "menu", args: { choices: [...] }` に変換されます。

## Generic Inline Command / 汎用インラインコマンド

```text
{{ @asset type="bg" src="sample.jpg" }}
```

- EN: `opName` regex is `[A-Za-z0-9_]+`.
- JA: `opName` は `[A-Za-z0-9_]+` です。

- EN: Args are parsed as string key/value pairs only.
- JA: 引数は文字列キー/値としてのみ解釈されます。

- EN: Value must use double quotes (`"`).
- JA: 値はダブルクォート（`"`）必須です。

- EN: Supported escapes in quoted values are `\"` and `\\`.
- JA: クォート値内で使えるエスケープは `\"` と `\\` です。

## JSON Command Block / JSONコマンドブロック

````text
```fcore:setup_game
{"key1":"value1","key2":123,"key3":[1,2,3]}
```
````

- EN: Block body is parsed with `JSON.parse`.
- JA: ブロック本体は `JSON.parse` でパースされます。

- EN: Top-level JSON value must be an object.
- JA: JSON のトップレベルはオブジェクト必須です。

- EN: Unterminated block or malformed JSON is a parse error.
- JA: ブロック未終端やJSON不正はパースエラーです。

## `@release` Directive / `@release` ディレクティブ

```text
@release bg/intro.jpg [fg/hero.png],(se/click.ogg)
```

- EN: Parsed as `op: "release_assets", args: { ids: [...] }`.
- JA: `op: "release_assets", args: { ids: [...] }` に変換されます。

- EN: Accepts whitespace/comma-separated IDs.
- JA: ID は空白区切り・カンマ区切りに対応します。

- EN: `[]`, `()`, `{}` wrappers around each token are stripped.
- JA: 各トークンの `[]` / `()` / `{}` ラッパーは除去されます。

- EN: Limits: max 32 IDs, max 4096 bytes (serialized args).
- JA: 制限: 最大32件、引数シリアライズ後4096バイトまで。

- EN: Rejects dangerous IDs (`..`, `\`, scheme like `http:`, `//`, invalid chars).
- JA: 危険なID（`..`、`\`、`http:` などのスキーム、`//`、不正文字）を拒否します。

## Plain Text / プレーンテキスト

- EN: Non-tag lines inside a label are converted to:
  - `{ op: "say", args: { text: "<original line>" } }`
- JA: ラベル内の非タグ行は次に変換されます:
  - `{ op: "say", args: { text: "<元の行文字列>" } }`

## Parse Error Behavior / パースエラー時の挙動

- EN: Parser currently throws a generic `Error("parse error")`.
- JA: 現在のパーサーは汎用 `Error("parse error")` を投げます。

- EN: Invalid tag structure should be fixed in scenario text, not at runtime.
- JA: 不正タグ構造はランタイムではなくシナリオテキスト側で修正してください。

## Full Example / 全体例

````text
{{# label: start }}
Welcome.

{{ @asset type="bg" src="sample.jpg" }}

```fcore:set
{"target":"hp","expression":"10 ^- 1"}
```

{{# choice}}
- Continue -> next
- Quit -> end
{{ end }}
{{ end }}

{{# label: next }}
@release bg/old_scene.jpg
Next scene.
{{ end }}
````
