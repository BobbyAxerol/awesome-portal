# P17 backend and contract packet — route-aware current-source replay

> **Current status 2026-09-26 (Claude, owner ≤P21):** A09/P17-B delivered by W5b ([record](./W5B_REPLAY_CLAUDE_2026-09-25.md)): signal-notional replay ledger, child audit, Reveal, T17 at 32 folds; CG-P17-01…03 answered. Remaining: P04 hub replay fixtures ([audit](../AUDIT_P15_P23_CLAUDE_2026-09-26.md) B6). The text below is the original packet.

Status: **BACKEND_CURRENT_SOURCE_CONTRACT_COMPLETE; feature-dark.** This packet
closes the safe, installed-source compatibility slice of P17. It does **not**
claim a complete execution replay, order/fill/trade/position/event ledger,
candidate engine rerun, browser receipt, runtime activation, deployment or
`PRODUCT_ACTIVE`.

Read [phase-report.md](./phase-report.md),
[source-capability-matrix.md](./source-capability-matrix.md), and
[frontend-handoff-claude.md](./frontend-handoff-claude.md) before changing
Screen 08.

## Generated named operation

| Generated operation | Same-origin route | Bound behavior |
|---|---|---|
| `researchReplayDetailGetV1` | `GET /api/v1/quantbt/runs/{runId}/execute/replay?workspace_id=&cursor=&before=&at=&limit=` | one session/workspace/run and immutable P13 OOS equity series; signed revision-bound page/direct-seek cursors; max 100 returned samples and 1 MiB response |

The route never accepts a source relation/revision, worker identity, lease,
artifact path, raw market input, credential, route parameter, command or CLI
authority. `cursor`, `before`, and `at` are mutually exclusive.

## Exact current-source truth

P13 emits a sealed OOS equity **display sample**, potentially `FULL` or
`EXTREMA_BUCKET_V1`, not an execution timeline. The route therefore labels a
selected sample `RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE`. It intentionally
publishes typed absences for every execution panel that P04 has not supplied.

`FEATURE_RESEARCH_REPLAY=false` by default. Enabling it later only exposes
this bounded reader and requires `FEATURE_RESEARCH_EVIDENCE=true`; it starts
no worker, cache, source adapter, migration, background loop or Execution
component.

## Rollback and next owner

Rollback is a signed release with `CONTROL_API_FEATURE_RESEARCH_REPLAY=false`.
Retain P13 immutable evidence; do not delete/rewrite it, access a worker/source
database/artifact, or manufacture a ledger to compensate.

Claude owns Screen 08 composition and browser-versus-HiFi receipt. The future
source owner owns any versioned execution replay receipt; its minimum facts
are recorded in [source-capability-matrix.md](./source-capability-matrix.md).
