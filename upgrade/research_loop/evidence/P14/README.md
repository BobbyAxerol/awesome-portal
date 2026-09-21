# P14 backend and contract packet — Split, chronology and holdout truth

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE; feature-dark; Screen-05 rich
consumer, browser/HiFi and product-route acceptance remain Claude-owned.**
P14 does not claim a running Research job, a raw historical-data read, a
holdout result/view, a holdout seal or unlock, a generic WFO implementation,
a deployment, direct database access, Execution Edge/Trading System access,
CLI action, or `PRODUCT_ACTIVE`.

Read [phase-report.md](./phase-report.md) and
[frontend-handoff-claude.md](./frontend-handoff-claude.md) before changing
Screen 05.

## Delivered boundary

P14 publishes exactly one authenticated, same-origin read operation:

| Generated operation | HTTP route | Bound |
|---|---|---|
| `researchSplitDetailGetV1` | `GET /api/v1/quantbt/runs/{runId}/split` | one immutable current-P04 Portal projection; one session/workspace/run; revision/ETag; no source selector, relation, cursor or action input |

The source receipt is accepted only beside a P11 `run_completed` event whose
`split_digest` matches its canonical bounded JSON. P10 creates the receipt as
it derives the confined child tape; P11 fsyncs it (`0600`, atomic rename) before
terminal emission; a callback retry carries the same document without rerunning
QuantBT. Control API binds it to the exact immutable P10 manifest and worker
attempt, then stores append-only source/projection rows.

All reads repeat membership in `REPEATABLE READ READ ONLY` under
`portal_research_runtime`, have finite statement/lock/idle budgets and use
two-active/eight-queued admission. The browser cannot provide a relation,
cursor, revision, worker identity, lease, artifact path, source path, market
row, transport input, credential or unlock request.

## Current P04 truth — no stronger claim

| Surface | P14 treatment |
|---|---|
| Warmup | exact P08-bound range/count only when rows were copied; otherwise `NOT_APPLICABLE/P08_WARMUP_NOT_REQUESTED`; never scored |
| IS / outer OOS | exact half-open UTC-ms ranges and copied row counts; OOS is `P04_OBSERVED_AFTER_FIXED_PROFILE`, not a selected-model claim |
| Holdout | P08 metadata range only; `NOT_EXPOSED_TO_CHILD_TAPE`, `NOT_EVALUATED`, `NOT_EXPOSED`; no raw row/result/view route |
| Physical Parquet I/O | `NOT_ATTESTED/P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED`; semantic filtering is not a claim that Arrow never touched a row group |
| Selection | `FIXED_PROFILE_NO_SEARCH`; strict outer-OOS is explicitly `NOT_ASSERTED` |
| Fold plan, purge, embargo, inner folds, theta per fold, gap scan | exact `NOT_PUBLISHED` source facts, not a sparse UI default |
| Source seal / holdout unlock | exact `NOT_PUBLISHED`; no actor/API exists, so P14 creates no Governance action or mutation |

`availability` describes BFF read readiness; a fact's own `state` and
`reason_code` remain separately present. A client must not turn
`NOT_ASSERTED` into pass, `NOT_PUBLISHED` into zero, or an absence into an
unlock affordance.

## Feature, rollout and rollback

`FEATURE_RESEARCH_SPLIT` defaults to `false`, independently from P10/P11.
Source terminal materialisation can be retained for recovery while the browser
reader remains dark. Migration `1723680000047_research-split-truth-v1.sql` is
additive and has no destructive down migration. The safe procedure is in
[the dark runbook](../../../../deploy/runbooks/research-p14-split-dark-and-rollback.md).

Rollback is the signed reader flag only. Do not delete P14 relations, source
receipts, progress events or bundles; do not restart a worker; do not change
an Execution profile or run a manual SQL operation.

## Next owner

Claude must first finish/stage only owned P12 work, then use the generated P14
type rather than a local DTO. The full rule and direct HiFi browser comparison
requirements are in [frontend-handoff-claude.md](./frontend-handoff-claude.md).
The four visual HiFi groups are three authority states plus Code Anatomy as a
presentation substage—not a new server lifecycle state.
