# P15 backend and contract packet — current-source Search, ledger and diagnostics

> **Current status 2026-09-26 (Claude, owner ≤P21):** the retained WFO lane is delivered — CG-P15-03/04 by W3 ([record](../RF-05/W3_P13_P15_CLAUDE_2026-09-24.md)), screens by W3b; DR-02 decided by W5a. Remaining: WFO declared ranges + trial surface, `pick=`/copy link ([audit](../AUDIT_P15_P23_CLAUDE_2026-09-26.md) B3/F4). The text below is the original packet.

Status: **BACKEND_CURRENT_SOURCE_CONTRACT_COMPLETE; feature-dark.** This packet
closes the current-P04 compatibility surface. It does **not** claim a generic
optimizer, a true trial ledger, a selected-trial artifact, browser acceptance,
real Research execution, deployment, or `PRODUCT_ACTIVE`.

Read [phase-report.md](./phase-report.md) and
[frontend-handoff-claude.md](./frontend-handoff-claude.md) before changing
Screen 06.

## One published operation

| Generated operation | Same-origin route | Bound |
|---|---|---|
| `researchSearchDetailGetV1` | `GET /api/v1/quantbt/runs/{runId}/search?workspace_id=&fold=` | one session/workspace/run, one immutable P14 projection, optional bounded `fold=1…256`, revision/ETag |

The endpoint does not accept a source relation, source cursor, P14 revision,
worker attempt, lease, artifact path, Parquet path, raw market input,
credential, command, objective expression or selection input. It can only
read the current Portal-persisted P10/P14 receipt through the bounded P14
repository.

## Truthful P04 mapping

| Screen-06 surface | Current P04 source fact | P15 result |
|---|---|---|
| A1 declared space / fixed effective profile | P04 binding + immutable adapter/bundle digest | eight exact decimal parameters, declared min/max/step and server-derived display position |
| requested mode/schedule | persisted P10 request only | `DECLARED_NOT_EXECUTED`; it is not an engine search mode or selection trace |
| selected/best/pick | no selected artifact/trial is published | `selected_trial_ref=null`, `FIXED_PARAMETER_PROFILE`; no click/jump state is created by the BFF |
| study, candidate pool, complete ledger | P04 does not create a study or trial rows | `NOT_APPLICABLE/P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY`, all totals/page/sample fields null |
| scatter, distributions, progression, prune, importance, interactions | no raw search diagnostics are published | individually typed `NOT_APPLICABLE/P04_FIXED_PROFILE_DOES_NOT_PUBLISH_SEARCH_DIAGNOSTICS` |
| strict outer OOS | P14 explicitly does not assert it | `NOT_ASSERTED`, never turned into a pass/fail or OOS selection claim |
| adapter/bundle mismatch | retained receipt is not compatible with this current P04 binding | whole Search payload is `NOT_PUBLISHED`; static parameters are not projected over it |
| pending/legacy P14 row | receipt not completed / historical metadata only | outer and nested availability retain `PENDING_SOURCE_CALLBACK` or `LEGACY_METADATA_ONLY` |

The original full optimizer P15 scope is therefore recorded as a **source
capability boundary**, not reclassified as an empty optimizer, zero score, a
single trial, or a temporary backend TODO. See the P15 amendment in the
[Unified Plan](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-p15) and the exact
[P15 source-capability matrix](./source-capability-matrix.md).

## Feature, resources and rollback

`FEATURE_RESEARCH_SEARCH=false` by default. The P15 reader is independent
from P10/P11/P14 worker materialisation flags: enabling it later only permits a
read of already retained P14 facts. It starts no QuantBT process, no source
adapter, no optimizer, no SSE, no cache, no migration and no command.

Rollback is one signed release with
`CONTROL_API_FEATURE_RESEARCH_SEARCH=false`. Retain P10/P14 immutable facts;
do not delete rows, restart a worker, change the Execution Edge, access a
source database, or run a broad container/cache cleanup.

## Next owner

Claude owns the Screen-06 product consumer and direct browser-versus-HiFi
receipt. The generated declaration must be used rather than a local DTO; see
[frontend-handoff-claude.md](./frontend-handoff-claude.md). Do not modify
P15 backend or make a generic optimizer appear from frontend fixtures.

## 2026-09-23 candidate-selection metric amendment

`CG-P15-01` is closed by the typed
[candidate-selection metric amendment](./contract-amendment-candidate-selection-metric.md).
Current P04 declared-but-not-executed requests publish `NOT_PUBLISHED` with a
specific reason and no value. A mutable engine catalogue default or mode name
is not historic run evidence.
