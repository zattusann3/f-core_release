# Available Commands (EN/JA)

This document summarizes commands currently available in this runtime.
このドキュメントは、現時点でこのランタイムで利用できるコマンドをまとめたものです。

## Command Invocation / 呼び出し形式

- EN: Commands are executed via IR as `{ op: "<command>", args: { ... } }`.
- JA: コマンドはIR `{ op: "<command>", args: { ... } }` 形式で実行されます。

## Commands / コマンド一覧

| Command  | Required Args                          | Behavior (EN)                                                                          | 機能 (JA)                                                                 |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `say`    | `text: string`                         | Stores the line into variable `_last_say` and requests normal progression (`next`).    | 発話テキストを変数 `_last_say` に保存し、通常進行（`next`）を要求します。 |
| `choice` | `to: string`                           | Requests a jump to the specified label (`jump(to)`).                                   | 指定ラベルへ分岐する進行要求（`jump(to)`）を行います。                    |
| `set`    | `target: string`, `expression: string` | Evaluates a safe expression and writes the result into `target`, then requests `next`. | 安全式を評価して `target` 変数へ代入し、その後 `next` を要求します。      |

## `set` Expression Rules / `set` の式ルール

- EN: Expression format is exactly `<left> <operator> <right>` (3 tokens).
- JA: 式フォーマットは厳密に `<left> <operator> <right>`（3トークン）です。

- EN: Only `^`-prefixed operators are allowed.
- JA: 演算子は `^` プレフィックス付きのみ許可されます。

- EN: Raw operators like `+ - * / = > <` are rejected.
- JA: 生演算子 `+ - * / = > <` などは拒否されます。

### Supported Operators / 対応演算子

| Operator | Meaning (EN)                           | 意味 (JA)                   |
| -------- | -------------------------------------- | --------------------------- |
| `^+`     | numeric addition                       | 数値加算                    |
| `^-`     | numeric subtraction                    | 数値減算                    |
| `^*`     | numeric multiplication                 | 数値乗算                    |
| `^/`     | numeric division (rejects divisor `0`) | 数値除算（分母 `0` は拒否） |
| `^=`     | strict equality                        | 厳密一致比較                |
| `^!=`    | strict inequality                      | 厳密不一致比較              |
| `^>`     | greater-than (numeric)                 | 数値の大なり比較            |
| `^<`     | less-than (numeric)                    | 数値の小なり比較            |
| `^>=`    | greater-or-equal (numeric)             | 数値の以上比較              |
| `^<=`    | less-or-equal (numeric)                | 数値の以下比較              |

## Plugin Context Surface / プラグインに渡るContext

- EN: Plugins receive only `vars`, `jump`, and `next`.
- JA: プラグインへ渡されるのは `vars`、`jump`、`next` のみです。

- EN: No `Deno`, filesystem, or network capability is provided through context.
- JA: `context` 経由で `Deno`・ファイルシステム・ネットワーク機能は提供されません。

## Notes / 補足

- EN: At this stage, only the commands listed above are implemented.
- JA: 現段階で実装済みのコマンドは上記のみです。
