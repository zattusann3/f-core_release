# Branch Permissions Matrix

This document defines branch authority by team so ownership is not forgotten after team expansion.

Effective date: 2026-02-14\
Applies to: canonical private repo and publication-facing repos

## Team Scope Policy

- Core team: core scope only
- Official host team: official host scope only
- Plugin team (currently inactive): plugin scope only after activation

Cross-scope changes are prohibited unless explicit exception flow is used.

## Branch Authority Matrix

| Team                       | Allowed Branch Types                                    | Allowed Scope                                               | Notes                                            |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Core team                  | `feature/*`, `fix/*`, `docs/*`, `release/*`, `hotfix/*` | `core`, release governance, cross-team integration approval | Owns final publication approval                  |
| Official host team         | `feature/*`, `fix/*`, `docs/*`                          | official host and host docs only                            | Cannot create `release/*` or `hotfix/*`          |
| Plugin team (inactive)     | none (until activation)                                 | none                                                        | Activation requires lead approval and onboarding |
| Plugin team (active state) | `feature/*`, `fix/*`, `docs/*`                          | plugin runtime/assets/docs only                             | Cannot create `release/*` or `hotfix/*`          |

## Exception Flow (Required for Cross-Scope Work)

All conditions are required:

1. Linked issue/ADR describes why cross-scope change is needed.
2. Scope owner approval is recorded before branch creation.
3. Branch is marked with scope labels (`core`, `host`, `plugin`, `release`).
4. Publication-facing work must pass mandatory gates.
5. Entry is added to:
   - `docs/release/release-branch-log.md`

## Prohibited Actions

- Host team modifying core contracts without core approval.
- Plugin team modifying core or host scope without approval.
- Any non-core team creating `release/*` or `hotfix/*`.
- Publishing branches from failing gate states.

## Activation Note for Plugin Team

When plugin team starts operation:

1. Assign maintainers and reviewers.
2. Enable plugin scope in branch permissions.
3. Update this matrix and `FORK_POLICY.md`.
4. Run onboarding with branch/gate policy acknowledgement.
