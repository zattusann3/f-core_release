# Secure Plugin Runtime Boundary with Prefix-Only Expression Interpreter / セキュアなプラグイン実行境界とプレフィックス限定式インタープリタ

- Status: Proposed
- Date: 2026-04-13
- ProjectId: F-CORE20260403
- ProposalDomain: CORE
- ProjectRoot: /Users/ishikawasakuraichirou/f-core20260403
- Impact: host-only
- NeedsCoreReview: no
- NeedsPluginReview: no

## Context

### 日本語
本プロジェクトは、最小コア・依存ゼロ・任意コード実行の排除を前提に、MD由来IRをプラグインで実行する構成を採用する。
主要な設計課題は、(1) プラグイン読込時のパス汚染、(2) 式評価でのコード実行混入、(3) プラグインへ渡す実行権限の過剰付与である。

### English
This project adopts a plugin-driven IR execution model under strict constraints: minimal core, zero dependencies, and no arbitrary code execution.
Key design concerns are (1) path traversal during plugin loading, (2) code-injection vectors in expression evaluation, and (3) excessive capabilities in plugin context.

## Decision

### 日本語
以下を採用する。
1. `loadPlugin(opName)` は `^[a-z0-9_]+$` のみ許可し、`import.meta.url` 基準の `./plugins/${opName}.ts` 固定相対パスだけを `import()` する。
2. 式評価は `^` プレフィックス演算子のみ許可し、安全関数マップ経由で実行する。生演算子（`+ - * / = > < ...`）は拒否する。
3. `^/` は分母0で即エラーとする。
4. プラグイン `context` は `vars`, `jump`, `next` のみに限定し、`Deno`/FS/ネットワーク能力は渡さない。
5. 実行系エラーは内部情報を漏らさない固定メッセージへサニタイズする。

### English
Adopt the following:
1. `loadPlugin(opName)` accepts only `^[a-z0-9_]+$` and imports only fixed relative path `./plugins/${opName}.ts` resolved from `import.meta.url`.
2. Expression evaluation allows only `^`-prefixed operators and executes through a safe function map. Raw operators (`+ - * / = > < ...`) are rejected.
3. `^/` aborts with an error on division by zero.
4. Plugin `context` is limited to `vars`, `jump`, and `next`; no `Deno`, filesystem, or network capabilities are exposed.
5. Runtime errors are sanitized to avoid leaking internal details.

## Options Considered

### Option A (Adopted) / 採用
Strict loader + prefix-only safe interpreter + minimal plugin context.

### Option B (Rejected) / 却下
Allow broader operation names (e.g., dot, slash, uppercase) and dynamic module path composition.
- Rejected because path abuse and policy bypass become easier.

### Option C (Rejected) / 却下
Use generic expression evaluators (`eval`, `Function`, or parser with raw infix operators).
- Rejected because it increases attack surface and violates the no-arbitrary-code-execution policy.

## Consequences

### 日本語
- 正の効果: 攻撃面を実装構造で削減できる。監査ポイントが明確になる。
- 負の効果: 演算式記法や命令名に制約が増え、互換性や可読性で追加ルールが必要になる。

### English
- Positive: Attack surface is reduced structurally; security review points become explicit.
- Negative: Syntax constraints for operation names and expressions are stricter, requiring compatibility guidance.

## Risks and Mitigations

### 日本語
- リスク: 許可演算子不足による運用不便。
  - 緩和: 安全関数テーブルへの段階的追加とテスト義務化。
- リスク: 例外の過剰サニタイズで障害調査が難化。
  - 緩和: 内部ログ（非公開）で詳細を保持し、外部公開メッセージは固定化。

### English
- Risk: Limited operators may reduce usability.
  - Mitigation: Expand safe function table incrementally with mandatory tests.
- Risk: Over-sanitized errors may hinder debugging.
  - Mitigation: Keep internal diagnostics in non-user-facing logs while external messages remain generic.

## Security and Privacy

### 日本語
- 権限最小化: プラグインへOS/API権限を付与しない。
- 信頼境界: コアが入力検証と実行制御を一元管理する。
- 乱用経路: path traversal、生演算子注入、分母0クラッシュを主要脅威として扱う。
- 管制: 固定パス import、演算子ホワイトリスト、ゼロ除算防御、エラーサニタイズ。

### English
- Least privilege: No OS/API capabilities are granted to plugins.
- Trust boundary: Core runtime centralizes validation and execution control.
- Abuse paths: path traversal, raw-operator injection, and divide-by-zero crashes are treated as primary threats.
- Controls: fixed-path import, operator allowlist, divide-by-zero guard, and error sanitization.

## Validation Plan

### 日本語
- `deno task test` を常時パスさせる。
- 不正命令名（`../`, `/`, 大文字）拒否テストを維持する。
- `context` に `Deno` 等が存在しないことを回帰テストで維持する。
- import失敗時と実行失敗時に内部パスが露出しないことをテストする。

### English
- Keep `deno task test` passing.
- Maintain rejection tests for invalid operation names (`../`, `/`, uppercase).
- Keep regression tests ensuring `Deno`-like globals are absent from plugin context.
- Verify that import and execution failures do not leak internal paths.

## Open Questions

### 日本語
- 将来、演算子セットをどこまで拡張するか（論理演算、文字列演算）。
- プラグイン署名検証やハッシュ固定を導入するか。

### English
- How far should the operator set be expanded (logical/string operators).
- Whether to add plugin signature verification or hash pinning.

## Go/No-Go Recommendation

- Recommendation: GO
- Rationale:
  - 日本語: 現時点の要求（依存ゼロ・任意コード実行排除・安全最優先）を最も直接的に満たし、検証可能な形で運用できるため。
  - English: This option most directly satisfies current requirements (zero dependency, no arbitrary execution, security-first) with a testable operational model.
