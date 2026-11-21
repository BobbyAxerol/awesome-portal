# Review2-04 — Data feasibility per V2 screen/concept, and new backend asks (Claude critic, 2026-10-18, draft for Bobby)

Read-only desk review. Sources: design/README + sweep/06 + V1_SCREEN_REVIEW + V1_SUBSCREEN_DISPOSITION + hifi/concepts c1-c4; FRONTEND_BACKEND_SYNC (FE-001..022, RV-1..10); proposal §1, §11-§13; `execution-manager-models.d.ts` (8 manager routes) and `execution-*` fixture names.
Not verified: runtime, HK worktrees, preview. Status words come from docs/contracts and can be stale (pins in SYNC §0 still unreconciled: FE-019).

**Status legend.** `E-503` V2 route/contract exists and is mounted but returns 503 until a publication qualifies (all 42 families UNAVAILABLE, `enabled_environments=[]`). `E-M` V1 route mounted in the retained preview build; real values depend on dark sources (not qualified for V2). `DARK` mounted, disabled (capital-commands: `COMMAND_RELAY_NOT_QUALIFIED`). `SCHEMA` types/fixtures only, no route. `PART` some inputs exist, a needed one missing. `MISSING` nothing. **No row is "qualified" today**; the honest default for every number is the typed-absence state (`Not available · <reason_code>`, hatched, per UI2) — never a blank, never 0.

## 0. Findings that change the plan
1. **Window control has no server meaning.** `ManagerDatasetQuery` has no `window`/`from_ms`; scalars are only `equity_30d_end_value` and `return_30d_pct`; `metric.window` is output-only. UI3 (default 90D, 7D/30D/90D/ALL on every cell) has **no 90D, 7D or ALL scalar** for returns/PnL anywhere (only V1 `equity-chart` takes `from_ms/to_ms`). -> FE-025.
2. **Most concept data is Portal-derived events/state that no stream publishes**: lifecycle history, gate criteria shape, last-visit marker, change feed, approved-baseline series, entity search. Only the approval queue/SLA/quorum/checklist side of C4 is Portal-owned and therefore earliest real.
3. **Money-bearing concepts (digest NAV delta, capital flow, compare series, heat-map return colour, M01 KPIs) sit on PM-dark / no-NAV-series fields** (SYNC FE-005/006/013/017; proposal §13 "low/very low"). They can only ship as design + fixtures.
4. `capital_statements.statement_scope = …BEFORE_TABLE_FILTERS` (FE-010/RV-3) means KPI strip and a filtered heat map/compare can disagree; UI must label scope.
5. V1 has controls that look live but are dead (sweep 06 §6: Live Approve/Deny, Ack/Resolve, Sync now/Dry-run, canary actions). V2 must not inherit them as enabled (D9 disabled+reason).

## 1. Feasibility matrix
Fallback = what the UI shows meanwhile. "cf." = existing request. `reason` always comes from `reason_code`/`availability`, never invented copy.

### 1a. V2 screens
| Screen / component | Data needed | Status | Fallback |
| --- | --- | --- | --- |
| M01 KPI strip (NAV, Net PnL, Return, DD) | `manager/fund-overview` metrics; NAV series | E-503; NAV/return/DD source MISSING (Modified-Dietz not TWR, FE-006) | Tiles keep layout, show `Not available · <reason>` + methodology chip; no total when PM aggregate null (FE-005) |
| M01 Fund equity/PnL chart | Fund-level series; `/views/equity-chart` has no root subject | MISSING (FE-013) | Hatched panel, one line why; no synthetic line from portfolio sums (partitions cannot be added) |
| M01 Needs attention | `compositions/command-center` (Needs You, severity/SLA/age) | E-M (Portal-owned, earliest real) | Distinguish "Nothing needs you" (source COMPLETE) from "Source not ready" (never show empty-good while stale/UNKNOWN) |
| M01 Stage/fleet counts, Today panel | `stage_presence` (set), V1 command-center Fleet cells, REVIEW_DUE/CONDITION_EXPIRY | E-503 / E-M | Counts per stage only where COMPLETE; else "21 of 24 reporting" partial label |
| M01 Capital block (initial/added/returned) | `capital_statements[]`; funding-source attribution | E-503; PM dark; `funding_bucket_pnl` always null | Disclosure "Not available · attribution not approved" (D6) |
| M02 Portfolios list + Unallocated row | V1 `/portfolios` (no sort/paging, truncated flag) + manager portfolio rows | E-M / E-503 | Show V1 identity columns; money columns typed-absent; `truncated` banner |
| M02 cross-env "All" | environment is mandatory single value | MISSING (FE-014) | "All" = navigation only; no summed money |
| M03 Fleet table (identity, owner, stage, venue, health) | `manager/fleet` rows; 16 scalars; group_by 8 keys; V1 `/alphas` has search/health/owner | E-503 (identity highest-readiness); search op MISSING (FE-008) | Columns on allowlist only; unknown metrics `UNAVAILABLE`; search = client-side over loaded page, captioned |
| M03 money cols (allocation, balance, net PnL), sparkline 30D | scalars; `alphas/equity-sparklines` (key per alpha, env hard-coded paper) | E-503 / E-M | Per-cell typed-absence; sparkline hidden (not flat) when not published |
| M03 attention reasons, free/locked balance | V1 `attentionReasons[]`, `balanceFree/Locked` | E-M only; not in V2 row | Health chip without "why" -> see amendment to FE-007 |
| M04 Portfolio overview/equity | `manager/portfolios/{id}/overview`; V1 `/views/equity-chart` (portfolio, metric=equity) | E-503 / E-M | Chart from V1 equity only when envelope has no gaps flag; draw caption algorithm/gaps/retention (V1 dropped it) |
| M04 Allocations: Real-funded vs Simulated ledgers | V1 `capital-ledger` (entries, movement, before/after) | E-M | Two blocks, entries table; per-block "ledger unpublished" if empty |
| M04 Risk & Health correlation | V1 `correlation` (PACKED_MATRIX/RANKED_PAIRS) | E-M, "no data source" | Collapsed "Not available · No data source" row |
| M04 Actions rail (recall/allocate preview) | `capital-commands` preview/submit/status/reconcile | DARK | Buttons disabled + reason + link M10 (D9); preview labelled "derived, not applied"; non-amount receipts per SYNC §0 |
| M05 Overview, Where-it-runs strip | `manager/alphas/{id}/overview`, `stage_presence`, children[] | E-503 / PART | Strip shows presence only; no history (see spine) |
| M05 Score / QBTS (Explain drawer) | `scores`, `score_details`, `score-view`, `score-revisions` | E-503; every value `policy_pending` (FE-011) | Typed `policy_pending` state, Explain shows band/P/R/B as "pending" |
| M05 Regime fit | `regime_details` | SCHEMA (synthetic); dataset regime value null | "Not available · policy pending" |
| M05 Performance (equity by stage, drawdown, venue contribution, drift) | V1 `query-analytics`, `stage-drift`; manager series | E-M (~6 of 12 tiles draw) | Draw only tiles with data; one line "N charts not available"; simulated = hatched, mixed series never labelled actual |
| M05 Orders & Fills, Positions | subject activity, relation pages (orders, fills) | E-M (higher readiness) | Real tables; partial population "21 of 24" |
| M05 Trade Replay | `/market/venue-candles`, `/market/candles`, relation fills | E-M (candle reliability source-dark) | Log table + "No candles published" (S7) |
| M06 Account 360 | `manager/accounts/{id}/overview`; V1 resources, sync history, findings | E-503 / E-M | Real tables; "Sync now/Dry-run" disabled with reason |
| M06 Physical binding, exposure verdict | V1 binding detail, `/broker-bindings/{id}/exposure` | E-M | Shared-binding balance "Not computed" (R10) |
| M07 Deployment header + strip | `manager/deployments/{id}/overview`; V1 stage screens | E-503 / E-M | Header always; stage tab bodies show fixture `unavailable` state (canary/live-full fixtures are `unavailable`) |
| M08 Archived alphas + paper monitor | list, archive disposition, paper-return after archive | SCHEMA only, no read route (FE-016, FE-022) | Design-only; route hidden from nav until read exists |
| M09 Operations/Exceptions | V1 `/operations` + composition; ack/resolve; mirror integrity; source health | E-M (Portal-owned) | Real queue; Ack/Resolve enabled only if handler + capability true; else disabled+reason |
| M09 Decisions (inbox, history, waivers) | `governance/approvals`, history, waivers | E-M (Portal-owned) | Real list; "Preview only" row removed unless FE-020 = yes; Audit tab "Not available" (FE-021) |
| M10 My access / permissions | `profile-access/v2/*` (8 routes), `researcher_field_policy` | E-M (trust not qualified); researcher policy PENDING | Self-view from `effective`; `grants[].current` is not click authority; researcher sees shell + typed absence |

### 1b. Kept V1 screens (re-homed)
| Screen | Data | Status | Fallback |
| --- | --- | --- | --- |
| GateReviewShell (R1, R2, Exit, Live) | `r1`, `r2`, `exit-reviews`, `/live`; capital-preview POST | E-M (Portal-owned) | Real checklist/locks/quorum; Live gate Approve/Deny disabled with reason until command relay qualified |
| Paper Workbench (Overview+4) | `screens/paper/{id}`, execution-quality, `projection/{panel}` | E-M | Tables real; quality KPIs `n/d` with latencyState |
| Sandbox cert / Canary / Live Ops | `certification`, `canary`, `live` | E-M, canary/live fixtures `unavailable` | Journey strip + typed "unavailable"; record-note POST stays only real write |
| Blotter | `screens/blotter` + funnel + conditional groups | E-M; server filters venue/symbol/side/sort unused; stage/deployment/account/alpha filters absent | URL-scoped client-side filter on loaded pages, caption; amendment below |
| Incident detail (drawer) | `operations/incidents/{id}`; 8 write routes without ExecutionApi methods | E-M | Read-only drawer; write buttons disabled+reason |
| Waivers, Admin actions (admin), Binding detail | `waivers`, `commands/catalog`, `tasks`, `activation/capabilities` | E-M | Real lists; admin-only 403 -> "Not permitted" with link M10 |
| Report pack / Export | no export route (FE-016) | MISSING | Button disabled "Not available"; no fake CSV (V1 blanked 7/11 columns) |

### 1c. Concept components
| Component | Data needed | Status | Fallback |
| --- | --- | --- | --- |
| C1 Command bar search (alpha/portfolio/account/approval/op) | Cross-entity prefix/contains search, scoped, with subtitle/stage | PART: V1 alphas/bindings have `search`; portfolios none; ops/approvals none; manager filter has no text op (FE-008) | Jump list = static nav + loaded rows + recents (browser-local); footer "Searches loaded items only" |
| C1 Context bar (env, stage, currency, scope) | `environment`, `stage_filter`, `economic_partition`, `portfolio_id` EQ | EXISTS in dataset query (E-503); multi-portfolio scope needs `IN` | Single portfolio scope only; "All portfolios" = no filter; partition chip required before any money |
| C1 Context bar: window 7D/30D/90D/ALL | window param + windowed scalars | MISSING (FE-025); charts only via V1 `from_ms/to_ms` | Chips visible; unpublished windows disabled with reason; auto-pick widest published + banner "90D not published, showing 30D" |
| C1 Context bar: "As of" | historical snapshot read | MISSING (FE-036) | Remove control (decision B6) |
| C1 Last-visit digest | per-user marker + change feed (incident, approval decided, op applied, source partial, stage move, new alpha, NAV delta) | MISSING marker; feed partly derivable (operations, approvals history, incidents, source-health); NAV delta needs FE-013 | Hide digest; M01 Needs attention stays (decision B3) |
| C1 Fleet heat map | rows with allocation/net PnL/return, health, stage_presence; ≤200 rows/page | PART: E-503; size=allocation is single-partition only; 1 MiB cap | Equal-size cells coloured by health/stage; size/return metrics offered only when AVAILABLE; "Showing 200 of N" |
| C2 Capital flow (Sankey) | Fund->portfolio->alpha->deployment->account edges per basis (capital/budget/exposure/margin) + ledger seq/receipt | PART: V1 `capital-ledger`, `capital_statements`; edges + receipts MISSING; by-funding-source MISSING by design | Ledger table only; flow panel "Not available · source not qualified" collapsed |
| C2 Compare 2-4 (portfolios/alphas) | multi-subject scalars one partition, 7/30/90, aligned series | PART: rows via single-id EQ calls; no `IN`; series FE-013 | Side-by-side scalar table from loaded rows; chart "Not available"; block if partitions differ |
| C3 Journey spine R1->Live | per alpha-version stage history, gate state, days-in-stage, criteria met/required, blocker, decider | PART: `stage_presence` is a lexical set, not history; gate data per approval id only | Spine from presence + current approval; unknown past steps drawn dashed "history not published" |
| C3 Fleet board (lanes) | current stage, days in stage, blocked reason as sortable scalars; lane counts | PART: `group_by stage_presence` (FE-012) | Table\|Board toggle stays; lanes by presence, no days/blocked chip |
| C3 Event ribbon on charts | per-subject UTC events (promotion, approval, capital cmd, incident, restart) | PART: command-journal + approvals history + incidents + observed timeline; unified feed MISSING | Ribbon from fills/orders markers only (when candles/series exist); else absent, no empty rail |
| C4 Cockpit queue/verdict/quorum/SLA/note | approvals list + R1/R2/Exit/Live review + plan->apply | E-M; creator/ladder/SLA per row partly; one-call receipt MISSING | Queue real; decision button "Preview · not recorded" until receipt contract (FE-030) |
| C4 Evidence diff (observed vs approved band/path, paper-twin) | approved baseline series, observed series, restart cycles | MISSING (baseline); observed partly (stage-drift, paper series E-M) | Criteria table only + "Chart not available" (decision B4) |
| C4 Drift verdict rows (metric/observed/limit/verdict) | uniform `criteria[]` across R1/R2/Exit/Live | PART: each gate has its own checklist/evaluation shape | Render per-gate existing checklist; unmapped rows labelled "Not published" |
| D9 Disabled-control reasons | per control: enabled, reason class (permission / not turned on / source not qualified / state-ineligible), grant ref, step-up | PART: governance `reason_code`s, `activation/capabilities`, `commands/catalog.blockedReason`, profile-access `effective` | One-line reason from nearest code + link M10; unmapped code shows raw code in Provenance, copy "Not available for you" |
| Window 7D/30D/90D/ALL on charts | `from_ms/to_ms` on equity-chart | EXISTS (V1 chart only) | Charts honour windows; scalar cells follow FE-025 |

## 2. New / changed backend requests (continue ELP2-REQ-FE-023..; do not repeat 001-022)
Priority: P1 before locking wireframes/fixtures of the dependent screen; P2 before wiring real; P3 optimise. Owner stream TS / PM / Edge / Portal (Portal is the integrator for every row). All `OPEN`.
| ID | Pri | Need | UI blocked | Owner | Done-when |
| --- | --- | --- | --- | --- | --- |
| FE-023 | P2 | Cross-entity scoped search `q` (PREFIX/CONTAINS) over alpha, portfolio, account, deployment, approval, operation -> `{kind,id,label,stage,env,route_key}`, authorized-only, no money | C1 command bar | Portal (+PM identity) | Operation + fixture (empty/1/many/not-authorized); text op rule stated (extends FE-008 beyond fleet) |
| FE-024 | P2 | Per-user last-visit marker (read + mark-seen) and change feed `since` marker: kinds INCIDENT, APPROVAL_DECIDED, OPERATION_APPLIED, SOURCE_PARTIAL, STAGE_MOVE, NEW_ALPHA, each with ref id, UTC ms, severity, no money | C1 digest, M01 | Portal (sources TS/PM/Edge) | Contract + fixture; marker cross-device; "no change" distinct from "feed unavailable" |
| FE-025 | P1 | `window` (7D/30D/90D/ALL or `from_ms/to_ms`) accepted by manager dataset/360 reads; windowed scalars (net PnL, Modified-Dietz return, DD) echo `metric.window`; unpublished window returns `UNAVAILABLE`+reason, not null | Every cell under UI3 | Portal + TS (+PM for capital) | Query field + per-window fixtures incl. one window UNAVAILABLE; cf. FE-006/013 |
| FE-026 | P2 | Approve researcher field-policy matrix (which fields a researcher sees on M01/M03/M04/M05 own-slice; portfolio name vs "your slice", D7) | Researcher variants all screens | Portal | Policy revision published, status not PENDING; fixture per role |
| FE-027 | P1 | Alpha-version lifecycle read: ordered stage transitions (R1,R2,Paper,Sandbox,Canary,Live) with state (done/current/blocked/not started), entered_at, days_in_stage, gate criteria met/required, blocker `reason_code`, decider role, decision/receipt ref; plus `current_stage`, `days_in_stage`, `gate_state` as sortable scalars | C3 spine, board, M05 header, M07 strip | Portal (PM lifecycle, TS stage moves) | Operation + fixtures (mid-journey, blocked, never-promoted); cf. FE-002 mapping |
| FE-028 | P1 | One `criteria[]` shape for all gates: `{key,label,observed,limit,op,unit,verdict(WITHIN/WARN/BLOCKER/NOT_PUBLISHED),source_ref}` + ladder, checklist counts | C4 drift verdict, GateReviewShell | Portal (evidence from TS/Research) | R1/R2/Exit/Live reviews return it; unknown verdict explicit |
| FE-029 | P2 | Approved-baseline and comparison series for evidence diff: approved return range band, approved in-sample/backtest path, paper-twin path for canary, restart-cycle markers, same clock and basis | C4 evidence diff | Portal + Research (+TS paper twin) | Series with `methodology_ref`, hatch flag for simulated; empty allowed; cf. FE-013, stage-drift |
| FE-030 | P1 | Decision cockpit contract: queue row adds `creator`, `ladder`, `sla_due_at`, `needs_you`/not-yours reason; server-computed "what changes" preview (derived, not applied); one idempotent decision call returning `receipt_ref`, `quorum_after`, state | C4 verdict panel, M09 | Portal | Fixtures for approve/reject/replay/duplicate/UNKNOWN; cf. FE-020 (preview kept or not) |
| FE-031 | P2 | Unified subject event feed `/subjects/{kind}/{id}/events?from_ms&to_ms&kinds` (promotion, approval, capital command, incident, restart, archive) with actor and receipt ref | C3 ribbon, M05/M04 Activity | Portal (TS journal, PM ledger, governance) | Contract + fixture; states audit gaps; may reuse FE-021 source |
| FE-032 | P2 | Capital flow read per portfolio: nodes/edges per basis (capital, budget, exposure, venue margin; never one amount), ledger page with `seq`, `command_id`, `receipt_ref`, `state` (pending/applied/recall), non-amount receipts allowed | C2 capital flow, M04 ledger | PM + Portal | Edges AVAILABLE/UNAVAILABLE per basis; fixture incl. no-amount receipt (SYNC §0); cf. FE-017, REQ-08-001 |
| FE-033 | P2 | Multi-subject read: filter op `IN` (portfolio/alpha ids, scope bar) and aligned rebased series for 2-4 subjects with common partition check (error on mixed currency) | C2 compare, C1 scope | Portal (+TS series) | Op + fixture; partition mismatch is a typed error; cf. FE-013 |
| FE-034 | P2 | Archive read + commands: archived-alpha list with archive disposition, paper-monitor return after archive, request/approve/reactivate commands (D3, D8) | M08, M09, M05 request-archive | Portal + PM + Research | Route list + fixture; cf. FE-016 (archived read now required), FE-022 |
| FE-035 | P3 | Fleet-map projection `view=MAP`: row_key, name, allocation, windowed return/net PnL, health, stage_presence only, ≤1000 rows, own byte cap | C1 heat map at fleet scale | Portal | Spec + 1000-row fixture; cf. FE-009/012 |
| FE-036 | P3 | Point-in-time read: `as_of_ms` on dataset/360 (retained snapshots) or explicit decision that it does not exist | C1 "As of", C2 retained snapshots | Portal | Operation or recorded "no" |

**Amendments to existing requests (no new ID):** FE-007 add `attention_reasons[]`, `balance_free`, `balance_locked` to guaranteed row keys (V1 had them, V2 row dropped them) | FE-012 add `current_stage`/`days_in_stage` sort+group (see FE-027) | FE-015 reason payload must carry `reason_class`, `grant_ref` (link to M10), `step_up_required` and distinguish "not turned on" vs "no permission" vs "source not qualified" | FE-016 split: archived read -> FE-034; export and saved views stay P3; Report pack/Export need a route before the button is enabled | FE-010 decision needed: filtered statements for heat map/compare | Blotter query (V1 `BlotterQuery`) add stage/deployment/account/alpha filters (small, Portal) | V1 writes with no `ExecutionApi` method (incident ack/assign/resolve, activation plans): FE-001 handoff must list them.

## 3. What ships first with real data vs design-only
Ordered by data readiness (proposal §13 + this matrix). "Real" = lane `REAL_READ_*` only after the owning source is qualified; today every item is fixture/BFF-double.
1. **Portal-owned governance and ops** (earliest real, no TS/PM money dependency): M09 Operations + Decisions, Incident drawer (read), Waivers, GateReviewShell reads, C4 cockpit minus evidence charts, M10 My access, D9 disabled-control reasons (from `activation/capabilities` + reason codes).
2. **Identity and facts:** M03 Fleet table (non-money columns, health/stage chips, group_by), C1 command bar (nav + loaded entities), C1 context bar (env, stage, partition chip), M06/M07 headers and tables (orders, fills, positions, reconciliation, sessions), Blotter, Trade Replay log table, journey strip from `stage_presence`.
3. **Money facts, thin:** allocation, balance, net/unrealized PnL cells; heat map with allocation sizing; M04 Allocations ledger from V1 `capital-ledger`; V1 portfolio equity chart with caption; Insight tiles that already draw (~6).
4. **Design-only until sources qualify (build with L0-L3 fixtures, behind lane label):** M01 KPI/NAV/equity, return/DD/score everywhere, Regime fit, capital statements, Initial/Added funds, C1 digest, C2 capital flow Sankey and compare series, C3 event ribbon beyond fills, spine history/board days-in-stage (FE-027), C4 evidence-diff charts (FE-029), C1 "As of", M08 Archived (FE-034), Report pack/Export, saved views, capital actions (relay DARK).
Rule: a design-only block in production renders the collapsed typed-absence row (one line + reason), not a large hatched panel.

## 4. Decisions Bobby must take
| # | Question | Options | Recommendation | UX consequence |
| --- | --- | --- | --- | --- |
| B1 | UI3 default 90D has no data (finding 1) | (a) keep 90D default, chips disabled+reason; (b) default 30D until FE-025; (c) derive windows client-side from series | (a) with auto-fallback to widest published window + visible banner | Honest first screens say "showing 30D"; no client math that disagrees with server later |
| B2 | Which concepts ship in the first real release | (A) all concepts, empty states; (B) only concepts with real data (section 3 items 1-3); (C) all behind a "design preview" flag | (B) for production, (C) for design review: C4 cockpit (no diff), C1 bar+context, C3 spine/board from presence, heat map health-colour; defer digest, Sankey, compare series, ribbon, evidence diff | Fewer features at launch but none pretends; M01 stays a Needs-attention + typed-absence screen |
| B3 | Digest "since your last visit" fallback | (a) hide until FE-024; (b) browser-local marker + partial feed | (a) | No digest in release 1; (b) would differ per device and omit events silently |
| B4 | Evidence diff without baseline series | (a) criteria table only; (b) hatched placeholder charts; (c) hold cockpit until FE-029 | (a) and ship cockpit | Reviewers decide from numbers and verdicts; chart appears when FE-029 lands |
| B5 | Capital flow and compare before PM/NAV | (a) defer both; (b) ship ledger table and scalar compare only | (b) | Allocations keeps ledger; Compare shows scalars from loaded rows, no overlay chart, blocks mixed partitions |
| B6 | "As of" in context bar | (a) remove; (b) keep disabled | (a) until FE-036 answered | Fewer dead controls; avoids implying time-travel exists |
| B7 | Researcher own-slice numbers | (a) ship shell + typed absence until FE-026; (b) show non-money fields now | (a) | Researcher screens are mostly "Your slice only" shells in release 1 |
| B8 | Enabled decision buttons while relay unqualified | (a) enabled, calls retained plan->apply; (b) visible but disabled+reason, "Preview · not recorded" | (b) | Cockpit usable for review/notes; approvals not recorded until receipt contract (FE-030) |
| B9 | Heat-map size metric when allocation missing | (a) equal cells; (b) hide map | (a), labelled "Size: equal (allocation not available)" | Map stays useful for health/stage; no implied capital weight |
Also needs Codex (not Bobby): FE-018/019 pin reconciliation before any PM semantics are used; FE-020/021 answers gate M09 rows.

Counts: 50 matrix rows (1a screens, 1b kept V1, 1c concepts); 14 new requests FE-023..036 (4 P1: 025, 027, 028, 030; 8 P2; 2 P3); 7 amendments; 9 decisions. Top blockers: no qualified V2 source; no window param (FE-025); no lifecycle/criteria shape (FE-027/028); no NAV/PM money for digest/flow/compare; M08 has no route.
