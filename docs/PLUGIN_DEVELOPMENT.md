# Plugin Development Guide (EN/JA)

This document describes how to add a new runtime plugin in the current f-core architecture.\
このドキュメントは、現行 f-core アーキテクチャで新規ランタイムプラグインを追加する手順を示します。

## Scope / 対象

- EN: This is for runtime command plugins under `src/plugins/*.ts`.
- JA: これは `src/plugins/*.ts` のランタイムコマンドプラグイン向けです。

- EN: Parser-only directives (for example `@release`) are handled in parser/session layer, not as worker plugins.
- JA: `@release` のようなパーサ専用ディレクティブは Worker プラグインではなく parser/session 層で処理されます。

## Plugin Contract / プラグイン契約

- EN: Implement `execute(context, args)` as defined by `PluginModule`.
- JA: `PluginModule` で定義された `execute(context, args)` を実装します。

- EN: Context surface is minimal: `vars`, `ui.dispatch`, `jump`, `next`, `suspend`.
- JA: Context は最小です: `vars`, `ui.dispatch`, `jump`, `next`, `suspend`。

- EN: No `Deno`, filesystem, or network APIs are provided via context.
- JA: `context` 経由で `Deno`・ファイルI/O・ネットワーク API は提供されません。

- EN: Reserved vars (`_...`) are blocked from plugin writes.
- JA: 予約変数（`_...`）への書き込みは拒否されます。

- EN: Flow is exclusive per execution: only one of `jump` / `next` / `suspend`.
- JA: 1実行内での進行制御は排他です（`jump` / `next` / `suspend` のいずれか1つ）。

## Add a New Plugin / 新規プラグイン追加手順

1. Create plugin file.
   - EN: Add `src/plugins/<opName>.ts`.
   - JA: `src/plugins/<opName>.ts` を作成します。
   - EN: `opName` must match `^[a-z0-9_]+$`.
   - JA: `opName` は `^[a-z0-9_]+$` に一致させます。

2. Export execute entrypoint.
   - EN: Export `execute(context: PluginContext, args: PluginArgs)`.
   - JA: `execute(context: PluginContext, args: PluginArgs)` を export します。

3. Register command in allowlist.
   - EN: Add `opName` to `src/plugin_allowlist.ts`.
   - JA: `src/plugin_allowlist.ts` に `opName` を追加します。

4. Register browser/Tauri raw source map.
   - EN: Import `?raw` source and add entry in `src/browser_plugin_sources.ts`.
   - JA: `src/browser_plugin_sources.ts` に `?raw` import とエントリを追加します。

5. Register worker factory.
   - EN: Add dynamic import factory entry in `src/worker_runner.ts` (`WORKER_PLUGIN_FACTORIES`).
   - JA: `src/worker_runner.ts` の `WORKER_PLUGIN_FACTORIES` に動的 import エントリを追加します。

6. Rebuild and sign manifest.
   - EN:
     ```bash
     FCORE_MANIFEST_PRIVATE_KEY_PKCS8_BASE64=... deno task manifest:update
     ```
   - JA:
     ```bash
     FCORE_MANIFEST_PRIVATE_KEY_PKCS8_BASE64=... deno task manifest:update
     ```

7. Verify manifest and run tests.
   - EN:
     ```bash
     deno task manifest:check
     deno task test
     ```
   - JA:
     ```bash
     deno task manifest:check
     deno task test
     ```

## Minimal Example / 最小例

```ts
import type { PluginArgs, PluginContext } from "../types.ts";

export function execute(context: PluginContext, args: PluginArgs): void {
  const text = args["text"];
  if (typeof text !== "string") {
    throw new Error("example.text must be a string");
  }
  context.vars.set("last_example", text);
  context.next();
}
```

## Security and Runtime Notes / セキュリティ・実行時注意

- EN: Plugin source hash must match signed manifest entry, or execution is rejected.
- JA: プラグインソースのハッシュが署名済みマニフェストと一致しなければ実行拒否されます。

- EN: Runtime enforces payload limits and execution timeout (`2000ms` default).
- JA: ランタイムはペイロード制限と実行タイムアウト（デフォルト `2000ms`）を適用します。

- EN: Internal test fixtures under `test/fixtures/plugins/` are not public plugin contract.
- JA: `test/fixtures/plugins/` のテスト用実装は公開プラグイン契約ではありません。

## Current References / 現状の主要リファレンス

- Command spec: [`docs/COMMANDS.md`](./COMMANDS.md)
- Shell command cheat sheet: [`docs/COMMAND_CHEATSHEET.md`](./COMMAND_CHEATSHEET.md)
- Plugin context/type contract: [`src/types.ts`](../src/types.ts)
- Runtime execution gate: [`src/runtime.ts`](../src/runtime.ts)
- Worker plugin registry: [`src/worker_runner.ts`](../src/worker_runner.ts)
- Allowlist: [`src/plugin_allowlist.ts`](../src/plugin_allowlist.ts)
- Browser/Tauri plugin source map: [`src/browser_plugin_sources.ts`](../src/browser_plugin_sources.ts)
- Manifest update/check scripts: [`scripts/manifest_update.ts`](../scripts/manifest_update.ts), [`scripts/manifest_check.ts`](../scripts/manifest_check.ts)
- Existing plugin examples: [`src/plugins/`](../src/plugins/)
