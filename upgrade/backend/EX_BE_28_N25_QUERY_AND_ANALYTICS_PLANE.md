# EX-BE-28 — N25 Query and Analytics Plane

**Status:** `COMPLETE / SOURCE_BACKED_QUERY_ANALYTICS_QUALIFIED / SIGNED_DEV_DEPLOYMENT_PENDING`  
**Date:** 2026-08-30  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** no stable/dev deployment, Trading System mutation, SSE or command activation

## 1. Goal and result

N25 exposes the currently derivable Execution Loop query and analytics surface
from one durable N24 snapshot. Rust owns population selection, exact financial
math, correlation, series and downsampling. TypeScript owns session/RBAC and a
fixed BFF route per product resource; it does not recalculate financial data.

```text
ACTIVE profile-isolated N24 epoch
  -> one repeatable PostgreSQL query
  -> subject-bound, allowlisted fact snapshot
  -> exact Rust aggregate/series/insight plane
  -> strict execution.query-analytics-envelope.v1
  -> authenticated TypeScript BFF
  -> browser renders canonical values only
```

## 2. Projection and query boundary

N25 adds `public.strategy_deployments` to the projection mapper, producing
adapter `manager-v2.runtime.v2` with 13 complete feeds. This closes the missing
deployment/alpha/portfolio lineage needed to scope analytics. Historical N24
12-feed receipts remain immutable; migration `0013` accepts them for evidence,
while the new writer rejects any new cycle not containing all 13 feeds.

The repository selects ACTIVE epoch, latest complete cycle, subject lineage and
all allowlisted facts in one SQL statement. It returns zero facts as a valid
empty snapshot, rejects more than 20,000 facts and emits catalogue, projection
state and canonical fact digests. Four subject types are fixed:

- `DEPLOYMENT`;
- `ALPHA`;
- `PORTFOLIO`; and
- `LIVE_GATE` (honest empty until a compatible binding is published).

The existing exact query primitive now reads both historical flat payloads and
N24 tagged payloads, while preserving filter/sort allowlists, exact counts,
aggregates and bidirectional keyset cursors. Expression indexes cover current
status, currency, deployment, portfolio, strategy and account lookups.

## 3. Exact analytics authority

The Rust plane supplies:

- exact relation + currency partitions for quantity, notional and realized
  PnL; unrelated relations or currencies are never summed together;
- order-funnel counts and execution-quality reject ratios;
- position exposure and bounded position rows;
- equity/drawdown series and drawdown-overlap episodes;
- daily contribution from daily-ending `performance_snapshots.net_pnl`
  differences per strategy and currency;
- portfolio pairwise correlation from aligned daily alpha-return observations;
- source-journal replay markers and a bounded trade log; and
- deterministic extrema-preserving adaptive downsampling.

All decimals are strings and every output declares formula version, authority,
completeness and source relations. `chart-series.rules.v1` validates ordering,
gaps, marker identity, annotations, declared totals, join digest, OHLC owner and
input/output extrema.

Current source semantics cannot honestly produce market candles, benchmark
correlation, cross-profile Paper/Canary drift or broker ACK latency. These are
not implementation TODOs: N25 returns explicit `UNAVAILABLE` states with the
N28 source-gap codes recorded in the release manifest. No substitute or browser
inference is allowed.

## 4. API and control-plane composition

The private Edge route is:

```text
GET /internal/v1/query-analytics/{subjectKind}/{subjectId}
```

It requires mTLS, delegated JWT and the exact fixed screen resource. The public
session-guarded BFF exposes deployment, alpha, portfolio and live-gate routes.
`PaperReadService` may compose the deployment result into Workbench without
altering its analytics envelope; typed unavailability is preserved.

The envelope is strict and bounded: maximum 20,000 facts, 64 partitions, 20
series, 5,000 output points per series, 20 correlation alphas/190 pairs, 200
replay rows and 500 positions. The release budget also caps a response at 2
MiB. Query/analytics flags are independent from SSE and commands.

## 5. Verification

- schema/OpenAPI/generated-TypeScript fixture validation: pass;
- all four TypeScript BFF target/resource mappings and session guard: pass;
- Paper Workbench canonical pass-through and typed unavailable behavior: pass;
- exact relation/currency aggregation and malformed numeric rejection: pass;
- order funnel, execution quality and position exposure: pass;
- daily contribution and aligned portfolio correlation golden cases: pass;
- drawdown episodes/overlap and deterministic replay markers: pass;
- 20,000-point adaptive downsampling to 5,000 points with extrema retained: pass;
- 182,000-row exact count, filter, aggregate and forward/backward keyset: pass;
- one-query subject repository, empty subject and 20,001-row fail-closed integration: pass;
- fresh PostgreSQL migrations, active-epoch read, deterministic rebuild and
  restored projection semantics: pass;
- static release/secret/bounds/rollback gate: pass;
- Rust all-target tests, rustfmt and zero-warning Clippy: pass.

## 6. Debt closeout and next phase

There is no open internal N25 implementation debt. New N25 cycles have the
lineage feed, every derivable current-source insight has a bounded canonical
output, and every non-derivable insight is explicitly unavailable rather than
fabricated.

Publishing a signed dev image and collecting runtime latency/size evidence are
release operations. N26 is next: authenticated snapshot → epoch/cursor → delta
SSE from the same N24/N25 truth, including terminal auth errors that prevent
infinite client reconnect loops.
