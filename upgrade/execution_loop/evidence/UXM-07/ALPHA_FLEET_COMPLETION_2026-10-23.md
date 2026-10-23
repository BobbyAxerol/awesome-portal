# Alpha Fleet completion against the manager guide (2026-10-23)

Level: R0 note. Everything here is FIXTURE_VERIFIED on the fixture lane (FIXTURE_LAB): no real source is connected, the fixture banner stays, and no figure is a financial statement. Authority read: `EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md` section 8 (M03), `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` sections 5.6 to 5.8 and 9, `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` line 19 (the lowfi column list), `PREVIEW_VS_ARTIFACT_AUDIT_2026-10-23.md` section 2 and 6(d) A3, `LAYOUT_QUALITY_AUDIT_2026-10-23.md`.

Bobby's question was "sort and filter on the metrics; where are QBTS and the portfolio score?". Answer: the Fleet table now has every guide 8.1 column, sort and range filters on the metrics the published dataset can carry, and a QBTS column read exactly as published. The portfolio score is not a Fleet column in the guide (8.1 lists QBTS per alpha version); it stays on Overview and Portfolio 360.

## 1. Where it works and where it falls back
Alpha Fleet reads the Manager dataset (one environment, or `ALL`, FE-CAT-3). When the dataset is not published for the caller, the lens falls back to the fleet read exactly as before (typed absences). The new controls exist only in dataset mode.

## 2. Guide 8.1: columns (section, element, state)
| Guide 8.1 row | Fleet element | State |
|---|---|---|
| Alpha / Version | Alpha cell: name link (truncates, full name on title) and version; sortable on `name` | DELIVERED_FIXTURE |
| Owner / Portfolio | Owner column, Portfolio column; the Portfolio cell carries a badge with the deployments behind the row when there are several (children on its title) | DELIVERED_FIXTURE. A dataset row is one alpha version in one portfolio, so "badge + children" is the deployments of that row |
| Stage Presence | Current stage (producer's scalar, never derived) + the set when there are several + In stage (typed `Not published (FE-027)`); multi-filter by lens/stage; group by Stage presence is a membership group | DELIVERED_FIXTURE |
| Alloc | `allocation` per economic partition, tagged domain and currency | DELIVERED_FIXTURE (typed `Not published (BQ-FLEET-ALLOC)` when the dataset omits the key) |
| PNL Amount | `net_pnl`, signed, per partition; the window is the dataset's (typed `Not published (FE-025)` otherwise) | DELIVERED_FIXTURE |
| Unrealized PNL | `unrealized_pnl`, a missing value is a typed absence, a true zero is a figure | DELIVERED_FIXTURE |
| Account Balance | `balance_total`, default basis `INTERNAL_ACCOUNT_BALANCE` (fixture basis `FIXTURE_LAB:INTERNAL_ACCOUNT_BALANCE`), per partition, never added across rows or shared sources | DELIVERED_FIXTURE |
| Equity 30D | Scalar chosen in the toolbar: Equity 30D end value / Return 30D / Drawdown 30D (`eq=` in the URL); sparkline under it from the series port | DELIVERED_FIXTURE; see needs-contract 4 for the sparkline subject |
| Health / Source State | Health flags (+ lifecycle flag) and Source columns; both filterable and groupable | DELIVERED_FIXTURE |
| QBTS | value (exact), band the dataset names, `Provisional` flag, disclosure with P / R / B, evidence word and policy label (`FIXTURE_LAB`); a missing score is `Not available` with the reason; a version with no named band prints `No band` (the client never looks a band up); a true zero is a figure | DELIVERED_FIXTURE; see needs-contract 1 |
| Optional columns | Columns menu: Venue, Lifecycle, Version, Economic domain, Drawdown, Score coverage | DELIVERED_FIXTURE |
| Optional: deployer, fee / funding completeness, regime-fit status, last trade / event | not controls | needs-contract 5 (named here, not drawn as dead controls) |
| Optional: archive monitor state | Lifecycle column (`ARCHIVE_REQUESTED` and the like) | DELIVERED_FIXTURE |

## 3. Guide 8.2: sort, filter, group
| Rule | Implementation | State |
|---|---|---|
| Sort server-side, stable immutable-ID tiebreak, null-last both directions | the screen sends only keys; the server ties on `row_key` and puts nulls last (`query_policy.null_order`); the client never sorts and never compares a decimal as text | DELIVERED_FIXTURE |
| Header asc/desc and priority multi-sort | click adds the key ascending, again reverses, again removes; up to three keys, the position is the priority, shown on the header and in the sort line (`sorts=score:desc,name:asc`); a Sort select repeats the presets for the card layout; Clear sort | DELIVERED_FIXTURE |
| Only published sort fields | a header sorts only if `query_options.sort_fields` offers it; money keys also need a Basis (the pinned economic partition: "no cross-currency implicit sort"); otherwise the header says why on its title and a sort in a shared link is not sent and the sort line says why | DELIVERED_FIXTURE |
| Numeric RANGE filters with unit and inclusive boundary | Ranges popover: Alloc, PNL Amount, Unrealized PNL, Equity 30D end value (need a Basis), Return 30D, QBTS (no basis); `GTE` / `LTE` on the wire; text "inclusive; in Paper · USDT" on the chip; non-decimals are refused | DELIVERED_FIXTURE |
| Stage multi-select, lifecycle, portfolio, owner, venue, version, health / source | lens + `stage_filter`; `lifecycle_filter`; `portfolio_id`, `owner_user_id`, `venue`, `alpha_version_id`, `health`, `source_state` as `EQ` / `IN` | DELIVERED_FIXTURE |
| Economic domain, currency | the Basis select (domain and currency together pin one partition) | DELIVERED_FIXTURE |
| Missing / stale / insufficient evidence | Evidence select: "Missing score" is `score IS_NULL`; "Stale source" is `source_state EQ STALE` | DELIVERED_FIXTURE; "insufficient evidence" as its own status is needs-contract 2 |
| Filter chips, clear one / clear all | one chip per filter and per range; Clear all also clears the metric params | DELIVERED_FIXTURE |
| Group up to two levels, counts from the whole authorized query | Group by / Then: portfolio, current stage, stage presence, owner, alpha, venue, health, source state, lifecycle; header counts are the server's `unique_row_count` (rows = alpha versions in a portfolio) with a note that stage groups are memberships and are never added | DELIVERED_FIXTURE; the "unique alpha vs deployments" split is needs-contract 3 |
| Logical account, regime status, date / window, score evidence status as filters | not controls (the published schema cannot carry them) | needs-contract 2 |

## 4. Guide 8.3 and the audit items
| Item | State |
|---|---|
| Sticky identity columns (alpha, and the select column) | DELIVERED_FIXTURE (CSS `position: sticky`, off in the card layout) |
| Compact density | DELIVERED_FIXTURE (`density=compact`) |
| Horizontal-scroll affordance | existing: the table wrap fades the cut side and is a focusable region |
| Saved views with version | needs-contract 6 (no saved-view store); not drawn |
| Bulk actions only with explicit capability | row checkboxes are drawn disabled, each `aria-describedby` the one typed reason ("Select 2 to 4 alphas to compare: Not published (FE-033)."); "Compare selected" is a typed disabled button; nothing selects |
| Export | needs-contract 6 (reauthorized, filtered, formula-safe export); not drawn |
| Portfolio filter, typed Group-by, Map toggle | DELIVERED_FIXTURE. The Map toggle is always drawn; when the dataset is not published it is disabled with its reason |
| Board lane tags and hatching | DELIVERED_FIXTURE: Paper and Sandbox lanes say SIMULATED and are hatched; Canary and Live say REAL-FUNDED and are framed (words first, never colour alone) |
| KPI set | DELIVERED: Alphas, Deployments, Portfolios, Need attention, Ready for exit review, Archive in progress (both typed `Not published` with FE-027 / FE-034: the fleet summary has no such count), Research only |
| Board card allocation, x/7 progress, EXIT REVIEW READY badge | needs-contract 7 (the board is built from the fleet read, which has no money or readiness) |

## 5. Needs-contract (exact backend requests; nothing was widened)
1. **QBTS band, evidence, provisional.** The Manager metric carries a decimal only. The fixture encodes `qbts_band` as an ordinal metric whose `reason_code` is the band code, `qbts_evidence` the same with the evidence word, and `qbts_provisional` a 0/1 flag, in the open partition map. Request: typed fields on the score metric (or a score slot on the row) `{ band_code, band_policy_version, evidence_state: ELIGIBLE | PROVISIONAL | INSUFFICIENT, provisional_duration, policy_version, components: {p, r, b} }`, so the band is a published code and not a reading of `reason_code`. The Fleet reads the encoded form today and shows `No band` when it is absent.
2. **Filters the schema cannot carry:** `score_evidence_state` (eligible / provisional / insufficient), `regime_fit_status`, `logical_account_id`, and a window on the Fleet read. Request: add them to the allowlist of `filters[].field` with their operators, each also a `sort_fields` entry when orderable.
3. **Group header "unique alpha" vs "deployments".** `groups[]` has `unique_row_count` only (alpha versions in a portfolio). Request: `unique_alpha_count` and `deployment_count` on each group, from the whole authorized query.
4. **Equity 30D sparkline for an alpha version.** The series subject is `FUND` or `PORTFOLIO`. Request: subject `ALPHA` (and `DEPLOYMENT`) on `GET /manager/series`. Until then the cell draws the NAV series of the row's portfolio, labelled so on its title.
5. **Optional columns:** deployer id, fee / funding completeness, regime-fit status, last trade / event time on the Manager row.
6. **Saved views with version and export:** a saved-view resource (id, version, query digest, owner) and an export action that reauthorizes at creation and download, with fields / basis / method / as-of and formula-injection-safe CSV.
7. **Fleet summary counts** `ready_for_exit_review_count`, `archive_in_progress_count`; board card `allocation` and `readiness x/7` (FE-027, FE-028).

## 6. Fixture lane (recorded in `SIMULATED_DATA_REGISTER_2026-10-22.md` section 2c)
`apps/portal/fixture-bff/review-manager.ts`, additive: `NEW_ROW_KEYS` gains `score`; new `qbtsMetric`, `addQbts` (called at the end of the per-partition loop of `enrichRow`); `nulled`, `aggregate` (a score is never summed and a group deletes it), `rowsFor` / `enrichRow` (a `components` parameter, populated only) and the options push in `datasetAnswer` were touched; `balance_total` basis is now `FIXTURE_LAB:INTERNAL_ACCOUNT_BALANCE`. The layout-stress profile serves no score (its responses sit at the size bound).

## 7. Layout and typography
LAYOUT_PLACEHOLDER

## 8. Baselines that will differ (not recorded)
Fleet table, board and map at every width (new columns, toolbar rows, sort line, KPI tiles, lane tags, disabled Map toggle), the Fleet drawer is unchanged. No baseline was recorded and no visual suite was run.

## 9. Tests (focused, `--maxWorkers=2`)
TESTS_PLACEHOLDER
