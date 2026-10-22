# Fixture as business schema: what the Edge contract carries vs what V2 uses (2026-10-22)

Level: SOURCE_ONLY / FIXTURE_VERIFIED. Scope: Overview, Portfolios, Alpha Fleet. Nothing here is a connected Portal Edge result.

## 1. What already existed (verified by inventory)
- 73 schemas `packages/contracts/schemas`, canonical fixtures `packages/contracts/fixtures`, 5 negative fixtures.
- Conformance L0 (canonical verbatim), L1 (state matrix from schema enums), L2 (scale), L3 (negative payloads) in `*.conformance.test.ts` (25 readers + Fleet + Portfolios).
- Fixture BFF `apps/portal/fixture-bff` (ROUTES.md: 31/100 routes judged against a published schema, 11 DRIFT, 58 no fitting schema).
- Switch off: the product route never picks fixtures (`ExecutionPreviewRoute.tsx:366`, `createHttpApi`). Preview fixtures are a network swap: `scripts/research-preview/preview.sh fixture off`, then `preview.sh up`. The `FIXTURE DATA` banner is injected by `deploy/research-preview/nginx/fixture-bff/fixture-bff.conf`. Registry still says `delivery_profile "fixture"` (shown only as drift).

## 2. What was missing and is now built
`src/execution/v2/coverage/` (separate from testkit on purpose):
- `fieldCoverage.ts`: runs the REAL reader on the canonical fixture through a recording Proxy.
  - `unread` = fields the schema offers that the reader never touches.
  - `unknown` = fields the reader touches that the schema does not publish.
  - layer 2 `unusedByModel` = fields the reader returned that the screen's model never uses.
- `hifiNeeds.ts`: 23 figures the chosen design draws, each scoped to the schema that must carry it.
- `fieldCoverage.test.ts` + two committed baselines (`fieldCoverage.baseline.json`, `screenConsumption.baseline.json`): a field that was used and no longer is, or a new read outside the schema, fails. `UPDATE_COVERAGE=1` accepts a change. `WRITE_COVERAGE_REPORT=<file>` writes the needs table.

## 3. Findings
**Design needs vs published schemas (name/enum match, scoped; "carried" means a field can hold it, not that a source feeds it):**
| Need | Verdict |
|---|---|
| NAV, Net PnL, Return series | CARRIED: `execution-manager-series.v1` metric enum (NAV, NET_PNL, RETURN). Fixture BFF serves NAV only; others answer a typed refusal |
| 7D/30D/90D/ALL window | CARRIED: `manager-dataset` query_options.window and per-metric window |
| Portfolio score | CARRIED: `manager-score-history/revision` (policy not set) |
| Portfolio manager | CARRIED: `portfolio-list` items[].owner (printed) |
| Fleet allocation, balance, position PnL per alpha | CARRIED by `alpha-fleet-list.v2` (`allocations[]`, `balances[]`, `position_pnl[]`, per-deployment fields); reader parses them, no screen prints them |
| Drawdown, Capital (initial/added/returned/budget), Contributors, Since-last-visit digest, Portfolio NAV and HHI, Portfolio health, Fleet equity series, QBTS score, readiness x/7, archived list | OPEN: no published schema carries them. These are the Edge requests (FE-005/006/011/013/017/024/025/027/034) |

**Reader vs schema (alpha-fleet):** reader reads `projection_refreshed_at`, which `alpha-fleet-list.v2` does not publish (baselined as known). An Edge that follows the schema would not send it.

**Used by the screen vs offered (screen-consumption baselines):** Fleet model ignores per-alpha `allocations`, `balances`, `position_pnl`, `exposure`, `metrics_availability` and every deployment money field (63 reader leaves). Portfolios model ignores the per-environment branches and the envelope freshness fields. Overview ignores most Command Center source/panel metadata (38 leaves) and the pinned watchlist panel.

## 4. Decisions taken and one question for Codex
- Fleet Allocation column is kept but held back as "Not available": `allocations[]` is one list per currency per alpha and the contract does not say whether it spans Real-funded and Simulated books (guide: never mix). Question **BQ-FLEET-ALLOC** to Codex: state the domain of `allocations`, `balances`, `position_pnl`, or split them by environment. Once answered, the cell prints the published list with no client arithmetic.
- Fleet Equity cell shows the register's own reason (`metrics_availability.equity_series_30d.reason_code`).
- Net PnL / Return / Drawdown stay "Not published" with their FE ids: windowed, not the current-position PnL the fleet read carries.

## 5. Gates run
`vitest run src/execution`: 357 files, 80,596 passed, 5 expected-fail. `tsc --noEmit`: no error in the touched files. Visual baselines for Overview, Portfolios and Fleet are NOT re-recorded yet (heavy-lock lane); until then the visual suite will show these three as changed.
