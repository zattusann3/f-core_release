# Trace Output Format (L1)

This document defines the trace output produced by:

- `f-core trace <game.ir.json>`

## Format

- Output is JSON Lines (one JSON object per line).
- UTF-8 encoded.
- Lines end with LF (`\n`).
- Each line is a single event.
- Output is written to STDOUT.

The trace stream MUST be valid JSONL and MUST be readable line-by-line.

## Trace Version

- `traceVersion` is `1` for this document.
- A change that removes or changes the meaning of an existing event name or field requires a `traceVersion` bump.
- Adding new events or new optional fields does not require a bump.

## Common Fields

All events MUST include:

- `traceVersion` (number) — must be `1`
- `event` (string)
- `step` (number) — zero-based monotonic counter, increments per executed instruction

Events SHOULD include when applicable:

- `label` (string)
- `ip` (number) — instruction pointer within the current label
- `op` (string)

Events MAY include:

- `seq` (number) — monotonically increasing sequence number starting at 0
- `ts` (string) — RFC 3339 timestamp (UTC recommended)

`seq` emission:
- By default, `seq` MAY be omitted.
- The CLI MAY add `seq` when requested (e.g. `f-core trace <game.ir.json> --seq`).

## Semantics

- `label` and `ip` refer to the instruction about to be executed unless stated otherwise.
- `vm.step` is emitted immediately before executing the instruction at (`label`, `ip`).
- `vm.say` and `vm.choice.present` are emitted while executing the instruction at (`label`, `ip`).
- `vm.choice.select` is emitted after user selection is made for the `choice` instruction at (`label`, `ip`) and before control flow jumps.
- `vm.end` is emitted when the `end` instruction at (`label`, `ip`) is executed.
- `step` increments by 1 per executed instruction and is included in all events for that instruction.

## Event Types (Initial)

### vm.step

Emitted for each VM step.

Required fields:

- `label`
- `ip`
- `op`

Example:

```json
{"traceVersion":1,"event":"vm.step","step":0,"label":"start","ip":0,"op":"say"}
```

### vm.say

Emitted when a `say` op is executed.

Fields:

- `label`
- `ip`
- `text` (string)

Example:

```json
{"traceVersion":1,"event":"vm.say","step":0,"label":"start","ip":0,"text":"Hello."}
```

### vm.choice.present

Emitted when a `choice` op is presented.

Fields:

- `label`
- `ip`
- `choices` (array)

Each choice item:

- `text` (string)
- `to` (string) — destination label

Example:

```json
{"traceVersion":1,"event":"vm.choice.present","step":1,"label":"start","ip":1,"choices":[{"text":"Go","to":"out"},{"text":"Sleep","to":"sleep"}]}
```

### vm.choice.select

Emitted when a choice is selected.

Fields:

- `label`
- `ip`
- `index` (number) — zero-based index into `choices`
- `to` (string)
- `nextLabel` (string) — same as `to` (reserved for future expansion)

Example:

```json
{"traceVersion":1,"event":"vm.choice.select","step":1,"label":"start","ip":1,"index":0,"to":"out","nextLabel":"out"}
```

### vm.end

Emitted when `end` is reached.

Fields:

- `label`
- `ip`

Example:

```json
{"traceVersion":1,"event":"vm.end","step":2,"label":"out","ip":5}
```

### vm.error

Emitted when runtime execution fails and exits with an error.
This event is emitted as a machine-readable JSON line on `stderr`
by CLI runtime wrappers (`run`/`trace`), not on the normal trace
`stdout` stream.

Fields:

- `code` (string)
- `message` (string)
- `file` (string)
- `label` (string, optional)
- `ip` (number, optional)
- `command` (string) — `run` or `trace`

Example:

```json
{"traceVersion":1,"event":"vm.error","code":"E0705","message":"plugin timed out","file":"game.ir.json","label":"start","ip":3,"command":"run"}
```

## Stability

- Event names are stable once published.
- New events MAY be added in the future.
- New optional fields MAY be added to existing events.
- Existing required fields MUST NOT be removed or have their meaning changed without bumping `traceVersion`.
