# Pre-Release Checklist (Public Repo) / 公開前チェックリスト（公開リポジトリ向け）

Use this checklist before pushing to the public repository.
公開リポジトリへ反映する前に、このチェックリストを使用してください。

---

## A. Release Boundary / リリース境界

- [✅] EN: Official support boundary is fixed: **Tauri production build only**.
      JA: 公式サポート境界は **Tauri本番ビルドのみ** で固定した。

- [✅] EN: Browser/HTML mode is explicitly documented as development preview only.
      JA: Browser/HTML モードは開発プレビュー用途のみであると明記した。

---

## B. Branch and Version / ブランチとバージョン

- [ ] EN: Public target branch is confirmed (`main` or release branch policy).
      JA: 公開対象ブランチ（`main` 直行 or release ブランチ運用）を確認した。

- [ ] EN: Version/tag for this publish is decided (example: `v0.1.0`).
      JA: 今回公開するバージョン/タグ（例: `v0.1.0`）を決めた。

---

## C. Scope and Files / 公開スコープとファイル

- [ ] EN: Checked against `docs/PUBLISH_SCOPE.md`.
      JA: `docs/PUBLISH_SCOPE.md` に照らして確認した。

- [ ] EN: No secrets are included (keys, tokens, private env files).
      JA: 秘密情報（鍵・トークン・環境変数ファイル）は含まれていない。

- [ ] EN: No accidental artifacts are included (`dist/`, logs, local notes, screenshots).
      JA: 誤って生成物（`dist/`、ログ、個人メモ、スクリーンショット）を含めていない。

---

## D. Documentation Consistency / ドキュメント整合

- [ ] EN: `README.md` reflects current behavior (setup, runtime model, production mode).
      JA: `README.md` は現行挙動（セットアップ、実行モデル、本番表示モード）と一致している。

- [ ] EN: Command docs are in sync (`docs/COMMANDS.md`, `docs/COMMAND_CHEATSHEET.md`).
      JA: コマンド文書（`docs/COMMANDS.md`, `docs/COMMAND_CHEATSHEET.md`）が同期している。

- [ ] EN: Policy docs are present and coherent:
      `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/BRANDING.md`.
      JA: 方針文書（`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/BRANDING.md`）が揃っている。

---

## E. Security Contact / セキュリティ連絡窓口

- [ ] EN: Vulnerability reporting channel in `SECURITY.md` is usable and current.
      JA: `SECURITY.md` の脆弱性報告窓口が実際に使える状態で最新である。

---

## F. Minimum Verification / 最低動作検証

- [ ] EN: Frontend build passes.
      JA: フロントエンドビルドが通過した。
      Command: `npm run build`

- [ ] EN: Tauri Rust check passes.
      JA: Tauri 側の Rust チェックが通過した。
      Command: `cd src-tauri && cargo check`

- [ ] EN: Local Tauri app startup is verified.
      JA: ローカルの Tauri 起動確認を実施した。
      Command: `npm run tauri:dev`

---

## G. Push Safety / プッシュ安全策

- [ ] EN: Backup line is created before force push (tag/branch).
      JA: 強制プッシュ前に退避線（タグ/ブランチ）を作成した。

- [ ] EN: Use `--force-with-lease` for public overwrite.
      JA: 公開リポジトリ上書きには `--force-with-lease` を使う。

Example / 例:

```bash
git fetch <public-remote>
git tag backup/pre-public-force-YYYYMMDD
git push --force-with-lease <public-remote> main
```

---

## H. Final Go/No-Go / 最終判定

- [ ] EN: I am ready to publish this state as the canonical public snapshot.
      JA: この状態を公開正本として出す準備ができている。

