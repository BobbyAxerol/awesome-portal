# Event continuity ruling

The qualified Manager-v2 surface is a profile-bound, catalogue-bound **current
page** read plane. It provides source availability, freshness, completeness,
as-of time and a source-issued opaque continuation only where one is issued.
It does not prove or provide a cross-relation global event sequence, retained
event floor, correction/retraction journal, replay cursor or live tail.

Current safe outcomes are therefore limited to the named E5 page semantics:

- `order_current` is current state, never lifecycle replay.
- `fill_history` is a bounded retained fill range where available, never a
  correction-aware replay guarantee.
- account-equity and performance data are retained snapshots, never an event
  log.
- a source-complete empty page is an authoritative empty snapshot only; it is
  not proof of no historical activity.

`trade_replay` remains `OWNER_ACTION_REQUIRED`. Closing that source capability
needs a producer-owned append/change journal with: an immutable global
sequence, explicit retention floor, ordering/correction rules, exact
timestamp/provenance semantics, resumable cursor, snapshot-plus-tail protocol,
and Paper/Sandbox/Live qualification. The portal must not synthesize these
properties from mutable rows or page hashes.

E7 tested a client reconnect only when the source issued a continuation for
the bounded `deployment_current` page. This proves same-relation continuation
binding for that sample, not event replay or a history-retention claim.
