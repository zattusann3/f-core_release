# Plugin Contract v1

Status: Active (L5 baseline) Contract version: `1`

This document defines the plugin invocation contract for plugin authors and host/runtime
implementers.

## Goals

- Keep plugin behavior deterministic and auditable.
- Make failure ownership explicit.
- Keep message schemas stable across core/plugin teams.

## Compatibility and Versioning

- All requests/responses MUST include `contractVersion`.
- `contractVersion` is fixed to `1` for this contract.
- Breaking changes MUST bump `contractVersion` and require an ADR update before implementation.
- Additive fields MAY be introduced in v1 if they are optional and existing semantics do not change.

## Manifest Shape

Each plugin package MUST expose a manifest with capability/primitive declarations.

```ts
export type PluginManifestV1 = {
  contractVersion: 1;
  pluginName: string;
  capabilities: string[];
  primitives: string[];
};
```

Rules:

- `capabilities` and `primitives` are deny-by-default declarations.
- Runtime execution requires both checks to pass:
  - scenario allowlist check (`{{# plugin: name }}`)
  - manifest capability/primitive check
- Unknown or undeclared primitive access is denied.

## Invocation Request Schema

```ts
export type PluginInvokeRequestV1 = {
  contractVersion: 1;
  requestId: string;
  primitive: string;
  attrs: Record<string, string>;
};
```

Semantics:

- `requestId` is host-assigned and is stable per invocation.
- `primitive` is the target primitive/plugin entry name.
- `attrs` values are strings; plugin-side parsing/validation is explicit.

## Response Schema

Success:

```ts
export type PluginInvokeSuccessV1 = {
  contractVersion: 1;
  requestId: string;
  ok: true;
  effect?:
    | { kind: "ui.render"; text: string }
    | { kind: "debug.log"; message: string };
};
```

Failure:

```ts
export type PluginInvokeFailureV1 = {
  contractVersion: 1;
  requestId: string;
  ok: false;
  message: string;
};
```

Combined:

```ts
export type PluginInvokeResponseV1 = PluginInvokeSuccessV1 | PluginInvokeFailureV1;
```

## Error Envelope and Ownership

- Plugin-side failure (validation/domain failure/exception) is returned via plugin response and
  normalized by core as `E0704`.
- Host/runtime enforcement failures are produced by host side:
  - timeout: `E0705`
  - cancellation: `E0706`
- `E0705` / `E0706` are terminal failures. Execution MUST stop and MUST NOT continue.

## Timeout / Cancel Rule

- Host/runtime enforces timeout/cancel boundaries.
- Timeout/cancel MUST perform hard-stop termination of the active isolation unit.
- If timeout and cancellation are observed at the same boundary, timeout takes precedence (`E0705`).

## Message Size Limits (v1)

Host-plugin IPC limits per invocation:

- Max request bytes: `65536`
- Max response bytes: `65536`

Requests/responses exceeding limits MUST be rejected as plugin invocation failure.

## Determinism and Security Constraints

Plugin logic MUST NOT:

- use `eval` / `Function`
- use dynamic import or runtime code loading
- access FS/network/env/process/run/ffi directly
- use direct nondeterminism (`Date.now`, `Math.random`) without approved primitive path

Plugin execution unit MUST run with deny-by-default permissions and communicate through structured
messages only.

## Executable Examples

Request:

```json
{
  "contractVersion": 1,
  "requestId": "req-001",
  "primitive": "ui.render",
  "attrs": { "text": "Hello" }
}
```

Success response:

```json
{
  "contractVersion": 1,
  "requestId": "req-001",
  "ok": true,
  "effect": { "kind": "ui.render", "text": "Hello" }
}
```

Failure response (plugin-side):

```json
{
  "contractVersion": 1,
  "requestId": "req-001",
  "ok": false,
  "message": "text is required"
}
```
