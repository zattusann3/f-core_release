# Current Concerns and Risk Register (EN/JA)

This document lists realistic concerns in the current implementation stage.  
このドキュメントは、現実装段階での実在する懸念点を整理したものです。

## Risk Table / リスク一覧

| ID | Severity | Topic | Concern (EN) | 懸念内容 (JA) | Suggested Mitigation (EN/JA) |
|---|---|---|---|---|---|
| C-01 | High | Isolation | Plugins are loaded and executed in-process. Restricting context does not fully sandbox global runtime APIs if process permissions are broad. | プラグインは同一プロセス内で読み込み・実行されるため、context制限だけでは、プロセス権限が広い場合にグローバルAPI利用を完全には防げない。 | Run plugins in isolated subprocess/worker with strict permission flags. / サブプロセスまたはWorker分離と厳格権限フラグを導入する。 |
| C-02 | High | Resource Control | No timeout, cancellation, or CPU/memory budget for plugin execution. A plugin can hang execution. | プラグイン実行にタイムアウト・キャンセル・CPU/メモリ上限がなく、実行停止不能になる可能性がある。 | Add per-command timeout and cancellation token; consider isolated killable worker model. / コマンド単位のタイムアウトとキャンセルを導入し、強制停止可能な分離モデルを採用する。 |
| C-03 | Medium | Integrity | Plugin files are loaded by name but without signature/hash verification. | プラグインは名前で読み込まれるが、署名/ハッシュ検証がない。 | Introduce plugin manifest with hash pinning/signature checks. / ハッシュ固定または署名検証付きのマニフェストを導入する。 |
| C-04 | Medium | Error Telemetry | Error sanitization protects internals, but currently removes diagnostic detail that operators may need. | エラーサニタイズで内部情報は守れる一方、運用者が必要な診断情報まで失われる可能性がある。 | Split external sanitized errors and internal structured logs with correlation IDs. / 外部向けサニタイズエラーと内部構造化ログを分離し、相関IDを導入する。 |
| C-05 | Medium | Expression Capability | Expression parser only supports 3-token format and numeric/comparison primitives; no string literal support. | 式パーサは3トークン形式と数値/比較中心で、文字列リテラルなどの表現力が低い。 | Define and version a small grammar extension without weakening security guarantees. / セキュリティを維持した小規模文法拡張をバージョン管理で導入する。 |
| C-06 | Medium | Flow Semantics | `jump()` and `next()` can both be called from a plugin, but precedence rules are not formally documented. | プラグインから `jump()` と `next()` の両方を呼べるが、優先順位が仕様化されていない。 | Specify deterministic precedence and validate in tests. / 優先順位を仕様化し、テストで固定する。 |
| C-07 | Medium | Variable Governance | Any plugin can write any variable key, including internal/reserved names. | どのプラグインも任意の変数キー（内部予約名含む）を書き換え可能。 | Add namespace policy (e.g., reserved prefixes) and write ACL per command/plugin. / 予約プレフィックスやコマンド単位ACLで書き込み制御を入れる。 |
| C-08 | Low | Plugin Discovery | Current command set is file-based and implicit; no explicit allowlist/registry policy yet. | 現在のコマンド集合はファイル存在ベースで暗黙的であり、明示allowlist/registry方針がない。 | Add explicit runtime allowlist and startup validation report. / 実行時allowlistと起動時検証レポートを導入する。 |

## Priority Actions / 優先対応

1. EN: Implement true runtime isolation for plugins (`C-01`, `C-02`).  
   JA: プラグインの実行分離（`C-01`, `C-02`）を最優先で実装する。
2. EN: Add plugin integrity controls (`C-03`).  
   JA: プラグイン整合性検証（`C-03`）を追加する。
3. EN: Define deterministic flow and variable governance rules (`C-06`, `C-07`).  
   JA: 進行制御と変数統制の仕様を明文化する（`C-06`, `C-07`）。
4. EN: Improve observability without leaking internals (`C-04`).  
   JA: 内部情報を漏らさない形で可観測性を強化する（`C-04`）。

## Scope Note / スコープ注記

- EN: This document is for current-stage concerns and should be updated when architecture changes.
- JA: 本書は現段階の懸念点整理であり、アーキテクチャ変更時に更新してください。
