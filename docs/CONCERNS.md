# Current Concerns and Risk Register (EN/JA)

This document lists realistic concerns in the current implementation stage.\
このドキュメントは、現実装段階での実在する懸念点を整理したものです。

## Risk Table / リスク一覧

| ID   | Severity | Status              | Topic                 | Concern (EN)                                                                                                     | 懸念内容 (JA)                                                                                         | Suggested Mitigation (EN/JA)                                                                                                             |
| ---- | -------- | ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Low      | Resolved            | Isolation             | Plugins are now jailed in a zero-permission Worker (`deno: { permissions: "none" }`).                            | プラグインは `deno: { permissions: "none" }` のゼロ権限Workerで隔離実行される。                       | Worker permissions are fully stripped at creation. / Worker生成時に権限を完全剥奪し、サンドボックス化を完了。                            |
| C-02 | Low      | Mitigated           | Resource Control      | Runtime now enforces timeout + payload size limits and terminates overrun workers, reducing CPU/memory DoS risk. | ランタイムはタイムアウト・ペイロード上限・超過時Worker強制終了を実装し、CPU/メモリDoSのリスクを低減。 | Keep limit regression tests and tune per operation class. / 上限値の回帰テストを維持し、命令種別ごとに閾値を調整する。                   |
| C-03 | Low      | Resolved            | Integrity             | Manifest is automated and signed (Ed25519), and plugin source is SHA-256 checked before execution.               | マニフェスト自動更新とEd25519署名検証を導入し、実行前にプラグインソースSHA-256照合を行う。            | Enforce `manifest:check` in CI and protect signing key rotation process. / `manifest:check` をCI強制し、署名鍵ローテーション手順を管理。 |
| C-04 | Low      | Mitigated           | Error Telemetry       | Structured internal logs with `requestId` are now emitted while external errors remain sanitized.                | 外部エラーはサニタイズを維持しつつ、`requestId` 付き構造化内部ログを出力する。                        | Optional next step: route logs to central sink with retention policy. / 次段階として集中ログ基盤と保持ポリシーを導入する。               |
| C-05 | Low      | Mitigated (Partial) | Expression Capability | Quoted string literals are supported, but grammar remains intentionally minimal (3-token form).                  | クォート文字列は対応済みだが、文法は意図的に3トークン最小構成に留めている。                           | Extend grammar only with versioned, security-reviewed increments. / セキュリティレビュー前提で段階拡張する。                             |
| C-06 | Low      | Mitigated           | Flow Semantics        | Flow control now rejects mixed `jump`/`next` requests within one plugin execution.                               | 1回のプラグイン実行で `jump`/`next` 混在要求を拒否する排他制御を実装済み。                            | Keep regression tests and document behavior as normative runtime contract. / 回帰テスト維持と仕様明文化を継続する。                      |
| C-07 | Low      | Mitigated           | Variable Governance   | Writes to `_`-prefixed reserved variables are blocked by context ACL.                                            | `_` プレフィックス予約変数への書き込みをcontext ACLで禁止済み。                                       | Reserve additional prefixes if needed and add lint/tests for plugin authors. / 必要に応じて予約領域を拡張し、lint/テストを追加する。     |
| C-08 | Low      | Resolved            | Plugin Discovery      | Command execution is gated by explicit manifest allowlist in both runtime and worker layers.                     | 実行可能コマンドはRuntime/Worker双方のマニフェストallowlistで明示管理され、未登録は拒否される。       | Manifest gates are enforced in multiple layers, removing implicit file-based execution. / 多層のマニフェスト門番により暗黙実行を排除。   |

## Priority Actions / 優先対応

1. EN: Add centralized log sink/retention policy for structured internal logs (`C-04`).\
   JA: 構造化内部ログ向けの集中ログ基盤と保持ポリシーを導入する（`C-04`）。
2. EN: Tune payload/timeout limits per operation class with production traces (`C-02`).\
   JA: 本番トレースを元に命令種別ごとのペイロード上限・タイムアウトを調整する（`C-02`）。

## Scope Note / スコープ注記

- EN: This document is for current-stage concerns and should be updated when architecture changes.
- JA: 本書は現段階の懸念点整理であり、アーキテクチャ変更時に更新してください。
