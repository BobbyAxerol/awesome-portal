# RS-03 — Rich consumer integration, independent acceptance and P18 entry

**Status:** `BACKEND_INDEPENDENT_ACCEPTANCE_COMPLETE · FEATURE_DARK · CLAUDE_RS03_INTEGRATION_PENDING`  
**Date:** 2026-09-22  
**Worktree / branch:** `/home/bobby/portal-research` / `docs/research-loop-plan`

RS-03 adds the missing independent backend acceptance lane for the RS-02
retained-current-source consumer. It verifies the actual Control API rather
than adding another reader, changing source data, or claiming frontend/product
acceptance early.

The full record is [phase-report.md](./phase-report.md). Claude must start
from [frontend-handoff-claude.md](./frontend-handoff-claude.md) and retain the
RS-02 [field/action matrix](../RS-02/field-action-coverage-matrix.md).

## What this checkpoint proves

- A real authenticated same-origin request reaches each of the six named
  S04–S08 reads from one actual sealed PostgreSQL corpus: Evidence, Evidence
  Series, Split, Search, Freeze and Replay.
- The boundary preserves exact decimal strings, UTC epoch milliseconds,
  provenance, availability, immutable revision and the 1 MiB response budget.
- Search/replay use `private, no-store`; their cursors/playheads are opaque,
  workspace-, relation- and revision-bound. Immutable Evidence supports a
  matching ETag/304 only.
- No browser request selects a relation/table/artifact, sees an arbitrary
  retained payload, reaches a foreign workspace, or turns a model sample into
  broker/execution state.

## What it deliberately does not claim

- It does not activate `FEATURE_RESEARCH_CURRENT_SOURCE`, deploy a runtime,
  or call QuantBT, a worker, an artifact filesystem, Execution, Trading
  System, Redis, broker or CLI on a GET.
- It does not replace Claude's rich S04–S08 shells with a generic envelope,
  make browser screenshots, perform a dev build, or accept RS-03/P18.
- It does not fabricate the source gaps listed in RS-02. Those stay typed and
  visible inside their rich panels.

The only disposable resource is a uniquely named tmpfs PostgreSQL container
created by `test-rs03-postgres.sh`; its `EXIT` trap removes exactly that
container. No volume, image, shared runtime service or business data is
created, pruned or changed.
