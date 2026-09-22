# P20 backend and typed-contract packet — Compare modes

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S13_PRODUCT_BROWSER_PENDING_CLAUDE.**

P20 adds one bounded, same-origin reader for Screen 13. It reads only
Portal-persisted Research facts: P08 requested specs, P13 evidence, P14 split
receipts and RS-02 sealed current observations. It does not start QuantBT,
open an artifact/source path, call Execution, select/promote/publish a run,
change approval state, or expose a relation, cursor, lease or credential.

Read [phase-report.md](./phase-report.md) and
[frontend-handoff-claude.md](./frontend-handoff-claude.md) before changing
Screen 13.

## Published operation

| Generated operation | Route | Bound truth |
| --- | --- | --- |
| `researchCompareGetV1` | `GET /api/v1/research/alphas/{alphaId}/compare?workspace_id=&mode=&runs=` | One session/workspace-scoped, bounded Compare projection inside exactly one Alpha. |

`mode=attempts` returns at most 128 primary runs. `mode=markets` returns at
most 24 independent small multiples. `mode=pair` requires precisely two
opaque run IDs and returns only those two same-Alpha candidates. A pair with a
different `ComparisonContractKey` is `REFUSED` with `pair:null`, so a consumer
cannot legitimately render an overlay or pair metric.

The generated OpenAPI type is intentionally discriminated:

- `PairComparableResult`: `state=AVAILABLE|PARTIAL`, `refusal:null`,
  `pair:PairData`.
- `PairRefusedResult`: `state=REFUSED`, `refusal:PairRefusal`, `pair:null`.

## Truth and numeric model

- Attempts are sorted by claim rank before a metric display tie-breaker. This
  is inspection order only; it never emits a promotion or selection.
- `original_metrics` retain P13 source scope. `common_window.metrics` are new
  `research.compare-common-window.v1` values over matched raw RS-02 outer-OOS
  timestamps and never overwrite original values.
- Correlation is only `PORTAL_DERIVED`, formula
  `pearson-product-moment-correlation`, version `p20.raw-return-v1`, with
  exact-timestamp inner join and
  `INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL` missing policy.
- Insufficient overlap, invalid/missing raw decimal facts and zero variance
  return typed `NOT_PUBLISHED`; no zero/NaN/Infinity placeholder exists.
- The currently published P14 protocol supports only conservative
  `WALK_FORWARD_OOS_COMPATIBILITY`. Strict or selection-adjusted claim
  families remain typed `NOT_PUBLISHED`, never inferred from a number.

## Bounds, feature and rollback

- Two active / eight queued Compare repository operations share the existing
  bounded Research admission and repeatable-read, statement/lock timeout
  discipline.
- Pair raw calculation is indexed by workspace/run/revision/kind/timestamp;
  one exact pair is calculated server-side. Browser payloads hold no raw
  return series. Each pair overlay is at most 192 retained points.
- The operational cache is workspace- and immutable-binding-scoped, capped at
  512 KiB per projection, 15 minutes TTL and an opportunistic per-workspace
  expired-row sweep of 64. It is not evidence. Runtime may `SELECT`/`INSERT`/
  `DELETE`, never `UPDATE`, it.
- Default is dark: `CONTROL_API_FEATURE_RESEARCH_COMPARE=false`. Enabling it
  requires the already accepted P12 Library, P13 Evidence and P14 Split flags;
  startup fails closed if a dependency is absent.
- Roll back by keeping the migration/data and setting the P20 flag false. Do
  not delete immutable Research facts; cache expiry/controlled maintenance is
  sufficient. See [the runbook](../../../../deploy/runbooks/research-p20-compare-dark-and-rollback.md).

## Evidence actually run

| Check | Result |
| --- | --- |
| P20 focused service/controller/contract/config tests | pass — 29 tests |
| P20 disposable PostgreSQL migration/repository proof | pass — UUID database inside a temporary loopback-only PostgreSQL container; validates fresh migration, runtime grants, exact numeric correlation, overlay bound, cache round trip and source-row non-mutation; container removed afterward |
| Control API production-source compile | pass — `npm --prefix apps/control-api run build` |
| Generated OpenAPI + snapshot + contracts suite | pass — 170 contract tests |
| Capability inventory ledger | pass — route count 174, focused ledger test 22/22 |

This packet is not a claim of Screen 13 browser/HiFi acceptance, real Delta
runtime evidence, feature activation, deployment, or `PRODUCT_ACTIVE`. Those
remain separate source/runtime and Claude-owned browser gates.
