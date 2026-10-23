# WP-K contracts lane, 23 October 2026

Owner of the contracts for the Execution V2 completion program: `packages/contracts/**`, `apps/control-api/**`. Everything here is ADDITIVE (optional fields, new enum values, new sibling reads). Every fixture value is FIXTURE_LAB and recorded in `SIMULATED_DATA_REGISTER_2026-10-22.md` section `## 2k`. Nothing below claims a real source.

Vocabulary used per slice:
- DELIVERED_FIXTURE: what the published contract now carries, what the fixture lane serves through the same HTTP route and the strict reader, and which screen consumes it.
- ACCEPTED_FOR_IMPLEMENTATION: the exact Edge/Core input for each field, so the real API can publish the same keys later.
- Rule shared by every new sibling read: a section is OMITTED (no owning source for this kind of subject), `null` (the source exists and was not read) or an object (published). A count or a list of 0 is a published true zero; only `null` or omission is "unknown". Money is one currency per figure and is never summed by a client.

## Slice 1. Manager series: ALPHA subject and DRAWDOWN metric (C->K 1 and 2, F1->K drawdown, F2->K drawdown strip)

Commit `435ad0529`. Schema touched: `execution-manager-series.v1` (NOT `execution-manager-lists`; N29 `br72_*` is unaffected).

DELIVERED_FIXTURE
- Contract: `subject_type` gains `ALPHA` (query, entry, stored binding `alpha`); `metric` gains `DRAWDOWN` (unit `RATIO` with a stated `ratio_scale`, no currency, every point zero or negative: Zod `MANAGER_SERIES_DRAWDOWN_POSITIVE`, JSON Schema pattern `^(?:0(?:\.0+)?|-(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)$`, reader rule MS-S11). `RATIO_SCALE_NOT_PUBLISHED` is now legal for every ratio metric (RETURN, DRAWDOWN).
- Control-api: an ALPHA subject is authorized as a whole like a portfolio (`alpha.read`, `scopeAllowsFullAccountingPopulation(scope, portfolioId?, alphaId?)`, no restricted fallback), is selected only from a publication bound to `subject_type=alpha` and the alpha's tuple population, otherwise a typed `UNAVAILABLE`. No source publishes one today, so every alpha is `SERIES_SOURCE_NOT_PUBLISHED`.
- New fixtures: `execution-manager-series.alpha`, `.drawdown`, `-publication.drawdown`, `-query.alpha-drawdown`, `.drawdown.synthetic.negative` (all hashed in `tooling/snapshot.py`). Existing fixtures are byte-identical.
- FE: reader (`MANAGER_SERIES_METRICS`, `MANAGER_SERIES_SUBJECT_TYPES`, `isRatioMetric`, ALPHA in `encodeManagerSeriesQuery`/`seriesAnswersQuery`), `METRIC_WORD.DRAWDOWN`.
- Fixture lane (`review-manager.ts` WP-K section; `e2e/bffDoubleManager.ts` WP-K markers): ALPHA series end on the alpha's own dataset figure (`wpcTarget` by `alpha_id`); DRAWDOWN is derived by exact integer arithmetic from the same subject's NAV walk (running peak).
- Screens consuming: Compare, Alphas tab: aligned overlay with a measure switch NAV, Net PnL, Return, Drawdown (ALIGNED / INCOMPARABLE / UNAVAILABLE exactly as the server says); Compare, Portfolios tab: Drawdown measure; Alpha 360 Performance: the drawdown pane under the equity chart (90D) with its caption, typed absence while unpublished.
- NOT consumed: Overview and Portfolio 360 drawdown strips (WP-F1 finished after this slice began and its final commit `09683f608` is not in this base; the strips are typed `DRAWDOWN_ABSENT` panes passed as the `drawdown` prop of `ManagerSeriesPanel` in `screens/overview/index.tsx` and `screens/portfolios/portfolio/Performance.tsx`; wiring is: one `getManagerSeries({metric:"DRAWDOWN"})` for the same subject, window and environment, then `{kind:"series", points: chartPointsOf(entry)}`, see `screens/alpha/PerformanceTab.tsx drawdownOf`). Account 360 strip: BLOCKED, there is no ACCOUNT subject in the series contract (request stays OPEN: needs an account equity series source).

ACCEPTED_FOR_IMPLEMENTATION (Edge/Core input)
- ALPHA series: a `manager_series` publication per (alpha, metric, economic partition, exact window) bound to the alpha's tuple population digest, same `source_set_digest`/`source_as_of_ms` as the Manager document, one currency per partition, observation time = document `as_of_ms`. Metrics NAV and NET_PNL: normalized financial series of the alpha's deployments in one partition; RETURN: ratio with the scale the producer states.
- DRAWDOWN: peak-to-trough ratio computed by the producer on the SAME normalized NAV series in the same partition and window (never by the Portal), with `ratio_scale` stated, points at or below zero, canonical zero `0`; methodology ref names the peak definition.

## Slice 2. Approvals evidence (E->K 1 to 5)

Schema added: `execution-approval-evidence.v1` (sibling read `GET /api/v1/execution/governance/approvals/{approval_id}/evidence`, operationId `executionApprovalEvidenceGetV1`). The sealed parent reads (R2, Paper exit, Live) and their field seals are untouched: a sibling read keeps the additive change out of `parent-read` purpose digests. Generator `tooling/generate-execution-approval-evidence.mjs`.

DELIVERED_FIXTURE
- Fields (all optional, nullable): `prior_economic_history` {subject, metric NAV|NET_PNL|RETURN|DRAWDOWN, unit, currency, ratio_scale, window, methodology_ref, points[{ts_ms, value}], as_of_ms}, `evidence_diff` {previous_revision, changes[{label, before|null, after|null, unit}]}, `obligations_after_approval` {open_positions, working_orders, reservations, unknown_outcomes, settlement_pending: non-negative integers}, `receipt_preview` {what_changes, counts_as{met_after, required}}, and the Portal evaluation time `read_at_ms` (E->K 5 for this read; the inbox page envelope itself is NOT extended, see not delivered).
- Fixtures: `.published`, `.not-read`, `.no-source`, `.drawdown`, `.synthetic.negative` (7 refusals). Reader `readers/approvalEvidence.ts` (EV-1 ascending points inside the window, EV-2 drawdown at or below zero, EV-3 a diff row that changes nothing is refused). Optional port method `getApprovalEvidence`, HTTP and fixture lane (deterministic per approval id; 1 id in 7 answers null sections, 1 in 7 omits them).
- Cockpit consumption (`screens/cockpit/evidenceExtra.tsx`, EvidenceFrame, Rail): Prior economic history chart with caption, Evidence diff rows, Still open after approval (five counts, a true 0 shown as `0`), the verdict fact "N obligations stay open after approval" (not on an R1; only the sum of the five published counts), the rail receipt row "What changes". Every panel keeps its typed absence for not read, no source, a refusal, a throw or a port without the read.
- Control-api: NO mapping. No projection row carries these facts; the route is contract only (the OpenAPI description says CONTRACT ONLY).

ACCEPTED_FOR_IMPLEMENTATION
- `prior_economic_history`: Core normalized series of the request's subject (alpha, portfolio, account or deployment), same publication as slice 1, one partition, one window ending at the request time.
- `evidence_diff`: the stored previous review revision and the current one of the same request kind; each `changes[]` row is a labelled field with both values as the owning fact prints them (money as exact decimal text with its currency in the label or unit).
- `obligations_after_approval`: counts at the Portal read time for the request's subject: open positions, working orders, reservations, unknown outcomes (orders whose outcome is not reconciled), settlement pending. `null` while the Edge has not reported, omitted for request kinds with no live subject.
- `receipt_preview`: Core decision plan effect statement (one sentence) and the quorum arithmetic `met_after` of `required`.
- `read_at_ms`: Portal evaluation time.

NOT DELIVERED in slice 2: E->K (5) as an inbox page envelope field (the inbox read belongs to `execution-governance`, a sealed chain); E->K (6) to (9) Access/Users fields (`role_preset`, business-access state and membership revision, `granted_by`, `observed_at_ms`): not started (they edit `portal.access-effective.v1`, `AccountSummary`, `AccessGrant`; see FE_CAT_8_9 note). They stay typed absences.

## Slice 3. Operations (B->K 1 to 5)

Schemas added: `execution-incident-children.v1` (`GET /api/v1/execution/operations/incidents/{incident_id}/children`, `executionIncidentChildrenGetV1`) and `execution-operations-audit.v1` (`GET /api/v1/execution/operations/audit`, `executionOperationsAuditGetV1`, params workspace_id, limit, after, incident_id). Generator `tooling/generate-execution-incident-audit.mjs`. Both are siblings of the V2 root; the legacy `execution.incident-detail.v1` is untouched.

DELIVERED_FIXTURE
- Incident children: `evidence[]` {source FINDING|ALERT|DEAD_LETTER|ORDER_TRACE, digest sha256, label, added_at_ms}, `assigned_to` {actor, assigned_at_ms}, `resolution_gate` {eligible, blocker_codes[]; eligible implies no blocker, in the schema and in reader rule IC-1}, `timeline[]` {event_id, action, actor|null, version_before|null, version_after, at_ms; IC-2 versions never go backwards}, `linked_operations[]` {operation_id, original_target{type,id}|null}.
- Audit: items {audit_id, at_ms, actor, action (upper-case code), subject{type,id}, receipt_ref|null}, `has_more`, `next_cursor` (exactly when there is another page), newest first (AU-1).
- Fixtures (children: published, eligible, not-read, no-source; audit: page, last, empty; 11 refusals in `execution-incident-audit.synthetic.negative`). Reader `readers/incidentChildren.ts`, optional port methods `getIncidentChildren`, `getOperationsAudit`, HTTP, fixture lane.
- Screens: routed Incident page (Evidence by source with true zeros, assignee gate, server verdict with blockers, timeline with actor and versions, children with the original target or "not attested"); Audit tab shows the feed (actor, action, subject, receipt or "No receipt written") when published, otherwise today's workflow record.
- Control-api: NO mapping (no source).

ACCEPTED_FOR_IMPLEMENTATION
- children: Core incident evidence table (source, digest, label, added_at), incident assignment record, the resolution-gate evaluator output (eligible, blocker codes), the incident workflow event log (event id, action, actor, version before/after, time), and the target recorded on every incident link when it was written (so `original_target` is attested; `null` while it is not).
- audit: the operations workflow audit log with actor user id, action code, subject, time and the receipt reference written by the same command (null when the action wrote none), keyset by (at, audit_id).

NOT DELIVERED in slice 3 (they edit the sealed operational-queue chain: `operational-read.contract.ts`, `OperationQueueQuerySchema`, `execution-operational-current-reader.mjs`, `execution-operations.openapi.json` and the SQL view plan; the control-api service documents that the production view has none of these columns and no migration is allowed here): B->K (1) row field `intent_state` (PREVIEWED|SUBMITTED, owning fact the command plan/apply record, FE-020), (2) queue filters `delivery_state` and `display_state` (the row axes already exist; the filters only apply when a `QueueHealthPlan` names the columns), (4) queue filter `incident_id` (audit already takes `incident_id`). Design: add `intent_state: nullable(enum)` beside `delivery_state` in `rowProperties`, add the three filter keys to `operationalQueueQuery`/`OperationQueueQuerySchema` and to `operationalQueueFilters`, refuse them with a typed 400 when the plan has no column, regenerate with `npm run generate:execution-operation-reader`, and run the operations contract specs.

## Slice 4. Blotter (F2->K 1 to 5): NOT STARTED

Reason: the Blotter order rows, `status_bucket` and aggregates live in `PaperReadResponse` (`execution-paper-read.v1`, route `/screens/blotter`, operationId `executionFullBlotterV1`), and the account fields in the bindings/account resources; those are sealed chains with pinned hashes that need a full contracts suite gate, which this lane may not run. F2's fields keep being served as open scalars by `e2e/bffSimulated.ts` (register 2f2) and stay typed absences on the real API.
ACCEPTED_FOR_IMPLEMENTATION (design for a later pass): order `filled_quantity` (exact, true 0 allowed), `average_fill_price` (quantity-weighted, absent without fills), `fee` + `fee_currency` (absent, never 0, when a fill has no commission or fills use two currencies), `deployment_id` on the order row; `status_bucket` values WORKING, CONDITIONAL, CANCELLED with `aggregates`; scope funnel {submitted, risk_granted, venue_acknowledged, filled} integers (0 allowed, null not read, omitted no source); account `product`, `network`, `network_proof_at_ms`, `margin_ratio` (percent decimal string), portfolio display names on sleeve rows; sync-history `check` (BALANCE|POSITIONS|OPEN_ORDERS) and `duration_ms`.

## Slice 5. Alpha 360 (C->K 3, 4, 5 and per-venue Net PnL)

Schema added: `execution-alpha-lifecycle.v1` (`GET /api/v1/execution/alphas/{alpha_id}/lifecycle`, `executionAlphaLifecycleGetV1`, query workspace_id, environment). Generator `tooling/generate-execution-alpha-lifecycle.mjs`.

DELIVERED_FIXTURE
- `stages[]` {stage R1|R2|PAPER|SANDBOX|CANARY|LIVE, state DONE|CURRENT|BLOCKED|NOT_STARTED, entered_at_ms, exited_at_ms, days_in_stage, criteria {met, total, items[{label, observed, threshold, met}]}, decider_role, decided_by, receipt_ref, blocked_reason}; `events` {total, truncated, items[{event_id, kind stage|decision|incident|recall|flow, at_ms, title, actor, receipt_ref}]}; `regime_fit` {state PUBLISHED with ratio_scale and value, or NOT_PUBLISHED with reason_code INSUFFICIENT_DATA|REGIME_MODEL_NOT_PUBLISHED and no number}; `venue_net_pnl[]` {venue, economic_domain, currency, net_pnl, as_of_ms}.
- Fixtures (published, not-read, no-source, regime-absent, 9 refusals). Reader `readers/alphaLifecycle.ts` (LC-1 stage order and a DONE stage has an exit, LC-2 criteria arithmetic, LC-3 unique events; one figure per venue, book and currency). Optional port method `getAlphaLifecycle`, HTTP, fixture lane (same derivation as the WP-C open keys; criteria items stay empty, no observed value invented).
- Alpha 360: the spine, stage spans on the chart, the event ribbon and Events table, the Regime fit tile read the lifecycle first and fall back to the WP-C dataset keys; Performance gains "Contribution by venue" (one row per venue, book and currency, never a total).
- Control-api: NO mapping.

ACCEPTED_FOR_IMPLEMENTATION
- stages: Core stage-transition table per alpha version (stage, entered, exited, derived days from the instants, gate criteria with the observed value and threshold, decider role, deciding actor, receipt reference). Days are the producer's, from the instants, not the Portal's.
- events: the unified subject event feed, one grain, kind from the closed list, actor and receipt when the action wrote them.
- regime_fit: the regime classifier's share of the window in the alpha's regime as a ratio with its scale, or the typed absence code; apart from the score.
- venue_net_pnl: Edge/Core Net PnL of the alpha at venue grain, one currency per figure, with the economic domain and the observation time; never summed across venues.

## Slice 6. Portfolios list (A->K, N1 and N3): NOT STARTED

Reason: N1 (`group_sort`/`group_filters` on the dataset) edits `execution-manager-lists.v1`, whose `br72_*` hashes the N29 product-acceptance file pins: it must be reported to the primary and re-pinned from the gate's table, which this lane may not run. N3 (portfolio Health roll-up) edits `execution-portfolio-list.v1` whose reader is closed. Design: dataset `group_sort: [{metric_key, partition_ref?, direction}]` and `group_filters: [{metric_key, op GTE|LTE|IS_NULL, value}]` (null last both directions); list item `health` {state PUBLISHED|NOT_PUBLISHED, value HEALTHY|ATTENTION|DEGRADED|HALTED, basis, as_of_ms}. WP-F1 (finished) must consume.

## Slice 7. Rows from D, F1, F3, A

D->K (1) ENTITY SEARCH INDEX: delivered as a contract and fixture lane, not consumed. Schema added: `execution-entity-search.v1` (`GET /api/v1/execution/search?q=&kinds=&limit=`, `executionEntitySearchGetV1`; generator `tooling/generate-execution-entity-search.mjs`).
- DELIVERED_FIXTURE: groups per kind (alpha, portfolio, account, operation, incident, approval), each `{kind, total_matched: int|null, rows[{kind, id, label, detail|null, route_hint}]}`, at most `limit` (1 to 50) rows; an unauthorized entity is absent (no denied state exists in the schema: a refusal fixture proves it); a counted zero, an uncounted group (null) and a group with rows are distinct. Fixtures `hit`, `none`, 7 refusals; reader `readers/entitySearch.ts` (ES-1 row kind equals group kind, ES-2 unique groups inside the asked kinds, ES-3 unique rows, never more than the limit, a count never below the rows); optional port method `searchEntities`; HTTP; fixture lane (contains-match over the loaded universe; account and incident are uncounted `null`).
- NOT consumed: `shell/**` (WP-D) landed in the lane after this base. Consumption for the primary or D: `api.searchEntities({q, limit: 8})` replaces the six list reads; use `route_hint` for navigation and `total_matched` for "N more".
- ACCEPTED_FOR_IMPLEMENTATION: an index over the caller's AUTHORIZED alphas, portfolios, accounts, operations, incidents and approvals (id, display label, one detail string, in-app route), authorization applied before matching (so the count never leaks hidden rows), `total_matched` null when a source cannot count.
- D->K (2) per-user counts (`needs_you`, assigned open exceptions), (3) scope parameter, (4) `display_name`/`role_preset` of the principal: NOT started (they edit the sealed governance inbox and self-context chains).
F1->K: DRAWDOWN done (slice 1); capital events, statement keys and `allocation_share_pct`: NOT started (manager-lists / statement chain, N29 pin).
A->K stage entry for the Fleet 'In stage' column: NOT started. The published options pin `unavailable_fields` (`STAGE_ENTRY_TIME_NOT_PUBLISHED`) and `stage_lifecycle.entry_time` inside `execution-manager-lists` (br72 pin). The new lifecycle read of slice 5 already carries `entered_at_ms` / `days_in_stage` per stage for ONE alpha; the Fleet grain (alpha version x portfolio x current stage, coverage per row) still needs the options flip by the primary.
F3->K (10 items): NOT started, except that item (10) stage history on the stage bodies is the same source as slice 5 `stages[]`; item (4) deployment subject for the series port DRAWDOWN is a one-value extension of the slice-1 `subject_type` enum (`DEPLOYMENT`), deliberately not added without a producer decision.

## Tests and gates (counts from the runs of this lane)

Contracts (`packages/contracts`, `npx vitest run <files> --maxWorkers=1`):
- `test/execution-manager-series` (2 files): 87 passed (71 existing with 2 expectations switched to still-unknown values SHARPE/STRATEGY, plus 16 new in `execution-manager-series-wpk.spec.ts`).
- `test/execution-approval-evidence`: 13 passed. `test/execution-alpha-lifecycle`: 16. `test/execution-incident-audit`: 20. `test/execution-entity-search`: 11. Together with the series files: 6 files, 147 passed.
- Neighbours that read every schema or fixture: `execution-serving-reads`, `execution-deployment-identity`, `execution-stage-facts`: 3 files, 69 passed.
- `python3 tooling/snapshot.py --check`: matches all 603 tracked files (was 558 before this lane; every existing fixture hash unchanged).

Control-api (in-process, `--maxWorkers=1 --no-file-parallelism`): `test/be-p4-manager-series.spec.ts` 89 passed (80 existing, two query expectations moved from DRAWDOWN to SHARPE, plus 9 new); `be-p16-manager-series-materializer`, `be-p16-manager-series-repair`, `fe-cat-3-manager-all`, `elp206-manager-model`, `elp2-read-projection`: 5 files, 217 passed, 41 skipped. `npx tsc --noEmit -p .`: no error under `src/`; the errors it prints are in `test/` and in imported frontend files (missing `@portal/contracts-screen-data`, DOM lib) and are pre-existing (checked: none of the touched files).

Frontend (`apps/portal/frontend`, `--maxWorkers=2`): `readers/managerSeries*` 3 files 1270 passed; `screens/compare` + `screens/series`: 130 run, 129 passed and 1 failed (the Alphas-tab expectation of the old typed absence), then `compare.preview` re-run alone after updating it and adding 2 tests: 8 passed; `screens/cockpit` + `readers` (44 files) 66921 passed, 5 expected fail; `screens/operations` + `screens/alpha` + `fixtureBff` + `readers` (94 files, 1 skipped) 67459 passed, 5 expected fail; `v2Hygiene`, `edgePathContract`, `sourceAuthority`, `failClosed`, `budgets`, `titleAbsence`: 222 passed; `readers/entitySearch` + `fixtureBff/wpkSeries`: 32 passed. `npx tsc --noEmit -p .`: no error outside `features/roadmap-task-board` (its node_modules is not linked in this worktree).

Not run (rules): full suites, full hook, Playwright, visual suite, docker, Postgres, preview stack. Not verified: the new screens in a real browser (no layout audit, no screenshot), the Alpha 360 drawdown pane readout alignment (its readout matches only where the equity read and the DRAWDOWN series share a timestamp; elsewhere it prints the pane's own "No published value at this time").

## Files

`git diff --stat` of the K commits is in LOG.md; schemas touched: `execution-manager-series.v1` (changed), `execution-approval-evidence.v1`, `execution-alpha-lifecycle.v1`, `execution-incident-children.v1`, `execution-operations-audit.v1` (new). `contracts-snapshot.json` regenerated by `tooling/snapshot.py`.

## Second pass (addendum; supersedes the "NOT STARTED" markers above for slices 4 and 6)

Branch `wpk-work`, rebased on F1's 33d4e16f6. Every item is DELIVERED_FIXTURE (FIXTURE_LAB in the lane, register sections 2k and 2k2) plus ACCEPTED_FOR_IMPLEMENTATION (the Edge/Core input named per row).

| Item | Request | Delivered (exact names) | Accepted for implementation (Edge/Core input) |
|---|---|---|---|
| Slice 6 group query | A->K N1, N3 | `group_sort`, `group_filters` (default `[]`) on `ManagerModelQuery`; `group_query` echo on the dataset; `applyGroupQuery` (exact bigint decimals, null last, GTE/LTE drop nulls, ties by group key); portfolio list `health` (HEALTHY, ATTENTION, DEGRADED, HALTED), `root_id`, `owner_user_id`. FE `serverOrder.ts`; keeps F1's invalid-range alert (`visible` empty while a range is invalid). | control-api already answers `group_sort/group_filters` from the projected groups; Health needs the portfolio lifecycle + incident roll-up per portfolio; `root_id`/`owner_user_id` need the portfolio identity row. |
| Stage entry | A->K | NOT built by K: Codex 82947ceb2 delivers it. FE reader accepts both the legacy pin (2 unavailable fields) and the published timing (`entry_time` EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED, 0 unavailable fields), flag `stageTimingPublished`; lane serves FIXTURE_LAB timing (8 rows in 9). | Codex `stage_transitions`. |
| Slice 4 blotter | F2->K 1 to 5 | Contract-only siblings `order-detail` (typed order fields, fee never defaulted to 0: exact figure in one currency or absent with reason) and `blotter-summary` (buckets incl. Working/Conditional/Cancelled, scope funnel never growing along its steps); `command-receipt`. | Order rows are open scalar records in paper-read: the typed fields need the order fact projection. |
| Siblings (GAP-1,3,4,5,6,7,9,11,12,15) | WP-M | `visit-digest` (+ `POST /digest/baseline`, GAP-7), `controls`, `obligations`, `portfolio-members`, `account-profile`, `alpha-readiness`, `reconciliation`, `limits`, `cost-events`, `report-snapshots`, `recovery-events`, `grants`; one DSL in `generate-execution-siblings.mjs`, strict FE readers `siblings.generated.ts`, port `getSibling`. Three-state sections (omitted = NO_SOURCE, null = NOT_READ, object = PUBLISHED). | Each needs its owning projection; routes say CONTRACT ONLY. |
| GAP-17 / 18 / 19 | WP-M | `root_id` on portfolio list; audit `policy_revision` and new subject types; portfolio `owner_user_id`. | Portfolio identity row; audit policy revision. |

### NOT done, with reasons
- GAP-8 statement kinds (headroom, net_external_flows, root_capital_limit): `BUSINESS_READ_FIELDS` and the field-policy digest chain would change scope fingerprints; needs a pinned-chain change by the owner.
- Slice 3 queue filters `delivery_state`, `display_state`, `incident_id`, and `intent_state` row field: the filters depend on SQL view columns (`QueueHealthPlan`); no control-api-only route exists. Not built.
- Fleet `owner_user_id` and the Fleet-grain timing flip: sealed chain.
- GAP-2 (`relay_receipt` null const, `F0ApplyDecision.decision` const DENIED): sealed consts, owner change.
- GAP-13, 14, 16, 21 and E 6 to 9 / F3's remaining items: not started.
- GAP-20 (ledger sibling): deliberately NOT built, listed only.
- Capital root limit sibling (second half of GAP-17): not built.

### GAP-22 proposal (reader scope for `score_details` and similar)
Add an optional `reader_scope` array on the Manager dataset root (`[{ key: "score_details", requires: "portfolio:read" }]`), an additive sibling of `unavailable_fields`: a key present in `reader_scope` and absent from the row means "withheld by scope" (typed absence `SCOPE_WITHHELD`), a key in neither means NO_SOURCE. The fingerprint stays untouched because the array is derived from the already-resolved scope, not stored. Owner decides whether it joins the field-policy digest.

### Gates
Contracts specs 11 files / 358 tests; `snapshot.py --check` 704 files; control-api in-process 132 tests (incl. `wpk-group-query.spec.ts` 17); FE: readers + fixtureBff + api 67,500 tests with 1 timeout flake (`alphaResourceScoped.conformance` 200-bound, 20 s, not a K file, fails alone too); portfolios + fixtureBff 982 passed; `wpkSeries` + `siblings` + `stageTiming` 174 passed; `tsc` clean for `src` (remaining: `fixture-bff/review-manager.ts` lines 10 and 410 are not K lines; roadmap-task-board is outside the lane).
