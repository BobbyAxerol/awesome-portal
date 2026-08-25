# EX-BE-02-LIVE — D4 BUILDING-only ingestion state machine

Date: 2026-08-25  
Status: `INGESTION_STATE_MACHINE_COMPLETE / PG_WRITER_PENDING / NO_SOURCE_CALL`

## Outcome

The new `paper-source-ingestor` crate implements the D4 snapshot/watermark
protocol against the locked wire types. It produces bounded projection write
batches but does not own HTTP, PostgreSQL or runtime activation.

The coordinator can be constructed only for Portal `paper` scope and an
explicit `BUILDING` epoch. Every pending write repeats that epoch and expected
status so the future PostgreSQL writer can lock and re-check authority inside
the same transaction.

## Durable protocol

1. Request snapshot creation.
2. Stop source paging until the opaque snapshot plus initial event cursor are
   durably persisted.
3. Page orders, fills and positions in fixed order and verify each accumulated
   population equals the immutable descriptor count.
4. Stop source polling until the complete baseline is atomically committed.
5. Poll the exact event cursor.
6. Stop again until the entire event page and next cursor are durably committed.
7. Advance the in-memory cursor only after the explicit durable ACK.
8. Treat `410` as terminal for the epoch and require a new `BUILDING` epoch.

Other typed source failures retain the exact current request and surface a
bounded retry hint; they never move a snapshot or event cursor.

## Mapping boundary

- D4 records now serialize only after strict contract parsing.
- Financial values preserve exact decimal scale.
- Baseline ingestion IDs are deterministic SHA-256 values without exposing an
  opaque token.
- Delta event IDs become idempotency keys and their monotonic sequence becomes
  the projection source sequence.
- DELETE becomes an explicit tombstone payload for the typed entity kind.
- Raw snapshot/event cursor values redact themselves in `Debug` output.
- No Gateway-v1 alpha mapper or inferred lifecycle event is reused.

## Evidence

- state-machine/mapping tests: 8/8 passed;
- non-BUILDING and non-Paper construction rejected;
- snapshot lease, baseline and event-page durable ACK barriers passed;
- count/resource/cursor/retry/410 negative paths passed;
- exact-decimal and tombstone mapping passed;
- rustfmt and strict Clippy passed;
- no source/network/PostgreSQL/runtime state changed.

## Next backend slice

Add a D4-specific PostgreSQL migration and writer that stores opaque cursor
state without logs, locks the epoch as `BUILDING`, commits snapshot lease,
atomic baseline and event page/cursor transactions, and rejects ACTIVE or
unknown epochs even if the process started with a stale BUILDING observation.
