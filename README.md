# f-core20260403

Minimal secure runtime prototype for command plugins in Deno/TypeScript.\
Deno/TypeScriptで動く、コマンドプラグイン向け最小セキュアランタイムのプロトタイプです。

## Status / 現状

- EN: This repository is an early-stage implementation focused on security boundaries and
  deterministic behavior.
- JA: このリポジトリは、セキュリティ境界と決定的挙動を優先した初期実装段階です。

- EN: Public command plugins: `say`, `choice`, `set`, `asset`, `effect`, `menu`.
- JA: 公開コマンドプラグイン: `say`、`choice`、`set`、`asset`、`effect`、`menu`。

- EN: Internal test operations may exist in source (and some in manifest for runtime checks) and are
  not part of the public command contract.
- JA:
  セキュリティ検証・ランタイム検証のための内部テスト用オペレーションがソース/マニフェストに存在する場合がありますが、公開コマンド契約には含みません。

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

- EN: Current test suite validates worker isolation behavior, expression safety, context shape, and
  runtime behavior.
- JA: 現行テストはWorker分離挙動、式評価安全性、context形状、ランタイム挙動を確認します。

### Run Demo Host / デモホスト起動

```bash
mkdir -p assets
# 任意の画像を assets/sample.jpg として配置
deno task demo:serve
```

- EN: Open `http://127.0.0.1:8000/` in your browser.
- JA: ブラウザで `http://127.0.0.1:8000/` を開いてください。

- EN: `sample.jpg` is referenced by the built-in demo scenario in `scripts/demo_server.ts`.
- JA: `scripts/demo_server.ts` の内蔵デモシナリオは `sample.jpg` を参照します。

### Manifest Automation / マニフェスト自動化

```bash
deno task manifest:check
# update requires signing private key in env
FCORE_MANIFEST_PRIVATE_KEY_PKCS8_BASE64=... deno task manifest:update
```

- EN: `manifest:check` validates manifest hashes and Ed25519 signature.
- JA: `manifest:check` はマニフェストのハッシュ整合性とEd25519署名を検証します。

## Runtime Model / 実行モデル

1. EN: The host receives an IR command `{ op, args }`.\
   JA: ホストは IR コマンド `{ op, args }` を受け取ります。
2. EN: Runtime verifies manifest signature and allowlist, then sends execution to a resident Worker
   host.\
   JA: ランタイムはマニフェスト署名検証とallowlist検証を行い、常駐Workerホストへ実行を委譲します。
3. EN: Runtime posts `{ op, args, vars, pluginSource }`, and Worker re-validates op and integrity
   before loading.\
   JA: ランタイムは `{ op, args, vars, pluginSource }`
   を送信し、Worker側で命令名と整合性を再検証してからロードします。
4. EN: Worker executes plugin with minimal context (`vars`, `jump`, `next`, `suspend`, `ui.dispatch`).\
   JA:
   Workerは命令名を検証してプラグインを読み込み、最小context（`vars`、`jump`、`next`、`suspend`、`ui.dispatch`）で実行します。
5. EN: Worker returns serializable result (`varsPatch`, `jumpTo`, `requestedNext`, `suspended`,
   `renderCommands`) and main thread applies it.\
   JA: Workerはシリアライズ可能な結果（`varsPatch`, `jumpTo`,
   `requestedNext`, `suspended`, `renderCommands`）を返し、メインスレッドが適用します。

## Available Commands / 利用可能コマンド

- EN: See detailed command specs in [`docs/COMMANDS.md`](./docs/COMMANDS.md).
- JA: コマンドの詳細仕様は [`docs/COMMANDS.md`](./docs/COMMANDS.md) を参照してください。

- EN: Public command contract is allowlisted and documented; test-only operations are not
  API-stable.
- JA: 公開コマンド契約はallowlistで管理し文書化します。テスト専用オペレーションはAPI互換対象外です。

## Security Baseline / セキュリティ基本方針

- EN: `opName` must match `^[a-z0-9_]+$`.
- JA: `opName` は `^[a-z0-9_]+$` のみ許可します。

- EN: Plugin module path is fixed to `./plugins/${opName}.ts` relative to `import.meta.url`.
- JA: プラグインパスは `import.meta.url` 基準の `./plugins/${opName}.ts` に固定します。

- EN: Worker is launched with `deno: { permissions: "none" }`.
- JA: Workerは `deno: { permissions: "none" }` で起動します。

- EN: Manifest integrity is verified by Ed25519 signature before execution.
- JA: 実行前にEd25519署名でマニフェスト自体の整合性を検証します。

- EN: Plugin source integrity is verified via SHA-256 manifest pins before execution.
- JA: 実行前にSHA-256マニフェスト照合でプラグインソース整合性を検証します。

- EN: Expression evaluation allows only `^`-prefixed safe operators.
- JA: 式評価は `^` プレフィックスの安全演算子のみ許可します。

- EN: Variables with `_` prefix are reserved and blocked from plugin writes.
- JA: `_` プレフィックス変数は予約領域とし、プラグイン書き込みを禁止します。

- EN: `jump` and `next` are mutually exclusive per plugin execution.
- JA: 1回のプラグイン実行で `jump` と `next` は排他制御されます。

- EN: Division by zero in `^/` is explicitly rejected.
- JA: `^/` のゼロ除算は明示的に拒否します。

- EN: Worker execution is timeout-guarded (default `1000ms`) and terminated on overrun.
- JA: Worker実行はタイムアウト（デフォルト `1000ms`）で監視され、超過時は強制終了されます。

- EN: Input/output payload sizes are constrained to prevent memory-pressure DoS.
- JA: メモリ圧迫型DoS対策として、入出力ペイロードサイズを制限しています。

- EN: External-facing errors are sanitized.
- JA: 外部向けエラーはサニタイズします。

## ADR / 設計記録

- EN: Security design decision is documented in ADR.
- JA: セキュリティ設計判断はADRに記録しています。

- [`adr/ADR-F-CORE20260403-CORE-20260413-01-secure-plugin-runtime-boundary.md`](./adr/ADR-F-CORE20260403-CORE-20260413-01-secure-plugin-runtime-boundary.md)

## Known Concerns / 既知の懸念

- EN: Current concerns and risk candidates are tracked in [`docs/CONCERNS.md`](./docs/CONCERNS.md).
- JA: 現段階の懸念点とリスク候補は [`docs/CONCERNS.md`](./docs/CONCERNS.md) に整理しています。
