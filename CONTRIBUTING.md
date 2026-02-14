# CONTRIBUTING

This file defines contribution workflow for this fork.

Normative baseline:

- `docs/l7-2/fork-baseline.md`

## 1) Branch and PR Rules

- Branch naming:
  - `feature/<topic>`
  - `fix/<topic>`
  - `docs/<topic>`
  - `release/<version>`
  - `hotfix/<topic>`
- PR title format:
  - `<scope>: <short summary>`
  - examples: `core: tighten say.meta validation`, `release: prepare v0.1.0-alpha`
- Required reviewers:
  - normal changes: at least 1 core maintainer
  - contract-sensitive changes: core maintainer + review lead
  - release changes: core lead + review lead + security lead

## 2) Branch Creation Authorization and Timing

Reference:

- `docs/release/branch-permissions-matrix.md`

- Core maintainers can create any branch type.
- ADR group / official host group can create `feature/*`, `fix/*`, `docs/*` only.
- Only core maintainers can create `release/*` and `hotfix/*`.

Branch creation requires:

1. Linked issue or ADR.
2. Declared reason (`feature`, `bugfix`, `release`, `hotfix`).
3. Scope label (`core`, `host`, `plugin`, `release`).
4. For release/publication branches, base commit with green mandatory checks.

## 3) Change Scope

- Keep PRs small and single-theme.
- Contract-sensitive changes require ADR update first.
- Avoid mixing core/runtime and plugin behavior changes in one PR.

## 4) Required Checks

Run before opening or merging PR:

- `deno task test:pr`
- `deno task test:ci`
- `deno task gate:boundary`
- `deno task gate:operations` (if present)
- `deno task gate:gui-bridge` (if present)
- `deno task audit:plugins` (when plugin/license surface changes)

## 5) Compatibility Policy

- No breaking change inside same `schemaVersion` / `contractVersion`.
- Breaking changes require:
  - ADR update
  - explicit version bump
  - migration notes

## 6) Review Checklist

- Scope is clear and bounded.
- Error mapping is stable and documented.
- Timeout/cancel behavior is preserved where relevant.
- Security boundary checks are not bypassed.
- Tests cover success and failure paths.

## 7) Merge Criteria

PR can merge only when:

- required checks pass
- required approvals are present
- no unresolved blocking review comments remain

## 8) Prohibited Actions

- Creating `release/*` without approval.
- Publishing from an untagged/unapproved branch.
- Force-pushing to public release branches from canonical private line.
- Merging contract-sensitive changes without ADR link.

## 9) Branch/Release Audit Log

For every publication-facing branch or release PR, add a log entry in the release notes/checklist
that includes:

- requester
- approver
- purpose
- source commit SHA
- target branch/repository
- date

Log file path:

- `docs/release/release-branch-log.md`

## 10) Documentation Updates

Any contract/behavior change must update:

- relevant ADR
- spec docs
- runbook or policy docs (if operations impact exists)
