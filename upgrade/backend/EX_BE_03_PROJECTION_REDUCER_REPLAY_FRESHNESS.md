# EX-BE-03 — Projection Schema, Reducer, Cursor/Epoch, Replay/Snapshot and Freshness

Status: **FOUNDATION_COMPLETE / SOURCE_INGESTION_INTEGRATION_PENDING**  
Owner: codex (Portal backend)  
Authority boundary: Portal-owned Rust edge and Portal-owned PostgreSQL only

## 1. Goal and references

This slice implements the P0 projection foundation defined in:

- [Execution Loop backend master plan §§7.1, 7.4, 8 and 13](../EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md);
- [ADR-007](./adr/ADR-007-PORTAL-PROJECTION-EPOCH-CURSOR-AND-FRESHNESS.md);
- frontend review F-4/F-5/F-7 and BR-EX-11/16/19 in
  [`BACKEND_PLAN_REVIEW.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_PLAN_REVIEW.md);
- canonical source semantics in
  [`DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md`](../DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md).

It does not copy or query Trading System tables. The only future ingestion input
is the authenticated, bounded HTTP adapter delivered by EX-BE-01/02.

## 2. Delivered architecture

### `execution-contracts`

- `SourceCursor` is the exact structured tuple `event_ts/created_at/event_id`.
- `SourceCompleteness` is independent from freshness.
- the canonical read envelope is flat on the wire and now carries poll interval,
  server age, projection lag, formula version and capability snapshot identity.
- exact decimals and raw unsupported vocabulary behavior remain unchanged.

### `projection-core`

Pure Rust owns:

- environment/workspace scope and nine explicit entity families;
- canonical observation validation and stable SHA-256 content identity;
- idempotent reducer with duplicate, refresh, out-of-order, gap and collision
  outcomes;
- complete-versus-partial bounded snapshot reconciliation;
- deterministic journal replay and semantic parity digest;
- `BUILDING → ACTIVE → RETAINED → RETIRED` epoch model;
- strict `{epoch_uuid}:{sequence}` resume cursor;
- per-epoch availability-bound resume, overlap-window support and
  server-assigned deterministic resnapshot jitter;
- versioned freshness policy with `OK/AGING/STALE/PAUSED/UNKNOWN`, server
  `age_seconds` and nullable observable projection `lag_ms`.

The reducer never says that contiguous projection sequence proves source
completeness. Only a genuine supplied `source_sequence` can create a numerical
gap; poll-bounded and unknown coverage remain labelled as such.

### `projection-store-pg`

SQLx owns an embedded, forward migration under schema `portal_projection`:

| Table | Purpose |
|---|---|
| `epochs` | one active epoch per workspace/environment; sequence allocator and parity identity |
| `entities` | current canonical projected facts with full source/compatibility metadata |
| `ingestion_keys` | durable idempotency result independent of process restart |
| `event_journal` | range-partitioned replay input with durable journal ordinal; default partition is safe landing |
| `checkpoints` | per-stream source cursor and last Portal sequence |
| `snapshots` | immutable reconciliation evidence |
| `gaps` | unresolved continuity blockers and resolution evidence |
| `dead_letters` | redacted ambiguous/invalid observations and replay status |
| `replay_runs` | rebuild/parity/activation audit |
| `freshness_policy_snapshots` | immutable content-addressed policy versions |

Each applied observation locks its epoch, reuses the pure reducer and commits
idempotency key, current row, immutable journal, checkpoint, sequence and gap in
one transaction. The journal ordinal is independent from projection sequence,
so no-op/out-of-order input has a deterministic replay position. Duplicate
delivery does not advance sequence. Out-of-order delivery is journalled but
cannot overwrite current truth. Collision details are
stored without the original payload; only metadata and payload digest enter the
dead letter.

Epoch activation locks candidate and previous active epochs, refuses unresolved
gaps/dead letters, recomputes semantic state digest inside the transaction,
retains the old epoch for overlap and activates the candidate atomically.

## 3. Runtime and deployment boundary

The AWS edge image embeds the migration and supports:

```text
portal-execution-edge projection-migrate
portal-execution-edge projection-check
portal-execution-edge serve
```

The database URL is file-only through `EDGE_PROJECTION_DATABASE_URL_FILE`.
`EDGE_PROJECTION_INGESTION_ENABLED=false` is the committed default. When later
enabled, startup and `/readyz` fail closed if the projection database is down;
compatibility-only EX-BE-02 behavior remains unchanged while the flag is false.

No PostgreSQL server is silently added to the production Compose because its
AWS placement, managed-versus-container choice, retention, RPO/RTO and cost are
still owner decisions. CI uses an isolated disposable PostgreSQL 16 container.

## 4. Invariants and failure behavior

- same ingestion ID + same digest: return the original result, no new sequence;
- same ingestion ID + different digest: redacted `IDEMPOTENCY_COLLISION` dead letter;
- same source cursor + different input: `SOURCE_CURSOR_COLLISION`, no overwrite;
- older cursor/read position: journal `OUT_OF_ORDER`, no current-state rollback;
- source sequence jump/regression: latest fact remains observable but an
  unresolved gap blocks activation;
- `POLL_BOUNDED` without positive interval or interval on another completeness
  class: rejected;
- complete snapshot may remove absent rows; partial snapshot never removes;
- parity mismatch records expected/actual digest but does not activate;
- stale/missing history returns gap/resnapshot semantics; no cursor is silently
  accepted across epochs;
- future `as_of` outside skew tolerance is `UNKNOWN`, never clamped fresh;
- venue pause is `PAUSED`, never nightly `STALE` noise.

## 5. Evidence

`./scripts/execution-edge-test.sh` is the canonical gate. It runs against a
fresh PostgreSQL 16 database and requires:

- immutable Trading System contract-pack checksum;
- `cargo fmt --check`;
- all workspace unit/integration tests;
- strict Clippy with warnings denied;
- a 182,000-observation/six-month deterministic replay corpus;
- duplicate, idempotency collision, source cursor collision, out-of-order and
  source-gap behavior;
- complete/partial snapshot behavior and snapshot/delta semantic parity;
- server freshness, future clock skew, pause and lag semantics;
- PostgreSQL migration, transactional persistence, process restart, ordered
  journal reload/replay, immutable snapshot evidence, policy-version collision,
  gap resolution, parity activation and retained-epoch cutover.

Production image and Compose rendering are separate gates. Real source
ingestion and SGP↔AWS operational evidence are not claimed by this slice.

## 6. Frontend/Claude handoff

Claude can now treat these wire facts as stable:

- structured `source_cursor`;
- nullable true `source_sequence`;
- Portal `projection_epoch/projection_sequence` with the narrower continuity
  claim documented above;
- `source_completeness` plus `poll_interval_ms`;
- server `age_seconds`, nullable `lag_ms`, and five freshness states;
- epoch cutover requires server `resnapshot_not_before` jitter.

Useful parallel work is the Command Center subscription state machine and panel
fixtures for gap, epoch cutover, stale, pause and unknown-completeness states.
Do not mark any fixture/shadow screen as live authority and do not activate
registry projection/SSE flags.

## 7. Next backend slice

**EX-BE-04b — Rust projection query primitives**: typed read repositories,
bidirectional keyset pagination, allowlisted filtering/sorting, exact full-set
counts and aggregates, exact decimals, adaptive ≤5,000-point series, cold
retention responses and bounded query budgets.

EX-BE-06 SSE follows query/snapshot parity; it does not start before EX-BE-04b.
