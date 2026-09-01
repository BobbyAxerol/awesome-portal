# EX-BE-35 — Alpha Fleet current-source v2 closeout

**Date:** 2026-09-01  
**Branch:** `feat/execution-data-activation`  
**Scope:** Alpha Fleet only  
**Status:** `ACCEPTED_ON_DEV / SOURCE_BACKED / COMMANDS_UNCHANGED`
**Request ledger:** `BR-EX-73` (additive Fleet v2; BR-EX-72 bindings/live-review remain unchanged)

## 1. Goal

Keep Claude's reviewed Alpha Fleet composition on `/deployments/alphas`, but
replace the thin BR-EX-72 strategy/deployment list with one bounded,
source-backed fleet projection that is useful to an internal manager across
Paper, Sandbox and Live.

This slice does not invent missing Trading System history. Current balances,
allocations, positions and reconciliation are published. The unavailable 30-day
equity and drawdown windows remain explicitly typed
`SOURCE_LATEST_WINDOW_NOT_PUBLISHED` until the source publishes a bounded
latest-window selector.

## 2. Root cause and source census

The v1 projection joined only `strategies` and `strategy_deployments`. It could
identify an alpha and a deployment but could not populate owner, portfolio,
allocation, account balance, current position PnL/exposure or reconciliation
health. The UI therefore retained its rich shell while most operational cells
were empty.

The accepted current Manager source already publishes the following bounded
relations used by this screen:

| Capability | Relations consumed | Fleet purpose |
|---|---|---|
| `manager.strategies` | `strategies` | alpha identity, label, version, owner candidate |
| `manager.deployments` | `strategy_deployments` | stage presence, account/venue/portfolio binding |
| `manager.accounts` | `accounts`, `account_balances` | owner fallback and exact per-currency balances |
| `manager.portfolios` | `portfolios`, `portfolio_allocations` | portfolio identity and exact allocation |
| `manager.positions` | `positions_v2` | current realized/unrealized PnL and absolute notional |
| `manager.reconciliation` | `reconciliation_findings` | unresolved operational attention |

The live discovery used for this implementation observed 48 strategies, 43
deployments, 43 accounts, 85 balance rows, 2 portfolios, 42 allocations and 20
current positions. These are evidence inputs, not hard-coded product values.

## 3. Delivered contract and architecture

- Contract revision: `execution.alpha-fleet-list.v2`.
- Default environment: `all`; the Control API independently reads the accepted
  Paper, Sandbox and Live profiles and combines them under
  `ALL_EXECUTION_PROFILES`.
- Source calls remain capability/relation/field allowlisted and bounded by the
  existing current-source admission layer. Browser code never receives raw
  Manager rows, credentials or transport material.
- Projection replacement is transactional and advisory-lock protected. A
  durable snapshot stores source time, completeness, row count and the
  server-computed summary.
- PostgreSQL provides exact count, bidirectional signed keyset pagination,
  allowlisted filters/sorts and the default `stage_rank DESC, alpha_label ASC`
  ordering.
- Exact decimal strings are aggregated with integer scaling in the server.
  Currency buckets are never FX-mixed and the browser performs no capital
  arithmetic.
- A strategy is present in every stage listed in `stages[]`; `stage` is only
  the furthest-stage sort/display value. The stage query uses a delimiter-safe
  internal filter and the UI regression gate preserves multi-stage membership.
- Migration removes old v1-derived snapshots so the v2 route cannot serve a
  stale v1 JSON shape after deployment.

## 4. Product behavior

The approved Alpha Fleet layout is preserved. Its product branch now shows:

- global alpha/deployment/stage counts;
- exact current allocation, current position PnL and exposure by currency;
- owner and portfolio links;
- all account-currency balances, including source-owned `locked` values;
- stage presence with server-side stage re-query;
- health and attention reasons from inactive/error state and unresolved
  reconciliation findings;
- expandable deployments with correct Paper/Sandbox/Live workbench routes;
- typed metric availability for balance, current positions, 30-day equity and
  drawdown.

Stage navigation was corrected to normalize source stage case. A deployment
whose source mode is `PAPER` or `SANDBOX` no longer falls through to the Live
route. A multi-stage alpha remains visible under every stage it actually holds.

## 5. Tests and evidence

Completed before runtime deployment:

- Control API fresh PostgreSQL build/test: 28 files, 257 tests; dump/restore
  signature parity passed.
- Contract schema/OpenAPI/generated snapshot: 113 tests passed.
- Alpha Fleet focused frontend: 10 tests passed, including rich composition,
  current-source cells, drill-down routing and multi-stage filtering.
- Full Portal frontend: 94 files, 1,795 tests passed, 1 intentional skip; no
  React/DOM or capital-arithmetic gate failure.
- Portal production build: passed with 4,506 transformed modules.

## 6. Runtime acceptance and rollback

The first cold runtime probe exposed one real admission defect: the BFF started
all 3 profiles × 8 relations concurrently, while the shared N21 source
authority correctly permits only 15 requests/second. It failed closed with
`N21_SHARED_RATE_BUDGET_EXHAUSTED`; no source limit was relaxed. Fleet refresh
now runs profile-sized batches in the deterministic order Paper → Sandbox →
Live while retaining parallel bounded reads inside each profile. A regression
test freezes that cross-profile ordering.

Accepted dev evidence after rebuilding the Control API image:

- same-origin BFF: HTTP 200, `execution.alpha-fleet-list.v2`, `environment=all`,
  `PORTAL_PROJECTION` over `TRADING_SYSTEM`;
- source-backed result: 48 alpha rows and 78 deployments; stage counts Paper
  43, Sandbox 35 and Research-only 5;
- populated facts: owner 48/48, portfolio and balance 42/48, current position
  PnL 12/48;
- a committed stale snapshot returned in 59.6 ms while refresh continued in
  the background;
- Chromium on `/deployments/alphas`: 48 rendered rows, 144 drill-down links,
  Alpha BFF HTTP 200, zero unavailable whole-screen panels and zero console
  warning/error;
- the temporary smoke session was deleted after acceptance.

`freshness=STALE` in the observed response is an honest source-time fact, not
an unavailable screen. The screen remains operational and refresh is
coalesced; no client or server invents newer market/account timestamps.

Rollback is the prior content-addressed dev Control API/web image pair plus the
existing source-dark/current-source helper. `main`, stable, Trading System,
command relay and Live mutation are outside this slice.
