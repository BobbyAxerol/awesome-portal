# UI/UX adjustment plan after Bobby's review, 10 Nov 2026

Source: Bobby's `/goal` of 10 Nov (four adjustments plus a visual check). Owner: Claude (frontend, and the Execution fixture/contract backend Bobby handed over). Fixture lane only: every number below is a declared simulation (SIMULATED_DATA_REGISTER); real-source values stay `Not published` until Codex/PM commission them.

## What was found in the code (not assumed)

| # | Ask | Today | Root cause |
|---|---|---|---|
| 1 | Alpha Fleet: drop Account balance and Unrealized PNL, add MDD and Win rate, fit 1440 without sideways scroll | `DATASET_COLUMNS` (`screens/fleet/fleetMetricsModel.ts`) lists them; the table says it scrolls | MDD exists as the partition metric `max_drawdown_pct` (an optional "Drawdown" column, not sortable). **Win rate is not in the Manager dataset contract at all** (only in Research contracts): a contract extension is needed, not a client invention |
| 2 | Capital flow: Initial funds below Approved budget looks wrong; add time per flow | `flowModel.ts` draws Initial/Added to NAV, a dashed "Limit, not cash" edge to Approved budget, then alphas. The scale fixture has initial funds 42,500.75, NAV 42,659.41, budget 60,000, max 85,001.50 | PM TS guide (`EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md` 6.3, 7.x): funds, NAV, approved budget (management budget), margin-risk budget and exposure cap are independent dimensions and are never summed or converted; an approved budget is a limit on allocation, not cash. The picture is allowed to show a limit, but a budget larger than the funded NAV is not a coherent fixture: allocated, headroom and budget must close (allocated + headroom = budget, budget not above NAV). The contract carries no per-flow time (only `as_of_ms`); capital-statement receipts do have an effective time in the PM guide |
| 3 | Alpha lists inside Portfolio and Account use the Alpha Fleet look and data | Portfolio "Alphas" tab has its own table (alpha, deployment, stage, account, allocation, position PnL, share of PnL, health) | A second table with a different column set and different reads |
| 4 | Overview: remove JPY and USD, default USDT | `bffScale.ts` draws the base currency from `USDT 17 : JPY 3 : USD 2`; Overview prints one row per currency | Fixture world, not product code |

## Work packages (one writer per file; each ends with vitest, tsc and a screenshot)

- **WP-1 Fleet columns + contract.** Add `win_rate_pct` to the Manager dataset contract and fixtures (additive, optional, `Not published` when absent), make MDD a default column, drop Balance and Unrealized from the default set (still reachable in the Columns menu), re-set widths so the default set fits 1440. Owner files: `screens/fleet/*`, `fixture-bff/review-manager.ts` (metric), `packages/contracts` (metric key and fixtures).
- **WP-2 Capital flow.** Make the scale fixture's capital statements coherent under the PM TS rules; add an effective time per flow (contract field `effective_at_ms` on each statement line, fixture values, rendered as a Time column next to each flow in the table and on the diagram's edge captions); correct the copy so "Approved budget" reads as a limit with its own time. Owner files: `screens/portfolios/portfolio/{flowModel,AllocationFlow}.tsx`, `charts/CapitalFlow.tsx` and `flowLayout`, statement generator in `fixture-bff`, contract statement schema.
- **WP-3 One alpha list.** After WP-1: Portfolio Alphas tab and Account alpha list reuse the Fleet table component with the same reads (filtered to the portfolio or account), not their own table. Owner files: `screens/portfolios/portfolio/Alphas*`, `screens/account/*`.
- **WP-4 USDT default.** The scale world publishes USDT only; Overview shows USDT. Owner files: `e2e/bffScale.ts` and the Overview screen and tests.
- **WP-5 Visual and flow review (Claude).** Rebuild `portal-web` and `portal-fixture-bff` only (never `control-api`), walk the screens in a browser at 1440 and narrower, read the actual text, re-run the V2 pixel suite on the pinned image, review contact sheets before recording any baseline.

## Contract notes for Codex (additive, backward compatible)

1. Manager dataset metric key `win_rate_pct` (partition metric, optional; absent means `Not published`, never zero).
2. Capital statement line `effective_at_ms` (optional; absent means `Not published`).
Both are declared simulated in the fixture; no real source publishes them yet. If Codex or the PM TS owner prefers other names or semantics, change the contract first and the fixture second.

## Not in scope

`control-api` swap (Codex), Edge, command, Live, dev/main/stable.
