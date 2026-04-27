# Command Cheat Sheet / コマンドチートシート

Run commands from the repository root unless a command says otherwise.
特に指定がない限り、リポジトリルートで実行してください。

```sh
cd /Users/ishikawasakuraichirou/f-core20260403
```

## Setup / セットアップ

| Command       | EN                                                                 | JA                                                                          |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `npm install` | Install Node/Vite/Tauri CLI dependencies from `package-lock.json`. | `package-lock.json` に従って Node/Vite/Tauri CLI 依存をインストールします。 |

## Daily Development / 日常開発

| Command                | EN                                                                                                    | JA                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Start the browser-only Vite dev server. Use this when you do not need the Rust/Tauri shell.           | ブラウザのみの Vite 開発サーバーを起動します。Rust/Tauri シェルが不要な確認に使います。            |
| `npm run tauri:dev`    | Start the Tauri desktop app in development mode. This also runs the Vite dev server via Tauri config. | Tauri デスクトップアプリを開発モードで起動します。Tauri 設定により Vite 開発サーバーも起動します。 |
| `deno task demo:serve` | Start the Deno demo host with network/read permissions and Worker support.                            | Deno デモホストをネットワーク・読み取り権限と Worker 対応で起動します。                            |

## Tests and Checks / テスト・検証

| Command                                | EN                                                                                 | JA                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `deno task test`                       | Run the TypeScript/Deno test suite.                                                | TypeScript/Deno のテストスイートを実行します。                                           |
| `deno task manifest:check`             | Verify plugin manifest hashes and signature. Run this after plugin source changes. | プラグインマニフェストのハッシュと署名を検証します。プラグインソース変更後に実行します。 |
| `deno check scripts/gemini_context.ts` | Type-check the Gemini context generator.                                           | Gemini コンテキスト生成スクリプトを型チェックします。                                    |
| `deno fmt`                             | Format Deno/TypeScript/JSON files according to `deno.json`.                        | `deno.json` の設定に従って Deno/TypeScript/JSON ファイルを整形します。                   |
| `cargo check`                          | Check the Rust/Tauri crate. Run from `src-tauri/`.                                 | Rust/Tauri クレートを検査します。`src-tauri/` で実行します。                             |
| `cargo test`                           | Run Rust unit tests. Run from `src-tauri/`.                                        | Rust のユニットテストを実行します。`src-tauri/` で実行します。                           |
| `cargo fmt`                            | Format Rust source. Run from `src-tauri/`.                                         | Rust ソースを整形します。`src-tauri/` で実行します。                                     |

## Build and Preview / ビルド・プレビュー

| Command               | EN                                                                    | JA                                                                                        |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run build`       | Build the browser frontend with Vite into `dist/`.                    | Vite でブラウザフロントエンドを `dist/` にビルドします。                                  |
| `npm run preview`     | Preview the production Vite build locally. Run `npm run build` first. | 本番用 Vite ビルドをローカルでプレビューします。先に `npm run build` を実行してください。 |
| `npm run tauri:build` | Build the packaged Tauri desktop app.                                 | パッケージ化された Tauri デスクトップアプリをビルドします。                               |

## Plugin Manifest / プラグインマニフェスト

| Command                                                                 | EN                                                                                      | JA                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `deno task manifest:keygen`                                             | Generate a new manifest signing key pair. Store private keys outside Git.               | 新しいマニフェスト署名鍵ペアを生成します。秘密鍵は Git 外で保管してください。                |
| `FCORE_MANIFEST_PRIVATE_KEY_PKCS8_BASE64=... deno task manifest:update` | Rebuild and sign `src/plugin_manifest.ts` from `src/plugins/*.ts`.                      | `src/plugins/*.ts` から `src/plugin_manifest.ts` を再生成して署名します。                    |
| `deno task manifest:check`                                              | Confirm the checked-in manifest still matches plugin source and trusted signature data. | チェックイン済みマニフェストがプラグインソースと信頼済み署名情報に一致することを確認します。 |

## Gemini Context / Gemini 共有用コンテキスト

| Command                                                     | EN                                                                                                        | JA                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `deno task context:gemini`                                  | Generate `repo-context.md`, a source snapshot for external architecture discussion.                       | 外部アーキテクチャ議論用のソーススナップショット `repo-context.md` を生成します。                             |
| `deno task context:gemini:txt`                              | Generate `repo-context.txt`. Use this if Gemini or Drive misclassifies `.ts` files as video files.        | `repo-context.txt` を生成します。Gemini や Drive が `.ts` ファイルを動画扱いする場合はこちらを使います。      |
| `deno task context:gemini -- --out repo-context-gemini.txt` | Generate the context snapshot with a custom output path. Prefer `.txt` when sharing with Gemini directly. | 出力先を指定してコンテキストスナップショットを生成します。Gemini に直接共有する場合は `.txt` がより無難です。 |

`repo-context*.md` and `repo-context*.txt` are ignored by Git. `repo-context*.md` と
`repo-context*.txt` は Git 管理対象外です。

## Git Hygiene / Git 管理

| Command              | EN                                                  | JA                                             |
| -------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `git status --short` | Show a compact list of changed and untracked files. | 変更・未追跡ファイルを短い形式で表示します。   |
| `git diff --stat`    | Show a compact summary of file changes.             | ファイル変更の概要を表示します。               |
| `git diff`           | Inspect the full unstaged diff before committing.   | コミット前に未ステージ差分の全文を確認します。 |

## Common Workflows / よく使う流れ

### Browser-only frontend check / ブラウザだけでフロント確認

```sh
npm run dev
```

- EN: Use this for fast UI iteration without launching the desktop shell.
- JA: デスクトップシェルを起動せず、UIを素早く確認したいときに使います。

### Full desktop app check / デスクトップアプリ確認

```sh
npm run tauri:dev
```

- EN: Use this when behavior depends on Tauri APIs or native commands.
- JA: Tauri API やネイティブコマンドに依存する挙動を確認するときに使います。

### Main pre-commit check / コミット前の基本確認

```sh
deno fmt
deno task test
deno task manifest:check
npm run build
```

- EN: This covers formatting, Deno tests, plugin manifest integrity, and frontend build.
- JA: 整形、Deno テスト、プラグインマニフェスト整合性、フロントエンドビルドを確認します。

### Rust/Tauri focused check / Rust・Tauri 重点確認

```sh
cd src-tauri
cargo fmt
cargo check
cargo test
```

- EN: Use this after changing `src-tauri/src/main.rs`, `Cargo.toml`, or Tauri configuration.
- JA: `src-tauri/src/main.rs`、`Cargo.toml`、Tauri 設定を変更した後に使います。

### Update Gemini context / Gemini 用コンテキスト更新

```sh
deno task context:gemini
```

- EN: Share the generated `repo-context.md` with Gemini when it needs repository context.
- JA: Gemini にリポジトリ文脈を渡したいときは、生成された `repo-context.md` を共有します。

```sh
deno task context:gemini:txt
```

- EN: Use the `.txt` output if Gemini or Drive treats `.ts` files as videos.
- JA: Gemini や Drive が `.ts` ファイルを動画扱いする場合は `.txt` 出力を使います。
