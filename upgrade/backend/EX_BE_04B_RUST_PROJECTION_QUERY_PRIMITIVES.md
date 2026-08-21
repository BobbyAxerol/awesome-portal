# EX-BE-04b — Rust Projection Query Primitives

Status: **FOUNDATION_COMPLETE / SCREEN_API_AND_SOURCE_INTEGRATION_PENDING**  
Owner: codex (Portal backend)  
Authority boundary: Portal-owned Rust edge and Portal-owned PostgreSQL only

## 1. Goal and binding references

This slice implements the cross-screen P1 query foundation defined by:

- [Execution Loop backend master plan §§4.1–4.2, 7.2, 8.3, 12.1, 13 and 15.1](../EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md);
- BR-EX-01–05, BR-EX-12 and BR-EX-17 in
  [`BACKEND_PLAN_REVIEW.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_PLAN_REVIEW.md);
- M1/M2 scale rules and chart ladder in
  [`EXECUTION_SCALE_AND_REFINE.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_SCALE_AND_REFINE.md);
- the replayable Portal projection delivered by
  [`EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`](./EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md).

It does not read a Trading System database, Redis, filesystem or CLI. It does
not add command authority. It is the reusable Rust query and PostgreSQL
repository layer; screen-specific HTTP adapters and production source
ingestion remain explicit later integration work.

## 2. Delivered architecture

### `query-api`

The new pure Rust crate owns protocol invariants independent from Axum and SQL:

- HMAC-SHA256 `kc1` cursor keyring with active-key rotation;
- cursor binding to workspace, environment, active projection epoch, resource,
  query fingerprint, direction, issue time and expiry;
- mutually exclusive `after`/`before`, default page 100 and hard maximum 250;
- explicit filter/operator and sort allowlists, maximum complexity and stable
  immutable `entity_id` tie-break;
- exact count/page/aggregate response contracts with filters and sorts echoed;
- exact decimals represented only by `DecimalString`, therefore JSON strings;
- canonical adaptive interval ladder `1m/5m/15m/1h/4h/1d`, selecting the
  finest interval whose inclusive bucket count is at most 5,000;
- typed retention outcomes `HOT`, `PARTIAL_HOT`, `COLD_REQUESTABLE`, `PURGED`
  and `UNKNOWN`, including hot boundary, requested range, policy version and
  optional authorized access-request path.

Changing filter, sort, limit, epoch, scope, resource or cursor direction makes
an old cursor fail closed. Cursor values are opaque transport tokens, never row
offsets or frontend-owned state.

### `projection-store-pg`

The repository executes each page as one read-only `REPEATABLE READ`
transaction:

1. resolve the active epoch for the authenticated workspace/environment;
2. validate allowlists and the signed cursor before building SQL;
3. compute exact unfiltered and filtered counts;
4. compute exact full-filter aggregates grouped by native currency;
5. run the keyset page with limit + 1 and stable multi-sort + ID order;
6. issue direction-specific next/previous cursors from the returned boundary.

Filter and sort SQL expressions are closed Rust enums. Client input is always a
bound parameter and can never become an identifier or SQL fragment. `contains`
escapes `%`, `_` and `\`. `as_of` uses `COALESCE(as_of, source_read_at)` so its
sort key is total and cursor-safe.

Quantity and notional use PostgreSQL `NUMERIC`, return text and are parsed back
through `DecimalString`; no binary float is introduced. Aggregates apply to the
entire filtered population, not the current page. They remain separated by
currency and deliberately expose no invented cross-currency total. Invalid
numeric source fields are counted explicitly rather than silently coerced.

## 3. Adaptive time series and retention

Migration `0002_projection_query_foundation.sql` adds:

| Table | Purpose |
|---|---|
| `series_points` | exact canonical-rung buckets with min/value/max, source sample count, authority, as-of, epoch/sequence and compatibility identity |
| `retention_policy_snapshots` | immutable versioned hot/cold/purged boundaries per scope, series and metric |

`series_points` accepts only the six canonical intervals. A covering index
serves epoch/series/metric/interval/time scans. The query selects the rung from
the requested range and intent; zooming to a smaller range naturally selects a
finer rung on the next request. It never uses stride sampling. A non-1m result
declares `canonical_preaggregated`; a 1m result declares `none`.

When a requested range is outside hot retention, the repository returns the
typed retention result. `COLD_REQUESTABLE`, `PURGED` and `UNKNOWN` may have no
points, but are not semantically an ordinary empty hot series. A partially hot
range is labelled `PARTIAL_HOT` and only its hot suffix is queried. Cold restore
remains an administrative workflow; no interactive endpoint scans archives.

Retention snapshots are append-only at the database boundary. An UPDATE or
DELETE is rejected by trigger, and a policy version cannot be reused in the
same scope/series/metric.

## 4. Failure and security behavior

- missing active epoch: typed repository failure, never fallback to a retained
  or building epoch;
- malformed/tampered/expired/cross-query cursor: rejected before page SQL;
- unsupported filter/operator/sort or excessive complexity: rejected before
  database work;
- cursor from another epoch/workspace/environment/resource: rejected;
- `after` plus `before`: rejected as ambiguous;
- result or projection sequence outside unsigned bounds: fail closed;
- mixed source authority in one exact series: persisted-vocabulary failure;
- range wider than 5,000 daily buckets: typed range-too-wide response, never
  an unbounded scan;
- cold policy absent: `UNKNOWN`, not `HOT` and not ordinary empty;
- no FX policy or rates-as-of: no base-currency grand total is produced.

The generic primitives are not exposed as a broad public search endpoint in
this slice. Screen APIs will bind each commissioned resource to delegated auth,
RBAC and a narrower allowlist. This avoids creating an accidental data
exfiltration surface while the production registry remains inactive.

## 5. Evidence

Canonical gate:

```bash
./scripts/execution-edge-test.sh
```

The pinned Rust 1.85.1 / PostgreSQL 16 gate covers:

- cursor signature, rotation, direction, scope/query binding and tamper checks;
- allowlist and mutually exclusive cursor rejection;
- inclusive ladder selection and finer-rung zoom behavior;
- hot/partial/cold/purged retention semantics;
- migration and retention-snapshot immutability;
- a 182,000-row projection corpus (five times the 36,400-row primary table
  target), exact counts and full-population currency aggregates;
- forward pagination followed by concurrent insertion and history eviction,
  then backward navigation without duplicate/drift;
- a 10-day exact-decimal series choosing 5m and returning 2,881 points from
  14,405 source samples, preserving 18 fractional digits;
- all prior auth, adapter, projection restart/replay/parity tests;
- workspace `rustfmt` and strict Clippy with warnings denied.

The complete workspace total is 47 Rust tests. The test PostgreSQL container
and network are disposable and removed by the gate.

## 6. Frontend handoff for Claude

Claude can continue in parallel without waiting for a production endpoint:

- Paper Workbench/Command Center fixtures should send `range + intent`, display
  the returned interval and issue a new request on zoom; never choose a server
  interval locally;
- Full Blotter controls can treat both cursors as opaque and exercise previous
  as well as next navigation;
- table copy can distinguish `totalCount` from `filteredCount` and show
  currency-separated full-set aggregates;
- chart fixtures can map `sourceRows`, `returnedRows`, `downsampleMethod`,
  authority/as-of and the five retention states, including the cold access
  request CTA;
- do not mark a commissioned screen as live: source ingestion, screen-specific
  API adapters, delegated resource authorization and SSE remain pending.

## 7. Next backend slice

`EX-BE-06 — multiplexed SSE delivery, resume and backpressure` is the next
Rust architecture slice. It should reuse EX-BE-03 epoch/sequence and EX-BE-04b
query/resnapshot semantics. `EX-BE-05b` remains blocked until the Trading
System publishes and proves its command/auth capability; EX-BE-07 still owns
screen-specific analytical models such as funnel, correlation and full-binding
aggregate.

