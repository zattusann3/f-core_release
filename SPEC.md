f-core Specification (L1)

Overview

f-core is a minimal, strict, CLI-first visual novel virtual machine.

Design goals:
	•	Author-first
	•	Fail-fast but author-friendly diagnostics
	•	Human-readable IR
	•	Deterministic execution
	•	Single binary distribution
	•	No implicit control flow
	•	Plugin-safe architecture

⸻

Execution Model

f-core uses a sequential virtual machine.

Characteristics:
	•	No implicit fallthrough
	•	No hidden transitions
	•	Explicit termination via end
	•	Deterministic behavior

Future extensibility is enabled via an Effect model:

Continue | Jump | End | Yield


⸻

Distribution Model

engine (single binary)
scenario.md OR game.ir.json (external)

The engine MUST NOT require installation.

⸻

CLI Interface

f-core validate <scenario.md>
f-core compile <scenario.md> -o game.ir.json
f-core run <game.ir.json>
f-core trace <game.ir.json>

Commands MUST NOT be merged to reduce cognitive load.

Security (CLI)

The CLI MUST run with least privileges:
	•	validate/compile require read-only access to input files
	•	run/trace require read-only access to IR and optional save input
	•	save output is allowed only to the explicitly provided path

The CLI MUST NOT request broad host permissions by default.

For Deno-based distribution, permissions SHOULD be path-scoped
(e.g., allow-read/write only for the specific input/output paths).

⸻

Script Rules

Label

{{# label: start }}

Rules:
	•	start label is REQUIRED
	•	Labels MUST be unique
	•	Labels MUST end with {{ end }}
	•	Any content after end is a compile error

⸻

Paragraph → say

Empty-line separated paragraphs become:

{ op: "say" }

Formatting is ignored.

The engine transports text — it does not interpret it.

⸻

choice

{{# choice }}
- Go outside -> out
- Sleep -> sleep
{{/ choice }}

Rules:
	•	At least one item required
	•	Destination labels MUST exist
	•	Nesting is forbidden

⸻

IR Format

Human-readable JSON is REQUIRED.

Example root:

{
  "schemaVersion": 1,
  "engineVersion": "0.1.0",
  "entry": "start",
  "labels": {}
}

Key order MUST remain stable.

⸻

Parser Philosophy

Ultra-strict.

Errors are collected when possible.

Categories:
	•	Fatal — parsing cannot continue
	•	Recoverable — continue collecting errors

Diagnostics MUST include:
	•	file
	•	line
	•	error code
	•	message

⸻

Plugin Architecture

Plugins are deterministic.

Handler contract:

(context, pluginState, args)
 -> (effect, newState)

Forbidden:
	•	eval
	•	arbitrary filesystem access
	•	uncontrolled network calls

Capabilities MUST be declared.

⸻

pluginState

Runner maintains:

pluginState.plugins[reverse-domain-id]

Plugins MUST NOT modify other namespaces.

⸻

Built-in Primitives

Core provides:
	•	ui.print
	•	ui.promptChoice
	•	flow.jump
	•	flow.end
	•	time.sleep
	•	debug.log
	•	debug.trace

Plugins compose primitives — they do not replace them.

⸻

VM Philosophy

f-core is a closed-flow narrative VM.

Explicit structure is preferred over convenience.

Small is safe.
Strict is kind.
