# EX-BE-02-LIVE D4 — Mapper Core and Readiness Hardening

Date: 2026-08-24  
Status: `D4_MAPPER_CORE_OFFLINE_COMPLETE / RUNTIME_FAIL_CLOSED / LIVE_INPUTS_BLOCKED`

## Outcome

The Portal now has a Rust normalization core for the four D4 Paper resources,
but it still performs no live business read. This slice closes a dangerous
readiness ambiguity: a successful PostgreSQL ping can no longer make
`EDGE_PROJECTION_INGESTION_ENABLED=true` report ready when no source mapper is
running.

D3 remains accepted and the AWS-HK runtime remains on the accepted D2
source-dark image set. Registry delivery remains `fixture`; Query, analytics,
SSE, commands and epoch activation remain disabled.

## Root cause closed

The Edge previously collapsed two different facts into one boolean:

1. the Portal projection PostgreSQL connection is healthy; and
2. a mapper owns a source-locked `BUILDING` epoch and is ingesting safely.

Only fact 1 existed. Therefore an operator could enable the projection flag,
connect an empty database and receive a false-positive `/readyz`. Readiness now
tracks `projection_store` and `projection_ingestion` independently. The second
dependency starts false and can be made ready only by the future owner-locked
D4 ingestor.

## Rust mapper core delivered

The new `paper-shadow-mapper` crate accepts only typed payloads returned by the
four allowlisted GET resources:

- orders;
- fills;
- positions; and
- events.

It does not accept contracts, health or capabilities as business payloads. It:

- preserves exact decimal strings without binary floating-point conversion;
- normalizes order, fill, position and execution-event facts;
- rejects a row whose source alpha differs from the request scope;
- rejects invalid/empty canonical identifiers;
- requires event ID, `event_ts`, `created_at` and object payload for the stable
  composite cursor;
- keeps source vocabulary values raw and marks unsupported values rather than
  aliasing them;
- bounds every response page to the published per-route maximum;
- treats every individual page as `PARTIAL`, never as population completeness;
- produces stable event idempotency keys and batch-scoped snapshot keys; and
- requires canonical SHA-256 identities for route, cursor, completeness and
  resync semantics before mapping.

`EVENT` is now an explicit projection entity kind. Migration 0005 expands the
existing entity-kind constraint without changing epoch authority.

## Synthetic corpus and PostgreSQL evidence

The four existing synthetic fixtures are sealed by
`d4-paper-shadow-corpus.manifest.json`. The manifest declares that it contains
no real business data and pins each fixture plus the immutable Trading System
contract-pack manifest.

Tests prove:

1. all four resources normalize into distinct typed entity kinds;
2. exact decimal scale survives serialization;
3. cross-alpha rows and ambiguous event cursors fail closed;
4. same-batch retry is idempotent while a later bounded poll is a refresh;
5. pure replay has the same semantic digest as the live reducer;
6. a fresh PostgreSQL migration accepts the new `EVENT` kind;
7. the mapper writes and replays all four observations in one explicit epoch;
8. that epoch remains `BUILDING`; and
9. the epoch is absent from ACTIVE realtime watermarks.

The repository gate also performs a PostgreSQL custom-format dump/restore and
compares the migrated projection signature.

## Deliberately not implemented

There is still no live polling/pagination/resync loop. Implementing one against
the current optional-key, limit-only contract would invent authority and
completeness semantics. Consequently, enabling projection ingestion cannot
become ready yet.

The Trading System owner must first return the mandatory dedicated Paper-read
identity and new cursor/completeness/resync contract requested in
[`EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md`](./EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md).
The owner-approved encrypted projection volume and backup/restore route are
also still required.

## Next backend action

After those inputs arrive:

1. reconcile their digests into `LockedSourceSemantics`;
2. implement the bounded pagination/watermark/resync ingestor around the mapper;
3. bind runtime readiness to the exact authorized `BUILDING` epoch;
4. build, scan, sign and deploy the exact commit into a new D4 window; and
5. run live parity, freshness, gap/resync, restart, load, encrypted backup/
   restore and rollback drills.

Passing those drills still cannot activate the epoch or any frontend live
profile. Activation remains a later owner decision.
