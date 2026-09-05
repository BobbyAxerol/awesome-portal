# EDS-08 source continuity owner packet v1

This is the one portable, source-dark contract packet for the EDS-08
continuity lane. It turns the qualified E7 current-source limitations into one
deduplicated request without pretending that current rows are an event log.

## What this packet does

- Maps each of the 18 E7 source gaps exactly once into seven owner lanes:
  Event, Market, Valuation, Operations, Command, Artifact and Research.
- Requires the strict event, snapshot and tail semantics only for the three
  classes which actually need replayable history now: position lifecycle, fill
  correction/replay and risk correction. The other gaps remain named,
  source-owner capabilities rather than being inflated into a generic journal
  request.
- Defines a portable envelope whose sequence is an exact decimal `u64` string
  and whose timestamps are UTC epoch milliseconds. It also defines the
  snapshot high-watermark, retention floor, epoch reset, correction, tombstone,
  causation and resnapshot semantics a future EDS-09 consumer needs.
- Gives the Trading System owner a dependency-free validator, machine-readable
  schemas and synthetic no-business-data cases before any runtime work.

## What this packet does not do

It does **not** change Manager-v2/D4, Source Proxy, Trading System tables,
database/Redis access, mTLS/JWT material, runtime flags, caches, a browser
route, command transport or any deployed container. `owner-return.pending.example.json`
is deliberately not evidence and cannot activate a relation.

The source owner may implement an accepted contract with an immutable journal,
outbox, CDC bridge or append-only keyset tail. Portal does not prescribe that
internal choice. Portal only accepts the published named contract and its
evidence. A current-page response, a `domain_events` row without an exact
source sequence, a page hash, or a Portal projection delta never satisfies the
event contract.

## Files

- `owner-request.v1.json` — the sole deduplicated request and E7 baseline pin.
- `owner-return.v1.schema.json` — sanitized return shape; no route, secret,
  DSN, raw SQL or business row is allowed.
- `source-event-envelope.v1.schema.json` — accepted event-class wire contract.
- `snapshot-tail.v1.schema.json` — snapshot + high-watermark + tail boundary.
- `fixtures/continuity-cases.v1.json` — synthetic duplicate, gap, correction,
  tombstone, epoch reset, retention, cross-profile and snapshot-tail cases.
- `owner-return.pending.example.json` — all 18 entries deliberately remain
  `SOURCE_GAP_CONFIRMED`; it is a template, not an owner publication.
- `MANIFEST.sha256` — exact complete file index.

## Owner workflow

1. Run `python3 services/portal-execution-edge-rs/tools/validate_eds08_source_continuity.py`.
2. Keep an unimplemented entry `SOURCE_GAP_CONFIRMED`; do not claim an event
   source merely because a current page is available.
3. For a named non-event capability, return `CAPABILITY_ACCEPTED_NON_EVENT`
   with an immutable schema/fixture/evidence digest.
4. For an event class, return `EVENT_SOURCE_ACCEPTED` with a schema digest,
   fixture/evidence digest and complete snapshot-tail/epoch/retention metadata.
5. Send only the sanitized return pack to Portal. EDS-09 remains blocked until
   Portal independently validates a real `EVENT_SOURCE_ACCEPTED` return and an
   approved activation scope exists.

