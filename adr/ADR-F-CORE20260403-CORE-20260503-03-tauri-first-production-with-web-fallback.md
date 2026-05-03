# Tauri-First Production Architecture with Web-Fallback for Development / 本番環境のTauri-First化と開発用Webフォールバックの維持

- Status: Proposed
- Date: 2026-05-03
- ProjectId: F-CORE20260403
- ProposalDomain: CORE
- ProjectRoot: /Users/ishikawasakuraichirou/f-core20260403
- Impact: host-only
- NeedsCoreReview: yes
- NeedsPluginReview: no

## Context

### English

The f-core engine requires a mechanism to persist save data to the local file system.
While established engines like TyranoScript rely on Electron, Electron applications suffer from
massive binary sizes and high memory consumption. To ensure f-core remains ultra-lightweight and
highly performant, we want to leverage Tauri's native capabilities.
However, completely abandoning the pure Web environment contradicts our current developer
experience (DX), which heavily relies on `npm run dev` for rapid UI prototyping and testing
without compiling Rust.

### 日本語

f-coreエンジンにおいて、セーブデータを物理的に永続化する機構が必要となった。
既存のティラノスクリプト等のようにElectronを採用すると、バイナリの肥大化とメモリ消費量の増加が避けられない。
f-coreを極限まで軽量かつ高速に保つため、Tauriのネイティブ機能を最大限に活用したい。
一方で、純粋なWeb実行環境を完全に放棄することは、Rustのコンパイルを待たずにUIの迅速な検証を行う現在の開発環境（`npm run dev`）の利便性（DX）を破壊してしまう。

## Decision

### English

We adopt a "Tauri-First" architecture for production, while explicitly maintaining Web execution
as a development-only environment.

1. **Production Target (Tauri-First):** Desktop binaries built via Tauri are the official
   production target.
2. **Development Target (Web-Fallback):** The pure browser environment (vite dev server) will be
   maintained strictly for development, UI verification, and rapid prototyping. It will not be
   supported as a production release target.
3. **Minimal Boundary (StoragePort):** To absorb environmental differences, we introduce a minimal
   abstraction layer (`StoragePort`).
   - **Responsibility Restriction:** `StoragePort` is strictly for data persistence (save/load) and
     must not abstract rendering or runtime execution.
   - **Security Boundary (Tauri):** The Tauri implementation will perform actual File I/O via Rust
     IPC (Custom Commands).
   - **Security Boundary (Web):** The Web implementation will strictly use `localStorage` or memory
     mock without OS-level access.
   - **Error Contract:** Implementations across both environments must return unified,
     domain-specific error codes (e.g., `ERR_STORAGE_WRITE`) to strictly adhere to the
     "Fail-Fast and Explicit" principle.

### 日本語

本番リリース（プロダクション）は「Tauri-First」としつつ、純粋なWeb環境は「開発・検証用途」として明確に維持する方針を採る。

1. **本番ターゲット（Tauri-First）:** Tauri経由でビルドされたデスクトップバイナリを公式な製品版とする。
2. **開発ターゲット（Web-Fallback）:** ブラウザ単体での実行環境は、UI開発や迅速なプロトタイピングのための検証モードとして維持する（製品サポートの対象外）。
3. **最小境界の維持（StoragePort）:** 環境ごとの差異を吸収するため、最小限の抽象化レイヤー（`StoragePort`）を導入する。
   - **責務の限定:** `StoragePort` はデータの永続化（保存/読込）のみを担い、レンダリングやランタイム実行の抽象化には決して使用しない。
   - **セキュリティ境界（Tauri）:** Tauri環境では、RustのIPC（カスタムコマンド）を介して実際のファイルI/Oを実行する。
   - **セキュリティ境界（Web）:** Web環境では、OSレベルのアクセスを持たず、`localStorage` またはメモリMockのみを使用する。
   - **エラー契約:** 両環境の実装は統一されたエラーコード（例: `ERR_STORAGE_WRITE`）を返し、当エンジンの「正しく壊れる（Fail-fast and Explicit）」の原則を厳格に遵守すること。

## Acceptance Criteria / 受け入れ基準

- `npm run dev` (Web fallback / Web検証): Save/Load operations execute without errors using
  `localStorage` or mock / 保存・読込操作がエラーなく `localStorage` 等で動作すること。
- `npm run tauri:dev` (Production target / 本番環境): Save/Load operations successfully perform
  physical File I/O via Rust IPC / 保存・読込操作がRust IPCを経由し、実ファイルI/Oとして動作すること。
- Both environments must operate on the exact same Save Data JSON schema / 両環境において、全く同一のセーブデータJSONスキーマを使用すること。

## Consequences

### English

- **Positive:**
  - Maintains the ultra-lightweight and robust characteristics of Tauri for the final product.
  - Preserves the rapid DX of pure browser testing for frontend development.
- **Negative:**
  - Requires maintaining two separate implementations for the `StoragePort` (Tauri IPC vs. Web
    Mock).

### 日本語

- **Positive:**
  - 最終製品としてTauriの極限の軽さと堅牢性を担保できる。
  - フロントエンド開発におけるブラウザ単体での高速な開発体験（DX）を維持できる。
- **Negative:**
  - `StoragePort` に対して、Tauri用とWeb用の2つの実装を保守する手間が発生する。
