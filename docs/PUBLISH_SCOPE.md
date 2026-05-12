# Publish Scope (Force Push) / 公開スコープ（強制プッシュ）

This document defines what should be included or excluded when force-pushing to the public repository.
このドキュメントは、公開リポジトリへ強制プッシュする際の「含めるもの / 除外するもの」を定義します。

## Include / 含める

- EN: Core source code under `src/` and `src-tauri/`.
- JA: `src/` と `src-tauri/` 配下のコア実装コード。

- EN: Build and runtime configuration files (`package.json`, `deno.json`, `vite.config.ts`, `tauri.conf.json`, capabilities/permissions).
- JA: ビルド・実行設定ファイル（`package.json`, `deno.json`, `vite.config.ts`, `tauri.conf.json`, capabilities/permissions）。

- EN: Public documentation (`README.md`, `docs/`, `adr/`).
- JA: 公開ドキュメント（`README.md`, `docs/`, `adr/`）。

- EN: Tests and fixtures needed to validate behavior (`test/`).
- JA: 挙動検証に必要なテストとフィクスチャ（`test/`）。

## Exclude / 除外する

- EN: Personal notes, draft memos, and local learning files not intended for users.
- JA: 公開利用者向けではない個人メモ・学習用ファイル・草稿。

- EN: Temporary outputs and local artifacts (`dist/`, logs, screenshots, scratch files).
- JA: 一時生成物・ローカル成果物（`dist/`、ログ、スクリーンショット、作業用断片）。

- EN: Secrets and private credentials (signing keys, API tokens, local env files).
- JA: 秘密情報（署名鍵、APIトークン、ローカル環境変数ファイル）。

- EN: Any file that changes security assumptions without documentation or review.
- JA: セキュリティ前提を変えるのに文書化・レビューが伴っていない変更。

## Pre-Force Checklist / 強制プッシュ前チェック

1. EN: `git status --short` is clean except intended files.
   JA: `git status --short` が意図したファイル以外クリーンである。

2. EN: Runtime and docs are aligned (README + command docs reflect current behavior).
   JA: 実装とドキュメント（README + コマンド文書）が一致している。

3. EN: Mandatory checks pass:
   JA: 必須チェックが通る:
   - `npm run build`
   - `cargo check` (run in `src-tauri/`)

4. EN: Backup safety line is created before force push (tag/branch).
   JA: 強制プッシュ前に退避線（タグ/ブランチ）を作成済み。

5. EN: Use `--force-with-lease` instead of raw `--force` whenever possible.
   JA: 可能な限り `--force` ではなく `--force-with-lease` を使う。

## Suggested Push Command / 推奨プッシュコマンド

```bash
git push --force-with-lease <public-remote> main
```

