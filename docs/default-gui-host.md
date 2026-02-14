# Default GUI Host (Local HTML)

This file documents the default GUI host asset for debugger handoff.

- Host asset: `docs/default-gui-host.html`
- Protocol: JSONL bridge (`ui.*` events from engine, `choice.select` commands from UI)

## Positioning

- This host is a minimal reference implementation for bridge conformance.
- Official feature-forward HTML host development is owned by:
  `f-core/debugger-novel/`
- Advanced presentation features should be implemented in the official
  host track without weakening ADR-0048/ADR-0051 invariants.

## What This HTML Provides

- Renders `ui.say` text lines.
- Ignores unknown optional `ui.say.meta` fields (forward-compatible).
- Renders `ui.choice.present` choice buttons.
- Emits `choice.select` commands with `schemaVersion: 1`.
- Keeps an outbox JSONL buffer for stdin submission.
- Accepts optional `postMessage` envelope:
  - Engine -> UI: `{ channel: "f-core.ui.event", payload: <ui-event> }`
  - UI -> Host: `{ channel: "f-core.ui.command", payload: <ui-command> }`

## Quick Local Check

1. Open `docs/default-gui-host.html` in a browser.
2. Paste sample lines in "Engine -> UI JSONL":
   ```json
   {"schemaVersion":1,"event":"ui.say","text":"Hello from engine."}
   {"schemaVersion":1,"event":"ui.choice.present","choices":[{"text":"A","to":"route_a"},{"text":"B","to":"route_b"}],"requestId":"choice-1"}
   ```
3. Click `Apply lines`.
4. Click a choice button and verify "UI -> Engine JSONL" appends:
   ```json
   { "schemaVersion": 1, "command": "choice.select", "requestId": "choice-1", "index": 0 }
   ```

## Engine-side CLI Verification

```sh
deno run --allow-read=./scenario_l4_2.md --allow-write=./tmp/fcore_gui.ir.json main.ts compile scenario_l4_2.md -o ./tmp/fcore_gui.ir.json
deno run --allow-run --allow-read=./tmp/fcore_gui.ir.json main.ts run ./tmp/fcore_gui.ir.json --gui-bridge --auto
```

Expected stdout JSONL includes:

- `ui.say`
- `ui.choice.present`
- `ui.choice.select`
