# Claude to Codex: Edge catalogue vs what the Portal draws (2026-10-22)

Level: SOURCE_ONLY / FIXTURE_VERIFIED. Nothing here connects a source, qualifies one or enables a command. Written for Codex (backend lead): what the Portal V2 screens need from the Edge and the control-api, matched against the published catalogue, so each real connection is one named step.

Inputs read: `apps/control-api/src/execution-v2/publication-source.generated.ts` (digests `source_catalogue` sha256:9257ebb0…, `field_dictionary` sha256:aca5c54c…, `metric_dependencies` sha256:9c945880…), `manager-model.contract.ts`, `manager-model.ts`, `SIMULATED_DATA_REGISTER_2026-10-22.md`, `EDGE_CONNECT_RUNBOOK_2026-10-22.md`.

## 1. State of the catalogue
42 families, all `availability: UNAVAILABLE`, `reason_code: NEW_EDGE_V1_EXPORT_NOT_QUALIFIED`, `runtime_enabled: false`; 31 dictionary fields, all `UNAVAILABLE / SOURCE_FIELD_PUBLICATION_NOT_QUALIFIED`. `current_page_adapter`: `EXISTING_SEPARATE_AUTHORITY`, `CURRENT_ONLY`, 200 rows / 1 MiB, no stable snapshot, no authoritative replay. So every real figure below waits on a family becoming qualified; the Portal keeps `Not published (FE-xxx)` until then and never fills a gap.

## 2. Naming: three vocabularies for the same facts
The dictionary, the control-api and the Portal readers spell some money/percent facts differently. The Portal reads the control-api spelling (the dataset reader is strict); the dictionary spelling is what the Edge will publish. A mapping layer at the control-api is needed, not a rename in screens.

| Dictionary field (Edge) | control-api key (`manager-model.contract.ts`) | Portal reads | Note |
|---|---|---|---|
| pnl | net_pnl | net_pnl | window must be named |
| unrealized_pnl | unrealized_pnl | unrealized_pnl | same |
| account_balance | balance_total | balance_total | |
| equity30d_end | equity_30d_end_value | equity_30d_end_value | |
| return30d_pct | return_30d_pct | return_30d_pct | PERCENT; Portal prints `%` |
| returned_funds | returned_capital (statement) | returned_capital | |
| nav | current_nav (statement) | current_nav | |
| initial_funds / added_funds | same | same | |
| management_budget | initial_budget / current_budget | current_budget | |
| exposure_cap | exposure_cap (statement) | not drawn | MODEL_DEFINED unit |
| allocation_weight (RATIO) | allocation (MONEY) | allocation | different facts: weight vs amount |
| alpha_score / portfolio_score / raw_q / contribution (POINTS) | score | not drawn (Pending) | policy not set |
| amount_locked / recall_pending / new_risk_capacity | locked_amount / pending_amount | not drawn | see 3 |

## 3. Keys the Portal draws that the control-api cannot produce today
The control-api metric set is a closed enum: `allocation, net_pnl, unrealized_pnl, balance_total, equity_30d_end_value, return_30d_pct, score` (`managerMoneyFields` + two). Statement kinds are the 21 `managerStatementFields` plus `allocation, balance_total, net_pnl, equity_30d_end_value, return_30d_pct`. The dataset schema (`execution-manager-dataset.v1`) leaves metric keys open, so these keys pass the schema and the fixture lane serves them, but the real control-api would not emit them:

| Simulated key (fixture) | Where drawn | In catalogue? | Needs |
|---|---|---|---|
| max_drawdown_pct (statement, partition) | Overview Drawdown, Portfolios, Compare, Alpha 360 | no field | `equity_snapshots` input (`balances_collateral`, `fund_portfolio_overview`) plus a drawdown definition; not a certified return history |
| concentration_hhi (group) | Portfolios, Portfolio 360 | no field | derivable from `allocation` per portfolio; decide server-side or publish |
| cost_drag_fees / _funding / _slippage | Alpha 360 Performance | partly: `fees_funding`; slippage needs `fills` + `valuation_prices_used` | applicable_costs proof ("missing is not zero") |
| forward_observation_days (DAYS) | Alpha 360 Forward panel | no field | `archive_paper_watch` |
| current_nav as a group metric | Portfolios NAV | statement only today | group-level rollup inside one partition |
| net_pnl, return_30d_pct as statement kinds | Overview | `return_30d_pct` and `net_pnl` are allowed fact kinds | window handling per statement |

Request FE-CAT-1 (to Codex): decide, for each row, publish-as-key, publish-as-statement, or leave absent. If absent, the Portal keeps the typed `Not published` cell; no screen change.

## 4. Family by family: which screen waits on it
`UNAVAILABLE` for all; this is the order in which qualifying a family turns a screen from `Not published` to data.

| Family | Screens and figures it would fill | Portal reader today |
|---|---|---|
| fund_portfolio_overview | Overview KPI, capital panel, Portfolios table | Manager dataset FUND/PORTFOLIO |
| alpha_fleet_overview | Fleet table, Map, counts | Manager dataset FLEET + fleet read |
| portfolio_registry, portfolio_membership, alpha_registry, alpha_ownership, deployment_registry | names (portfolio_name, strategy_name, deployment_name), owner, Users role | registry reads |
| internal_accounts, venue_physical_account_registry, account_binding | Accounts list, Account 360, Access | bindings list, resources/accounts, broker-bindings |
| balances_collateral | wallet_balance, native_equity, Physical equity, Check | `broker_sync.*` on account resource |
| economic_capital_assignment, root_capital_limit, budget_entitlement, execution_grant_reservation | capital statements, Budget used/approved, Allocations | statements, `portfolio_allocations` |
| order_intents, orders_execution_status, fills | Blotter, Alpha 360 Orders and Fills, Trade replay, Avg price | blotter, orders |
| fees_funding, accounting_postings_corrections, economic_journal | Fee column, Cost drag | blotter (fee), none yet |
| positions_episodes, valuation_prices_used | positions, exposure gross/long/short, equity series | broker-bindings exposure |
| risk_state_limits, trading_state, administrative_locks, recall_requests | Operations health, Live state, locks | queue, incidents |
| obligations_unknown_execution_outcomes, reconciliation, recovery_quality_events | Incident detail, Operations exceptions, Check | incidents |
| sync_health_cursor_retention | Source health, display lag, freshness | health strip |
| command_receipts, operational_audit | Admin actions, Operations receipts, audit | admin actions (read only) |
| report_snapshots | digest ("since your last visit"), exports | none |
| qbts_per_alpha, manager_alpha_score, portfolio_score, regime_fit | Score, Contribution, Regime fit | none (Pending) |
| archive_paper_watch | Forward days, Archived lens | none |
| portal_identity_profile_session, user_identity_mapping | Users, Profile and Access | access routes |
| publication_catalogue_manifest | Source Truth, "what is published" disclosure | catalogue read |

## 5. Contract gaps that block a screen even when data exists (closed schemas)
These are not data questions: the published JSON shape has no place for the figure, so a qualified source would still not reach the screen.

| ID | Gap | Screen | Proposal |
|---|---|---|---|
| FE-CAT-2 | Operations queue `health` has no pending-receipts, display-lag or open-exception counts; Intent and Display columns have no field; Incident detail blocks | Operations | add three integer counts and two enum fields to the queue/incident schemas |
| FE-CAT-3 | Fleet "All" lens needs one read across environments; the dataset takes one environment per read and the client must not join | Fleet | a dataset query with `environment: ALL` returning per-partition rows, or a documented client rule (Bobby/Codex) |
| FE-CAT-4 | Bindings list rows are closed (`binding_id, account_id, venue, state, credential_state, updated_at`); equity, virtual sum, headroom, check, sleeves cost two reads per row (N+1, capped at 20) | Accounts list | add the five fields to the list row, and per-environment counts for the tab strip (ALL, ISSUES, REAL-FUNDED, PAPER, TESTNET) |
| FE-CAT-5 | Contributors (group by alpha with net_pnl) and the "since your last visit" digest have no route | Overview | allow `group_by alpha_id` on the FUND surface with `net_pnl`; publish the command-center digest panel |
| FE-CAT-6 | No basis or portfolio-scope parameter on FUND/Overview; the design shows "USDT one basis" and "Scope: All portfolios" | Overview | the Portal prints "each currency on its own, never converted" and "every portfolio you may see"; a basis selector would need a published conversion rule (FX policy), so it is a Bobby/Codex decision, not a UI control |
| FE-CAT-7 | BQ-FLEET-ALLOC: domain of per-alpha `allocations[]` and balances | Fleet money columns | name the economic domain on each allocation so it lands in the right partition |
| FE-CAT-8 | Display names and Users columns: `portfolio_name`, `strategy_name`, `deployment_name`, `role_preset`, `last_sign_in_at_ms`, blotter `average_fill_price`, `fee`, `fee_currency` | several | add to the existing resources, all additive |
| FE-CAT-9 | Account 360 `broker_sync.wallet_balance/native_equity`, `portfolio_allocations.budget_used/approved`, `exposure_gross/long/short` | Account 360 | add to the account resource, all additive |

## 6. Grouping and the one-line backend changes already possible
- Two-level grouping (`group_by` of 2) is already allowed by `manager-model.contract.ts` (`max(2)`); the Fleet "Then" control now uses it (`then=` in the URL, two-field `group_by`). No backend change.
- Sort keys offered by the dataset are read from `query_options.sort_fields`; the Portal offers only those.

## 7. Order in which the Portal can switch on real data (one step each)
1. Run the read-only checker on the route (`EDGE_CONNECT_RUNBOOK_2026-10-22.md` section 3): schema OK, reader accepts, no unknown reads.
2. Compare against the field list in `src/execution/v2/fieldcoverage` (offered vs touched).
3. Serve on a separate real-review lane with an explicit upstream for that route only, no fixture fallback.
4. Visual harness at 1280 and 660 on that lane; receipt in the phase packet.
Suggested first routes by value and risk (read-only, small): `fund_portfolio_overview` (Overview, Portfolios), `alpha_fleet_overview` (Fleet), `balances_collateral` (Accounts), then `fills`/`orders_execution_status` (Blotter). Writes, STREAM and Live stay behind C-7 and C-8.

## 8. What Codex owes / what Claude owes
- Codex: answer FE-CAT-1 (publish, statement or absent, per key), FE-CAT-2 to FE-CAT-9 as accepted, deferred or refused; confirm the naming map in section 2; land the lane (ff-only) per `CLAUDE_TO_CODEX_LANDING_REQUEST_2026-10-22.md`; `review-manager.ts` has data-only edits from Claude (see `CLAUDE_TO_CODEX_SIMULATED_KEYS_2026-10-22.md`).
- Claude: nothing on the Edge side. On each answer, wire the screen only to what is published; remove a simulated key from `review-manager.ts` the day the real key appears.
- Bobby: FE-CAT-3 and FE-CAT-6 are product decisions (cross-environment read; basis/FX).
