# S03 Run Progress · S04 Evidence Flow — HiFi match and completeness (read-only audit, 2026-09-30)

**Lines evaluated (union):**
- **C** = Claude line `/home/bobby/portal-research-w1-build`, HEAD `d7db1cb3` plus uncommitted changes. Since the shared base `d3d99f26` it has no commits to any S03/S04 file. The uncommitted work touches only the topbar: `app/TopBar.tsx`, `styles/shell.css` and `topBarRunCrumbCollapse.test.tsx` (G14, Bobby option A).
- **X** = Codex line `/home/bobby/portal-research`, HEAD `c2ec1443`. Its S04 changes are commit `0ab62994` ("seal source-time analytics"), consumed in merge `decb5f6c`: `EvidenceFlow.tsx` +100/−~20, `EvidenceCharts.tsx` +30, `evidenceClient.ts` +2, plus the backend `retained-analytics.contract.ts` and the `summary_analytics` DTO. It has no S03 FE changes. It widens the progress contract with `IMPORTED_FIXED_PROFILE`.
- **G3** = worktree `agent-ab5c79763ddadbbd8`, not committed. It **does not affect S03/S04**: `RUN_LABEL_READ_SEGMENTS` is split/search/freeze/execute only, and its comment says 03/04 already feed the label registry (`app/researchRunCrumb.ts`).

Line numbers are for C (`apps/portal/frontend/src/research/…`) unless marked X.

HiFi sources: `QuantBT 03 Run Progress.dc.html` (454 lines) and `QuantBT 04 Evidence Flow.dc.html` (1616 lines, `data-screen-label` Summary / Stage 1 Split … Stage 5 Claim / Atlas).

---

## S03 Run Progress (`/research/quantbt/runs/:id/progress`)

HiFi blocks (from the markup and script, lines 28–236 / 237–454): topbar crumb · page crumb, title and subtitle · SSE label and demo transport · identity strip · claim passport (head, note, 5 claim chips, "open evidence flow →") · 11-stage stepper · progress bar, ticks and text · study/elapsed/eta/rate · fold Gantt (compact cells at >8 folds, rows, `fold_plan.json · outer N`) · evidence cursor · 7-row artifact manifest and its footnote · Live console / Stage log tabs with CANCEL→ARCHIVE · console · 8-column stage ledger · completion banner with S1–S5 links · rules footer.

| # | HiFi block | Status | Where (file:line · line) | Note |
|---|---|---|---|---|
| 03-A | Topbar crumb `Research / QuantBT Backtest / R-WFO-119 / Progress` | YES | `app/TopBar.tsx:44–46` + `researchRunCrumb.ts` · C; G14 collapse in `shell.css` · C (uncommitted) | The D1 label comes from the progress read (`progressClient.ts` `rememberRunLabel`). G14 drops the feature segment below 1440 and the screen name below 1366 (Bobby option A), which fixes FG 03-SH (the topbar wrapped at 1280). The Research laptop baselines will change when G14 lands. |
| 03-B | Page crumb `Runs / R-WFO-119 / Progress` | YES | `RunProgress.tsx:1787–1802` · C | `ShortId` prints the label, and the full id is in its title. |
| 03-C | Title `Run progress — R-WFO-119` / `Run completed — …` | PARTIAL | `RunProgress.tsx:2008`, `:1954`, `:1973` · C | The audit's 03-1 mid-token wrap is gone, but the h1 uses the `shortId(runId)` string, so it reads `Run progress — rrun_9c3f1234` while the crumb beside it reads `R-WFO-…`. FE, S. |
| 03-D | Subtitle (verbatim) | YES | `:61` | |
| 03-E | SSE / transport label | PARTIAL | `:65–69`, `TransportDot :243–247` | Uses the HiFi wording with a 5 s floor (DQ-02, decided). **FG 03-T is still open:** `!live → SSE_CLOSED`, so the screen says "stream closed at terminal frame" while loading and after 503/409/400, when no terminal frame arrived. FE, S. |
| 03-F | Demo transport (play, 1×/4×/16×, complete now, 5/32 folds) | DEVIATION-approved | — | Exists only in the prototype (audit "Dropped as decided"). |
| 03-G | Identity strip (run, status, protocol·mode·schedule, alpha·symbol·tf, route, engine·config sha) | YES | `RunMetaStrip.tsx:63–120` · C | Read verbatim from `run` (CG-P11-03). The alpha shows `alpha_id` where the HiFi shows a strategy name. |
| 03-H | Passport head: `claim passport — forecast/issued`, note, `open evidence flow →` | YES | `ClaimPassport :1351–1445` | The note copy follows the HiFi. The hand-off link carries the fold/trial cursor. |
| 03-I | 5 claim chips: validation_claim, chronological_claim, oos_used_for_selection, holdout_state, certification | **PARTIAL** | certification `:1454–1471`; nothing for the other four | **The four methodology claims are still absent.** Instead the passport shows the server's claim sentence, seal readiness, the hand-off cursor and the claim cursor. **Discrepancy:** the Unified §13.4.1 E4 row and the record `P13/E4_…_2026-09-27.md` say "S03 claim passport + forecast — ĐÓNG" (closed). But merge `c81e8dc2` did not touch `RunProgress.tsx`, `StageLedger.tsx` or `ArtifactPanel.tsx`, and no S03 file or `research-progress.d.ts` contains a methodology-claim field (grep `validation_claim|chronological` returns nothing). BE: **CG-FG-S03-02** (OPEN). An FE alternative that needs no new BE: the issued chips from the S04 retained claim strip / hub, and the forecast from the Atlas mode×schedule matrix as S02 already reads it. |
| 03-J | Forecast box populated while QUEUED/RUNNING | **NO** | `:1967–1994` (the QUEUED_NO_SOURCE page has no passport at all); `:2103–2106` (placeholder shows the title only) | The audit's 03-2 "empty forecast box" is unchanged. Same fix and packet as 03-I. |
| 03-K | 11 engine stepper pills | DEVIATION-approved (H5 / DQ-04) | `StagePills :343–440` | 5 contract stages. The failed stage is red, from `current.failed_at` (E10). |
| 03-L | Progress bar with fold ticks + `n / N trials · %` | YES | `ProgressCard :486–540` | Ticks are drawn only when `declared_folds` is published. |
| 03-M | study N/M · elapsed · eta · rate | PARTIAL | `studyLabel :441–453`, `:552–561` | Study prints `latest / declared` from `run.declared_folds` (CG-P11-03); FG saw "not published" only because its fixture has no declared count. Rate is a typed absence (`RATE_NOT_PUBLISHED`), and there is no BE packet for a trial rate. **Union risk:** X adds scope `IMPORTED_FIXED_PROFILE` (`research-progress.d.ts`), but `studyLabel :443` and `StageLedger.tsx:112` test only `FIXED_PROFILE`, so an imported fixed run would print a per-fold "study" line. FE, S. |
| 03-N | Fold Gantt: rows, compact cells at >8, planned/pending folds, `fold_plan.json · outer N` | PARTIAL | `FoldGantt :722–902` (`COMPACT_FOLDS=8 :620`); meta `:2132` | Only reported folds are drawn, with meta "N of M folds reported". There are no PENDING rows for folds not reached and no `fold_plan` note. BE: **CG-FG-S03-01** (OPEN). An FE option is to draw `declared − reported` PENDING rows from the published count. |
| 03-O | Gantt fills its panel (audit 03-7) | NO (not re-verified) | `:2128` `alignItems: stretch` + `CursorRow :927` `marginTop: auto` | The layout is unchanged since the audit: with 1–2 folds there is blank space above the cursor row. FE, S. |
| 03-P | Evidence cursor: fold / trial / params / hand-off sentence | YES | `CursorRow :904–963` | |
| 03-Q | Artifacts: 7-row manifest (fold_plan, search-trace, selection_trace, parameter_set, stitched, claims.json, holdout DENIED) | PARTIAL | `ArtifactsTable :1027–1096`, `DeniedRow :992`, `RetainedTables :1108`; formatting `ArtifactPanel.tsx:122–125` | The E1 formatting is done: bytes, grouped rows, UTC time and short digest (fixes audit 03-6). The sealed holdout DENIED row is present. The HiFi's named rows depend on what the source announces. BE: **CG-FG-S03-04** / audit 03-5. **Discrepancy:** the ledger marks E15 "ĐÓNG" (closed), but there is no S03 code diff for it (see 03-I). Names still clip from the left with RTL (by design). |
| 03-R | Artifact footnote "clickable the moment its digest is written" | DEVIATION (contract-recorded, no D-id) | `ARTIFACT_NO_READER :87–88`, `:2177` | P11 pins `reader_href` to null, so the screen says sealed bytes have no reader route in this release. |
| 03-S | Live console / Stage log tabs + tab note | YES | `:2189–2196` | Filter chips, follow and load-older are extras from spec 03. |
| 03-T | Console lines: stage events, `fold_0x frozen · best J₁`, `BUILDING_ARTIFACTS · claims.json issued` | PARTIAL | `TrialConsole :1157–1310` | The FE renders what the journal sends. Journal content is BE (audit 03-8). E15 is marked closed but has no code trail, and there is no FG packet. |
| 03-U | Stage log: 8 columns (fold, study started, trials, best J₁, selected, params digest, frozen at, state) | YES | `StageLedger.tsx:36–42` | |
| 03-V | CANCEL RUN on a live run | YES | `:2243–2265` + `CancelDialog :1578` | E10: the owner may cancel, and stuck RETRY_WAIT runs are expired server-side (audit 03-4). The real receipt E10-O1/O3 is **NOT_RUN**: Bobby must allow a run to be stuck on purpose (G10). |
| 03-W | ARCHIVE RUN in the terminal state | DEVIATION-approved (**D5**, deferred) | — | Terminal runs get `new run with same draft →` instead (CG-P11-07, `:1830`). |
| 03-X | Completion banner `✓ RUN COMPLETE — CLAIMS ISSUED` + S1–S5 links | YES | `DoneBanner :1512–1575` | Also a variant for "ARTIFACTS SEALED" with no claim. |
| 03-Y | Rules footer | YES | `:80–81`, `:1861` | The holdout sentence is dropped (DQ-15). |
| 03-Z | Denied / 404 (not in the HiFi; X3 rule) | YES | `:1951–1963` `REFUSAL_COPY.denied` | E1: one F-04 sentence. FG 03-S: the 403/404 text diff is 0. |
| 03-AA | Failed run (not in the HiFi) | YES | `:1491–1503` | The screen's own sentence, with code and message behind `details` (E1/E10; fixes audit 03-10). |
| 03-AB | a11y | PARTIAL | — | Per G7 (`FRONTEND_GAPS_STATUS_…09-30 §7`), axe is red on S03 because of deliberate HiFi colours. Bobby decision. |

**Verdict S03:** The frame, Gantt, cursor, console, ledger, cancel/new-run, banner and refusals match the HiFi. **It is not complete, because the claim passport, the screen's defining block, still lacks the four methodology claims and the queued forecast (03-I/J).** Those rows are marked closed in the ledger with no code behind them. The remaining gaps are mostly source facts behind typed absences, plus four small FE items.

**Remaining gaps S03**

| Gap | Size | Owner |
|---|---|---|
| 03-I/J: four methodology claims (forecast → issued) and a populated queued forecast. Correct the E4/E15 "ĐÓNG" ledger rows. | M | BE-Claude≤P21 (P11; CG-FG-S03-02 is addressed to Codex but P11 ≤ P21) + FE-Claude. An FE-only option exists: issued from the hub/retained claim strip, forecast from the Atlas |
| 03-N: planned/pending folds and fold-plan note | S–M | BE-Claude≤P21 (CG-FG-S03-01), or FE-Claude from `declared_folds` |
| 03-Q/T: 7-row manifest and a richer journal (fold freeze, artifact build) | M | BE-Claude≤P21 (CG-FG-S03-04; audit 03-8) |
| 03-M: `IMPORTED_FIXED_PROFILE` handling in `studyLabel` / `StageLedger` once X is merged | S | FE-Claude |
| 03-C: h1 should use the D1 label | S | FE-Claude |
| 03-E: transport label says "stream closed at terminal frame" while loading/503 | S | FE-Claude |
| 03-O: Gantt blank space with few folds | S | FE-Claude |
| 03-M: trial rate (`rate ~42 trials/s`) | S | BE-Claude≤P21 (no packet yet) |
| 03-V: E10-O1/O3 real receipt | S | Bobby decision (G10 stuck-run permission) |
| 03-AB: axe colours | S | Bobby decision |

---

## S04 Evidence Flow (hub) (`/research/quantbt/runs/:id/evidence`)

HiFi blocks: topbar crumb with stage · identity strip and dataset drawer (manifest, span, gaps, patched, columns, coverage bar) · claim strip (7 claims, certification and cap link, engine note) · 7 tabs with fact subtitles and `→ Promotion SOON` · evidence cursor bar (fold ‹›, trial, params, seq, schedule, window, deep dives, copy link) · window switcher (IS / OOS / Holdout Live / Compare) · metric tiles and holdout-withheld row · EChart 1 equity IS vs stitched OOS with provenance · EChart 2 underwater · per-fold verdict table · EChart 3 rolling Sharpe / beta vs benchmark · EChart 4 return distribution · monthly grid · behaviour tiles · Stage 1–4 tab bodies (split, search, freeze, execute) · Stage 5 (cert chain, window disclosure counts, artifact manifest, next gates) · Atlas.

| # | HiFi block | Status | Where (file:line · line) | Note |
|---|---|---|---|---|
| 04-A | Topbar crumb `… / R-WFO-118 / {stage}` | YES | `useTopbarCrumb :3957`, `:4060` · C; G14 · C (uncommitted) | |
| 04-B | Identity strip (run, status, mode, binding, dataset chip, route, engine, created) | YES | `RunHeader :599–735` | `ShortId` prints the D1 label. |
| 04-C | Dataset drawer: manifest digest, source, span/bars, gaps, patched bars, columns, coverage bar | PARTIAL | `DatasetPanel :810–912`; `SourceGap data-gap="dataset-coverage" :894–912` | Identity, 5 digests, route/config/seed and revision are shown. Coverage bar, gaps, vendor and columns show a source gap. BE: **CG-FG-S04-02** (OPEN). |
| 04-D | Claim strip: validation, chronological, oos_used_for_selection, holdout_state, causality, execution_contract, runtime authority | PARTIAL | WFO retained `RetainedClaimFields :2176–2250` (YES); P04 hub `UNPUBLISHED_CLAIM_FIELDS :353–359`, `:487–510` | **WFO: all 7 populated.** They print the server token via `claimToken` (capitals, YES/NO), not the HiFi's prose ("NO — read once after freeze"). That was decided in E1 ("nothing is reworded"), so it counts as matched-by-decision (fixes audit 04-1). **P04 hub:** 5 claims + runtime authority show "not published". BE: **CG-FG-S04-01** / audit 04-2. |
| 04-E | Certification `B` + "Stage 1 sets the cap ↗" | PARTIAL | `:512–542` | The grade and an "open Stage 5 ↗" link appear when issued. The per-stage cap chain is unpublished. BE: **CG-FG-S04-06**. |
| 04-F | Claim strip while the hub is loading or refused | NO | `:506` (`contract?.availability ?? NOT_PUBLISHED`), `:487–489`, `:538–540` | FG 04-E: says "not published" where it should say "not read". FE, S (P3). |
| 04-G | 660: claims stack in one column (audit 04-15) | NO (not re-verified) | `:428–433`, `:545–549` (`hidden … sm:flex max-w-[230px]`) | Code unchanged; at 660 (≥ sm) the note still takes a side column. FE, S. |
| 04-H | Stage tabs + fact subtitles ("5 folds · holdout sealed", "600 trials / fold", "cert B") | PARTIAL | `StageTabs :943`, `tabSub :920–941` | Tabs, keyboard support and `→ Promotion SOON` (`:1020–1030`) are present. Subtitles are generic (`DONE · fold 1`, `n of m metrics · k series`). Audit 04-4 is unchanged. FE, S. |
| 04-I | Evidence cursor bar: fold ‹›, trial, params, seq, schedule, window, copy link, reset | YES | `CursorBar :1063–1296` | FG 04-C: MATCH (hash survives reload and back). |
| 04-J | Deep dives: S2 search · S3 freeze · S4 replay · promotion · journey map | YES | `:1252–1272` | E1 fixed audit 04-5 (links to 08 and 11 are live). The comment at `:127` ("Screen 08 … not built") is stale. |
| 04-K | Window switcher IS / OOS / Holdout Live / Compare + holdout-withheld tiles | PARTIAL | `WindowSwitcher :2701–2732` | Only OOS is live; the other three are disabled with a reason ("the Evidence Hub publishes the OOS window only"). The holdout 0/5 tile row is not drawn. BE: hub windows (no packet). |
| 04-L | Headline tiles | DEVIATION-approved (**H2**: 15 tiles instead of 5) | `retainedTiles :2925–2998`, `PerformanceTile :1466` | Values: on WFO, TRADE COUNT, Sortino, CAGR, PF and both hit rates are a typed `UI_RETAINED_LANE_HAS_NO_FIELD` → PARTIAL, BE (audit 04-6, W7 lane). **X adds** the engine total trade count as a footnote line (`X EvidenceFlow.tsx:3460`, `data-summary-trade-count`, scoped, "not an audited fill count"). The TRADE COUNT tile itself is unchanged. |
| 04-M | EChart 1 "Equity — IS vs stitched OOS" (2 series + legend) | PARTIAL (C) / YES on FIXED (X) | C: `RetainedEquityPanels :2541–2640` (typed "No IS equity series" `:2590–2603`); `preOosSplit` in `EvidenceCharts.tsx`. X: `EvidenceCharts.tsx:57` `SERIES_NAME.inSample`, legend, dashed IS series, `InSampleNote X EvidenceFlow.tsx:3140` | Pre-OOS flat stretch split off and labelled (E4, audit 04-8) → YES. **IS series:** only X binds `summary_analytics.in_sample_equity` (≤ 24 extrema points). It is AVAILABLE on FIXED/P04 runs sealed after `0ab62994`, and WFO stays a typed NOT_PUBLISHED because the final account holds no selected-candidate IS. The consumer was accepted on real API cell e17 (`X upgrade/…/P13/E11_E14_SOURCE_TIME_ANALYTICS_ACCEPTANCE_2026-09-27.md`). C lacks both the contract and the consumer. |
| 04-N | Provenance row (source, segment, units, tz, as-of, digest) | YES | `ProvenanceRow :1751–1786` | |
| 04-O | EChart 2 Underwater | YES | `:2618`, `:3312–3313` | |
| 04-P | Per-fold verdict table | PARTIAL | WFO `RetainedVerdictTable :2278` (YES); P04 `VerdictTable :2797` | P04 publishes typed `per_fold_metrics` absence. BE: **CG-FG-S04-04** / audit 04-13. |
| 04-Q | EChart 3 rolling Sharpe + rolling beta vs benchmark | PARTIAL | C `RollingFigure :1845–1924`; X `RollingHalf inline` (`X :1902`, `summary={summary} X :3391`) | C on WFO: "retained lane publishes neither series". **X** binds the sealed `rolling_sharpe_63` (≤ 12 points; AVAILABLE on long WFO runs, typed NOT_APPLICABLE with the daily-return count on short runs). Beta vs benchmark is absent in both lines (benchmark is an engine-side dependency). BE: **CG-FG-S04-05**. |
| 04-R | EChart 4 return distribution | PARTIAL | `:3346` | Drawn when the series is served; otherwise a typed absence. Part of CG-FG-S04-05. |
| 04-S | Monthly returns grid fills its card | NO (not re-verified) | `:3367–3375` inside `flex-[1_1_380px]` next to `BehaviorCard :3125` | Layout unchanged since audit 04-12, so 1 cell sits above blank stretched space. FE, S. |
| 04-T | Behaviour tiles (8) | PARTIAL (C) / 6 of 8 (X) | C `BehaviorCard :3115–3160` (all typed absent); X `SUMMARY_BEHAVIOR X :3134`, `BehaviorCard X :3151+` | X fills win rate, payoff, avg holding, turnover, max consec loss and exposure, with ENGINE_DIRECT/SOURCE_DERIVED origin and scope. Beta and corr vs benchmark stay typed absent. X's labels differ from the HiFi set (skew and kurtosis are gone; payoff and max-consec-loss are added). No decision id → DEVIATION-unapproved (minor). |
| 04-U | Stage 1–4 tab bodies (split timeline and fold table, search config/funnel/decision/progression/trial ledger, freeze timestamps/digest chain/what-if, execute candle replay) | DEVIATION (recorded in P13 composition, no Bobby D-id) | `StagePreviewTab :3419–3512`, `STAGE_PREVIEW :141` | Each tab shows the HiFi heading and panel titles, the stage timeline and `open deep dive → 05/06/07/08`. The body lives on S05–S08, which are separate HiFi screens and are built. FG 04-ST calls this CURRENT_SOURCE_ABSENT. Recorded in `P13/frontend-composition-claude.md:99`, not approved by Bobby. |
| 04-V | Stage 5: cert chain (min of caps) | PARTIAL | `ClaimTab :3539`, `SourceGap id="cert-chain" :3613–3616` | BE: **CG-FG-S04-06**. |
| 04-W | Stage 5: window disclosure with n/5 counts | PARTIAL | `:3618–3623` | Fixed sentence with no counts. BE: **CG-FG-S04-07**. |
| 04-X | Stage 5: artifact manifest (whole run) | DEVIATION (contract-recorded) | `SourceGap id="artifact-manifest" :3626–3630` | The Evidence contract never opens artifacts (FG 04-AM: CURRENT_SOURCE_ABSENT). |
| 04-Y | Next gates: report → RC, Send to Approval (SOON), Register for Paper (SOON) | YES | `:3650–3683` `SoonHook` | FG 04-SA: MATCH. |
| 04-Z | Atlas tab (modes × claims matrix) | PARTIAL | `AtlasTab :3688–3727` | Shows a SourceGap and a link to S12, although `research-foundation` already publishes modes × claims (S02 reads it). FG 04-AT: FE gap. FE, S. |
| 04-AA | a11y data table of the charts rounded (DQ-08 / E1) | NO | `EvidenceCharts.tsx ExactTable :150–185`, rows `:556–623` · C; also X `:577` (IS table) | The screen-reader table still prints ISO-ms times and full-precision equity, drawdown and Sharpe strings. The E1 row lists "bảng dữ liệu a11y của chart làm tròn" (round the charts' a11y data table), but S04 was not changed (audit 04-16). FE, S. |
| 04-AB | Denied / 404 | YES (copy) + NO (landmark) | `RunNotFound :3728–3757` `REFUSAL_COPY.denied` | The E1 one-sentence rule is met, and the 403/404 diff is 0 (audit 04-14 fixed). **FG 04-NF:** a nested `<main>` inside the shell's `<main id="portal-content">` (`:3730`). FE, S (P3). |
| 04-AC | Series refusal prose | Bobby decision (**VD-FG-01-01** OPEN) | `ResearchPanel.tsx:242–253` `({detail})`; `EvidenceFlow.tsx:2097–2099` | `error.message` and request_id are printed inline (FG 04-SR, P1 weight). |
| 04-AD | P04 series density (25 of 744 points) | PARTIAL | — | BE (audit 04-9, hub series cap 192). Not re-verified. |
| 04-AE | Currency without `$`, no zoom slider, passport as a card with inline dataset panel, EChart 3 split plus an EChart 5 | DEVIATION-approved (H6, P13 zoom → S08, H4, H3) | — | |

**Verdict S04:** The frame, claim strip on WFO, cursor, deep dives, equity with pre-OOS handling, underwater, WFO verdict table and refusals match the HiFi. **The screen is complete as a hub but not as the HiFi:** the stage bodies are delegated to S05–S08 without a Bobby decision, and most remaining cells are backend absences shown as typed absences. The Codex line fills a large part of 04-M/Q/T (IS equity on FIXED, rolling Sharpe, 6 behaviour tiles, total trades) that the Claude line does not have yet, so the consolidated line is ahead of either branch alone.

**Remaining gaps S04**

| Gap | Size | Owner |
|---|---|---|
| Merge X `0ab62994` + `decb5f6c` (retained-analytics contract, producer, `summary_analytics` consumer) into the consolidated line; resolve the behaviour-label set against the HiFi | M | FE-Claude + BE-Codex (merge), Bobby for the label set |
| 04-D/E/V/W: P04 hub methodology claims, per-stage cert caps, window disclosure counts | M | BE-Claude≤P21 (P13; CG-FG-S04-01/06/07 are addressed to Codex but P13 ≤ P21) |
| 04-C: dataset coverage, gaps, vendor, columns | M | BE-Claude≤P21 (CG-FG-S04-02) |
| 04-L/P/Q/T: WFO aggregate tiles (Sortino, CAGR, PF, hit rates, trade-count tile), P04 per-fold facts, benchmark beta/corr, WFO IS | M–L | BE-Claude≤P21 (CG-FG-S04-04/05, W7 lane); benchmark and WFO-IS are engine-side (BE-Codex / engine) |
| 04-K: IS / Holdout / Compare windows on the hub | M | BE-Claude≤P21 (no packet) |
| 04-U: stage bodies as previews + deep dive vs the HiFi's full bodies | — | Bobby decision (ratify the P13 composition or ask for bodies) |
| 04-AC: server prose in RefusalNote | S | Bobby decision (VD-FG-01-01) |
| 04-H tab fact subtitles · 04-F "not read" on loading · 04-G 660 stacking · 04-S monthly grid · 04-Z Atlas from foundation · 04-AA a11y table rounding · 04-AB nested `<main>` | S each (M total) | FE-Claude |
| 04-AD: P04 hub series density | S | BE-Claude≤P21 |

---

### Cross-cutting notes
- **Ledger vs code:** E4 (the S03 part) and E15 are marked "ĐÓNG" (closed) in `UNIFIED_IMPLEMENTATION_PLAN.md` §13.4.1, but no S03 source file changed in `c81e8dc2`. The same is true of the original worktree `agent-aa8f9930603238f14`. E1 lists the S04 a11y table rounding as done, and the code shows it is not. These rows should be reopened or corrected.
- **FG packets:** all `CG-FG-S03-01…04` and `CG-FG-S04-01…07` are **OPEN** (`FG-backend-requests.md` header: "State mọi packet: OPEN"). The FG matrix was taken at `8783461e` on a fixture lane, so its "not published" readings for declared folds and study total are fixture artefacts where C already binds `declared_folds`.
- **G3** leaves S03/S04 unchanged. **G14** (C, not committed) is the only current change that reaches these screens, and only through the shell crumb.
