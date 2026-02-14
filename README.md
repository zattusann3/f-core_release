# f-core_release

`v0.1.0-alpha` / **Developer Preview**

This repository is a public preview release of f-core, focused on sharing the project’s minimal-core philosophy and technical direction.

## Important Notice

- This is an **alpha** build and **not recommended for production use**.
- Contracts and implementation details may change in future releases.
- The scope is intentionally minimal: core runtime, minimum HTML host, and related tests.
- For stable evaluation, use tagged releases rather than tracking active development branches.

# f-core

Minimal, strict, CLI-first visual novel VM.

Project process docs:

- L5 close checklist: `docs/release/l5-close.md`
- L6-1 close checklist: `docs/release/l6-1-close.md`
- L6-2 close checklist: `docs/release/l6-2-close.md`
- L6-3 close checklist: `docs/release/l6-3-close.md`
- L6-4 close checklist: `docs/release/l6-4-close.md`
- L7-1 close checklist: `docs/release/l7-1-close.md`
- v0.1.0-alpha go checklist: `docs/release/v0.1.0-alpha-go-checklist.md`
- v0.1.0-alpha known limitations: `docs/release/v0.1.0-alpha-known-limitations.md`
- branch permissions matrix: `docs/release/branch-permissions-matrix.md`
- operations runbook: `docs/ops/runbook.md`
- CI policy: `docs/ci-policy.md`
- L5 plugin contract: `spec/plugin-contract-v1.md`
- L5 plugin SDK: `sdk/plugin/`
- L5 sample plugins: `samples/plugins/`
- default GUI local host asset: `docs/default-gui-host.html`
- default GUI handoff note: `docs/default-gui-host.md`
- host handoff (lip sync metadata): `docs/host-handoff/lip-sync-meta.md`

## CLI

- validate: read scenario only
- compile: read scenario, write IR
- run/trace: read IR, optional save read/write

Quick start (installed `f-core`):

- validate: `f-core validate ./scenario.md`
- compile: `f-core compile ./scenario.md -o ./game.ir.json`
- run: `f-core run ./game.ir.json --auto`
- trace: `f-core trace ./game.ir.json --seq`

`--auto` behavior:

- `run --auto` does not wait for interactive input.
- When a `choice` is reached, index `0` (first option) is selected automatically.
- If `--gui-bridge` is also set, bridge input (`choice.select`) takes precedence over
  auto-selection.

Security note: run the CLI with least privileges and only the minimum filesystem access needed for
the command. For Deno, prefer path-scoped permissions and avoid broad `--allow-read` /
`--allow-write` defaults. L4 plugin isolation uses subprocess execution, so `run` / `trace` require
`--allow-run` when launching via `deno run main.ts ...`.

Dependency note: `deno.json` includes `@std/assert` for tests only. It is not required for the
runtime CLI or compiled output.

## Testing

- local: `deno task test`
- CI (subprocess plugin tests + temp file tests): `deno task test:ci`
- boundary gate (manual): `deno task gate:boundary`
- presentation gate (manual): `deno task gate:presentation`
- operations gate (manual): `deno task gate:operations`
- gui bridge gate (manual): `deno task gate:gui-bridge`
- plugin license gate: `deno task audit:plugins`

Examples (path-scoped):

- validate: `deno run --allow-read=./scenario.md main.ts validate scenario.md`
- compile:
  `deno run --allow-read=./scenario.md --allow-write=./game.ir.json main.ts compile scenario.md -o game.ir.json`
- run:
  `deno run --allow-run --allow-read=./game.ir.json --allow-read=./save.json --allow-write=./save.json main.ts run game.ir.json --load save.json --save save.json`
- trace: `deno run --allow-run --allow-read=./game.ir.json main.ts trace game.ir.json --seq`
