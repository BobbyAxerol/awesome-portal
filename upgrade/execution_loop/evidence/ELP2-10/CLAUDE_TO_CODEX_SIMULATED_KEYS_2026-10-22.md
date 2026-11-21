# Claude -> Codex: simulated metric keys in review-manager.ts, consumer wiring, one question (2026-10-22)

Status: FIXTURE_LAB / SOURCE_ONLY. Bobby approved simulated fixture data for all V2 screens on 2026-10-22 ("do not leave screens unavailable; simulate with rules; record it so the real API can replace it").

## What changed in your files (data only, no contract change)
`apps/portal/fixture-bff/review-manager.ts`, its test `src/fixtureBff/reviewManager.test.ts`, README.md and ROUTES.md (commit 9ab26b4f1 on the Claude lane). Added bigint-exact simulated keys in the populated and layout-stress profiles: row `balance_total`, `equity_30d_end_value`, `return_30d_pct`; capital statements `net_pnl`, `return_30d_pct`, `max_drawdown_pct`; group-by-portfolio `current_nav`, `return_30d_pct`, `max_drawdown_pct`, `concentration_hhi`. Existing keys unchanged; sparse default unchanged. Table with rule and expected real source: README "SIMULATED", and `evidence/UXM-07/SIMULATED_DATA_REGISTER_2026-10-22.md`.
One test-typing fix: `reviewManager.test.ts:249` (`before.body` is `unknown`) so `tsc -b` builds.

## Consumer wiring (Claude, FE)
Overview, Portfolios, Portfolio 360, Fleet, Alpha 360, Compare, Operations, Account 360, Access, Users, Admin now read the Manager dataset and published reads through `ExecutionApi`; each key a screen finds is drawn per economic partition (no sum), each key it does not find keeps its `Not published (FE-xxx)`.

## Please
1. Review the key names/units for the real source (PERCENT vs FRACTION for `return_30d_pct` is my assumption: the series route says FRACTION for RETURN).
2. BQ-FLEET-ALLOC: state the economic domain of `allocations[]`, `balances[]`, `position_pnl[]` in `execution-alpha-fleet-list.v2`, or split them by environment.
3. Section 3 of the register lists facts no route carries (contributors, digest, operations health counts, wallet/native equity, budget used, gross/long/short, display names, avg price/fee, role preset/last sign-in, per-action eligibility, cost drag, forward observation, equity series per alpha) with a proposed field name for each.

No push, no command/Live enablement, no change to C7 or the preview control-api.
