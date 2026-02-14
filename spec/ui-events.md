# UI Event Specification (L4-2)

This document defines the UI event channel used by f-core runtime in
L4-2.

## Purpose

- Separate UI rendering events from debug trace output.
- Keep core runtime host-agnostic (CLI/Desktop/Web).
- Provide a stable, deterministic event contract.

## Format

- Output is structured JSON-compatible event objects.
- UI channel is separate from trace.
- Events are serializable and host-transport agnostic.

## Schema Version

- All UI events MUST include `schemaVersion`.
- `schemaVersion` is fixed to `1` in L4-2.
- Breaking field/event changes require a version bump.

## Common Fields

All UI events MUST include:

- `schemaVersion` (number, must be `1`)
- `event` (string)

Events SHOULD include when applicable:

- `label` (string)
- `ip` (number)

## MVP Event Types

### ui.say

Emitted when text should be presented.

Required fields:

- `text` (string)

Optional fields:

- `meta` (object)
  - Host-consumed optional metadata.
  - Unknown `meta.*` keys SHOULD be ignored by hosts.
  - Absence of `meta` MUST preserve existing default behavior.

Example:

```json
{"schemaVersion":1,"event":"ui.say","label":"start","ip":0,"text":"Hello."}
```

Example with optional metadata:

```json
{"schemaVersion":1,"event":"ui.say","label":"start","ip":0,"text":"Hello.","meta":{"mouth":{"mode":"phoneme","mou":"oaou"}}}
```

### ui.choice.present

Emitted when choices should be shown.

Required fields:

- `choices` (array)

Each choice item:

- `text` (string)
- `to` (string)

Example:

```json
{"schemaVersion":1,"event":"ui.choice.present","label":"start","ip":1,"choices":[{"text":"Go","to":"out"},{"text":"Stay","to":"stay"}]}
```

### ui.choice.select

Emitted after host UI returns the selected index.
This event is mandatory in L4-2 MVP.

Required fields:

- `index` (number, zero-based)
- `to` (string)
- `nextLabel` (string, same as `to` in L4-2)

Example:

```json
{"schemaVersion":1,"event":"ui.choice.select","label":"start","ip":1,"index":0,"to":"out","nextLabel":"out"}
```

## Host Boundary

- Core runtime MUST NOT render UI directly.
- Host runtime owns rendering and input.
- CLI MAY mirror UI events as JSONL for debugging/tooling.
- In L4-2 CLI, `f-core run <game.ir.json> --ui-jsonl` emits UI events as JSONL.
- In CLI `run --auto`, interactive input is skipped and `choice` selects index `0`.

## Stability

- Event names are stable once published.
- New optional fields MAY be added.
- Existing required fields MUST NOT change meaning without a
  `schemaVersion` bump.
