# EX-BE-31 — N28 Genuine Missing-Capability Adapters and Owner Packet

Date: 2026-08-31  
Branch: `feat/execution-manager-campaign`  
Status: `COMPLETE / 13_CURRENT_SOURCE_ADAPTERS / 9_GENUINE_OWNER_GAPS / 3_INTENTIONAL_EXCLUSIONS / SOURCE_DARK / N29_READY`

## Goal and result

N28 closes the gap-classification phase without requesting convenience APIs
from Trading System. The N18 census, current-source map, N25 query profile,
N27 task catalogue and owner contract pack are SHA-bound into one registry.

Final classification:

| Class | Count | Result |
|---|---:|---|
| usable current-source alternatives | 13 | versioned Rust request/response adapters; source-dark |
| genuinely absent owner capabilities | 9 | exactly one owner request v3 with exact contract and return schema |
| intentional operator-only exclusions | 3 | no owner request and no Portal control |
| N27 tasks eligible for later reclassification | 5 | bounded source-dark plans; not falsely connected |

No network listener, source credential, runtime flag, database, Proxy or
Trading System data was changed.

## Existing-source adapters

The new `missing-capability-adapter` Rust crate:

- constructs strict relative requests for Gateway ticks, bounded Binance/VNM
  candles, calendar, partial order events and five N27 task candidates;
- forces VNM `fresh=false`, preventing a read screen from triggering a data
  collection side effect;
- rejects path injection, unknown intervals/markets, excess rows and oversized
  source responses;
- normalizes Binance arrays and VNM objects into exact-decimal candles;
- validates tick identity and price aliases without claiming historical depth;
- validates the current calendar as current session rules, not a future
  holiday authority;
- labels Gateway events `ORDER_LIFECYCLE_ONLY_POLL_BOUNDED`, never full event
  completeness;
- calculates cross-profile drift from exact timestamp intersection with
  Decimal arithmetic;
- leaves portfolio-create/risk-profile as pre-dispatch mutation candidates and
  contains no HTTP client.

This covers all 13 registry alternatives: benchmark reuses canonical candle
adapters, performance reuses N25 projection query, and inspect/broker/health
use bounded current Gateway routes.

## Genuine owner gaps

Only these remain owner work:

1. full incremental event coverage;
2. artifact reference/digest contract;
3. authoritative broker acknowledgement clocks;
4. signal-to-intent funnel identities;
5. complete exposure population proof;
6. authoritative VNM order types;
7. typed sizing explanation;
8. versioned config plan/apply/verify;
9. delegated command terminal/step-up/approval policy.

They are encoded as MC-01…MC-09 in
`owner-request.v3.json`. The old master request v2 is superseded in place by
the single official v3 document. The pending example is deliberately invalid
for activation; a real publication must bind every published schema, fixture
index and acceptance result by SHA-256 while keeping
`portal_activation=false`.

## Intentional exclusions

Direct Redis inspect, testnet hard reset and lab hard reset are not product
capabilities. N28 does not manufacture HTTP endpoints for them. They stay
operator/host procedures and are rejected by the adapter authority.

## Evidence and tests

Passed locally:

- `./scripts/execution-n28-missing-capability-test.sh`
  - all JSON parses;
  - contract manifest verifies;
  - all seven source evidence SHA-256 pins match repository bytes;
  - exact 13/9/3/5 inventories and authority flags match;
  - owner request/pending response pairing is exact;
  - secret/DSN/private-key scan passes.
- Rust 1.85 container gate for `missing-capability-adapter`
  - 8/8 unit tests passed;
  - `cargo clippy --locked -p missing-capability-adapter --all-targets -- -D warnings` passed;
  - `cargo fmt --all` completed.
- `EXECUTION_EDGE_CI_IMAGE_REUSE=true ./scripts/execution-edge-test.sh`
  - full locked Rust workspace/all-target unit suite passed;
  - full workspace clippy with warnings denied passed;
  - N06 template CLI remained fail-closed;
  - PostgreSQL projection backup/restore signatures matched.

The bounded CI target lifecycle now uses `/target/build` and releases test
artifacts before clippy. This closes a reproducible tmpfs exhaustion in the
gate without increasing host/runtime resources or weakening any test.

## Exit and next phase

N28 exit gate is satisfied: every proved gap is either a working versioned
source-dark adapter or exactly one entry in one consolidated owner request.
There are no loose owner requests and no unnamed N28 technical debt.

N29 is next. It binds adapters to approved identities/transports, verifies any
returned MC publication, exercises end-to-end product flows and promotes only
the accepted capability set. Owner gaps may remain typed unavailable without
blocking release of the current-source feature set.
