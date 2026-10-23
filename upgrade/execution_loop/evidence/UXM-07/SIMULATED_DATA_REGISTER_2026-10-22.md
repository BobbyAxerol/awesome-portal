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

## 2c. Score keys (23 October 2026, `review-manager.ts` `addGroupScores`; populated and layout-stress profiles)
Level FIXTURE_LAB. Open metric keys of the two group maps only (`economic_partitions[].metrics` of a group by `portfolio_id` or by `alpha_id`); no row-level key, no capital-statement key, no schema widened. Exact decimals from bigint: `portfolio_score = (45*P + 30*R + 25*B) / 100` with P, R, B in hundredths, so the value is exact at four places (`82.8000` is published as `82.8`). Policy `policy_revision = FIXTURE_LAB`, `methodology_ref = FIXTURE_LAB:portfolio-score-direct-nav-v1`, provenance `FIXTURE_LAB:SYNTHETIC_SCORE_NOT_SOURCE_ACCEPTANCE`. The band is not published: the screen maps the published value to the spec's band edges (SCORE_REGIME_SPECIFICATION v1.1, 11.2). Cases are stable per portfolio id (suite ids fixed, others by digest), the same on 7D, 30D and 90D (values differ per window inside the case's range); `ALL` is the window gap (`ALL_HISTORY_WINDOW_NOT_PUBLISHED`, `window` null) on every key.

| Level | Key | Unit | Rule | Consumer | Expected real source |
|---|---|---|---|---|---|
| group by portfolio_id | portfolio_score | SCORE | direct from the portfolio NAV, 0..100. Cases: high 91.0-98.0 (very good), good 76.0-84.0, mid 42.0-58.0 (neutral), low 9.0-32.0 (weak), provisional 62.0-73.0 (`source_confidence` PROVISIONAL, fair), insufficient (typed absence `INSUFFICIENT_EVIDENCE`), zero (true `"0"`, weak) | Portfolios Portfolio score column, filters, sort; Portfolio 360 score tile | `scores.direct_nav` per portfolio group (Edge) or a group metric `portfolio_score` |
| group by portfolio_id | portfolio_score_p, _r, _b | SCORE | the three components in hundredths, same case and window; absent with the score | Portfolio 360 score tile (P / R / B) | score_details components (`score_details` is read by count only today) |
| group by portfolio_id | portfolio_score_evidence | RATIO | evidence coverage 0..1: high 0.9712, good 0.9420, mid 0.8834, low 0.8120, provisional 0.6405, insufficient 0.1830, zero 0.9301; present even when the score is absent | evidence line of the cell and the tile | evidence / eligibility of the score publication |
| group by alpha_id | score | SCORE | raw alpha q_i by the same rule (`SCORE_CASE_OF` by alpha id digest), never summed across alphas, never a quality band on a contribution | Portfolio 360 Contributors (the Overview Contributors already reads the key `score`) | `scores.raw` per alpha group |
| group by portfolio_id | max_drawdown_pct | PERCENT | changed rule: the seed now carries the group's own row keys (it used the partition alone, so every USDT portfolio drew the same value and 100% of them were absent); one group in five is a typed absence | Portfolios Drawdown | FE-013/025 |

Where a place does not exist: there is no key for the score band, for "eligibility", for the policy version number or for a score `observed_days` in any published map, so the band is derived on the page from the value, eligibility is the metric's `availability` + `reason_code`, provisional is `source_confidence`, and the policy is `policy_revision`. Real sources are not claimed.
## 2a. WP-A Alpha Fleet QBTS (23 October 2026, `fixture-bff/review-manager.ts`: `addQbts`, `qbtsMetric`; populated profile only)
Rule: guide M03 8.1 and score spec 5.8. A score is per alpha version, so it is a row key and a partition value, never a group or statement value (a group deletes it; it is never added). The layout-stress profile serves none (its responses sit at the size bound). Deterministic from the row key; integer tenths; no float. The band, the evidence word and the provisional flag are FIXTURE encodings because the metric shape carries a decimal only (see ALPHA_FLEET_COMPLETION, needs-contract 1).

| Level | Key | Unit | Rule | Consumer | Expected real source |
|---|---|---|---|---|---|
| row (closed key) and partition | score | SCORE | q = 0.45 P + 0.30 R + 0.25 B from tenths, exact to 3 places; 1 row in 10 is an insufficient-evidence typed absence (reason INSUFFICIENT_EVIDENCE), 1 in 10 a true zero (P = R = B = 0), 2 in 10 provisional; methodology `FIXTURE_LAB:qbts_v1_1`, policy_revision `FIXTURE_LAB` | Fleet QBTS column, sort, range | Manager score publication (raw QBTS slot) |
| partition (open) | qbts_p, qbts_r, qbts_b | SCORE | the three components in tenths (0 to 99.9), three profiles so every band is reached | QBTS disclosure | score publication components |
| partition (open) | qbts_band | BAND_ORDINAL | ordinal of the policy band of the UNROUNDED q (`quality_bands_v1_1`: weak below 40, neutral below 60, fair below 75, good below 90, very_good); the band code is the metric's `reason_code` | QBTS band flag | `band_code`, `band_policy_version` |
| partition (open) | qbts_evidence | EVIDENCE_STATE | 2 eligible, 1 provisional, 0 insufficient; the word is the `reason_code` | QBTS provisional / coverage | evidence maturity state |
| partition (open) | qbts_provisional | FLAG | 1 when provisional | QBTS flag | provisional marker |
| row | balance_total | MONEY | basis `FIXTURE_LAB:INTERNAL_ACCOUNT_BALANCE` (was `synthetic-book`); still allocation + net PnL inside the partition | Fleet Account balance | internal account balance projection |

## 2d. WP-E (Approvals, New request, Profile & Access, Admin Actions, Users), 23 October 2026
Level FIXTURE_LAB. Every row is served on the simulated lanes only (`options.simulated`: the populated and layout-stress profiles), through the same route as the real read, in the published shape; no schema is widened and no component names a fixture. The sparse default is unchanged. Code lives in `e2e/bffDoubleUsers.ts`, `e2e/bffDoubleAccess.ts`, `e2e/bffSimulated.ts` and one marked POST hook in `e2e/bffDouble.ts` (all `WP-E begin/end`). Switch off: the lane is not simulated.

| Level | Key | Unit | Rule | Consumer | Expected real source |
|---|---|---|---|---|---|
| route `GET /api/admin/accounts` (roster rows and the detail read) | `user_id` of the first account (`usr_0001`, bobby) | id | served under the session's own user id (the fixture user, `FIXTURE_USER_ID`), the detail read answered for that id; nothing else on the row changes | Users "(you)" marker and the inline "You cannot disable yourself" | the roster naturally holds the signed-in account |
| route `GET /api/admin/profile-access` and `/activity` | `accounts[]` with `capabilities[]` (5 accounts: owner, researcher, reviewer, operator, archived former analyst) and a two-entry activity for the reviewer | account / capability | governance capabilities only (`governance.{r1,r2,canary,live}.{read,decide}`); the owner is flagged and absent from the grid by the V1 screen; reads only, a write is never answered | Profile & Access, Manage grants tab (V1 matrix) | the Control API policy read (A4-3), which the fixture BFF did not answer, so the tab said "Could not read the access policy" |
| route `GET /commands/tasks` | `state` of six READ_INSPECT tasks (`health`, `inspect`, `capital`, `performance`, `sizing`, `broker-read`) | enum | served CONNECTED with `reason_code` and `unlisted_reason` null; `classification_counts` moved with them; `redis-inspect` and every command keep the published state; relay stays off | Admin Actions: "6 of 24 can run now", Read tier "6 of 7 ready", Run local read | the catalogue states once the local-projection read transport is wired per task |
| route `POST /commands/tasks/{id}/run` | `execution.command-run-result.v1` for those six | receipt | `source_request_sent: false`, `transport: SGP_LOCAL_PROJECTION`, a sha256 digest of the fixture's own words, `result.provenance` = `FIXTURE_LAB: synthetic local read, not source data` | Admin Actions pane receipt | the local projection read's own receipt |
| route `GET /governance/approvals/history` | two decisions ahead of the canonical row (`dec_fx_today_1` R1 APPROVED by minh, 25 min before the fixture clock; `dec_fx_today_2` R1 CHANGES_REQUESTED by lan, 70 min before) | decision | same row shape; instants follow the fixture clock (so the preview's `FIXTURE_REBASE_TIME=1` makes them today) | Approvals "Decided today", the decided rows and their recorded receipt | the history read |

Existing fixture values used without a new key: the waiver register's `due_at` and `read_at` (`CONDITION_FIXTURES`: two lapse in days, one lapsed, three with no clock) draw the runway; the run list the New request pickers read.

Typed, not simulated (no published place; each is a request in the board inbox addressed to K, see the WP-E note): Approvals prior economic history series, evidence diff, the five "still open after approval" counts, "what changes", the approvals ladder; Access role preset and business-access state; Users role preset; Approvals/New request/Access/Admin freshness as-of (the chips state the browser's receipt time or the read they rest on, never "Fresh").

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

## 2b. WP-B Operations and Incident (23 October 2026, `e2e/bffDoubleV2.ts` queue/operations branch; opt-in `simulated`, level FIXTURE_LAB)
Served on the same routes (`GET /operations`, `GET /operations/incidents/{id}`) and read by the same readers as the real Edge; every key below is a published optional field of `execution-operations.v1`, so no schema is widened. Switch off (no `simulated`) and the rows lose these keys and the screens return to their typed absences. Verified by `src/fixtureBff/queueHealthSimulated.test.ts` and `screens/operations/wpb.test.tsx`.

| Key | Level | Rule | Consumer | Expected real source |
|---|---|---|---|---|
| `delivery_state`, `display_state` (rows) | row | eleven named rows carry a fixed pair so every badge shows (awaiting receipt, receipt failed, confirmed, no receipt expected; catching up, stale, current, null = source did not report); a generated row restates its own `source_status`, every fifth applied row (last two digits of its id) is catching up. No clock. | Operations Receipt and Display columns, Next action, ops drawer | FE-CAT-2 owning sources (command receipts, projection display state) |
| `health.pending_receipt_count`, `display_lag_count` | queue | counted by integer tally over the SAME filtered set as the page (never the loaded rows); display lag coverage PARTIAL while any row did not report | health strip | FE-CAT-2 queue health |
| `health.open_exception_count` | queue | distinct OPEN incidents the filtered rows link to; a true zero stays 0; COMPLETE | health strip, Exceptions tab count | exception source (FE-031) |
| `incident_links` (rows) | row | seven named rows link five incidents many to many (one incident named by three rows, one row names two incidents); newest first, bound 3, `authorized_link_count` printed; rows with none carry the empty list | queue row links, ops drawer, Exceptions tab, incident page | FE-042 incident links |
| incident root for the five `inc_TEST_ONLY_fx_*` ids | incident | target, environment, severity, state and lifecycle timestamps equal the link summary on the rows (OPEN x3 incl. one CRITICAL, one MITIGATED, one RESOLVED); `historical_children` stays NOT_PUBLISHED | incident page and peek drawer | `portal.execution.incident-current-root.v2` |

Not simulated (typed absence, request posted in the board inbox): Intent (closed row schema), incident evidence per source, assignee, dry-run evidence, per-event actor and version, original targets of children, receipt and display filters, the audit feed. With `FIXTURE_REBASE_TIME=1` the 22 Aug instants read as current on a real clock; with it off the screen counts ranges back from the read (`observed_at_ms`) and says the read is old.


## 2f2. WP-F2 Account 360, Accounts and Blotter (23 October 2026, `e2e/bffSimulated.ts` between `// ===== WP-F2 begin/end`; opt-in `simulated`, level FIXTURE_LAB)
Served through the same routes and read by the same readers; no schema widened; every key is an optional scalar on an open row or an optional additive field of `execution.bindings-list.v1` (FE-CAT-4). Switch off by not serving the key: the screen returns to its typed absence. Functions touched: `overlayBlotter` (rewritten), `overlayBindingsList` (one `else if` for generated rows), `overlayAccountResource` (one call line to `overlayAccountF2`), new `generatedFigures`, `hashOf`, `decimalOf`, `overlayAccountF2`.

| Where | Key / figure | Rule (bigint, one currency, no float) | Consumer | Expected real source |
|---|---|---|---|---|
| `GET /broker-bindings` row `figures` (every generated `bnd_*` binding, all three environments) | `native_equity`, `virtual_used`, `virtual_headroom`, `sleeve_count` | stable per binding id (FNV-1a). 1 in 16 publishes none (the capped two-read fallback, a dedicated case: with `okx_main@OKX` and the double's own paper/sandbox rows); 1 in 16 `native_equity: null` (absent equity); 2 in 16 mixed currency (a USDC line plus the USDT line); 1 in 16 used above equity (headroom negative, Check EXCEEDED); 1 in 16 PARTIAL coverage; 1 in 16 used = "0.00" (true zero); rest within. Equity 40,000 to 939,999 whole units, used 18 to 79 percent; headroom = equity - used in the equity currency (the source's number in the real lane). DERIBIT books BTC at four places, others USDT at two. `bnc_main` and `bnc_sub` keep their explicit figures (FE-CAT-4 section 7) | Accounts Physical equity, Sum virtual / Headroom, Check, sleeves; no per-row read | `execution_binding_projection.list_figures` (Edge/Core, FE-CAT-4 section 5) |
| `GET /screens/blotter` order `deployment_id` | by alpha: adaptive_hma_cpp_00115m = dep_btc_live, carry_basis_v3 = dep_carry_live, grid_mean_v1 = dep_grid_paper | deployment id with the row's own venue under it | Blotter Deployment column, Add scope | order read `deployment_id` (FE-052) |
| order `filled_quantity` | exact sum of the order's fills on the page; "0" (true zero) for an order that traded nothing; 1 order in 23 leaves it out (typed absence stays testable) | none | Blotter Filled; No fill rule | order read `filled_quantity` |
| order `average_fill_price` | quantity-weighted fill price truncated toward zero to the fills' price places; absent without fills | none | Blotter Avg price | order read `average_fill_price` (FE-052) |
| order `fee` + `fee_currency` | exact sum of the fills' commissions when every fill states one in one currency; a fill with no commission, or fills in two currencies (USDT and BNB), leave the order with NO fee: absent, never 0, never converted | none | Blotter Fee | order read `fee`, `fee_currency` (FE-052) |
| account row `product`, `network`, `network_proof_at_ms` | BINANCE = "USDT-M futures · hedge", other venues = "Perpetual swap · net"; MAINNET; proof two minutes before the newest venue report | none | Account 360 Physical binding: Product, Environment with proof time | account/binding detail (A360-4) |
| account-level margin row `margin_ratio` | "5.10" percent on the core account USDT row, a fixed value, never computed by a component | none | Account 360 Margin ratio | venue margin report (A360-2) |
| deployment row `portfolio_name` | pf_satellite = Satellite, pf_canary = Canary | none | Account 360 sleeves table Portfolio | portfolio display names (FE-066) |

Typed on purpose (no key): Native account stays "Withheld" (policy: the broker account reference is never shown); Native attribution is a typed Not available / No source (no source splits native balance among sleeves); the reconciliation difference on a shared binding stays Not computed (the design draws it so).
