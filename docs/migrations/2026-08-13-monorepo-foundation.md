# Portal Monorepo Foundation Migration

## Decision

Portal now tracks application and feature source in one Git repository. The
former parent integration repository remains the canonical `awesome-portal`
repository; it no longer clones, locks or deploys independently maintained
child worktrees.

The first mother-Portal layout is deliberately small:

| Imported source | Portal location | Imported local tip |
| --- | --- | --- |
| `git@github.com:BobbyAxerol/awesome-quant-portal.git` | `apps/portal/` | `feat/pypi-quantbt-smoke` at `c64d9a9ff950652c0d74d6312626b8bfbd1ebebb` |
| `https://github.com/BobbyAxerol/MigrationPlan.git` | `features/roadmap-task-board/` | `feat/phase5-release-readiness` at `a93a56148bd7d115de4b1dff478d1cb8a450c70e` |

Both imports use non-squashed `git subtree add`, so the selected source commits
and their full ancestry are reachable from the Portal history. This is critical
for the local-only Roadmap Phase 3–5 commits, which had not reached the former
source remote.

## What changed

- `apps/portal/` is the public Portal shell; QuantBT Research is its initial
  capability, not the parent product name.
- `features/roadmap-task-board/` is tracked in the same repository and remains
  an embedded feature with a private companion API.
- Public runtime names are `portal-web` and `portal-api`. Existing `/api`,
  `/roadmap-task-board/` and `/roadmap-task-board/api/` routes remain stable.
- `repos.conf`, `repos.lock` and source-sync tooling are retired. Root CI,
  Dependabot, CodeQL and image publishing operate directly on the tracked tree.
- `quantbt-engine==1.0.8` remains a constrained PyPI install; no engine source
  was imported.

## Follow-up boundary

This migration does not mix bug fixes or a large UI rewrite into the history
move. Future work can extract shared UI, contracts and a module registry from
`apps/portal/` once portal-domain interfaces have tests. Keep such refactors in
separate commits so migration provenance and runtime regressions stay easy to
trace.
