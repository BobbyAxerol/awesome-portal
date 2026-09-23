# P15 phase report — Search, complete trial ledger and diagnostics

Date: 2026-09-22  
Base before P15: `975772c6` (`docs/research-loop-plan`)  
Status: **BACKEND_CURRENT_SOURCE_CONTRACT_COMPLETE; feature-dark; generic
optimizer ledger correctly SOURCE_CAPABILITY_BLOCKED.**

## 1. Scope actually delivered

P15 supplies the stable server-side compatibility boundary for the installed
P04 source, rather than pretending that the fixed qualification is an Optuna
study:

1. A single authenticated same-origin Search BFF reads one exact P14 hub
   record under session/workspace scope and existing bounded repeatable-read
   admission.
2. It verifies both immutable adapter-contract and parameter-bundle digests
   before it exposes any static P04 declaration. A mismatch returns typed
   `NOT_PUBLISHED` with no parameter map.
3. It publishes exact fixed parameter values/ranges, current requested
   mode/schedule as `DECLARED_NOT_EXECUTED`, P14 strict-OOS `NOT_ASSERTED`,
   immutable revision/ETag and UTC milliseconds.
4. It gives every study/trial/selection/ledger/diagnostic surface a typed
   source reason. No row, score, trial, best candidate, selection, sampler,
   seed, objective, proxy statistic or OOS value is fabricated.
5. It adds no P15 source ingress, PostgreSQL relation/migration, Python
   change, worker/sidecar, cache, source transport, runtime container or
   deployment flag activation.

Codex did not alter any Claude-owned P12 frontend work or any TSX/CSS/HiFi
composition in this phase.

## 2. Current-source decision and test-matrix disposition

The current P04 admission contract rejects overrides, optimizer configuration,
non-one trial count, early stopping and random seed. P04's execution parameter
mode is `fixed_qualification_v1`. Its P11 counter is useful progress telemetry
only, so P15 must not reinterpret `trial 1/1` as a historic ledger.

| Original P15 requirement | P15 current-source disposition |
|---|---|
| five modes/schedules, objective unions, selection trace | `SOURCE_CAPABILITY_BLOCKED`: source publishes only a requested declaration, marked `DECLARED_NOT_EXECUTED` |
| selected-none / centroid / multi-objective | `NOT_APPLICABLE`: no candidate or selector fact exists; selected ref remains null |
| study-scoped collision-safe complete trial ledger, keyset/jump/exact totals | `NOT_APPLICABLE`: there is no study/trial relation, not a pagination implementation omission |
| sampler/seed/warm-start, constraints, pruning and population reconciliation | `NOT_APPLICABLE`: no source fact is published |
| scatter/histogram/frequency/progression/importance/interactions | `NOT_APPLICABLE`: no raw diagnostics source is published |
| P04 fixed declaration and immutable run compatibility | **Implemented and proven**: exact current declaration only after adapter/bundle digest match |
| browser Screen-06 full HiFi composition | Claude-owned and pending; generated current-source type is ready |

This is not a waiver of the full generic P15 exit gate. A future true
optimizer must publish a versioned immutable source receipt containing study,
trial/evaluation, selection and diagnostics facts; it must receive a new
reader/projection revision rather than broadening current P04 by inference.
The per-test disposition is retained in
[source-capability-matrix.md](./source-capability-matrix.md).

## 3. Safety and operational boundaries

| Layer | Implementation | Guard |
|---|---|---|
| source read | existing `ResearchSplitRepository.hub()` only | session/workspace membership, repeatable read, 2 active/8 queued readers, finite DB budgets |
| compatibility | P04 adapter + canonical fixed-bundle SHA-256 check | mismatch never projects static declaration onto a foreign/historical source |
| public contract | `research.search-detail.v1` / `researchSearchDetailGetV1` | bounded run ID/fold, strict query, exact decimal strings, immutable ETag |
| absent panels | typed source-state/reason in every panel | pending and legacy state stays visible inside nested absence rather than degrading to a false completed source |
| release | `FEATURE_RESEARCH_SEARCH=false` | feature dark; does not enable P10/P11/P14 materialisation or any mutable action |

No browser field exposes worker attempt, lease epoch, relation/cursor, source
path, artifact/Parquet path, raw OHLCV, credential, broker or command route.

## 4. Test evidence

| Gate | Command | Result / coverage |
|---|---|---|
| TypeScript production build | `npm --prefix apps/control-api run build` | PASS |
| P15 control-api units | `npm --prefix apps/control-api test -- test/research-search.service.spec.ts test/research-search.controller.spec.ts test/research-search.contract.spec.ts test/config.spec.ts` | PASS, 21 tests: exact fixed values, mismatch rejection, legacy/pending nested state, feature-dark, workspace/ETag/fold bound and strict query |
| Fresh P15 PostgreSQL proof | `bash scripts/research-loop-v11/test-p15-postgres.sh` | PASS, one focused P10→P14→P15 scenario in a new tmpfs PostgreSQL 16 container; one immutable source/projection, no P15 table/sidecar and no private field leak; trap removes exact container |
| Generated P15 contract | `openapi-typescript openapi/research-search.openapi.json -o /tmp/research-search.verify.d.ts && cmp -s /tmp/research-search.verify.d.ts generated/research-search.d.ts && vitest run test/research-search.spec.ts` | PASS: P15 generated OpenAPI is byte-stable and contract tests reject worker/source/cursor/command fields; the pre-existing all-contract verifier remains the release gate |
| Contract snapshot | `python3 packages/contracts/tooling/snapshot.py --check` | PASS; 184 tracked files including P15 OpenAPI/generated declaration |
| Route ownership ledger | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` | PASS; P15 named route is classified and owned |
| Screen-06 browser/HiFi/real-run | frontend owner / deployment | **PENDING_CLAUDE; NOT CLAIMED** |

The isolated proof exercises the new BFF against a real fresh database and the
existing immutable ingress chain. It intentionally does not use a fake
optimizer fixture as an API or claim real-data tuning.

## 5. Resource discipline and rollback

The only P15 test resource is one uniquely named `research-p15-postgres-*`
PostgreSQL 16 container backed exclusively by tmpfs. Its EXIT trap deletes that
exact container on pass/failure. No image/volume prune, cache cleanup, source
data change, runtime restart, deployment, signed release or migration was run.

Rollback: deploy a signed release with
`CONTROL_API_FEATURE_RESEARCH_SEARCH=false`. Do not delete/modify retained
P10/P14 rows, worker journal or source data.

## 6. Closeout, source boundary and frontend handoff

**No known P15-A backend technical debt remains.** The unimplemented generic
optimizer features are named, typed source-capability boundaries, not hidden
backend promises. Their only valid next step is a separately approved,
versioned source contract; no direct DB/worker/artifact workaround is allowed.

Claude's exact typed-only consumer, HiFi browser audit and state rules are in
[frontend-handoff-claude.md](./frontend-handoff-claude.md). The handoff must
be implemented after Claude commits/reconciles current P12 files, without
staging/resetting Codex files.

## RS-01 corrective amendment — 2026-09-22

No P15 source capability or browser field is invented by RS-01. Its retained
P14 read path now receives the Research-only cancellable admission/deadline
boundary and semantically valid chronology only. Complete trial/evaluation
ledger work remains RS-02; this amendment must not turn fixed-profile
compatibility into an optimizer claim.

## RS-02 delivery amendment — 2026-09-22

For the specifically admitted Advanced-WFO source, the old fixed-profile
compatibility limitation is supplemented—not reinterpreted—by a full retained
trial/candidate/selection ledger with bounded opaque keysets. Objective
decomposition, pruning, importance and interaction facts remain typed source
gaps. The product may display the complete available ledger without claiming a
generic optimizer. See [RS-02 matrix](../RS-02/field-action-coverage-matrix.md).

## Candidate-selection metric amendment — 2026-09-23

`CG-P15-01` is resolved by an additive required
`requested_optimizer.candidate_selection_metric` branch. Current fixed P04
requests emit `NOT_PUBLISHED` with
`P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC`; they do not
reuse the mutable engine catalogue's `robust_decay` default or infer a metric
from a mode string. A later `CONFIRMED` value must be a persisted
`RUN_BOUND_ENGINE_DEFAULT` source fact. Details and consumer rules are in
[the amendment](./contract-amendment-candidate-selection-metric.md).
