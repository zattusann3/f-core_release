# IR Specification (L1)

The Intermediate Representation (IR) is the canonical executable format of f-core.

It is designed to be:

- Human-readable
- Deterministic
- Stable
- Minimal

The IR is NOT an optimization target.
Transparency is prioritized over compactness.

---

## Format

The IR MUST be valid JSON.

Encoding requirements:

- UTF-8
- LF newline
- Pretty-printed (2 spaces)
- Stable key ordering

---

## Root Structure

Example:

```json
{
  "schemaVersion": 1,
  "engineVersion": "0.1.0",
  "entry": "start",
  "labels": {}
}
```

### Required Fields

#### schemaVersion (number)

Defines the IR schema.

Rules:

- Increment ONLY on breaking changes.
- Runtimes MUST reject unsupported versions.
- schemaVersion is fixed at 1 for L1 and will not change within L1.

Failing early is safer than undefined execution.

---

#### engineVersion (string)

Represents the engine build that produced the IR.

Used for diagnostics only.

Compatibility MUST NOT depend on this value.

---

#### entry (string)

The label where execution begins.

For L1, this MUST be `"start"`.

Future versions MAY relax this requirement.

---

#### labels (object)

A mapping of label name → instruction list.

Example:

```json
{
  "start": [ ... ]
}
```

Rules:

- Labels MUST be unique.
- Every label MUST terminate with `end`.
- No instructions are allowed after `end`.

---

## Instruction Model

Instructions are executed sequentially.

Each instruction is an object containing an `op` field.

Example:

```json
{ "op": "say", "text": "Hello." }
```

The VM translates operations into internal Effects.

Effects MUST NOT appear in the IR.

---

## Instructions (L1)

### say

Displays text to the user.

Example:

```json
{ "op": "say", "text": "Good morning." }
```

Fields:

- `text` (string, required)
- `meta` (object, optional)
  - Optional host-facing metadata carried through runtime UI events.
  - Unknown keys are allowed for forward-compatible host extensions.

The engine transports text.
It does not interpret formatting.

---

### choice

Presents selectable branches.

Example:

```json
{
  "op": "choice",
  "options": [
    { "text": "Go outside", "to": "outside" },
    { "text": "Stay", "to": "stay" }
  ]
}
```

Fields:

- `options` (array, required)

Each option:

- `text` (string, required)
- `to` (string, required)

Rules:

- At least one option is required.
- Destination labels MUST exist.

---

### end

Terminates execution.

Example:

```json
{ "op": "end" }
```

No fields.

Execution MUST stop immediately.

---

## Determinism

The same IR MUST always produce the same execution path
for identical user input.

Sources of nondeterminism are forbidden unless explicitly introduced
by future plugin capabilities.

---

## Validation Requirements

Compilers MUST guarantee:

- valid label references
- schema compliance
- structural correctness

The runtime SHOULD assume the IR is valid.

Runtime validation is a safety net — not the primary defense.

---

## Stability Policy

The IR is a contract.

Rules:

- Fields MUST NOT change meaning.
- Required fields MUST NOT be removed.
- New optional fields MAY be added.
- Breaking changes REQUIRE a schemaVersion bump.

Stability enables tooling.

---

## Future Extension Model

Extensions MUST follow these principles:

- Preserve readability
- Avoid implicit behavior
- Prefer explicit structure

Likely future additions:

- variables
- conditional nodes
- jump instructions
- optional metadata

Presentation (GUI, audio, rendering) MUST remain outside the IR.

The IR describes narrative logic — not presentation.

---

## Philosophy

Small IR.
Clear behavior.
No magic.

Explicit structure is kindness to future readers.
