# Security Policy / セキュリティポリシー

## Scope / 適用範囲

- EN: Official security support target is the Tauri desktop build of this repository.
- JA: 公式のセキュリティサポート対象は、このリポジトリの Tauri デスクトップビルドです。

- EN: Browser/HTML mode is provided for development preview and compatibility checks, not as an official production deployment target.
- JA: ブラウザ/HTML モードは開発プレビューおよび互換性確認用途であり、公式な本番配備対象ではありません。

## Reporting a Vulnerability / 脆弱性報告

- EN: Please report security issues privately to the maintainer. Do not open a public issue first.
- JA: セキュリティ問題は、まずメンテナへ非公開で報告してください。最初から公開 Issue は作成しないでください。

- EN: Include reproduction steps, affected files/components, and expected impact if possible.
- JA: 可能であれば、再現手順・影響箇所（ファイル/コンポーネント）・想定インパクトを添えてください。

## Response Expectations / 対応目安

- EN: Initial acknowledgement target: within 7 days.
- JA: 初期受領確認の目安: 7日以内。

- EN: Fix and disclosure timing is best-effort and depends on severity and maintenance bandwidth.
- JA: 修正および開示時期は、深刻度とメンテナンス帯域に応じたベストエフォート対応です。

## Out of Scope / サポート対象外

- EN: Third-party plugins/adapters, modified forks, and externally hosted integrations are out of official security scope.
- JA: サードパーティ製プラグイン/アダプタ、改造フォーク、外部ホスティング連携は公式セキュリティ対象外です。

- EN: Misconfiguration in custom deployments (self-hosted web stacks, external service glue code, private infrastructure) is out of scope.
- JA: 独自配備での設定不備（自前Web運用、外部サービス接続コード、私設インフラ）は対象外です。

## Security Baseline (Current) / 現在のセキュリティ前提

- EN: Plugin execution is isolated by Worker boundaries.
- JA: プラグイン実行は Worker 境界で分離されます。

- EN: Runtime enforces allowlist + manifest integrity checks (signature/hash).
- JA: ランタイムは allowlist とマニフェスト整合性（署名/ハッシュ）を検証します。

- EN: Arbitrary code execution primitives (`eval`, `Function`) are not part of official command/runtime design.
- JA: 任意コード実行プリミティブ（`eval`, `Function`）は公式コマンド/ランタイム設計に含めません。

- EN: Input and payload sizes are bounded to reduce memory-pressure and abuse risks.
- JA: 入力およびペイロードサイズは、メモリ圧迫や悪用リスク低減のために制限されています。

