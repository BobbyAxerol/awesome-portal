# EDS-09 — Rust snapshot+tail append store, reducers and durable ACK

**Status:** `CODE_COMPLETE_SOURCE_DARK / VERIFIED / RUNTIME_INACTIVE`  
**Date:** 2026-09-05  
**Scope:** Portal-owned Rust durability core and expand-only projection storage.

## Decision and boundary

EDS-09 prepares the authoritative Portal ingest path for a future independently
accepted Trading System event source.

It does not reinterpret Manager-v2 current pages as event history.
It creates no source client, mTLS configuration, JWT issuer, Source Proxy rule,
listener, cache, scheduler, container, command or browser route.
It does not access a Trading System DB, Redis, broker or CLI path.

The current owner return is contract/source-dark: it has no accepted event
endpoint, source-profile activation, checksum/compression wire rules,
transport proof, capacity evidence or runtime change window. This boundary is
deliberately fail-closed: Portal must not invent replay from a bounded current
page.

## Delivered Rust and storage surface

| Artifact | Responsibility |
| --- | --- |
| `crates/authoritative-event-core` | Provider-neutral event contract, source admission, snapshot/tail state machine, pure generic reducer, bounds and durable-ACK capability. |
| `crates/projection-store-pg/src/authoritative_event_store.rs` | PostgreSQL transaction boundary, immutable facts, current state, checkpoint, quarantine and committed local journal. |
| `migrations/0017_eds09_authoritative_event_store.sql` | Seven expand-only `portal_projection.authoritative_event_*` tables, indexes and immutable evidence triggers. |
| `scripts/execution-edge-test.sh` | Fresh PostgreSQL migration, full Rust/Clippy gate and backup/restore signature including every EDS-09 table. |

`authoritative-event-core` binds one stream, contract revision, workspace,
environment, profile, venue, resource and filter digest. It also pins the
source contract, owner return, runtime evidence, transport contract and local
storage-policy digests. It refuses construction unless runtime acceptance,
snapshot+tail, correction/tombstone and durable-ACK facts are explicitly true.

Exact source offsets remain canonical unsigned decimal strings. Time remains
UTC epoch milliseconds. Neither offset nor source cursor is a browser input or
response.

## Snapshot, tail and ACK state machine

```text
AWAITING_SNAPSHOT
  -> complete snapshot boundary (retention floor .. high watermark W)
  -> SNAPSHOT_BACKFILL
  -> final complete backfill at W, durably committed
  -> TAIL_READY
  -> CURRENT or LIVE_TAIL strictly from W+1

Any binding/epoch/checksum/sequence/target/state conflict
  -> RESNAPSHOT_REQUIRED (quarantine; no source ACK)
```

Only the core can construct its private `PendingAppend` capability. The store
revalidates it immediately before the transaction. A source ACK is valid only
after the store returns an exact `DurableAppendReceipt`; duplicate exact batches
return their original receipt without rewriting facts.

Frames default to 200 records and 1 MiB. Hard ceilings are 1,000 records,
8 MiB decoded frame, 128 queued frames per lane, 32 MiB queued bytes and 8 MiB
unacknowledged bytes. Live tail has strict priority over current and history.
Disk spool and transport decompression remain absent until an accepted source
adapter supplies contract-specific behavior.

## Atomic append and reducer rules

For each staged frame, one PostgreSQL transaction takes a transaction-scoped
advisory lock for the complete stream binding, then:

1. pins immutable stream provenance and the explicit snapshot generation;
2. checks an exact duplicate batch receipt and expected prior offset;
3. rejects lane, epoch, gap, duplicate sequence/event-id and target drift;
4. writes immutable `authoritative_event_facts` and generic
   `authoritative_event_current` reducer rows;
5. advances the generation checkpoint and source state;
6. inserts the local downstream journal in the same transaction; and
7. commits before returning the receipt that permits source ACK.

Facts and journal rows have database triggers rejecting update/delete.
Corrections and tombstones are new immutable facts, never updates. They must
name an earlier fact, match its entity and cannot self-reference. The pure
reducer rejects identity mismatch and non-monotonic source positions.

A complete snapshot stays `TAIL_READY` across later tail batches; it cannot
regress to snapshot backfill after restart. Any integrity failure stores only
redacted quarantine metadata, fences the generation as `RESNAPSHOT_REQUIRED`
and withholds the receipt. The local journal is readable only while the stream
is `TAIL_READY`; fenced state is not silently presented as current truth.

## Restart, retention and downstream use

`load_authoritative_event_resume_state` returns `Absent`, a binding-verified
checkpoint, or `ResnapshotRequired` with a bounded reason code. Restart rejects
a tail-ready checkpoint below high watermark, a mismatched active generation,
malformed persisted decimal offset or source/profile drift.

The local journal is a private post-commit primitive for EDS-11 fan-out. It
does not expose a raw relation, source cursor or source envelope to a browser.
The additive migration leaves current-page BFFs, D4, Manager projection, SSE
and command paths unchanged.

## Verification

The final gate is:

```bash
./scripts/execution-edge-test.sh
```

It runs formatting, all Rust tests, Clippy with warnings denied, a fresh
PostgreSQL migration/write path and custom-format backup/restore parity. The
restore signature now covers EDS-09 stream, generation, batch, fact, current,
journal and quarantine tables.

Focused EDS-09 tests cover source-dark admission rejection; durable snapshot
before tail; checksum/profile/gap/epoch rejection; exact duplicate receipt;
correction/tombstone/self-reference rules; live-priority bounded queue;
restart/resume; resnapshot fence; and local-journal visibility.

Final clean verification on 2026-09-05 passed `./scripts/execution-edge-test.sh`
(formatting, workspace tests, Clippy with warnings denied, fresh PostgreSQL
write path and PostgreSQL restore signature) and
`./scripts/control-api-test.sh` (TypeScript build, 45 test files / 382 tests,
and its fresh PostgreSQL restore drill).

No verification makes a source request or changes a runtime container.

## Runtime activation gate

An EDS-09 source adapter may begin only for one exact event class/profile after
the Trading System owner returns all of the following:

1. immutable sanitized `EVENT_SOURCE_ACCEPTED` evidence passing the EDS-08
   schema and manifest validator;
2. a versioned wire contract resolving the current GET/STREAM ambiguity and
   fixing H2+mTLS, checksum, compression, decoded-frame bounds, cursor/resume
   and error semantics;
3. deployment-bound endpoint and mTLS/delegated-read identity evidence,
   including positive and negative transport proof;
4. source retention/high-watermark, 2x peak capacity, disk/spool/backpressure,
   partition/restart, epoch/resnapshot, corruption and rollback evidence; and
5. a Bobby-approved change window with exact preflight and rollback.

Until then, the adapter stays absent and product replay stays typed unavailable.
This is an external acceptance gate, not hidden Portal technical debt.

## Next handoff

**Current-source ruling (2026-09-05):** the verified owner return confirms
that no currently published class is eligible for this authoritative Event
core. Do not adapt bounded Manager pages to this crate and do not hold product
delivery for an owner Event upgrade. The current product path is EDS-09b in
the existing `ExecutionDurableMirrorRepository`: it creates a separate,
explicitly `PORTAL_OBSERVATION`-labelled local revision journal from accepted
current/range reads. It must never write these Event tables or claim source
sequence, replay, correction, retention or ACK authority.

The owner-facing implementation scope is centralized in
[`EDS_09_TRADING_SYSTEM_EVENT_SOURCE_IMPLEMENTATION_REQUEST.md`](./EDS_09_TRADING_SYSTEM_EVENT_SOURCE_IMPLEMENTATION_REQUEST.md).
It is the MC-01 addendum to the governing owner request, not a competing
request or an authorization to activate traffic.

Only after a future owner return is accepted, add a narrow versioned adapter
that maps that exact wire contract to `EventSourceAdmission`,
`SnapshotBoundary`, `SourceFrame`, `SnapshotTailCoordinator` and this append
store. Do not broaden it into a generic relation reader. EDS-10 then builds
replay/market context only for accepted event and market classes.
