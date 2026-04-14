# Available Commands (EN/JA)

This document summarizes commands currently available in this runtime.
このドキュメントは、現時点でこのランタイムで利用できるコマンドをまとめたものです。

## Command Invocation / 呼び出し形式

- EN: Runtime command IR is `{ op: "<command>", args: { ... } }`.
- JA: ランタイムのコマンドIRは `{ op: "<command>", args: { ... } }` です。

- EN: Parser supports both inline and JSON-block command syntax.
- JA: パーサーはインライン構文とJSONコードブロック構文の両方をサポートします。

### Parser Syntax / パーサー構文

- Inline:
  - EN: `{{ @opName key1="value1" key2="value2" }}`
  - JA: `{{ @opName key1="value1" key2="value2" }}`
  - EN: Inline args are parsed as strings.
  - JA: インライン引数は文字列として解釈されます。

- JSON code block:
  - EN:
    ````text
    ```fcore:opName
    {"nested":{"x":1},"arr":[1,2,3]}
    ```
    ````
  - JA:
    ````text
    ```fcore:opName
    {"nested":{"x":1},"arr":[1,2,3]}
    ```
    ````
  - EN: Block body is parsed by `JSON.parse` and must be a top-level object.
  - JA: ブロック本体は `JSON.parse` で解釈され、トップレベルはオブジェクトである必要があります。

## Public Commands / 公開コマンド一覧

| Command  | Required Args                                      | Behavior (EN)                                                               | 機能 (JA)                                                                             |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `say`    | `text: string`                                     | Stores text into `last_say` and requests `next`.                           | テキストを `last_say` に保存し、`next` を要求します。                                |
| `choice` | `to: string`                                       | Requests `jump(to)`.                                                        | `jump(to)` を要求します。                                                             |
| `set`    | `target: string`, `expression: string`             | Evaluates safe expression and writes result to `target`, then requests `next`. | 安全式を評価して `target` に代入し、`next` を要求します。                         |
| `asset`  | `type: "bg" \| "fg"`, `src: string`                | Clears target layer and appends an `img` render node.                      | 対象レイヤーをクリアして `img` ノードを描画します。                                   |
| `effect` | `type: "shake" \| "color"`, `targetId`, `value`    | Emits `UpdateCSSVar` commands for visual effects.                           | 演出用の `UpdateCSSVar` コマンドを発行します。                                       |
| `menu`   | `choices: Array<{ text: string; to: string }>`     | Renders buttons and `suspend`s until input arrives, then `jump`s by input. | ボタンを描画して `suspend` し、入力受領後に入力値で `jump` します。                  |

## Render Commands / 描画コマンド

- EN: `ui.dispatch` accepts:
  - `AppendNode { parentId, nodeId, tag, text?, src?, onClickInput?, cssVars? }`
  - `UpdateCSSVar { targetId, vars }`
  - `ClearSubtree { targetId }`
- JA: `ui.dispatch` が受け付ける型:
  - `AppendNode { parentId, nodeId, tag, text?, src?, onClickInput?, cssVars? }`
  - `UpdateCSSVar { targetId, vars }`
  - `ClearSubtree { targetId }`

## `set` Expression Rules / `set` の式ルール

- EN: Format must be exactly `<left> <operator> <right>` (3 tokens).
- JA: 形式は厳密に `<left> <operator> <right>`（3トークン）です。

- EN: Only `^`-prefixed operators are allowed.
- JA: 演算子は `^` プレフィックス付きのみ許可されます。

- EN: Raw operators (`+ - * / = > < ...`) are rejected.
- JA: 生演算子（`+ - * / = > < ...`）は拒否されます。

### Supported Operators / 対応演算子

| Operator | Meaning (EN)                             | 意味 (JA)                   |
| -------- | ---------------------------------------- | --------------------------- |
| `^+`     | numeric addition or string concatenation | 数値加算または文字列結合    |
| `^-`     | numeric subtraction                      | 数値減算                    |
| `^*`     | numeric multiplication                   | 数値乗算                    |
| `^/`     | numeric division (rejects divisor `0`)   | 数値除算（分母 `0` は拒否） |
| `^=`     | strict equality                          | 厳密一致比較                |
| `^!=`    | strict inequality                        | 厳密不一致比較              |
| `^>`     | greater-than (numeric)                   | 数値の大なり比較            |
| `^<`     | less-than (numeric)                      | 数値の小なり比較            |
| `^>=`    | greater-or-equal (numeric)               | 数値の以上比較              |
| `^<=`    | less-or-equal (numeric)                  | 数値の以下比較              |

## Plugin Context Surface / プラグインに渡るContext

- EN: Plugins receive `vars`, `ui.dispatch`, `jump`, `next`, `suspend`.
- JA: プラグインへ渡されるのは `vars`、`ui.dispatch`、`jump`、`next`、`suspend` です。

- EN: No `Deno`, filesystem, or network capability is exposed via context.
- JA: `context` 経由で `Deno`・ファイルシステム・ネットワーク機能は提供されません。

- EN: Variables with `_` prefix are reserved and blocked from plugin writes.
- JA: `_` で始まる変数は予約領域で、プラグインから書き込めません。

- EN: Flow actions are exclusive: only one of `jump`, `next`, `suspend` is allowed per command.
- JA: 進行操作は排他制御で、1実行あたり `jump` / `next` / `suspend` のいずれか1つのみ許可されます。

## Runtime Notes / 実行時補足

- EN: Execution uses a resident Worker host (not per-command Worker spawn).
- JA: 実行は常駐Workerホスト方式で行われます（コマンドごとのWorker再生成ではありません）。

- EN: Worker runs with `deno: { permissions: "none" }`.
- JA: Workerは `deno: { permissions: "none" }` で動作します。

- EN: Plugin source integrity is validated against signed manifest hashes.
- JA: プラグインソース整合性は署名付きマニフェストのハッシュで検証されます。

- EN: Payload size limits are enforced for request/response objects.
- JA: リクエスト/レスポンスのペイロードサイズ制限が適用されます。
