# FORK POLICY

This document defines how this fork is operated and synchronized.

Normative baseline:

- `docs/l7-2/fork-baseline.md`

Fork-local policy MAY extend this document, but MUST NOT weaken baseline requirements in
`docs/l7-2/fork-baseline.md`.

## 1) Fork Identity

- Fork name: `f-core/core`
- Fork role: `core`
- Repository owner: f-core project
- Primary maintainers: core maintainers group

## 2) Scope Boundary

- In-scope changes:
  - core runtime contracts and behavior
  - IR, validation, serialization, and CLI execution flow
  - bridge contract compatibility and safety gates
- Out-of-scope changes:
  - host-specific rich GUI behavior owned by official host track
  - production plugin distribution packaging policy
- Contract-sensitive areas:
  - IR (`schemaVersion`)
  - Plugin contract (`contractVersion`)
  - Error code mapping

## 3) Compatibility Rules

- No breaking contract change without ADR update first.
- Any break in `schemaVersion` or `contractVersion` requires:
  - explicit version bump
  - migration notes
  - compatibility test updates

## 4) Upstream Sync Policy

- Upstream remote: fork parent `f-core` canonical line
- Sync cadence: weekly and before release branch cut
- Sync owner: core maintainers group
- Conflict decision owner: core lead

Sync process:

1. Fetch upstream changes
2. Run mandatory checks
3. Resolve conflicts
4. Re-run checks
5. Record sync note

## 5) Mandatory Gates

Required before merge:

- `deno task test:pr`
- `deno task test:ci`
- `deno task gate:boundary`
- `deno task gate:operations` (if required by fork class baseline)
- `deno task gate:gui-bridge` (if required by fork class baseline)
- `deno task audit:plugins` (when plugin/license surface changes per baseline)

## 6) Ownership Split

- Core owner:
  - runtime contracts
  - execution semantics
  - error code stability
- Plugin owner:
  - plugin behavior
  - capability/manifest compliance
- Debugger/novel owner:
  - build evaluation artifacts
  - scenario/tooling experiments

## 7) Release and Rollback

- Canonical source-of-truth repository:
  - private canonical repo on GitHub (authoritative integration line)
- Public release repositories:
  - publish only approved minimum release payloads
- Release branch/tag convention:
  - release branches: `release/*`
  - tags: semantic prerelease or release tags (e.g. `v0.1.0-alpha`)
- Release approvers:
  - core lead
  - review lead
  - security lead
- Rollback unit:
  - CI config
  - contract validator
  - plugin/runtime integration points

## 8) Branch Creation Authorization

Reference:

- `docs/release/branch-permissions-matrix.md`

- Default branch creation authority:
  - core maintainers
- Limited branch creation authority:
  - ADR group and official host group MAY create `feature/*`, `fix/*`, `docs/*` branches only for
    scoped work
- Restricted branch creation:
  - only core maintainers MAY create `release/*`, `hotfix/*`, and publication branches

## 9) Branch Creation Criteria

Branch creation is permitted only when all are true:

1. Purpose is explicit and linked to issue/ADR.
2. Scope label is assigned (`core`, `host`, `plugin`, `release`).
3. Target branch policy matches purpose:
   - `feature/*` for normal changes
   - `release/*` for approved release preparation
   - `hotfix/*` for urgent correction
4. If publication-facing, mandatory checks are green on current base.

Allowed reasons:

- approved feature work
- reproducible bug fix
- release execution after Go criteria pass
- emergency correction for security/data-loss/runtime integrity

## 10) Prohibited Branch Actions

- Creating `release/*` without release approval.
- Publishing branches from failing gate states.
- Force-pushing from canonical private line to public release repos.
- Bypassing issue/ADR linkage for contract-sensitive changes.

## 11) Audit Trail Requirement

Each publication-facing branch action MUST be recorded in a release log entry that includes:

- requester
- approver
- purpose
- source commit SHA
- destination repo/branch
- expiration or close date

Log file path:

- `docs/release/release-branch-log.md`

## 12) Security and License

- Security contact:
- Vulnerability intake process:
- License review process:
- Required audit artifacts:
  - dependency audit
  - plugin/license audit

## 13) Operations and Observability

- Startup path guarantee:
- No-silent-wait policy handling:
- Machine-readable failure output path:
- Incident runbook location:

## 14) ADR Linkage

This fork follows, at minimum:

- `ADR-0040`
- `ADR-0041`
- `ADR-0042`
- `ADR-0043`
- `ADR-0049`

Fork-specific ADR additions:

-

## 15) Machine-Readable Policy File (Required)

This markdown policy must be paired with:

- `fork-policy.json`

Format is fixed to JSON (not TOML/YAML) to avoid parser drift across forks.

Minimum required keys:

- `forkRole` (`"core" | "plugin" | "debugger+novel" | "monorepo-baseline"`)
- `pluginSurfaceGlobs` (`string[]`)
- `dependencyAuditTriggerGlobs` (`string[]`)
- `requiredCiTasks` (`string[]`)
- `forkDestinations` (`Record<string, string>`)

`forkDestinations` MUST define, at minimum:

- `samples/plugins/**`
- `sdk/plugin/**`

CI trigger decisions must be based on `fork-policy.json`, not prose in this document.
