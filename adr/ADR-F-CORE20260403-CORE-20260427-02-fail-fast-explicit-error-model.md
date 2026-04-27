# Fail-Fast and Explicit Error Model with Sanitized External Boundary / サニタイズ境界を維持した「正しく壊れる」エラーモデル

- Status: Proposed
- Date: 2026-04-27
- ProjectId: F-CORE20260403
- ProposalDomain: CORE
- ProjectRoot: /Users/ishikawasakuraichirou/f-core20260403
- Impact: cross-runtime (Rust + TypeScript + GUI)
- NeedsCoreReview: yes
- NeedsPluginReview: yes

## Context

### 日本語

f-coreは Tauri (Rust)・Worker (TypeScript)・ブラウザUI の境界を跨いで実行される。  
現状はセキュリティ優先のため外部向けエラーを `operation rejected` にサニタイズしているが、障害調査時に
「どこで」「何が」「なぜ」失敗したかの追跡コストが高い。  
一方で、内部詳細をそのまま外部へ露出すると、パス情報や実行境界の漏えいを招く。

### English

f-core runs across multiple boundaries: Tauri (Rust), Worker (TypeScript), and browser UI.  
For security, external errors are currently sanitized as `operation rejected`, but this increases
debugging cost and MTTR because failure origin and cause are opaque.  
At the same time, exposing raw internal exceptions to users would leak sensitive implementation
details (paths, runtime topology, trust-boundary internals).

## Decision

### 日本語

以下を採用する。

1. **内部では明示的エラーコードを標準化する。**  
   汎用文字列ではなく、ドメイン固有コード（例: `USR_SCENARIO_PARSE`, `USR_ASSET_NOT_FOUND`,
   `INT_WORKER_TIMEOUT`, `INT_PLUGIN_INTEGRITY`）で統一する。
2. **外部境界は引き続きサニタイズを維持する。**  
   既定の外部応答は安全な抽象表現（`operation rejected`）を維持し、内部詳細は返さない。
3. **ただし「ユーザーが修正可能な失敗」は安全な範囲で可視化する。**  
   例: シナリオ構文エラー、参照アセット不足などは、機密情報を含まない形で
   `code` と最小限メッセージをUIへ伝える。
4. **境界を跨ぐエラー伝播は `code` 主体で行う。**  
   Rust→TS→UIで共通のエラー封筒（`code`, `category`, `requestId`, `safeMessage`, `meta`）を採用し、
   `meta` は許可済みキーのみを転送する。
5. **ログは内部向けに構造化する。**  
   すべての内部エラーに `requestId` を付与し、構造化ログで相関追跡可能にする。

### English

Adopt the following:

1. **Standardize explicit internal error codes.**  
   Replace generic strings with domain-specific codes (e.g. `USR_SCENARIO_PARSE`,
   `USR_ASSET_NOT_FOUND`, `INT_WORKER_TIMEOUT`, `INT_PLUGIN_INTEGRITY`).
2. **Keep the sanitized external boundary by default.**  
   Public-facing responses remain safe and abstract (`operation rejected`) with no raw internals.
3. **Surface user-fixable failures safely.**  
   For script/asset issues, expose `code` plus minimal non-sensitive message suitable for creators.
4. **Propagate across boundaries by `code`-first envelopes.**  
   Use a shared envelope (`code`, `category`, `requestId`, `safeMessage`, `meta`) from Rust→TS→UI;
   only allowlisted `meta` keys can cross boundaries.
5. **Use structured internal logging with correlation.**  
   Attach `requestId` to all internal failures for end-to-end traceability.

## Consequences

### 日本語

- 正の効果:
  - 原因特定が高速化し、MTTRが短縮される。
  - シナリオ制作者が自己修正可能な失敗を即時に認識できる。
  - セキュリティ境界（サニタイズ）を維持したまま可観測性を上げられる。
- 負の効果:
  - Rust/TS間で共通のエラー型・変換テーブル・互換ルールの実装工数が増える。
  - 既存の `operation rejected` 前提コードに段階移行対応が必要になる。

### English

- Positive:
  - Faster root-cause detection and lower MTTR.
  - Scenario authors can immediately identify self-fixable script/asset issues.
  - Better observability without weakening the sanitized security boundary.
- Negative:
  - Additional implementation cost for shared error types and mapping across Rust/TS.
  - Migration effort is required for components that currently assume only `operation rejected`.

## Rollout Plan

### 日本語

1. `ErrorCode` と `ErrorCategory` を共通定義する。  
2. Rustコマンド層で `Result<T, EngineError>` を標準化し、`requestId` を付与する。  
3. Worker/Runtimeで `EngineError` へ正規化し、UIには `safeMessage + code` を選択的に表示する。  
4. 既存のサニタイズ文字列は後方互換のフォールバックとして維持し、段階的に移行する。

### English

1. Introduce shared `ErrorCode` and `ErrorCategory`.  
2. Standardize Rust command layer on `Result<T, EngineError>` with `requestId`.  
3. Normalize Worker/Runtime failures into `EngineError`, and expose only safe UI fields.  
4. Keep `operation rejected` as backward-compatible fallback during phased migration.

## Go / No-Go Recommendation

- Recommendation: GO
- Rationale:
  - 日本語: 現行の「外部はサニタイズ、内部は可観測化」というセキュリティ方針を崩さず、
    DX/運用性を同時に改善できる。
  - English: Improves DX and operability while preserving the current security boundary model
    (sanitized externally, observable internally).
