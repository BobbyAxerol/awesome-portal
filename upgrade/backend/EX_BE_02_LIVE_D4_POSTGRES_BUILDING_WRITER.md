# EX-BE-02-LIVE — D4 PostgreSQL BUILDING writer

Date: 2026-08-25  
Status: `D4_BUILDING_WRITER_OFFLINE_COMPLETE / LIVE_QUALIFICATION_PENDING / NO_SOURCE_CALL`

## Outcome

Portal now has the D4-specific durable boundary between the Rust ingestion
coordinator and Portal-owned PostgreSQL. The writer persists an opaque snapshot
lease before snapshot paging, commits the complete baseline atomically, and
advances an event cursor only in the same transaction as every event in that
page.

This is an offline implementation checkpoint. It did not start Source Proxy,
install a credential, call any Trading System route, create a live projection
epoch, enable Query/SSE/analytics, or change a registry delivery profile.

## Corrected projection semantics

The locked D4 source contract publishes one monotonically increasing sequence
for the whole orders/fills/positions delta stream. It is not a per-entity
sequence. Reusing the older per-entity gap rule would therefore report false
gaps whenever another entity legitimately occupied an intermediate global
sequence.

The projection contract now carries an explicit sequence semantic:

- snapshot rows use `PER_ENTITY_CONTIGUOUS` with no source sequence;
- D4 delta rows use `GLOBAL_STREAM_MONOTONIC` and are checked in page order;
- a baseline entity may transition once into global-stream semantics;
- later semantic drift is rejected;
- global continuity is enforced at the D4 page checkpoint, not separately for
  every entity.

`DELETE` is also a first-class projection operation. It writes an immutable
journal record and removes visible current state, so live application and
deterministic replay now produce the same result. A tombstone is not retained
as if it were a current business entity.

## Durable PostgreSQL protocol

Migration `0006_projection_operation_and_sequence_semantics.sql` stores the
operation and sequence vocabulary in entities, journal and checkpoints.
Migration `0007_d4_source_checkpoint.sql` adds:

- one D4 checkpoint per epoch with the fixed `d4.paper-read.v1` /
  `PAPER_BINANCE_USDM` identity;
- opaque snapshot token and event cursor as bounded `BYTEA` values intended
  only for the encrypted projection database;
- exact expected/applied counts for orders, fills and positions;
- baseline/page integrity digests and source head/caught-up metadata;
- explicit `SNAPSHOT_LEASED → BASELINE_COMMITTED → STREAMING` phases;
- immutable failure evidence and `REBUILD_REQUIRED` for a proven global gap or
  regression.

Every write transaction first locks and rechecks the epoch as `BUILDING`.
`ACTIVE`, `RETAINED`, `RETIRED`, unknown and failed epochs cannot ingest. A
global gap commits only redacted failure evidence, marks the epoch `FAILED`,
keeps the last durable cursor unchanged and requires a new BUILDING epoch.

Opaque values have a redacted `Debug` representation and are never copied into
journal, gap, failure or public-query payloads. Exact retries return
`AlreadyDurable`; a retry with different content fails closed as a collision.

## Snapshot-watermark boundary

The initial event cursor is an opaque source-issued watermark tied to the
repeatable-read snapshot. Portal deliberately does not decode or infer a
numeric sequence from it. The locked source contract guarantees that polling
that exact cursor begins after the baseline. After the first event page becomes
durable, Portal enforces consecutive numeric source sequences within and
between all later pages. A `410` remains a fresh-BUILDING-epoch signal.

## Evidence

- all five imported D4 contract artifacts still pass `sha256sum -c`;
- reducer tests prove global stream ordering without false per-entity gaps and
  replayable delete semantics;
- fresh PostgreSQL integration proves durable lease/retry, exact baseline,
  restart/resume, atomic event pages, cursor barriers, no ACTIVE authority,
  replay parity, gap→FAILED and zero partial write on the rejected page;
- full Rust workspace tests: 131 passed;
- `cargo fmt --check` and strict `cargo clippy -- -D warnings`: passed;
- the execution-edge gate includes D4 checkpoint/failure rows in the
  credential-free PostgreSQL dump/restore signature.

## Next backend slice

Wire the already-tested ingestion coordinator to this writer in a bounded D4
qualification runner, then perform a fresh owner-authorized preflight/change
window. Only that later window may deliver the dedicated read identity to
Source Proxy and exercise the exact four GET routes. Query, SSE, analytics,
commands and epoch activation remain separate acceptance gates.
