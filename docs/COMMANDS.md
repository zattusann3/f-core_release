# Available Commands (EN/JA)

This document summarizes commands currently available in this runtime.
このドキュメントは、現時点でこのランタイムで利用できるコマンドをまとめたものです。

## Command Invocation / 呼び出し形式

- EN: Commands are executed via IR as `{ op: "<command>", args: { ... } }`.
- JA: コマンドはIR `{ op: "<command>", args: { ... } }` 形式で実行されます。

## Public Commands / 公開コマンド一覧

| Command  | Required Args                          | Behavior (EN)                                                                          | 機能 (JA)                                                                |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `say`    | `text: string`                         | Stores the line into variable `last_say` and requests normal progression (`next`).     | 発話テキストを変数 `last_say` に保存し、通常進行（`next`）を要求します。 |
| `choice` | `to: string`                           | Requests a jump to the specified label (`jump(to)`).                                   | 指定ラベルへ分岐する進行要求（`jump(to)`）を行います。                   |
| `set`    | `target: string`, `expression: string` | Evaluates a safe expression and writes the result into `target`, then requests `next`. | 安全式を評価して `target` 変数へ代入し、その後 `next` を要求します。     |

## Internal/Test Operations (Non-Contract) / 内部・テスト用オペレーション（公開契約外）

| Operation  | Status (EN)                                                                    | 状態 (JA)                                                                 |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `badhash`  | Listed only for integrity rejection tests and intentionally fails hash check.  | 整合性拒否テスト用で、意図的にハッシュ不一致となる。                      |
| `conflict` | Listed for flow-conflict tests (`jump` and `next` mixed request rejection).   | フロー競合テスト用（`jump`/`next` 混在要求拒否の確認）。                  |
| `hang`     | Listed for timeout/termination tests (infinite loop guard).                   | タイムアウト強制終了テスト用（無限ループ防止確認）。                      |
| `unlisted` | Source file exists but is intentionally not allowlisted and must be rejected. | ソースは存在するが意図的にallowlist未登録で、実行拒否されるべき対象。     |

- EN: Only the public commands (`say`, `choice`, `set`) are part of the runtime command contract.
- JA: ランタイムの公開コマンド契約に含まれるのは `say`、`choice`、`set` のみです。

## `set` Expression Rules / `set` の式ルール

- EN: Expression format is exactly `<left> <operator> <right>` (3 tokens). Quoted string literals
  are supported.
- JA: 式フォーマットは厳密に
  `<left> <operator> <right>`（3トークン）です。クォート付き文字列リテラルを利用できます。

- EN: Only `^`-prefixed operators are allowed.
- JA: 演算子は `^` プレフィックス付きのみ許可されます。

- EN: Raw operators like `+ - * / = > <` are rejected.
- JA: 生演算子 `+ - * / = > <` などは拒否されます。

- EN: String literals can be written with single or double quotes (example: `"hello" ^+ "world"`).
- JA: 文字列リテラルはシングル/ダブルクォートで記述できます（例: `"hello" ^+ "world"`）。

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

- EN: Plugins receive only `vars`, `jump`, and `next`.
- JA: プラグインへ渡されるのは `vars`、`jump`、`next` のみです。

- EN: No `Deno`, filesystem, or network capability is provided through context.
- JA: `context` 経由で `Deno`・ファイルシステム・ネットワーク機能は提供されません。

- EN: Variables starting with `_` are reserved and cannot be written from plugins.
- JA: `_` で始まる変数は予約領域として扱い、プラグインから書き込めません。

- EN: Flow actions are exclusive. A plugin command can request either `jump` or `next`, not both.
- JA: 進行操作は排他です。1つのプラグイン実行で `jump` と `next` の同時要求はできません。

## Notes / 補足

- EN: At this stage, only the commands listed above are implemented.
- JA: 現段階で実装済みのコマンドは上記のみです。

- EN: Test-only plugins may exist in source for runtime verification and are out of public contract.
- JA:
  ランタイム検証用のテスト専用プラグインがソースに存在する場合がありますが、公開仕様の対象外です。

- EN: Before execution, plugin source is integrity-checked (SHA-256 manifest) inside Worker.
- JA: 実行前にWorker内部でプラグインソースの整合性検証（SHA-256マニフェスト照合）を行います。
