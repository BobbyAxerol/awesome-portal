# EX-BE-03 / N04 Lease-aware Rust Shared Consumer

Status: `SOURCE_DARK_CORE_COMPLETE / POSTGRESQL_FENCING_COMPLETE /
N02_N03_WIRE_INTEGRATION_PENDING / LIVE_SOURCE_OFF`

Date: 2026-08-25

## 1. Outcome

Portal now owns a Rust shared-consumer core and a PostgreSQL fencing boundary for
one `workspace + paper + PAPER_BINANCE_USDM` ingestion stream. No screen can
construct a source request. A source page cannot advance the durable cursor until
the exact projected facts and cursor are committed in one transaction under the
currently active lease generation.

This slice is deliberately source-dark. The N02 owner contract and N03 owner
implementation have not been published or accepted, so N04 does not compile the
request examples as a wire contract, call AWS-HK, start the v1 facade, open Source
Proxy traffic, activate an epoch or change a registry delivery profile.

## 2. Architecture

```text
Portal screen/API
       |
       | projection/query only
       v
Portal PostgreSQL projection
       ^
       | one atomic facts + cursor transaction
       | protected by lease_id + fencing_token + DB-time expiry
       |
Rust LeaseAwareSharedConsumer (source-dark in this slice)
       |
       | future accepted N02/N03 adapter only
       v
Source Proxy mTLS -> Trading-System-owned incremental facade
```

There are two separate leases:

1. the Portal-owned singleton worker lease in PostgreSQL, which supplies the
   monotonic fencing token; and
2. the future source-issued opaque consumer lease, which remains redacted and is
   accepted only through an owner-published adapter.

Losing either lease stops source requests. Replacing the Portal lease increments
the fencing token. The old worker cannot commit a page received before lease loss.

## 3. Rust consumer core

The new `shared-consumer-core` crate provides:

- source-dark construction with zero implicit reads;
- exact fixed Paper scope and one in-flight request;
- aggregate demand gating, so screens never poll source independently;
- redacted source lease/cursor wrappers;
- bounded page rows, response bytes, pending queue, timeout, retries and delay;
- explicit retry backoff and circuit-open state;
- per-request generations that discard late responses/failures from a superseded poll;
- exact UPSERT/DELETE observation carriage into an atomic commit batch;
- duplicate page idempotency and duplicate-event rejection;
- out-of-order, cursor drift and sequence gap fail-closed behavior;
- cursor advance only after exact batch digest + fencing proof acknowledgement;
- typed redacted operational snapshots with no workspace, entity, token, cursor or
  business identifier.

The runtime default remains stricter than the N02 request ceiling: one in-flight
request and one pending page. No implicit cursor retry exists.

## 4. PostgreSQL lease and transaction boundary

Migration `0008_shared_consumer_lease.sql` adds one singleton row per fixed source
scope. The row stores only:

- workspace/environment/source scope;
- BUILDING epoch ID;
- lease UUID and non-secret owner digest;
- monotonic fencing token;
- acquire/renew/expiry timestamps.

It stores no source token, API key, certificate, DSN, account, strategy, order,
fill or position value.

`acquire_shared_consumer_lease` is idempotent for the exact active owner. It
refuses lease stealing. After release or expiry, a replacement receives the next
fence. Renewal keeps the current fence. All expiry decisions use PostgreSQL
`clock_timestamp()`, not a worker-supplied clock.

`commit_lease_fenced_d4_event_page` locks the BUILDING epoch and the exact lease
row in the same transaction used by the existing D4 writer. Facts, DELETEs,
journal records and opaque cursor advance together. Missing, expired or stale
proof returns `SharedConsumerLeaseLost` before mutation.

The finite v1 qualification writer remains available only for its locked dormant
compatibility path; it was not silently relabeled as the steady-state reader.

## 5. Failure semantics

| Condition | Result | Cursor |
|---|---|---|
| no demand | `DEMAND_IDLE` | unchanged |
| lease/source lease expired | `DORMANT` | unchanged |
| stale fencing proof | pending page discarded | unchanged |
| transient source loss | explicit bounded backoff | unchanged |
| retry budget exhausted | `CIRCUIT_OPEN` | unchanged |
| duplicate exact page | idempotent duplicate | unchanged/already durable |
| duplicate event ID in page | terminal invalid page | unchanged |
| cursor ahead/drift | fail closed | unchanged |
| out-of-order sequence | `REBUILD_REQUIRED` | unchanged |
| sequence gap/cursor expired | new BUILDING epoch required | unchanged |
| invalid/oversized response | terminal fail closed | unchanged |
| exact atomic store ACK | next cursor becomes current | advanced once |

No failure becomes an empty-success response and no source loss advances progress.

## 6. Offline evidence

The reproducible gate is:

```bash
cd /home/bobby/portal-backend-plan
./scripts/execution-edge-test.sh
```

Coverage added by N04 includes:

- 20 pure Rust shared-consumer cases;
- fresh PostgreSQL migration and singleton lease acquire/restart/renew/release;
- active-owner collision and monotonic fence replacement;
- stale-writer rejection before cursor mutation;
- atomic UPSERT/DELETE + cursor commit;
- duplicate, gap, out-of-order, source-loss, lease-loss, late-callback and retry/circuit behavior;
- redaction and exact frontend fixture deserialization;
- PostgreSQL dump/restore signature including the new lease table;
- workspace rustfmt and strict Clippy.

Canonical synthetic UI states live at:

`services/portal-execution-edge-rs/crates/shared-consumer-core/fixtures/redacted-snapshots.json`

They contain no business data or source authority.

## 7. Authority and remaining gate

Completed in Portal:

- Rust state machine;
- bounded/redacted internal envelope;
- durable lease/fencing repository;
- atomic fenced event writer;
- offline/fresh-PostgreSQL/restart/failure corpus.

Still blocked on Trading System owner:

1. N02 exact four-file owner publication passes acceptance;
2. N03 exact five-file implementation/evidence package passes acceptance;
3. accepted bytes are imported in a separate reviewed contract-only commit;
4. a thin adapter maps those accepted bytes to this core;
5. N06 owner window performs real-source qualification. N04 itself does not open
   that window.

Therefore this is a completed source-independent N04 foundation, not live N04
source activation.

## 8. Next backend work

N05 can begin with source-dark retention/recovery policy, disk budgets, checkpoint
compaction rules, typed retention availability and restore/rollback drills. The
N04 wire adapter remains gated on N02/N03 acceptance and must not be guessed.
