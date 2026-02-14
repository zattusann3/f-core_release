# Host Handoff: ui.say Metadata for Lip Sync

Updated: 2026-02-13
Owner: core team -> official HTML host team

## Scope

This document defines the core-to-host contract for optional lip-sync
metadata transport on `ui.say`.

Normative references:
- `adr/ADR-0052 — ui.say Meta Transport for Host Lip Sync`
- `adr/ADR-0048 — Default GUI Local HTML Messaging (Proposed)`
- `adr/ADR-0051 — Host Adapter Policy and Electron Experimental Recommendation`

## Contract Change

`ui.say` now supports optional `meta`:

```json
{
  "schemaVersion": 1,
  "event": "ui.say",
  "label": "start",
  "ip": 0,
  "text": "おはよう。準備できた？",
  "meta": {
    "mouth": {
      "mode": "phoneme",
      "mou": "oaou"
    }
  }
}
```

## Compatibility Rules

- `schemaVersion` stays `1`.
- Existing required fields (`schemaVersion`, `event`, `text`) are
  unchanged.
- `meta` is optional.
- If `meta` is missing, host behavior MUST remain the current default.
- Unknown `meta.*` keys SHOULD be ignored.
- Invalid/missing mouth metadata SHOULD fail soft and fallback to
  default mouth behavior.

## Core Validation Rules

- `say.meta` must be an object when provided.
- `say.meta` accepts JSON-compatible nested values only.
- Reserved keys are rejected inside `say.meta`.

## Reference Expectations for Official Host

- Parse `meta.mouth.mode` and `meta.mouth.mou` when present.
- Do not require metadata for normal dialogue.
- Keep punctuation pause / `sil` fallback behavior host-side.
- Do not change bridge framing or command protocol.

## Phase 1 Fixed Host Defaults

1) Asset naming
- Phase 1 reference naming is fixed to:
  - `<speaker>_mouth_a.png`
  - `<speaker>_mouth_i.png`
  - `<speaker>_mouth_u.png`
  - `<speaker>_mouth_e.png`
  - `<speaker>_mouth_o.png`
  - `<speaker>_mouth_n.png`
  - `<speaker>_mouth_sil.png`
  - `<speaker>_mouth_pau.png`
- Host MAY support additional aliases, but the above set is baseline.

2) `n` handling
- `n` mouth shape is required in Phase 1 baseline.
- If asset is missing, host SHOULD fail-soft to `sil`.

3) Pause duration
- Punctuation pause for `、。！？…` is fixed to `120ms` in Phase 1.
- Host MAY make this configurable later, but default must remain `120ms`
  unless superseded by ADR/issue decision.

4) Narrator default
- Lines without speaker are not lip-sync targets by default.
- Host SHOULD skip mouth animation for narrator lines.

## Test Vectors

1) No metadata (baseline)
```json
{"schemaVersion":1,"event":"ui.say","text":"Hello"}
```
Expected: existing mouth auto behavior.

2) Valid phoneme metadata
```json
{"schemaVersion":1,"event":"ui.say","text":"Hello","meta":{"mouth":{"mode":"phoneme","mou":"oaou"}}}
```
Expected: host uses phoneme mode.

3) Unknown metadata keys
```json
{"schemaVersion":1,"event":"ui.say","text":"Hello","meta":{"mouth":{"mode":"phoneme","mou":"oaou"},"future":{"x":1}}}
```
Expected: host ignores unknown keys and continues.

4) Invalid metadata payload
```json
{"schemaVersion":1,"event":"ui.say","text":"Hello","meta":"bad"}
```
Expected: rejected at core IR validation stage.
