# Codex -> Claude: N04 Lease-aware Shared Consumer Handoff

Status: `SOURCE_DARK_TYPES_AND_FIXTURES_READY / LIVE_LANE_B_LOCKED`

## What Claude may consume now

Use the exact synthetic snapshots in:

`services/portal-execution-edge-rs/crates/shared-consumer-core/fixtures/redacted-snapshots.json`

The stable envelope is `portal.execution.shared-consumer.v1`:

- `state`;
- `demand_count`;
- `lease_state`;
- `source_lease_state`;
- `cursor_state`;
- `pending_commit_state`;
- bounded aggregate `metrics`.

All status values are typed `SCREAMING_SNAKE_CASE`. Keep the frontend exhaustive;
unknown values fail closed.

## UI meaning

- `DORMANT`: no source authority; do not show live/connected.
- `DEMAND_IDLE`: lease may exist but zero screens/workflows need source work.
- `READY`: shared consumer may request the next bounded page.
- `AWAITING_SOURCE`: one request is in flight.
- `AWAITING_ATOMIC_COMMIT`: data is not yet durable; do not advance displayed
  checkpoint/progress.
- `RETRY_BACKOFF`: source is temporarily unavailable and cursor is unchanged.
- `CIRCUIT_OPEN`: retry budget exhausted; show explicit degraded/unavailable.
- `REBUILD_REQUIRED`: never render as empty; show resync/new BUILDING epoch state.

## What Claude must not do

- do not expose lease UUID, fencing token, cursor, token, owner digest or hash;
- do not add per-screen polling or a browser route to Trading System;
- do not label fixture data real or enable Lane B;
- do not collapse `CIRCUIT_OPEN`, `REBUILD_REQUIRED` and `DORMANT` into one empty
  panel;
- do not infer fills/orders/positions from these operational metrics;
- do not add a source-connect button. Source activation remains an owner window.

## Parallel frontend task

Claude can wire the typed states into shared status/banner/panel components and
add exhaustive fixture tests. Preserve the single Carbon visual system and keep
operational detail progressive: primary state and freshness first; bounded counts
in details; no raw technical identifiers in the main screen.

N02/N03 owner acceptance and the future thin Rust wire adapter remain blocked.
Frontend continues to use fixture/unavailable delivery profiles until a later N07
promotion.

