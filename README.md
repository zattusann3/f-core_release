# f-core20260403

Minimal secure runtime prototype for command plugins in Deno/TypeScript.\
Deno/TypeScriptで動く、コマンドプラグイン向け最小セキュアランタイムのプロトタイプです。

## Status / 現状

- EN: This repository is an early-stage implementation focused on security boundaries and
  deterministic behavior.
- JA: このリポジトリは、セキュリティ境界と決定的挙動を優先した初期実装段階です。

- EN: Current release channel is **Developer Preview (Beta)**.
- JA: 現在のリリースチャネルは **Developer Preview（Beta）** です。

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

## Project Policy / プロジェクト方針

- EN: This repository is a personal project to build the author's own visual novel.
  Issues and forks are welcome, but pull requests that are outside the author's primary goals are
  generally not merged.
- JA:
  このリポジトリは、作者自身のノベルゲーム制作のための個人プロジェクトです。Issue報告やフォークは歓迎しますが、作者の主目標から外れるPRは原則としてマージしません。

- EN: Forking and private customization are welcome, but do not publish derivative works under the
  exact name `f-core`. Naming such as "f-core derivative" is acceptable.
- JA:
  フォークして自分用に改造することは歓迎しますが、派生版を厳密に `f-core` と名乗ることは避けてください。「f-core派生」のような表記は問題ありません。

- EN: Implementation note: most source code in this repository was authored with assistance from
  GPT-5.3-Codex. Final direction, review, and release decisions are made by the maintainer.
- JA:
  実装注記: このリポジトリのソースコードの大部分は GPT-5.3-Codex の支援で作成されています。最終的な方針決定・レビュー・公開判断はメンテナが行います。

- EN: For contribution intake policy, see [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- JA: コントリビューション受付方針は [`CONTRIBUTING.md`](./CONTRIBUTING.md) を参照してください。

- EN: For naming/branding rules of derivative distributions, see [`docs/BRANDING.md`](./docs/BRANDING.md).
- JA: 派生配布物の命名・ブランド方針は [`docs/BRANDING.md`](./docs/BRANDING.md) を参照してください。

## Support & Responsibility Boundary / サポート範囲と責任境界

- EN: Official support target is local application builds via Tauri.
  Browser/HTML builds are provided for development preview and compatibility checks, and are not
  covered by equivalent support or security guarantees.
- JA:
  公式サポート対象は Tauri によるローカルアプリケーションビルドです。ブラウザ/HTML
  ビルドは開発プレビューおよび互換性検証用として提供し、同等のサポートおよびセキュリティ保証の対象外です。

- EN: f-core is a local-first scenario runtime.
  Official core/host does not provide network communication, account systems, payments, online
  rankings, chat, or external API credential management.
- JA:
  f-core はローカルファーストのシナリオ実行環境です。公式コア/ホストは、ネットワーク通信、アカウント機能、決済、オンラインランキング、チャット、外部API資格情報の管理を提供しません。

- EN: Third-party plugins, external communication adapters, modified forks, and online-service
  integrations are outside official support and official security boundaries.
- JA:
  サードパーティ製プラグイン、外部通信アダプタ、改造版、オンラインサービス連携は、公式サポートおよび公式セキュリティ境界の対象外です。

- EN: Official plugins are limited to audited basic commands that run under zero-permission
  assumptions. Official plugins will not be granted file I/O, network access, OS control, or
  arbitrary JavaScript execution.
- JA:
  公式プラグインは、権限ゼロ前提で動作する監査済みの基本命令セットに限定します。公式プラグインへファイルI/O、ネットワーク通信、OS操作、任意JavaScript実行を許可しません。

- EN: Browser/HTML builds are intended for local preview and client-side validation.
  Production operations such as web hosting, external networking, rankings, chat, and API
  integrations are the developer's responsibility.
- JA:
  ブラウザ/HTML ビルドはローカルプレビューおよびクライアントサイド検証を目的とします。Webホスティング、外部通信、ランキング、チャット、API連携を含む運用は各開発者の責任です。

- EN: Non-goals in official distribution:
  no official chat, no official online ranking, no official account management, no official
  payment features, no official API key/token custody, no official server operations, and no
  support for modified forks.
- JA:
  公式配布の非搭載方針:
  公式チャット通信なし、公式オンラインランキングなし、公式アカウント管理なし、公式決済機能なし、公式APIキー/トークン管理なし、公式サーバー運用なし、改造版サポートなし。

- EN: High-risk features (external communication, rankings, chat, advanced OS integrations) are
  intentionally excluded from official core. If needed, implement them as third-party adapters at
  your own responsibility.
- JA:
  外部通信、ランキング、チャット、特殊なOS連携などの高リスク機能は、公式コアに含めません。必要な場合は、開発者が各自の責任でサードパーティアダプタとして実装してください。

- EN: This project is maintained by an individual. Support is best-effort, with no SLA.
- JA:
  本プロジェクトは個人運営です。サポートはベストエフォートであり、SLAは提供しません。

- EN: In short:
  f-core provides a safe local runtime and minimal official command set. Dangerous permissions,
  external services, and operation-heavy responsibilities are intentionally separated from official
  core.
- JA:
  要約:
  f-core は、安全なローカル実行環境と最小限の公式命令セットを提供します。危険な権限、外部サービス、運用責任を伴う機能は公式コアから切り離します。

## Quick Start / クイックスタート

### Prerequisites / 前提

- EN: Deno 2.6+
- JA: Deno 2.6以上
- EN: Node.js 20+ (for Vite/Tauri host)
- JA: Node.js 20以上（Vite/Tauriホスト用）
- EN: Rust toolchain (for Tauri backend)
- JA: Rustツールチェーン（Tauriバックエンド用）

### Run Tests / テスト実行

```bash
deno task test
```

- EN: Current test suite validates worker isolation behavior, expression safety, context shape, and
  runtime behavior.
- JA: 現行テストはWorker分離挙動、式評価安全性、context形状、ランタイム挙動を確認します。

### Run Demo Host / デモホスト起動

```bash
mkdir -p public/assets
# 任意の画像を public/assets/sample.jpg として配置
deno task demo:serve
```

- EN: Open `http://127.0.0.1:8000/` in your browser.
- JA: ブラウザで `http://127.0.0.1:8000/` を開いてください。

- EN: `sample.jpg` is referenced by the built-in demo scenario in `scripts/demo_server.ts`.
- JA: `scripts/demo_server.ts` の内蔵デモシナリオは `sample.jpg` を参照します。

### Run Tauri Host (Phase 1) / Tauriホスト起動（フェーズ1）

```bash
npm install
mkdir -p public/assets
# 任意の画像を public/assets/sample.jpg として配置
npm run tauri:dev
```

- EN: For browser-only debug without Rust shell, run `npm run dev`.
- JA: Rustシェルなしでフロントだけ確認する場合は `npm run dev` を使います。

- EN: In production build, Inspector is hidden and renderer view takes the full window.
- JA: 本番ビルドでは Inspector は非表示になり、Renderer 画面がウィンドウ全体を占有します。

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
   before resolving the plugin from a static worker registry.\
   JA: ランタイムは `{ op, args, vars, pluginSource }`
   を送信し、Worker側で命令名と整合性を再検証したうえで静的レジストリから実行対象を解決します。
4. EN: Worker executes plugin with minimal context (`vars`, `jump`, `next`, `suspend`, `ui.dispatch`).\
   JA:
   Workerは命令名を検証してプラグインを読み込み、最小context（`vars`、`jump`、`next`、`suspend`、`ui.dispatch`）で実行します。
5. EN: Worker returns serializable result (`varsPatch`, `jumpTo`, `requestedNext`, `suspended`,
   `renderCommands`) and main thread applies it.\
   JA: Workerはシリアライズ可能な結果（`varsPatch`, `jumpTo`,
   `requestedNext`, `suspended`, `renderCommands`）を返し、メインスレッドが適用します。

## Available Commands / 利用可能コマンド

- EN: For shell commands used by humans, see [`docs/COMMAND_CHEATSHEET.md`](./docs/COMMAND_CHEATSHEET.md).
- JA: 人間が端末で実行するコマンドは [`docs/COMMAND_CHEATSHEET.md`](./docs/COMMAND_CHEATSHEET.md) を参照してください。

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

- EN: In Deno runtime, Worker is launched with `deno: { permissions: "none" }`; in browser/Tauri
  frontend, browser Worker sandbox is used.
- JA: Deno実行時は `deno: { permissions: "none" }` でWorkerを起動し、ブラウザ/TauriフロントではブラウザWorkerサンドボックスを利用します。

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

- EN: Worker execution is timeout-guarded (default `2000ms`) and terminated on overrun.
- JA: Worker実行はタイムアウト（デフォルト `2000ms`）で監視され、超過時は強制終了されます。

- EN: Scenario directive `@release ...` is parsed before runtime plugin execution and handled in
  session evaluator layer with strict limits.
- JA:
  シナリオディレクティブ `@release ...` はプラグイン実行前にパースされ、厳格な上限制限付きで
  セッション評価層により処理されます。

- EN: Input/output payload sizes are constrained to prevent memory-pressure DoS.
- JA: メモリ圧迫型DoS対策として、入出力ペイロードサイズを制限しています。

- EN: External-facing errors are sanitized.
- JA: 外部向けエラーはサニタイズします。

## ADR / 設計記録

- EN: Security design decision is documented in ADR.
- JA: セキュリティ設計判断はADRに記録しています。

- [`adr/ADR-F-CORE20260403-CORE-20260413-01-secure-plugin-runtime-boundary.md`](./adr/ADR-F-CORE20260403-CORE-20260413-01-secure-plugin-runtime-boundary.md)
- [`adr/ADR-F-CORE20260403-CORE-20260427-02-fail-fast-explicit-error-model.md`](./adr/ADR-F-CORE20260403-CORE-20260427-02-fail-fast-explicit-error-model.md)
- [`adr/ADR-F-CORE20260403-CORE-20260503-03-tauri-first-production-with-web-fallback.md`](./adr/ADR-F-CORE20260403-CORE-20260503-03-tauri-first-production-with-web-fallback.md)

## Known Concerns / 既知の懸念

- EN: Current concerns and risk candidates are tracked in [`docs/CONCERNS.md`](./docs/CONCERNS.md).
- JA: 現段階の懸念点とリスク候補は [`docs/CONCERNS.md`](./docs/CONCERNS.md) に整理しています。

## Release Operations / 公開運用

- EN: Public release scope and force-push boundaries are documented in [`docs/PUBLISH_SCOPE.md`](./docs/PUBLISH_SCOPE.md).
- JA: 公開スコープと強制プッシュ境界は [`docs/PUBLISH_SCOPE.md`](./docs/PUBLISH_SCOPE.md) に記載しています。

- EN: Use the pre-release gate checklist at [`docs/PRE_RELEASE_CHECKLIST.md`](./docs/PRE_RELEASE_CHECKLIST.md).
- JA: 公開直前のゲートチェックには [`docs/PRE_RELEASE_CHECKLIST.md`](./docs/PRE_RELEASE_CHECKLIST.md) を使用してください。

## License / ライセンス

- EN: This project is licensed under the MIT License. See [`LICENSE`](./LICENSE).
- JA: 本プロジェクトは MIT ライセンスで提供されます。詳細は [`LICENSE`](./LICENSE) を参照してください。

## Security Contact / セキュリティ連絡先

- EN: For vulnerability reporting and security handling scope, see [`SECURITY.md`](./SECURITY.md).
- JA: 脆弱性報告とセキュリティ対応範囲は [`SECURITY.md`](./SECURITY.md) を参照してください。
