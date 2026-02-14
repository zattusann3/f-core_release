# SECURITY (Template)

This file defines security reporting and handling for this fork.

Normative baseline:
- `docs/l7-2/fork-baseline.md`

## 1) Reporting

- Security contact:
- Preferred channel:
- Expected acknowledgement time:

Do not post unpatched vulnerabilities in public issue trackers.

## 2) Scope

Security-relevant areas include:

- runtime contract validation
- plugin isolation and capability enforcement
- timeout/cancel fail-stop behavior
- UI bridge schema validation
- dependency and license supply-chain checks

## 3) Severity Levels

- Critical: arbitrary code execution, sandbox escape, auth bypass
- High: contract bypass, silent execution continuation after terminal failure
- Medium: observability gaps, degraded but recoverable isolation
- Low: non-exploitable hardening gaps

## 4) Required Security Gates

- `deno task test:pr`
- `deno task test:ci`
- `deno task gate:boundary`
- `deno task gate:operations` (if present)
- `deno task gate:gui-bridge` (if present)
- `deno task audit:plugins` (when plugin/license surface changes)

## 5) Vulnerability Handling

1. Triage and assign severity
2. Reproduce with minimal case
3. Fix with tests
4. Verify no regression
5. Publish advisory and patch note

## 6) Hard Requirements

- Failures must emit stable error codes.
- Terminal timeout/cancel must not continue execution.
- Unknown schema/contract inputs must fail closed where required.
- Security-critical changes require ADR + spec alignment.

## 7) Disclosure Policy

- Coordinated disclosure by default.
- Public disclosure after patch availability, unless legal policy differs.
