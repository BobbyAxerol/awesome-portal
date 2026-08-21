# EX-BE-07a — Analytics Contracts and Pure Rust Engine

Status: `FOUNDATION_COMPLETE / SOURCE_REPOSITORY_AND_SCREEN_API_PENDING`  
Date: 2026-08-21  
Authority: Portal-derived read models only. Trading System remains the sole
execution, risk and accounting authority.

## 1. Why this slice exists

Phases 3 and 14–17 need derived values before they need another generic query
surface. Putting those formulas in the browser would let five screens invent
capital, lifecycle, exposure or correlation truth independently. EX-BE-07a
therefore freezes one deterministic Rust boundary first:

`services/portal-execution-edge-rs/crates/analytics`

The crate accepts already attributed source facts, validates bounded cardinality
and exact decimals, and returns a `DerivedAnalytics<T>` envelope. It opens no
network, reads no database, exposes no endpoint and performs no mutation.

Every envelope returns:

- `schema_version=execution.analytics.v1`;
- `source_authority=DERIVED`;
- an explicit formula version;
- the worst input freshness and oldest input `as_of`;
- `COMPLETE/PARTIAL/UNKNOWN` population completeness;
- a typed panel state and warnings rather than an invented zero.

All monetary, PnL, ratio and correlation coefficients are JSON strings backed by
`rust_decimal`. Currency codes are uppercase bounded values. No function accepts
an implicit FX conversion.

## 2. Contract map

| Screen | Pure contract | Locked behavior |
|---|---|---|
| Gate R2 | `build_capital_preview` / `capital-preview.v1` | exact requested amount; portfolio and currency must match; allocated/used/reserved/cap reconcile; stale/paused/unknown or incomplete input blocks the decision; limit excess is explicit |
| Full Blotter | `build_order_funnel` / `order-funnel.v1` | canonical `SUBMIT → SOURCE_ACK → BROKER_ACK → FILL`; each missing stage is `MISSING` or `PARTIAL`; multiple fills stay ordered by source time + ID; later facts never fabricate earlier stages |
| Alpha 360° | `build_insight_batch` / `alpha-insight-preview.v1` | one request carries at most 64 typed items; `portfolio_id` is required and echoed; missing/error is isolated per item; duplicate/cross-portfolio cache results fail closed |
| Portfolio 360° | `build_correlation` / `portfolio-correlation.v1` | complete lower triangle including diagonal through 150 entities; exact labels and packing enum; above 150 returns at most 500 ranked pairs plus bounded clusters, never a square matrix |
| Portfolio 360° | `build_capital_ledger` / `portfolio-capital-ledger.v1` | immutable movement rows reconcile `before`, `amount`, `after`; direction is explicit; output remains bucketed by currency |
| Account/Broker 360° | `aggregate_binding_exposure` / `broker-binding-exposure.v1` | sums the supplied complete binding population, not a page; distinct virtual-account count + expected count; per-currency used/reserved/available/headroom; oldest/newest source timestamps and partiality |

### 2.1 Correlation packing

For dimension `n ≤ 150`, `values` is lower-triangle row-major including the
diagonal. Its exact length is `n × (n + 1) / 2`; diagonals are exact string `"1"`.
The consumer indexes `(row, column)` where `row ≥ column` with:

`index = row × (row + 1) / 2 + column`

The input must contain every unique off-diagonal pair exactly once. Missing
pairs fail the contract instead of becoming zero. At `n > 150`, the tagged
representation changes to `RANKED_PAIRS`; the frontend must not allocate or
reconstruct a square matrix.

### 2.2 Capital semantics

Capital preview changes allocation only:

- `available = allocated - used - reserved`;
- `allocation_headroom = maximum_allocated - allocated`;
- `allocated_after = allocated + requested_amount`.

These are Portal-derived previews over authoritative source facts, not ledger
writes and not permission to approve. A stale or incomplete preview remains
visible for diagnosis with `decision_eligible=false`; Gate R2 must respect that
field and the approval backend's own eligibility checks.

The capital ledger does not reinterpret Trading System accounting. It verifies
the immutable row invariant `abs(after - before) == amount`; `ALLOCATE` must
increase, `WITHDRAW` must decrease, while `REBALANCE/ADJUST` derive direction
from the source before/after values. It never sums different currency buckets.

## 3. Bounds and failure policy

- insight batch: 64 items;
- order-funnel facts: 1,024 per order; capital-ledger page: 250 immutable
  entries, matching the query page cap;
- correlation entity set: 500; packed matrix: 150; ranked pairs: 500;
- binding exposure facts: 2,500, sufficient for 500 accounts across five
  currency facts without accepting an unbounded body;
- duplicate IDs, invalid uppercase currency, negative/inconsistent amounts,
  decimal overflow, unknown correlation labels and malformed population scope
  return typed errors;
- partial/missing source data becomes `PARTIAL`, `UNKNOWN`, `MISSING`, or
  `UNAVAILABLE`; it is never silently treated as zero or complete.

The bounds protect memory/serialization at the Portal edge. They are not claims
about Trading System capacity and do not authorize direct reads of its DB,
Redis, CLI or broker SDK.

## 4. Source and deployment boundary

EX-BE-07a deliberately stops before source integration. The next slice,
EX-BE-07b, may bind these functions only to Portal-owned projection repositories
and narrow authenticated screen APIs. If an authoritative fact is absent from
the published Trading System HTTP contract, its panel remains unavailable or a
formal Trading System contract request is raised; Portal does not add a DB
backdoor.

No delivery-profile flag changes in this slice. All five screens remain
`fixture`; `shadow/paper/sandbox/live_*` require their own source, parity and
operational gates.

## 5. Verification evidence

`./scripts/execution-edge-test.sh` passes with the immutable Trading System
contract pack, PostgreSQL 16, locked dependencies, rustfmt and strict
`clippy::all + clippy::pedantic`:

- 21/21 focused analytics tests;
- 72/72 Rust workspace tests total;
- existing 182,000-row replay/query corpus and real PostgreSQL restart/cutover;
- exact 18-decimal arithmetic and string serialization;
- 150×150 packed correlation and 151-entity ranked fallback;
- stale R2 blocker, multi-currency isolation, missing funnel stages, 64-item
  limit, per-item batch failure, full-population count mismatch and ledger
  reconciliation failures.

This evidence proves the pure foundation. It does not prove a live source,
screen endpoint, SGP↔AWS latency or production profile.

## 6. Claude parallel work order

Claude can proceed immediately without waiting for EX-BE-07b:

1. Gate R2: map a fixture to the exact capital fields, display formula/freshness/
   blockers, and re-request a preview when requested amount changes. Do not
   recompute money in TypeScript and do not enable approval when
   `decision_eligible=false`.
2. Full Blotter: render all four `stages` in server order. Show `MISSING` and
   `PARTIAL` explicitly; support multiple fill events; never infer an ack.
3. Alpha 360°: add one batch-port method for up to 64 cards, require and echo
   `portfolio_id`, and render item-level `READY/ERROR/MISSING` without failing
   unaffected cards.
4. Portfolio 360°: implement the documented packed index through 150 and the
   ranked-pair/cluster layout above 150. Add boundary fixtures at 150 and 151.
   Render capital-ledger buckets separately by currency and use server-provided
   direction.
5. Account/Broker 360°: render `account_count`, `expected_account_count`,
   population completeness, per-currency buckets and source time range. Never
   label a partial binding aggregate as total.
6. Preserve every decimal as a string through ports, state and formatters. Keep
   the registry profile `fixture`; do not mark any EX-BE-07 endpoint live.

Claude should record FE progress and fixture evidence in `PHASE_TRACKER.md`. Any
field mismatch is a backend request against this document; it is not permission
to duplicate formulas in the browser.

## 7. Next backend slice

`EX-BE-07b — Analytics Projection Repositories and Narrow Screen APIs`:

- bind each pure function to scoped, read-only Portal projection repositories;
- prove full-population queries and source completeness in one consistent read;
- expose only screen-specific authenticated routes, never a generic analytics
  evaluator;
- add source/capability fixtures, PostgreSQL integration, OpenAPI/TypeScript
  generated contracts and profile mismatch fail-closed tests;
- keep production flags false until source parity and cross-cell evidence pass.

EX-BE-05b remains separate because command relay authority depends on a proven
Trading System command/auth capability, not on analytics completion.
