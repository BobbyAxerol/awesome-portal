# ADR-001 — JavaScript workspace and lock authority (npm → pnpm)

> **Status:** Proposed for owner confirmation (BAR-06 prerequisite)<br>
> **Date:** 2026-08-15<br>
> **Required by:** U09 monorepo platform tooling

## Context

The monorepo currently has four independent npm boundaries (portal frontend,
planning frontend, control-api, contracts workspace), each with its own
lockfile. U09 requires one JavaScript workspace/lock authority before the
generated clients replace handwritten API shapes. The guide names the
migration "npm-to-pnpm".

## Decision

- Adopt **pnpm workspaces** as the single JavaScript authority with one root
  `pnpm-workspace.yaml` and one lockfile at the repo root.
- Workspace members: `apps/portal/frontend`, `features/roadmap-task-board/frontend`,
  `apps/control-api`, `packages/contracts`, `packages/ui` (U09).
- Migration is phased: add the workspace + lockfile; convert members one
  coherent PR at a time; **no npm and pnpm authority coexist after cutover**
  (each member switches fully in its PR).
- CI keeps `npm ci` jobs until the cutover PRs land, then a single pnpm gate
  replaces them.

## Rejected alternatives

- npm workspaces: weaker strictness, slower installs, no content-addressed
  store; the guide already telegraphs pnpm.
- Yarn/Bun: no team evidence; pnpm is the neutral documented choice.

## Security/operations impact

- Lockfile churn is reviewed like any dependency change; no new runtime deps
  are introduced by the migration itself.

## Migration and rollback

- Cutover per member: freeze lockfile, convert, run tests/builds, merge.
- Rollback = revert the member PR; the root workspace remains additive until
  the last member converts.

## Acceptance evidence

- One root lockfile; every member builds/tests under pnpm; `portal doctor`
  reports a single JS toolchain version.
