# Current Concerns and Risk Register (EN/JA)

This document lists realistic concerns in the current implementation stage.\
このドキュメントは、現実装段階での実在する懸念点を整理したものです。

## Risk Table / リスク一覧

| ID   | Severity | Status              | Topic                 | Concern (EN)                                                                                                       | 懸念内容 (JA)                                                                                          | Suggested Mitigation (EN/JA)                                                                                                           |
| ---- | -------- | ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Low      | Resolved            | Isolation             | Plugins are now jailed in a zero-permission Worker (`deno: { permissions: "none" }`).                              | プラグインは `deno: { permissions: "none" }` のゼロ権限Workerで隔離実行される。                        | Worker permissions are fully stripped at creation. / Worker生成時に権限を完全剥奪し、サンドボックス化を完了。                          |
| C-02 | Low      | Mitigated           | Resource Control      | Runtime now enforces timeout and calls `worker.terminate()` on overrun, preventing infinite-loop hangs.            | ランタイムはタイムアウト超過時に `worker.terminate()` を実行し、無限ループによる停止不能を防止できる。 | Keep timeout tests and tune timeout budget per operation class. / タイムアウト回帰テストを維持し、命令種別ごとに上限時間を調整する。   |
| C-03 | Low      | Resolved            | Integrity             | Plugin source is SHA-256 verified against manifest pins before execution and rejected on mismatch.                 | プラグインソースは実行前にSHA-256マニフェスト照合され、不一致時は拒否される。                          | Runtime + Worker both enforce manifest checks before import/execute. / RuntimeとWorkerの双方で実行前検証を強制し、改ざん実行を遮断。   |
| C-04 | Low      | Mitigated (Partial) | Error Telemetry       | Sanitized external errors are now separated from internal stderr logs, but no correlation IDs/structured sink yet. | 外部向けサニタイズエラーと内部stderrログの分離は実装済みだが、相関IDや構造化ログ基盤は未導入。         | Add structured internal logs with correlation IDs and optional log sink policy. / 相関ID付き構造化ログとログ出力ポリシーを追加する。   |
| C-05 | Low      | Mitigated (Partial) | Expression Capability | Quoted string literals are supported, but grammar remains intentionally minimal (3-token form).                    | クォート文字列は対応済みだが、文法は意図的に3トークン最小構成に留めている。                            | Extend grammar only with versioned, security-reviewed increments. / セキュリティレビュー前提で段階拡張する。                           |
| C-06 | Low      | Mitigated           | Flow Semantics        | Flow control now rejects mixed `jump`/`next` requests within one plugin execution.                                 | 1回のプラグイン実行で `jump`/`next` 混在要求を拒否する排他制御を実装済み。                             | Keep regression tests and document behavior as normative runtime contract. / 回帰テスト維持と仕様明文化を継続する。                    |
| C-07 | Low      | Mitigated           | Variable Governance   | Writes to `_`-prefixed reserved variables are blocked by context ACL.                                              | `_` プレフィックス予約変数への書き込みをcontext ACLで禁止済み。                                        | Reserve additional prefixes if needed and add lint/tests for plugin authors. / 必要に応じて予約領域を拡張し、lint/テストを追加する。   |
| C-08 | Low      | Resolved            | Plugin Discovery      | Command execution is gated by explicit manifest allowlist in both runtime and worker layers.                       | 実行可能コマンドはRuntime/Worker双方のマニフェストallowlistで明示管理され、未登録は拒否される。        | Manifest gates are enforced in multiple layers, removing implicit file-based execution. / 多層のマニフェスト門番により暗黙実行を排除。 |

## Priority Actions / 優先対応

1. EN: Improve internal observability with correlation IDs (`C-04`).\
   JA: 相関ID付きの内部可観測性を強化する（`C-04`）。
2. EN: Automate manifest updates and consider signature trust chain as future hardening (`C-03`).\
   JA: 将来強化としてマニフェスト更新自動化と署名信頼連鎖を検討する（`C-03`）。

## Scope Note / スコープ注記

- EN: This document is for current-stage concerns and should be updated when architecture changes.
- JA: 本書は現段階の懸念点整理であり、アーキテクチャ変更時に更新してください。
