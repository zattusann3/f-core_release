# Security Policy / セキュリティポリシー

## Scope / 適用範囲

- EN: Official security support target is the Tauri desktop build of this repository.
- JA: 公式のセキュリティサポート対象は、このリポジトリの Tauri デスクトップビルドです。

- EN: Browser/HTML mode is provided for development preview and compatibility checks, not as an official production deployment target.
- JA: ブラウザ/HTML モードは開発プレビューおよび互換性確認用途であり、公式な本番配備対象ではありません。

- EN: Current security/runtime verification is centered on macOS. Windows validation is planned but not complete yet.
- JA: 現時点のセキュリティ/ランタイム検証は macOS 中心です。Windows 検証は予定していますが、まだ完了していません。

## Reporting a Vulnerability / 脆弱性報告

- EN: Contact channels: X (DM to the maintainer) or GitHub Issues in this repository.
- JA: 連絡窓口: メンテナの X（DM）@ouichiro39562または本リポジトリの GitHub Issue。

- EN: If you use a public Issue, avoid posting exploit details or sensitive data in full.
- JA: 公開 Issue を使う場合、悪用手順や機微情報の詳細はそのまま公開しないでください。

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
