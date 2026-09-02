# Phase 1 — Data Truth, Projection & Realtime Foundation closeout

Date: 2026-09-02  
Branch: `feat/execution-data-activation`  
Decision: `DATA_TRUTH_ACCEPTED / SGP_LOCAL_READ_MODEL_ACTIVE /
CURRENT_SOURCE_READ_ADAPTERS_ACCEPTED / UNIFIED_REALTIME_ACCEPTED /
PHASE_2_READY`

## 1. Delivered architecture

```text
AWS-HK Trading System
  -> exact Manager-v2 GET relations
  -> mTLS + delegated JWT Rust Execution Edge
  -> one lease-controlled Control API ingestion cycle/profile
  -> atomic SGP PostgreSQL snapshot + delta journal
  -> same-origin TypeScript screen BFF + bounded adapters
  -> one SGP-local SSE fan-out/profile
  -> authenticated Portal browser tabs
```

Browser refresh, tab count and Control API replica count do not create direct
AWS-HK reads. Product reads use only the last committed SGP projection. The
direct source path remains a separately authorized diagnostic path. Commands,
Trading System mutations, `main` and stable were not changed.

The projection scope is one existing authenticated Portal workspace configured
by `EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID`; every response also retains the
viewer's own workspace ID. This prevents per-user duplicate ingestion while
preserving session/RBAC authorization.

## 2. Data truth and bounded source-as-is behavior

- Every row, snapshot and journal entry carries workspace, exact
  Paper/Sandbox/Live profile and source contract revision lineage.
- Cross-profile rows and orphan child rows are rejected before persistence.
- One database lease admits one writer for each
  `(workspace, environment, profile)` scope.
- Each hot relation is bounded to two pages of 200 rows. A larger population is
  committed as `PARTIAL`, never mislabeled as complete and never allowed to
  prevent other relations or profiles from refreshing. Full/cold history is
  outside this hot projection contract.
- A relation rejected by the current source contract is stored as a typed
  `UNAVAILABLE` relation with zero items and a bounded reason code. Transient
  transport/source failures still abort the profile refresh and preserve its
  prior committed snapshot.
- Worker failures are observable through sanitized
  `execution_profile_projection_relation_failed`,
  `execution_profile_projection_refresh_failed` and
  `execution_profile_projection_cycle_failed` events. No payload, credential,
  assertion or upstream message is logged.

The real dev source currently rejects only
`manager.performance:portfolio_equity_snapshots` with
`MANAGER_V2_SOURCE_CONTRACT_REJECTED`. This is recorded honestly in the Paper
projection and does not make the remaining Paper surface unavailable.

## 3. Projection, adapters and realtime contracts

Migration `1723680000018_execution-profile-local-projection.sql` owns:

- `execution_profile_projection_leases`;
- `execution_profile_projection_snapshots`;
- `execution_profile_projection_journal`.

The repository provides atomic snapshot replacement, semantic payload digest,
duplicate-delta suppression, monotonic epoch/sequence replay, retention and
bounded journal cleanup. The realtime contract has exactly five event kinds:

- `snapshot`;
- `delta`;
- `heartbeat`;
- terminal `auth.expired`;
- terminal `projection.gap`.

One local database tail exists per active scope, independent of subscriber
count. Resume uses `(projection_epoch, projection_sequence)`; invalid,
cursor-ahead or retention-gap cursors close with `projection.gap` and require a
fresh local snapshot.

Only four existing-source read adapter families are accepted:

- `admin.inspect`;
- `admin.performance`;
- `admin.broker-read`;
- `event.order-lifecycle`.

All market/candle/calendar/benchmark/cross-profile and mutation candidates
remain typed-dark unless a real source and exact bounds are proven.

## 4. Verification evidence

### Automated gates

- `./scripts/execution-phase1-data-truth-test.sh`: PASS.
- TypeScript build: PASS.
- Vitest: 30 files, 272 tests, 0 failures.
- Real PostgreSQL migration and `pg_dump`/`pg_restore` signature drill: PASS.
- Contract manifest and adapter/realtime schema checks: PASS.
- Monorepo pre-commit verification: PASS.

Covered cases include writer exclusion, atomic commit, duplicate suppression,
restart/replay, cursor continuity, stale retention, source loss, profile and
row-lineage rejection, exact scalar tagging, adapter allowlists, all five SSE
event types, terminal close, shared fan-out and zero direct source calls under
concurrent browser-style reads.

### Sanitized real dev runtime smoke

Control API image:
`sha256:76dffaf25d924840cff142713f3509a67db5faeb3144c6657793c4792e1f05bb`

| Profile | Relations | Hot rows | Unavailable | Partial | Truthful empty |
|---|---:|---:|---:|---:|---:|
| Paper | 19 | 2,259 | 1 | 7 | 5 |
| Sandbox | 13 | 191 | 0 | 2 | 6 |
| Live | 15 | 50 | 0 | 1 | 13 |

Across 2,500 checked real projected rows:

- lineage mismatches: `0`;
- embedded-mode mismatches: `0`;
- projection cycle failures on the accepted image: `0`;
- projection ages during capture: `0.1–5.0 seconds`;
- journal continuity: Paper `1..12`, Sandbox `1..24`, Live `1..24`, one epoch
  per profile.

Runtime health and same-origin gateway checks both returned HTTP 200. The dev
Control API was rebuilt/recreated alone; Portal web, `main` and stable services
were not rebuilt or modified.

## 5. Rollback and next phase

Rollback is configuration-only: set
`CONTROL_API_FEATURE_EXECUTION_LOCAL_PROJECTION=false`, redeploy the prior
content-addressed Control API image and retain all three projection tables for
forensic/replay evidence. Profile source flags can then be disabled
independently. No Trading System or WireGuard mutation is required.

Phase 1 has no unnamed Portal technical debt. The single typed source contract
gap above is external source truth, not hidden Portal debt. Phase 2 may now
bind the rich UI panels to these local BFF/projection states and add only the
query/cold-history capabilities that require a different storage/query shape.
