# f-core20260403

Minimal secure runtime prototype for command plugins in Deno/TypeScript.  
Deno/TypeScriptで動く、コマンドプラグイン向け最小セキュアランタイムのプロトタイプです。

## Status / 現状

- EN: This repository is an early-stage implementation focused on security boundaries and deterministic behavior.
- JA: このリポジトリは、セキュリティ境界と決定的挙動を優先した初期実装段階です。

- EN: Implemented command plugins: `say`, `choice`, `set`.
- JA: 実装済みコマンドプラグイン: `say`、`choice`、`set`。

## Design Goals / 設計目標

- EN: Minimal core.
- JA: 最小限のコア。

- EN: Zero runtime dependencies.
- JA: ランタイム依存ゼロ。

- EN: No `eval`/`new Function` style arbitrary execution.
- JA: `eval`/`new Function` 型の任意実行を禁止。

- EN: Plugin execution through controlled interfaces.
- JA: 制御されたインターフェース経由でのプラグイン実行。

## Quick Start / クイックスタート

### Prerequisites / 前提

- EN: Deno 2.6+
- JA: Deno 2.6以上

### Run Tests / テスト実行

```bash
deno task test
```

- EN: Current test suite validates loader checks, expression safety, context shape, and runtime behavior.
- JA: 現行テストはローダー検証、式評価安全性、context形状、ランタイム挙動を確認します。

## Runtime Model / 実行モデル

1. EN: The host receives an IR command `{ op, args }`.  
   JA: ホストは IR コマンド `{ op, args }` を受け取ります。
2. EN: `loadPlugin(op)` loads `./plugins/<op>.ts` after strict name validation.  
   JA: `loadPlugin(op)` は厳格な名前検証後に `./plugins/<op>.ts` を読み込みます。
3. EN: Plugin executes with a minimal context (`vars`, `jump`, `next`).  
   JA: プラグインは最小context（`vars`、`jump`、`next`）で実行されます。
4. EN: Result is returned as updated vars and flow control flags.  
   JA: 更新後の変数と進行制御フラグが結果として返ります。

## Available Commands / 利用可能コマンド

- EN: See detailed command specs in [`docs/COMMANDS.md`](./docs/COMMANDS.md).
- JA: コマンドの詳細仕様は [`docs/COMMANDS.md`](./docs/COMMANDS.md) を参照してください。

## Security Baseline / セキュリティ基本方針

- EN: `opName` must match `^[a-z0-9_]+$`.
- JA: `opName` は `^[a-z0-9_]+$` のみ許可します。

- EN: Plugin module path is fixed to `./plugins/${opName}.ts` relative to `import.meta.url`.
- JA: プラグインパスは `import.meta.url` 基準の `./plugins/${opName}.ts` に固定します。

- EN: Expression evaluation allows only `^`-prefixed safe operators.
- JA: 式評価は `^` プレフィックスの安全演算子のみ許可します。

- EN: Division by zero in `^/` is explicitly rejected.
- JA: `^/` のゼロ除算は明示的に拒否します。

- EN: External-facing errors are sanitized.
- JA: 外部向けエラーはサニタイズします。

## ADR / 設計記録

- EN: Security design decision is documented in ADR.
- JA: セキュリティ設計判断はADRに記録しています。

- [`adr/ADR-F-CORE20260403-CORE-20260413-01-secure-plugin-runtime-boundary.md`](./adr/ADR-F-CORE20260403-CORE-20260413-01-secure-plugin-runtime-boundary.md)

## Known Concerns / 既知の懸念

- EN: Current concerns and risk candidates are tracked in [`docs/CONCERNS.md`](./docs/CONCERNS.md).
- JA: 現段階の懸念点とリスク候補は [`docs/CONCERNS.md`](./docs/CONCERNS.md) に整理しています。
