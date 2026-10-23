# Simulated fixture data register (2026-10-22)

Bobby approved fixture data for the V2 screens on 2026-10-22: do not leave a screen "Not available" when a plausible, rule-bound simulation can fill it, and record every simulated fact so the real Portal Edge can replace it. This file is that record.

Level: FIXTURE_LAB. Nothing here is source acceptance, a financial statement or permission to enable commands.

## 1. Rules for simulated data
1. It lives only in the fixture layer (`apps/portal/fixture-bff`, e2e doubles, test doubles) and is served through the same HTTP routes and the same `ExecutionApi` readers as the real Edge. No component hard-codes or computes a fact.
2. Exact decimal strings, integer (bigint) arithmetic, no float, no cross-currency or cross-domain sums. Real-funded (ACTUAL), Paper and Sandbox are separate partitions; one currency per figure.
3. True zero stays a value; one typed absence per level stays testable (a figure the source "did not publish").
4. Every simulated metric carries `FIXTURE_LAB` in its methodology/provenance and the fixture banner stays on the preview.
5. Metric keys are open only in three maps of `execution-manager-dataset.v1`: `economic_partitions[].metrics` of a row, `economic_partitions[].metrics` of a group, and `capital_statements[].metrics` (`propertyNames: string`). The row-level `metrics` map is a CLOSED enum of seven keys (`allocation, net_pnl, unrealized_pnl, balance_total, equity_30d_end_value, return_30d_pct, score`), and the real control-api emits closed sets in all of them (`manager-model.contract.ts`). So a key outside those sets passes the schema in a partition/group/statement map and the fixture lane serves it, but that is fixture support, not evidence the Edge can publish it; no schema is widened to legalize it (closeout 2026-10-23 §2). A key the screen finds is drawn; a key it does not find keeps the screen's `Not published (FE-xxx)`.
6. Switch off: stop serving the key (or the profile), the screen falls back by itself. Nothing in a component names the fixture.

## 2. Simulated metric keys (Manager dataset, populated and layout-stress profiles)
Source: `apps/portal/fixture-bff/review-manager.ts`, README section "Explicit populated/layout review" (table SIMULATED). Verified by `src/fixtureBff/reviewManager.test.ts`.

| Level | Key | Unit | Rule | Consumer | Expected real source |
|---|---|---|---|---|---|
| row | allocation, net_pnl, unrealized_pnl | MONEY | existing (Codex) | Fleet table/Map | Manager dataset row metrics |
| row | balance_total | MONEY | allocation + net_pnl, same partition | Fleet, Alpha 360 | account balance projection |
| row | equity_30d_end_value | MONEY | typed absence when unrealized is null | Fleet Equity, Map | 30D equity series end |
| row | return_30d_pct | PERCENT | net_pnl / allocation, exact; "0" when net_pnl is "0" | Alpha 360, Fleet | windowed return (FE-006/025) |
| capital statement | initial_funds, added_funds, returned_capital, current_nav, current_budget, pending_amount | MONEY | existing (Codex), one per partition | Overview, Portfolio 360 Capital | capital statements (FE-017) |
| capital statement | net_pnl | MONEY | sum of the partition's rows, window = selected | Overview Net PnL | fund net PnL (FE-005/025) |
| capital statement | return_30d_pct | PERCENT | percent of initial_funds; one partition a typed absence | Overview Return | FE-006/025 |
| capital statement | max_drawdown_pct | PERCENT | negative deterministic; first partition "0" | Overview Drawdown | FE-013/025 |
| group by portfolio_id | current_nav | MONEY | server-side sum inside one partition | Portfolios NAV | FE-013 |
| group by portfolio_id | return_30d_pct, max_drawdown_pct | PERCENT | one group in six a typed absence | Portfolios, Compare | FE-006/013/025 |
| group by portfolio_id | concentration_hhi | RATIO | sum of squared allocation shares, 0..1, one partition | Portfolios, Portfolio 360 | FE-005 |

## 2b. Accounts list columns (22 October 2026, `e2e/bffSimulated.ts`; opt-in, same routes and readers)
`execution.bindings-list.v1` rows are closed (`binding_id`, `account_id`, `venue`, `state`, `credential_state`, `updated_at`), so Physical equity, Σ Virtual · Headroom, Check and the sleeves count come from two published carriers read per row (first 20 rows (`ROW_FACTS_CAP`), four at a time, later rows say so; a capped fallback until the bindings list publishes the figures, DEBT-UXM07-052): the account resource's `broker_sync.wallet_balance` and the binding exposure's bucket `used` / `headroom` / `expected_account_count`.

| Column | Source | Rule | Expected real source |
|---|---|---|---|
| Physical equity | `GET /resources/accounts/{id}` `broker_sync.native_equity` (the wallet balance is a different figure, printed in Account 360, never a fallback; corrected 2026-10-23, `ea537a9ba`) | published string, currency of the broker row; typed absence when the venue did not report native equity | bindings list native equity |
| Σ Virtual | `GET /broker-bindings/{id}/exposure` bucket `used` in the same currency | published string, no summing; typed absence when no bucket in that currency | bindings list virtual sum |
| Headroom | same bucket `headroom` | simulated for `bnc_main@BINANCE` as native equity less used, 414010.40 - 197500.00 = 216510.40 (integer arithmetic; the wallet balance is not the base, corrected 2026-10-23) | bindings list headroom |
| Check | exact decimal comparison, virtual vs physical, same currency | within / exceeded; "Not available" when either is absent | server verdict (BR-EX-26 aggregate) |
| Sleeves | exposure `expected_account_count`, else `account_count` | published integer | bindings list sleeve count |

Not done: the design's tab counts across environments (ALL, ISSUES, REAL-FUNDED, PAPER, TESTNET): one environment per bindings read (ELP2-REQ-FE-014), so the counts are not published.

## 3. Facts no published route carries yet (proposed; not served; screens keep Not published)
From the subagent reports of 2026-10-22; each is a field to ask Codex for, with the value the fixture lane would simulate.

| Screen | Figure | Proposed location | Simulated value |
|---|---|---|---|
| Overview | Contributors (amount, return) | fund dataset groups by alpha with `net_pnl` | BTC-Trend v3 +21,430 USDT |
| Overview | Since your last visit digest | command-center `digest` panel (FE-024) | 3 items |
| Operations | Pending receipts / display lag / open exceptions | queue `health.pending_receipts`, `.display_lag_count`, `.open_exception_count` | 2 / 1 / 3 |
| Account 360 | Wallet balance, native equity | `broker_sync.wallet_balance`, `.native_equity` | 412880.25 / 414010.40 USDT |
| Account 360 | Budget used/approved, gross, long, short | `portfolio_allocations.budget_used/.budget_approved`, `exposure_gross/_long/_short` | 80000.00 / 100000.00; 96400.00; 61300.00; 35100.00 |
| Names | portfolio, alpha, deployment display names | `portfolio_name`, `strategy_name`, `deployment_name` | Core, BTC Trend, BTC Trend live |
| Blotter | Avg price, Fee | `average_fill_price`, `fee`+`fee_currency` | 61250.4; 12.35 USDT |
| Users | Role preset, last sign-in | `AccountSummary.role_preset`, `.last_sign_in_at_ms` | Reviewer; 17 Oct 09:14Z |
| Access | per-action eligibility (archive, operations, export, own admin rights) | eligibility vocabulary actions | request ALLOWED, approve UNAVAILABLE NO_CURRENT_PERMISSION |
| Alpha 360 | Max drawdown tile; Cost drag (fees, funding, slippage); Forward days | partition-level keys `max_drawdown_pct`, `cost_drag_fees`, `cost_drag_funding`, `cost_drag_slippage` (MONEY), `forward_observation_days` (unit DAYS) in `economic_partitions[].metrics` of each ALPHA row; wired in `alpha/DatasetFigures.tsx` (`RowFigure`), `Not published` stays when absent | drawdown -7.35%; fees 40.00 USDT; 14 days |
| Fleet | Equity 30D series per alpha | `getManagerSeries` subject ALPHA | 30 NAV points |
| Fleet | Allocation domain | question BQ-FLEET-ALLOC to Codex | domain of `allocations[]` |

## 4. How to replace with the real API
1. Edge publishes a key at the level above (same name, unit and partition rule): the screen draws it with no code change.
2. Remove the key from `review-manager.ts` (or serve the real upstream on the review lane); the screen returns to its `Not published (FE-xxx)` cell.
3. Run `npx vitest run src/execution/v2/coverage` after a contract change: `fieldCoverage.baseline.json` shows which offered fields the readers touch.

## 5. Preview state (2026-10-22, after the rollout)
- research-portal.primusspark.com (preview stack `portal-research-preview`, port 8095) serves lane tip `89a496612`: `portal-web` and `portal-fixture-bff` rebuilt and rolled out scoped (`preview.sh build portal-web portal-fixture-bff`, `preview.sh up portal-web portal-fixture-bff`); `control-api` and the databases were not touched (control-api uptime unchanged). Running image ids equal the tags; the public bundle name equals the local one (`index-DTaOU6vP.js`).
- The fixture BFF runs the `populated` profile at medium scale (`FIXTURE_REVIEW_PROFILE=populated` appended to the host env file `~/.config/portal-research-preview/preview.env`, outside the repo). Back to the sparse default: delete that line, then `preview.sh up portal-fixture-bff`. Off entirely: `preview.sh fixture off` then `preview.sh up portal-web`.
- The yellow "FIXTURE DATA" banner stays on every page. Nothing here is acceptance evidence.
- Build input: the approved HMD reader wheel was copied (untracked, not committed) into `vendor/hmd-reader/` of the Claude worktree to satisfy the build.
