# P03 phase report — Research schema, identities and authorization

Status: `BACKEND_FOUNDATION_COMPLETE — 2026-09-19`.

P03 is complete as a backend foundation. It does not claim a new visible
product screen or a running Research service.

## Delivered

- Added additive migration `1723680000037_research-schema-foundation.sql`.
  Existing Portal identity/workspace rows and every Execution table retain
  their shape and values.
- Added `ResearchMetadataRepository`: every operation receives the existing
  Portal actor/workspace scope, opens one bounded transaction, drops to
  `portal_research_runtime`, verifies membership, applies timeout/lock
  budgets, and writes immutable audit metadata.
- Persisted alpha/version, attempts/primary runs, jobs/worker retries,
  studies/trials/selections/evaluations, append-only source exposure, sealed
  artifact/release-candidate metadata and actor-local inspection state.
- Enforced composite workspace/run ownership, idempotency, optimistic CAS,
  immutable version/evidence behavior, a no-cascade evidence path and a small
  four-operation admission cap above the existing ten-connection shared pool.
- Registered the repository as an internal Control API provider only. No
  controller, route, worker, source call, feature flag or frontend file was
  added.

## Verification

`P03-T01…T11` pass in one self-removing PostgreSQL 16 tmpfs cell. T01 includes
fresh/upgraded/repeated migration and an isolated `pg_dump`/`pg_restore` proof;
the rest covers cross-workspace denial, idempotency/CAS,
Execution-table role denial, evidence protection, query-plan/index proof,
worker retry identity plus fresh-connection persistence, nullable centroid selection, child/evaluation/exposure
relationships and non-mutating inspection updates.

The frozen P02 regression gate also passes after P03. Control API TypeScript
build and `git diff --check` pass. No browser build was run because P03 creates
no browser-consumable route; rebuilding one would consume resources without
testing this phase's changed surface.

## Coordination and next boundary

Claude owns any UI review or future browser implementation. See
[frontend-handoff-claude.md](./frontend-handoff-claude.md): it names the only
stable state/error semantics available now and prohibits fabrication of a
Research session or scheduled run UI.

P04 may consume P03's durable identities for a QuantBT adapter/resource
baseline. P05/P06 own artifact bytes and scheduler/workers; P10 owns the named
Research BFF/generated client. Those are explicit future phase gates, not
unresolved P03 work.

## Cleanup and rollback

The P03 test cell used only tmpfs and its exact-name trap removed it; the
post-test read-only Docker check found no matching container. At 51% workspace
filesystem free, P03 requires no cleanup. General Docker image inventory is a
separate protected C4 maintenance action, not a reason to prune within this
phase. Rollback is reader/image rollback with additive schema retained; see
[rollback.md](./rollback.md).
