# EDS-05 / EDS-06 — Portal derivations and durable local mirror

**Campaign branch:** `feat/eds-current-bff`  
**Status:** `EDS-05_COMPLETE · EDS-06_COMPLETE_SOURCE_DARK`  
**Scope date:** 2026-09-05

## 1. Decision and boundary

This delivery keeps the browser on same-origin Portal BFFs and keeps AWS-HK
behind the existing, deployment-bound Execution Edge path.  It does **not**
change an Edge contract, Trading System database, Source Proxy, profile
activation, mTLS/JWT material, command relay, broker/CLI authority, `main`, or
the stable runtime.

```text
Manager-v2 accepted current pages
  -> existing lease-controlled SGP projection
  -> EDS-05 named Portal derivation/composition DTOs
  -> EDS-06 dark durable row mirror (owner-window gated)
  -> same-origin authenticated Portal BFFs
  -> frozen rich UI panels
```

No browser input may select a Manager relation, source cursor, Edge URL,
credential, database object, or raw source query.  Every source absence remains
a typed panel state; zero, guessed history, or cross-currency arithmetic must
never stand in for missing data.

## 2. EDS-05 plan — named derivation and operational composition

### Named operations

| Product need | Named operation | Inputs / truth policy |
|---|---|---|
| source health | `executionSourceHealthV1` | committed profile metadata only; no source cursor is exposed |
| deployment quality | `executionDeploymentQualityV1` | exact deployment/current session inputs; exact integer counters and explicit denominator |
| conditional groups/legs | `executionConditionalLegsV1` | exact `group_id` and declared `group_id -> leg_id` foreign key only |
| portfolio capital | `executionPortfolioCapitalV1` | allocation/current-account inputs partitioned by currency; unpublished ledger/reservation remains typed partial |
| alpha activity | `executionAlphaActivityV1` | Portal alpha identity -> declared deployment/session/order/fill facts; no replay claim |

Each DTO carries a stable schema version, formula version, source relation list,
input population/completeness/freshness, input revisions/digests, UTC epoch
milliseconds and explicit exact-decimal/currency policy.  A source fact may be
used only after profile/workspace/freshness checks already imposed by the local
projection.

### Operational composition

The composition facade wraps only existing Portal-owned workflow reads
(Approval R1/R2/Live Review, Exit Review, Waivers Register, Operations Queue, Incident,
Command Center and Admin task catalogue) together with accepted Manager health
and redacted command-journal metadata.  It emits one `composite_revision` that
binds the exact Portal workflow revisions and accepted projection revisions it
read.  It never changes a command plan or applies a command.  Canary remains
`E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED` unless exact named inputs exist.

### EDS-05 acceptance

- formula golden vectors, zero/denominator and exact-decimal/currency tests;
- partial/stale propagation and profile/workspace isolation;
- no cursor, source handle, mTLS/JWT, external account reference or raw journal
  payload reaches a DTO;
- operation facade reads one explicit composite revision and command state
  remains read-only/fail-closed;
- controller validation and same-origin browser DTO tests pass.

## 3. EDS-06 plan — dark durable current/range mirror

EDS-06 is intentionally split into **code/migration readiness** and a later
owner-approved **runtime activation**.  The implementation is complete only
when the former is tested and fail-closed by default; turning it on requires a
separate SGP storage/migration/change-window approval.  That external approval
is not an implementation debt and must not be bypassed.

### Storage model

The new tables store observations rather than claiming Trading System lifecycle
events:

1. batches and read-model revisions;
2. one source-observation envelope per accepted relation page;
3. exact current entities keyed by profile/relation/entity key;
4. retained range rows for fills and equity/performance snapshots;
5. server-only continuations, gaps and digest conflicts/quarantine.

Every write is scoped by workspace, environment and profile.  Row conflict is
defined as **same exact source key + different digest**; it is quarantined and
prevents the affected revision from becoming current.  Existing profile JSONB
snapshots remain a bounded compatibility read while observation mode is dark.
No retention cap, Parquet, DuckDB, raw-ladder browser response or history/replay
claim is introduced.

### Runtime/read policy

- `FEATURE_EXECUTION_DURABLE_MIRROR=false` by default; no mirror write occurs
  unless the explicit activation flag is true.
- `FEATURE_EXECUTION_DURABLE_MIRROR_READS=false` by default; existing snapshot
  reads remain the rollback path.
- A later screen cutover uses one committed mirror revision and compares it to
  the existing snapshot first.  It must never delete mirror rows on rollback.
- Source admission remains the existing one lease-aware worker per profile;
  browser requests remain local and cannot create AWS-HK reads.

### EDS-06 acceptance

- fresh PostgreSQL migration/restore and schema-index proof;
- atomic batch/current/range/revision commit, idempotency and crash rollback;
- same-key/different-digest conflict quarantine, stale cursor and lease loss;
- profile/workspace isolation, exact resource/time index and keyset plan;
- payload budget and no-source-read browser concurrency proof;
- dark flag defaults and bounded old/new parity proof.

### EDS-06 completion record — 2026-09-05

Implemented and verified:

- migration `1723680000022_execution-durable-current-range-mirror.sql`;
- typed batch, revision, observation, current-entity, retained-range,
  continuation, gap and quarantine/conflict tables with exact
  workspace/environment/profile/resource/time indexes;
- atomic projection snapshot + server-only continuation + durable-mirror write
  path, including rollback on mirror-writer failure;
- read-only repeatable-read server queries that bind a current page to one
  committed revision, including a regression for partial refreshes;
- SHA-256 canonical row/page dedupe and same-key/different-digest quarantine;
- bounded (1–200) relation-bound signed Portal keysets for server-side current
  and range consumers; raw Edge cursor material is neither returned nor stored
  by the durable tables;
- default-dark writer/read flags and a rollback-compatible bounded legacy
  projection path.

`./scripts/control-api-test.sh` passed from a fresh PostgreSQL database:
TypeScript build, 43 test files / 371 tests, migration-history validation and
backup/restore parity. The focused EDS-06 proof covers normal atomic commit,
duplicate acceptance, conflict quarantine, cross-workspace cursor rejection,
exact resource/time index selection and transaction rollback.

The remaining owner-approved runtime window is an operational activation gate,
not an implementation omission: both EDS-06 flags remain `false`, no screen
uses mirror reads, and no AWS-HK, Edge, command or browser transport changed.

## 4. Explicit non-goals and no-debt rule

Unpublished ledger/reservation, candle, replay/correction, cross-profile Canary
twin and source command semantics are externally typed limitations, not silent
fallbacks.  No phase may close with an unnamed implementation omission: every
unavailable branch must have a code, source/input evidence and next owner or
Portal action documented in the unified plan and this delivery record.
