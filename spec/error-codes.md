# Error Code Specification (L1+)

This document defines the error code system used by f-core.

Error codes provide stable, machine-readable identifiers for diagnostics.

They MUST remain stable once published.

---

## Format

All error codes follow:

E####

Example:

E0301

- `E` — error prefix
- First two digits — category
- Last two digits — specific error

Numbers do NOT need to be contiguous.

Gaps are allowed and encouraged to preserve stability.

Warning codes follow the same shape:

W####

Example:

W0301

- `W` — warning prefix
- Digits follow the same category conventions as errors

---

## Design Principles

- Error codes MUST NOT change meaning once released.
- Messages MAY improve for clarity.
- New codes MAY be added at any time.
- Removed codes MUST NOT be reused.

Failing fast is good.
Failing clearly is better.

---

## Categories

### E01xx — Parsing Errors

Syntax-level issues that prevent reliable parsing.

Examples:

- malformed tag
- invalid label declaration
- unterminated block

These MAY be fatal depending on recovery capability.

---

### E02xx — Structural Errors

Tag structure is invalid but parsing can often continue.

Examples:

- unclosed `choice`
- nested `choice`
- unexpected `end`

Recovery SHOULD be attempted to surface additional errors.

---

## Example Codes (Structural)

### E0201 — Instruction must be an object
An instruction entry is not a JSON object.

### E0202 — Unknown instruction op
The `op` field is missing or not a supported L1 instruction.

### E0203 — Invalid choice options array
`choice.options` is missing, not an array, or empty.

### E0204 — Invalid choice option shape
A choice option is not an object or is missing required fields.

### E0205 — Label must map to instruction array
A label entry does not map to an instruction array.

---

### E03xx — Rule Violations

Violations of f-core script rules.

Examples:

- missing `start` label
- label not terminated with `end`
- content after `end`
- duplicate label

These are compile-time errors.

---

### E04xx — Reference Errors

Failures in symbolic resolution.

Examples:

- undefined label
- invalid jump target
- broken choice destination

Compilation MUST fail.

---

### E05xx — IR / Version Errors

Incompatibilities between runtime and IR.

Examples:

- unsupported `schemaVersion`
- corrupted IR
- missing required fields

Runtime MUST terminate safely.

---

### E07xx — Plugin Runtime Errors

Plugin runtime setup or invocation failures.

Examples:

- plugin runtime missing for plugin-enabled IR
- plugin manifest missing or invalid
- plugin invocation failed

Runtime MUST terminate safely.

---

## Warnings

Warnings are non-fatal diagnostics.

Policy:
- `validate` SHOULD exit 0 when warnings exist (and print `OK (warnings: N)` to stdout).
- `compile` MAY emit warnings to stderr but SHOULD still produce output when compilation succeeds.
- Warnings MUST NOT change execution semantics.

Reserved range:
- W08xx is reserved for UX-only warnings (typos/candidates/suggestions).
  Existing warning codes remain valid.

---

## Example Codes (Initial Set)

These form the minimal L1 baseline.

### E0101 — Input too large
The input exceeds the maximum total character limit.

### E0102 — Too many lines
The input exceeds the maximum line count limit.

### E0103 — Line too long
A single line exceeds the maximum line length limit.

### E0301 — Missing start label
The scenario does not define `{{# label: start }}`.

### E0302 — Label not terminated with end
A label block is missing `{{ end }}`.

### E0303 — Content after end
No content is allowed after an `end` within a label.

### E0304 — Duplicate label
Multiple labels share the same identifier.

### E0305 — Choice index must be an integer
The choice selection returned a non-integer index.

### E0306 — Choice index out of range
The choice selection returned an index outside the available options.

### E0312 — Invalid set value type
The `set` value must be boolean, number, or string.

### E0313 — Invalid if equality usage
Equality comparison cannot be combined with negation.

### E0314 — Invalid if value type
An `if` without equality requires a boolean value.

### E0320 — Invalid plugin name
Plugin names must follow the allowed name format and must not collide with reserved core tags.

### E0321 — Duplicate plugin allowlist entry
The same plugin appears more than once in the scenario/IR allowlist.

### E0322 — Plugin is not allowlisted
A plugin execution tag references a plugin that is not in the allowlist.

### E0323 — Invalid plugin attributes
Plugin attributes must be an object with valid keys and string values.

### E0401 — Undefined label reference
A choice or jump references a label that does not exist.

### E0501 — Unsupported schemaVersion
The runtime cannot execute this IR version.

### E0502 — Invalid engineVersion
`engineVersion` must be a string.

### E0505 — Reserved label name
Reserved keys (`__proto__`, `constructor`, `prototype`) are not allowed as label names and must not appear in externally keyed maps (e.g. `labels`).

### E0506 — Invalid IR JSON
The IR file could not be parsed as JSON.

### E0507 — Invalid plugins field
`plugins` must be an array of valid plugin names.

### E0601 — Save load failed
The save file could not be read or was invalid.

### E0602 — IR file read failed
The IR file could not be read from disk.

### E0701 — Plugin runtime required
The IR declares plugins, but no plugin runtime is configured.

### E0702 — Plugin manifest required
The IR declares plugins, but required plugin manifests are missing.

### E0703 — Plugin manifest denied
A plugin manifest fails validation or capability/primitive checks.

### E0704 — Plugin invocation failed
The runtime attempted to invoke a plugin and the invocation failed.

### E0705 — Async plugin timeout
An async plugin operation exceeded its configured timeout bound.

### E0706 — Async plugin cancelled
An async plugin operation was cancelled and execution was stopped.

---

## Example Warning Codes

### W0301 — Variable referenced before any set
An `if` reads a variable that has not been set anywhere in the IR.

---

## Output Requirements

Diagnostics MUST include:

- error code
- file
- line (when available)
- human-readable message

Example:
ERROR E0401 scenario.md:12
Undefined label “outside”

Machines read the code.
Humans read the message.

Both matter.

---

## Stability Policy

- Codes are permanent identifiers.
- Meaning MUST NOT drift.
- Messages MAY evolve.
- New categories MAY be introduced if necessary.

Stability is more valuable than perfection.
