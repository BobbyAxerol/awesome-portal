# Trading System EDS-09 event source wire ruling v1

This package is a source-owner return for MC-01 `event.full-incremental`. It
freezes the future envelope and snapshot-tail shapes while reporting the
maximum truthful capability of the current Trading System source revision.

## Current publication

`NO_EVENT_WIRE_TRANSPORT_PUBLISHED` is the only current wire resolution.
There is no event endpoint, stream, polling interface, cursor minting path,
or source activation in this return. A valid mTLS/JWT identity does not change
that result, and an invalid identity must be denied before any future source
lookup.

| Event class | PAPER | SANDBOX | LIVE | Ruling |
| --- | --- | --- | --- |
| `execution.position-lifecycle.v1` | assessed | assessed | assessed | `SOURCE_GAP_CONFIRMED` |
| `execution.fill-lifecycle.v1` | assessed | assessed | assessed | `SOURCE_GAP_CONFIRMED` |
| `risk.decision-lifecycle.v1` | assessed | assessed | assessed | `SOURCE_GAP_CONFIRMED` |

The exact reasons and all 18 EDS-08 classifications are in
`owner-return.v1.json`; the three-class source mapping is in
`acceptance/source-as-is-mapping.v1.json`.

## Frozen future wire invariants

If a later source-owner change is approved, an accepted event class must use
the supplied `source-event-envelope.v1.schema.json` and
`snapshot-tail.v1.schema.json` without weakening them. It must prove a
producer-owned epoch and contiguous decimal-string `u64` sequence, immutable
event/entity-version identifiers, UTC epoch milliseconds, causal corrections
and tombstones, retention floor, opaque resumable cursor, snapshot watermark
followed by the next tail sequence, resnapshot on discontinuity, and bound
profile/workspace/venue/resource scope with cross-profile denial.

The current-state Manager read surface and a change-hint snapshot mechanism
are expressly not substitutes for this event contract. Portal must not infer
history from page deltas, mutable rows, or local projection changes.

## Consumer and activation boundary

Portal may verify this package and retain the classifications, but it must not
construct an event consumer from this return. There is no direct database,
cache, broker, shell, CLI, credential, or command authority here. A future
accepted source needs a separate source implementation, owner return revision,
and narrow activation request; that later request must declare transport,
identity policy, capacity, recovery, rollout, and rollback evidence.
