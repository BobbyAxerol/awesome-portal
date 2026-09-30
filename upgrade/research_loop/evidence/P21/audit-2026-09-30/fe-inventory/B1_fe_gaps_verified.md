# Research Loop V1.1 — every open FRONTEND gap, one list (Claude, 2026-09-30)

Tree: `/home/bobby/portal-research-fe` · `claude/fe-parity` = `docs/research-loop-plan` @ `6ac69315` (contains `925d4f22` consolidation, `784bb19d`, `f7c76bae`).
Read-only pass. Paths: `R/` = `apps/portal/frontend/src/research/`, `APP/` = `apps/portal/frontend/src/app/`, `QB/` = `apps/portal/frontend/src/features/quantbt/`, `E2E/` = `apps/portal/frontend/e2e/`. HiFi = `upgrade/research_loop/release-v1.1/QuantBT NN *.dc.html` (`H04:269` = file 04, line 269).

Backend work is **not** here (it is in `CODEX_BACKEND_GAPS_2026-09-30.md`). A row that waits on Codex lists only the FE half and names the Codex item (`B1#n` = CODEX_BACKEND_GAPS §2 row n, `B3#n` = §4 row n, `AN-nn` = BR-AN-01 / A5).

**Status column:** `OPEN ✓` = re-read in current code today, still wrong (locator is today's line). `OPEN =` = file not touched by `925d4f22`/`784bb19d`/`f7c76bae` since the 09-30 audit that found it, so the audit locator holds (spot-checked where noted). `OPEN ?` = needs a browser to confirm.

**Classes:** HONESTY (screen says something false / FE-invented fact / null→0 / raw value) · HIFI (parity vs HiFi) · BIND (FE↔BE — field served-but-unread, or bind once Codex publishes) · A11Y · LANE (lane/test/tooling debt) · DECISION (needs Bobby; FE executes after).

**Done =** unless stated: vitest on the touched file(s) green + `tsc -b --noEmit` + screenshot 1440/660 on preview `:8095` (R-WFO-017 `rrun_17f76212…`, R-P04-018 `rrun_464bf9c3dd89…`) placed next to the HiFi block, and read as text (memory: suites pass while raw numbers leak).

---

## 0. Dropped — fixed today, verified in code

| Old id | What | Fixed by | Evidence today |
|---|---|---|---|
| V1 | `/research/quantbt` redirected to Run Library; S00 unreachable | `f7c76bae` | `QB/QuantBTModule.tsx` index renders Journey Map |
| V2 / 04-U / 04-X / 04-Z | Hub tabs S1–S4, S5 Claim, Atlas printed "not published — Screen 0X reads it" | `f7c76bae` | `R/hubStage{Split,Search,Freeze,Execute,Atlas}.tsx`; `ClaimTab` draws cert/window/manifest tables |
| 03-C / D5 walk | S03 h1 `Run completed — rrun_…` | `f7c76bae` | `R/RunProgress.tsx:2011` uses `useRunLabel` |
| D1 walk | RC topbar wrapped to 2 rows at 1440 | `784bb19d` | `APP/TopBar.tsx` + `shell.css` ellipsis |
| X3 / OL-24 cause | e2e loaded deleted journey-v2 (ENOENT) | `ac0b3101` | `grep journey-v2 E2E` = 0 hits |
| G1 (D7), G2 (D4 outer bounds), G8 (6.4 fold strip), G3 S05–S08 cold label, G7 (S07 heading, S05 region), G10 S10 depth-first tree, G14 topbar A | merged | `925d4f22` | files in commit stat; `APP/researchRunCrumb.ts:58` |
| G4 / F12(1) | S13 arrow dangling at row end | FG-04a kept (G4 dropped by consolidation plan) | `R/CompareDetail.tsx:1063-1076` |
| FE-A1-01/03/04, 02-D, 02-PR | S02 server prose in refusals | FG-08 `a1d7bf3f` + 403/404 fix in `925d4f22` | `R/preflightClient.ts` |
| 01-8, 02-6, S11 P22 consumer | rc chip, last published rc, publish + R1 mirror existed only on Codex line | on branch (base `c2ec1443`) | `R/RunLibrary.tsx:977-1070`, `R/NewRun.tsx:383-426` |
| S08 reveal leak, 7.9 engine_pin (E16-R2), S14 short receipt id, S14 token, S09 G5 print D1–D4 | merged | `c2ec1443` / `fcb9bc2a` / `27747ab7` | — |
| CG-FG-D1-O1 (S09/S11/S13 labels) | done BE+FE | `08fa8ee0`/`8ad39e83` | `R/reportClient.ts:164` |

---

## 1. HONESTY bugs (fix first)

| id | screen | title | class | HiFi locator | code locator | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|---|
| A2b-PF (CG-P08-06 FE) | S02 | Preflight window table prints `0` for null `bars`/`missing_bars`/`gap_runs`; `expected_bars` not shown | HONESTY | H02:410-415 window timeline + bar counts | `R/PreflightPanel.tsx:399-401` (`?? 0`) | null → typed absence "not published"; unit with `bars` undefined asserts no `0` | S | none | OPEN ✓ |
| FG 05-15 (CG-FG-S05-01 A) | S05 | `train ∩ test = ∅, every fold` drawn ✓ whenever a fold plan exists — FE-asserted verdict | HONESTY | H05:187 "boundary integrity — read from fold_plan", rows H05:369,374 | `R/SplitDetail.tsx:1890-1891` | now: `mark="none"` + typed absence (no field); later bind `SplitGuards.train_test_disjoint{verdict,basis}` | S | FE now none; bind after B1#9 | OPEN ✓ |
| FG 05-17 | S05 | Gap scan `?? 0` on null measured/boundary counts | HONESTY | H05 boundary integrity block | `R/SplitDetail.tsx:1177,1179` | null counts → absence text; unit | S | none | OPEN ✓ |
| CG-FG-S10-01 A | S10 | PROMOTION PICK prints the approval `source_digest` in the `prm_` param-set slot | HONESTY | H10:94-95 `att_03 · R-WFO-118 · prm_7c1a9e` | `R/LineageDetail.tsx:1086` | slot = typed absence now; bind `selected_trial_id` + params digest when published | S | FE now none; bind after B1#10 | OPEN ✓ |
| CG-FG-S10-02 A / D3 walk | S10 | Node status derived in FE — FAILED attempts chip ACTIVE (19 on real data) | HONESTY | H10:100 `statusFilter` ACTIVE/DRAFT/SUPERSEDED/ABANDONED, H10:318 | `R/LineageDetail.tsx:200-210` `lineageStatus`, used `:2149` | interim: chip shows attempt state (FAILED) or "version ACTIVE" wording that cannot read as run state; bind `lineage_status` when served | S | vocab = Bobby; field = Codex B-queue "Bobby quyết" list | OPEN ✓ |
| CG-FG-S14-02 A | S14 | FE writes its own "Activation needs a workspace ADMIN" reason | HONESTY | H14 register/activate step | `R/AlphaImport.tsx:753` | print server `may_activate_reason`; until then neutral "not permitted" without a guessed cause | S | B1#11 | OPEN ✓ |
| CG-FG-S14-03 A / 14-12 | S14 | Copy "Not admitted yet (OL-01)" stale (imported admission branch exists) | HONESTY | H14 "new run with this av_ →" | `R/AlphaImport.tsx:113-121`, `:890`, `:1273-1280` | copy says admission is decided per version by the server; bind `run_admission{may_create_run,code}` | S | B1#12; link VD-FG-01-32 | OPEN ✓ |
| 14-09 (E6-BR-01) | S14 | "signed publication" hard-codes `REGISTRATION_ABSENT.signature` while server serves `import_attestation` with `RESEARCH_ALPHA_IMPORT_{SIGNATURE,SBOM}_NOT_PRODUCED` | HONESTY / BIND | H14 registry "signed publication" row | `R/AlphaImport.tsx:125-133`, `:1406-1410` | row renders served codes; fixture test | S | none (served) | OPEN ✓ |
| 11-26 | S11 | FE synthesises `P22_${state}` codes that are not in the contract enum | HONESTY | H11 publish card | `R/ReleaseCandidateDetail.tsx:1977,2147,2157` | show state word + served `blocked_reason` only; unit asserts no `P22_` code outside enum | S | none | OPEN ✓ |
| CG-P04-05 FE / S02-01 | S02 | "cert ceiling not published" hard-coded; ignores served `cert_cap.reason` | HONESTY | H02:422-433 claim forecast (cert ceiling C + note) | `R/NewRun.tsx:1739` | print `cert_cap` reason code/sentence | S | none | OPEN ✓ |
| FG 02-8b | S02 | Unvisited invalid steps show green ✓ `valid` | HONESTY | H02:45-48 stepper captions `valid / needs attention / preflight pending` | `R/NewRun.tsx:239` | neutral "not visited" state; unit | S | none | OPEN ✓ |
| D6 walk | S02 | Review shows timeframe 4h (draft) while the Data select renders 1h (only option); error appears with no visible cause | HONESTY | H02:210-236 timeframe chips | `R/NewRun.tsx:834-857` (`value={draft.timeframe}` not in `timeframeOptions`) | draft snaps to a declared tf (or select shows the undeclared value marked invalid); Review = select | S | none | OPEN ✓ |
| FG 01-13 | S01 | Legacy/unbound row + alpha-scoped `?to=` links to `/evidence`, which a legacy run lacks | HONESTY | H01:71-80 card head "open evidence" | `R/RunLibrary.tsx:1160-1166` runs before legacy branch `:1168` | legacy branch first or "cannot open here" title; unit | S | none | OPEN ✓ |
| FG 03-T | S03 | Transport says "stream closed at terminal frame" while loading and after 503/409/400 | HONESTY | H03 SSE label | `R/RunProgress.tsx:246` (`!live → SSE_CLOSED`) | distinct label for not-yet-live / refused; unit per state | S | none | OPEN ✓ |
| FG 04-F | S04 | Claim strip says "not published" while hub is loading/refused (should be "not read"); many `reason_code:null` absences | HONESTY | H04 claim strip | `R/EvidenceFlow.tsx:513`, `:398`, `:804`, `:915` (+ ~12 more `reason_code: null`) | loading/refused → "not read"; every absence carries a code or states why none | S | none | OPEN ✓ |
| 2_wiring S04 | S04 | "Net return" tile shows account return; E14 `summary_analytics.net_oos_return` read nowhere | HONESTY / BIND | H04:1336 tiles "Total Return" | `R/EvidenceFlow.tsx` TILE_ORDER `:1404`, tile `:2968` | bind `net_oos_return` or label tile "account return" | S | none (served) | OPEN ✓ (`grep net_oos_return R/` = 0) |
| D8 walk | S09 | Equity legend "IS account" + "IS emitted 300 of 720" while Source absences say "in sample account — not published" | HONESTY | H09 equity figure | `R/ReportDetail.tsx:663-735` | decide which fact is right (report `equity_is` = account before OOS vs selected-candidate IS); relabel legend like S04 `preOosSplit` so both statements agree | S | none (confirm semantics with served DTO) | OPEN ✓ |
| CG-FG-S12-01 A | S12 | FE ignores `historical_identity`/`facts_state`/`facts_reason`; `atlas:null` renders an empty body; historical note hard-coded | HONESTY / BIND | H12 historical release view | `R/foundationRoutes.tsx:227`, `R/hubStageAtlas.tsx`, `R/EngineAtlas.tsx:1401-1407`; e2e `E2E/research-foundation/atlas-historical.json` breaks the union | bind union + canonical fixture `research-foundation.historical-identity.valid.json`; fix e2e fixture | S–M | none (served since `5069b39a`) | OPEN ✓ (0 hits) |
| FG 08-05 | S08 | P04 "state at cursor" prints raw floats `equity ${at.equity}`, `drawdown ${at.drawdown_fraction}` | HONESTY | H08 readout `t · bar · seq · position · equity` | `R/ExecuteDetail.tsx:911`, `:1671-1672` | `formatMetric` currency/fraction, exact in `title` | S | none | OPEN ✓ |
| D7 walk | S07 | What-if prints `J₁ -1.4435308120735202 · base -1.44…`; slider thumb mid-track while ends read 1/1.6 | HONESTY | H07 what-if sandbox | `R/WhatIfCard.tsx:288` (raw `cell.objective`); slider track geometry same file | format with shared decimal helper; track range = labelled range | S | none | OPEN ✓ |
| D11 walk | S08 | Fold capital headline prints raw enum `carry_position`; price axis `66000.00` ungrouped vs `58,744.40` elsewhere | HONESTY | H08 tiles, price pane | `R/ExecuteCandleReplay.tsx:1318` (`fold_capital.policy`); no `localization.priceFormatter` in chart setup `:210-220` | words(); grouped price formatter | S | none | OPEN ✓ |
| FG 08-06 / 08-07 | S08 | Per-fold return computed in FE (`end/start−1`) and window fee summed in FE; fee rate raw | HONESTY (rule 3.5) | H08 fold chain, cost timeline | `R/ExecuteCandleReplay.tsx:~392-420`, `:1316` | only served numbers, or label "derived in browser" removed; typed absence otherwise | S | none | OPEN = |
| 14-21/22 + S14-C1 | S14 | Parse 403/404 banners print raw `RESEARCH_*` code → 403 ≠ 404 visibly; origin 403 reads "The import request is not valid" | HONESTY | H14 refusal states | `R/AlphaImport.tsx:911-913`; `R/alphaImportClient.ts:248` | one F-04 sentence for 403/404, code in `details`; origin copy per S14-C1 | S | S14-C1 copy = Bobby | OPEN ✓ |
| X7 / WS-LEAK-01 FE | S03 | Progress `console`/`events` reads send no `workspace_id`; `RunProgressRoute` passes none → wrong/empty on non-default workspace | HONESTY (wrong data) | — | `R/progressClient.ts:~160,~189` (only read/requestedSpec/cancel take it), `R/RunProgressRoute.tsx` | pass workspace like `read`; unit on URL | S | none (BE half `download_href` = B1#7) | OPEN ✓ |
| 03-M union | S03 | `IMPORTED_FIXED_PROFILE` scope not handled → imported fixed run prints a per-fold "study" line | HONESTY | H03 study N/M | `R/RunProgress.tsx:444`, `R/StageLedger.tsx:112` | treat `IMPORTED_*` like `FIXED_PROFILE`; unit | S | none | OPEN ✓ |
| X5 | S05 | Imported runs fall through to weaker "was observed" (literal `P04_OBSERVED_AFTER_FIXED_PROFILE` only) | HONESTY | H05 holdout/OOS sentence | `R/SplitDetail.tsx:2034` | handle `IMPORTED_*` union members | S | none | OPEN ✓ |
| S13 equal-claim | S13 | "claim ↑ →" between cards of equal claim rank (all 15 real cards one family); gold `ATTEMPTS_RULE` "strengthens at every step" false | HONESTY | H13:77 ladder, H13:329 `arrow: i<3 ? "claim ↑ →"`; H13:73 rule | `R/CompareDetail.tsx:1063-1076`, `:159-160`, `:987` | equal rank → "same claim →" (or none); rule sentence conditional | S | wording = Bobby (VD-FG-04-01 family) | OPEN ✓ |
| 2_wiring S04 codes | S04 | FE-invented reason codes with no packet: `P13_PUBLISHES_NO_TRIAL_CURSOR/PARAMS_DIGEST/EVENT_SEQ`, `SERIES_*_NOT_PUBLISHED`, `UI_RETAINED_LANE_HAS_NO_*` | HONESTY | — | `R/EvidenceFlow.tsx:~1209-1235`, `~1755`, `~2902` | each maps to a served code or a documented FE-absence id | S | `UI_RETAINED_*` retire with AN-01…05 | OPEN = |
| D-AN-01 copy | S04 | Panel "behavior — engine-published, UI renders" / "segment OOS" contradicts D-AN-01 (portal-derived, all time) | HONESTY | H04:303 (old copy, superseded by D-AN-01 §3) | `R/EvidenceFlow.tsx:3173-3175` | copy per D-AN-01 when v2 bound | S | AN-28 | OPEN ✓ |
| CG-P10-04 FE | S03 | Trial rate and study absence print literal sentences, not a reason code | HONESTY | H03 "rate ~42 trials/s" | `R/RunProgress.tsx:~450`, `:~561` | typed absence w/ code; bind `rate_trials_per_s` | S | B3#17 | OPEN = |
| 2_wiring S01 | S01 | `rc === null` → chip silently omitted; `rc_availability` reason never shown | HONESTY / BIND | H01:71-80 rc chip | `R/RunLibrary.tsx:~1381` | typed absence with served reason | S | none (served) | OPEN ✓ (0 hits `rc_availability`) |
| CG-P02-02/P08-02 FE | S02 | S02 offers rolling / purge / embargo / inner folds (preflight accepts) but create refuses every v2 spec (`RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE`) | HONESTY | H02:243-285 walk-forward | `R/NewRun.tsx:1165-1282` | until Codex decides: notice on those controls "create does not admit v2 yet" (or disable from an Atlas fact) | S | Codex B4 CG-P02-02 | OPEN ✓ |
| D2 walk | S09 | Printed "evidence link" label is a short-id URL that 404s if typed (href is correct) | HONESTY (print) | H09 provenance | `R/ReportDetail.tsx:1120-1122` | print full URL (wrap) or label as "link (full address on screen)" | S | none | OPEN ✓ |

---

## 2. Per screen

### S00 Journey Map (H00)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| 00-1a…d | Kicker, HiFi title (Newsreader 27/400), subtitle, 2-swatch legend on the right | HIFI | H00:30-37 | `R/JourneyMap.tsx:338-360`, legend `:84-108` | text = HiFi (DQ-02), swatches right | S | none | OPEN ✓ (`:343` still "QuantBT Backtest — journey map") |
| 00-2 | Phase label is serif (base `h2` Newsreader) — HiFi Inter 13/600 | HIFI | H00:42-45 | `R/JourneyMap.tsx:214-224`; `styles/base.css:14` | Inter override on phase h2 | S | none | OPEN = |
| 00-8…10 | Mapping block: caps header copy, both columns as links (descriptor target keys), footnote | HIFI | H00:62-72 | `R/JourneyMap.tsx:384-393` | links via `resolveJourneyCardRoute`/`pickRunHref`; footnote | S | none | OPEN ✓ |
| 00-6 | Paper card title "— SOON" next to BLOCKED badge | DECISION | H00:121 | descriptor copy | Bobby: descriptor copy vs keep | S | Bobby / descriptor | OPEN = |
| 2_wiring S00 | `JourneyCard.requires_run` served, FE recomputes from route table | BIND | — | `R/JourneyMap.tsx:150` → `screenRoutes.ts needsRunToOpen` | read served flag | S | none | OPEN = |
| CG-S00-AV-01 FE | `alpha_version_legacy` card forces a run pick; lane S00 2 cells red | BIND | H00 card "13 · Alpha version" | `R/screenRoutes.ts:89,103-107` | bind `requires_alpha` (or route) when served; lane 2 cells green | S | B1#3 | OPEN = |

### S01 Run Library (H01)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| 01-14 | Picker notice/link prints raw `alpha_version_legacy` | HIFI | H01 picker | `R/RunLibrary.tsx:1122-1134` (key missing), `:1153`, `:2039` | add "Alpha version" | S | none | OPEN ✓ |
| 01-1 | Header "attempt lineage" is a hint, not a link | HIFI | H01:39 | `R/RunLibrary.tsx:~1821-1826` | link when one alpha catalogued | S | none | OPEN = |
| 01-6 | Claim note wraps under the trail on failed cards | HIFI | H01:105 | `R/RunLibrary.tsx:~1269-1274` | stays right column | S | none | OPEN = |
| 01-10 | `?status=running` silently dropped (case) | HIFI | — | `R/useRunLibrary.ts:72,94` | normalise case; unit | S | none | OPEN = |
| 01-2 | Running stats `%`/`s` vs HiFi `fold 3/5` · `42m` | HIFI / BIND | H01:100-101 | `R/RunLibrary.tsx` `statDisplay` `~670-683` | humanised duration (FE); fold position when server stat exists | S | P12 stat value (Codex) | OPEN = |
| 2_wiring S01 rel | `relationship{kind,parent_run_id,…}` unread — REPRODUCTION_OF / AUDIT_OF_SELECTION children unmarked | BIND | H01:109-110 superseded line | `R/RunLibrary.tsx` card head | parent marker from served field | S | none | OPEN ✓ (0 hits) |
| AN-19 FE | Card sparkline + stat trio must be **last-30D**, labelled "last 30D" (D-AN-01 §1.3) | BIND | D-AN-01 §3 (supersedes H01:92,100) | `R/RunLibrary.tsx` `SPARK_LABEL ~:434`, stats `:560-800` | read `last_30d`; label; typed absence for old seals | S | AN-19 | OPEN ✓ |

### S02 New Run (H02)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| D4 walk | Clone/fork banners print `rrun_464bf9c3` not `R-P04-018` | HIFI | H02 context | `R/NewRun.tsx:2014`, `:2044` (`shortId`) | `useRunLabel` like S03 | S | none | OPEN ✓ |
| 02-2 | Frame/typography: `px-4` frame, release line right of title, subtitle 13px, panel titles serif | HIFI | H02:34-39, panel titles Inter 12/600 caps | `R/NewRun.tsx:~1729-1772`, Card h3 `:182` | match 01/03/04 frame; Inter titles | S | none | OPEN = |
| 02-4 | Six "not reported" before any choice; single ACTIVE entry not preselected | HIFI | H02:60-95 | `R/NewRun.tsx:~317-343`, `~1855-1865` | blank until chosen; preselect single ACTIVE | S | none | OPEN = |
| 02-5/5b | Context: supersedes (typed absence), links lineage / runs of this av_ / import new version, `avStateNote` | HIFI | H02:85-90 | `R/NewRun.tsx:264-363` | rendered | S | none | OPEN = |
| 02-6 time | "last published rc" time printed `toISOString()` (ms) | HONESTY-lite | H02:793-798 | `R/NewRun.tsx:424` | shared UTC formatter (E1) | S | none | OPEN ✓ |
| 02-7 | Stepper wraps (2 rows @1440, 3 @660); captions static | HIFI | H02:45-48, captions `:622-626` | `R/NewRun.tsx:192-260`; `R/runDraft.ts:172-183` | one row; live caption valid / needs attention / preflight pending | S | none | OPEN = |
| 02-10a / 8_sweep #3 | Window timeline is text; HiFi proportional IS/OOS/Holdout bars | HIFI | H02:410-415 | `R/NewRun.tsx:~1481-1502` / `~1696-1727` | reuse `SplitBand`/Freeze data-time band from draft dates | S | none | OPEN = |
| 02-10b | Bar counts per window | BIND | H02:410-415 | same | bind per-window counts | S | B3#13 (BR-D4-1 = CG-FG-S02-02) | OPEN = |
| 02-9 | Claim forecast: gold card, payload sha256, source row, augmentation note | HIFI | H02:422-433 | `R/NewRun.tsx:~1503-1524` ReviewRail | styled; sha from preflight digest when present | S | none | OPEN = |
| 02-11 | Route panel: double heading, title copy, atlas link in card; "Data" → "Market data" | HIFI | H02:104-180, H02:210 | `R/NewRun.tsx:~438-516`, `:1877`; `R/runDraft.ts:183` | one heading "Execution route — how orders come to exist" | S | badge VD-FG-01-05 | OPEN ✓ (`runDraft.ts:183` "Data") |
| 02-15 | Trials/early stop/seed editable when profile forbids overrides | HIFI | H02:321-371 "pinned by protocol" | `R/NewRun.tsx:~1357-1390` | readOnly + profile reason | S | none | OPEN = |
| 02-16 | Review summary table in rail, not main | HIFI | H02:379-402 | `R/NewRun.tsx:~1906-2060`, `~1525-1584` | table in main panel | M | none | OPEN = |
| 02-17 / 02-k | "RULES OF THIS SCREEN" footer; half-open note | HIFI | H02:439-440; H02:253 | — (0 hits) | rendered | S | none | OPEN ✓ |
| 02-18 | `?step=` read but never written | HIFI | — | `R/NewRun.tsx:~1918-1926`; `R/NewRunRoute.tsx:376` | replaceState on pill change | S | none | OPEN ✓ |
| 02-l | Fold-plan preview "≈ N outer folds" before preflight omitted, no D-id | DECISION | H02:266-273 | `R/NewRun.tsx:~993-997` | Bobby: estimate labelled "server decides" vs record deviation | S | Bobby | OPEN = |
| D4 interior | Prefill fills only 4 outer bounds; interior/warmup need served facts | BIND | H02:243-285 | `R/runDraft.ts` prefill | bind bar edges + `submission_constraints` | S | B3#13, B3#14 (BR-D4-1/3); BR-D4-2 = Bobby | OPEN = |
| DR-05 / 2_wiring S02 | No reproduce entry; `reproduction.environment_equivalence` never shown; FE always sends `intent_kind:"NEW"` | BIND | (HiFi only mentions in S08) | `R/useNewRun.ts:103-105,156` | optional entry point | S | none | OPEN = (optional) |
| 2_wiring S02 drift | Atlas `min_folds_maximum`/`train_window_pattern` hard-coded | BIND | — | `R/runDraft.ts:312,348` | read Atlas | S | none | OPEN = |

### S03 Run Progress (H03)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| 03-I/J | Four methodology claims (validation, chronological, oos_used_for_selection, holdout_state) + queued forecast missing; ledger marks E4/E15 "ĐÓNG" wrongly | BIND (+ docs) | H03 claim passport, 5 chips | `R/RunProgress.tsx` ClaimPassport `~1351-1471`, `~1967-1994`, `~2103-2106` | bind `claims[]{kind,FORECAST|ISSUED}`; FE-only interim option: forecast from Atlas mode×schedule, issued from retained ClaimStrip; correct §13.4.1 E4/E15 rows | M | B3#5 (CG-FG-S03-02) | OPEN = |
| 03-N | No PENDING rows for unreached folds; no `fold_plan.json · outer N` | BIND | H03 fold Gantt | `R/RunProgress.tsx` FoldGantt `~722-902` | draw `declared − reported` PENDING from `declared_folds` now; list when served | S–M | B3#4 (optional) | OPEN = |
| 03-O | Gantt blank space above cursor row with 1–2 folds | HIFI | H03 Gantt | `R/RunProgress.tsx:~2128`, CursorRow `~927` | fills panel | S | none | OPEN = |
| 2_wiring S03 | `best_objective` (live best-so-far) unread; cancel `status`/`source_marker` (`PENDING_RECONCILIATION`) stored never shown | BIND | H03 study / cancel | `R/useRunProgress.ts:217,660` | render both | S | none | OPEN ✓ (0 hits in RunProgress) |
| 03-Q/T | 7-row manifest / richer journal | BIND | H03 artifact manifest | `R/RunProgress.tsx` ArtifactsTable | FE renders whatever is served (nothing to do until BE) | — | CG-FG-S03-04 (may close) | OPEN = |

### S04 Evidence Flow hub (H04) — incl. D-AN-01 §3 and hub-tab follow-ups

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| AN-16/17 FE | Replace EChart 3 "rolling Sharpe · rolling beta" with **"Strategy vs benchmark — all time"** (rebased 100 + Beta/Corr/Sharpe/Sortino cells); stop requesting `ROLLING_SHARPE_63`/`ROLLING_BETA_63` on v2 | BIND | H04:269 (superseded by D-AN-01 §3) | `R/EvidenceFlow.tsx:1862-1920`, `:3100`; `R/evidenceClient.ts:111-116` | v2 hub draws new figure; v1 seal still renders | M | AN-10, AN-11, AN-28 | OPEN ✓ |
| AN-18 FE | Drop EChart 5 rolling 20-observation return | HIFI (decision) | D-AN-01 §2 | `R/EvidenceFlow.tsx:3089`, `:3108` `RETAINED_PANEL_KINDS` | panel gone; no series call | S | none (FE-only) | OPEN ✓ |
| 04-L / D-AN-01 hero | 15 headline tiles → 5 hero tiles as HiFi; rest into Behavior; WFO hero Sharpe = all-time (now "fold mean") | HIFI / BIND | H04:1336 tiles (5), D-AN-01 §3 | `R/EvidenceFlow.tsx:1404` TILE_ORDER, `:2971-2999` | 5 tiles; fold mean as foot | M | AN-01 | OPEN ✓ |
| AN-02…15 FE | Behavior block: Sortino, CAGR, PF(bar), hit rates, vol, DD duration, skew, kurtosis, exposure L/S/F, episodes (win rate/payoff/hold/consec losses) all-time, `portal-derived` label; WFO tiles now `UI_RETAINED_LANE_HAS_NO_FIELD` | BIND | H04:303-307 behaviour tiles (8), D-AN-01 §2-3 | `R/EvidenceFlow.tsx:3130-3190`, `:3027-3028` | each fact origin/scope shown; absences `PORTAL_ANALYTICS_*` | M | AN-02…AN-15, AN-28 | OPEN ✓ |
| AN-29 FE | Old seals (v1 only): typed absence `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL` | BIND | — | same | unit on v1 seal | S | AN-28; backfill = Bobby | OPEN ✓ |
| 04-H | Tab subtitles generic (`DONE · fold 1`, `n of m metrics`) vs facts ("5 folds · holdout sealed", "600 trials / fold") | HIFI | H04 tab strip | `R/EvidenceFlow.tsx:927-950` `tabSub` | fact subtitles from served facts | S | none | OPEN ✓ |
| 04-G | 660: claim note keeps a side column (`sm:flex max-w-[230px]`) | HIFI | H04 claim strip @660 | `R/EvidenceFlow.tsx:~428-433`, `~545-549` | stacks in one column | S | none | OPEN = |
| 04-K | Window switcher: only OOS live; holdout-withheld tile row not drawn | BIND | H04:1338 IS/OOS/Holdout Live/Compare | `R/EvidenceFlow.tsx:2726-2732` | render when hub publishes windows | M | no Codex packet yet (needs one) | OPEN ✓ |
| 04-S | Monthly grid sits above blank stretched space | HIFI | H04:287 monthly returns | `R/EvidenceFlow.tsx:~3367-3402` (`flex-[1_1_380px]`) | grid fills card | S | none | OPEN ✓ |
| 04-AA | a11y data tables print ISO-ms + full-precision floats (E1 said done) | A11Y / HONESTY | — | `R/EvidenceCharts.tsx:152` ExactTable, rows `:573,579,620,639` | rounded display + exact kept in a separate column or `title`; correct E1 ledger row | S | none | OPEN ✓ |
| 04-AB | Nested `<main>` inside shell `<main id="portal-content">` on denied/404 | A11Y | — | `R/EvidenceFlow.tsx:4050` | `<div>`/`<section>` | S | none | OPEN ✓ |
| 04-C | Dataset drawer coverage bar/gaps/vendor/columns | BIND | H04:94 dataset drawer | `R/EvidenceFlow.tsx:~810-912` | bind `dataset_coverage` | S | B3#1 (CG-FG-S04-02) | OPEN = |
| 04-D | P04 hub: 5 claims + runtime authority "not published" | BIND | H04 claim strip | `R/EvidenceFlow.tsx:360-366`, `:494` | bind shared `claims[]` projection | S | B3#5 (S04-01) | OPEN ✓ |
| 04-W | Window disclosure counts (n/5) | BIND | H04:714-789 Claim window table | `R/EvidenceFlow.tsx:~3747-3760` | bind `window_disclosure` | S | B3#13 (S04-07) | OPEN ✓ |
| 04-E/V | Per-stage cert caps + "binding: Stage 1" | DECISION → BIND | H04:714-789 cert table | `R/EvidenceFlow.tsx:~3695` | bind after cap policy | S | Bobby (cap policy, S02-01/S04-06) | OPEN ✓ |
| HT-1 | Embedded stage bodies still render their own "rules of this screen" footer inside the tab | HIFI | H04:320-713 tab bodies (no footer) | `R/SplitDetail.tsx`, `R/SearchDetail.tsx`, `R/FreezeDetail.tsx`, `R/ExecuteDetail.tsx` (`embedded` branch) | hide footer when `embedded` | S | none | OPEN (HUB_TAB_* records) |
| HT-2 | Execute tab: body's `StageDenied` would render a full-page denial inside the tab | HONESTY-lite | — | `R/ExecuteRoute.tsx` embedded path | tab-sized refusal | S | none | OPEN (record) |
| HT-3 | Tab bodies are the full deep-dive layout (Split table full width then 3 cards; Search ~2970 px; Execute ~2 screens vs HiFi 1.2; Freeze adds provenance/custody/what-if) | DECISION | H04 `isSplit` L320-409, Search 404-501, Freeze 502-580, Execute 581-713 | `R/hubStage*.tsx` | Bobby: accept "deep dive embedded" as VD or ask for compact HiFi tab layouts (M each) | S decide / M build | Bobby | OPEN |
| HT-4 | Search tab lacks HiFi "fold N · OOS a → b" pill and lineage chip row (trial → candidate → params → freeze → OOS → claim); Execute lacks fold navigator/layers column left, "event inspector", "why these params?" | HIFI | H04 `isSearch`, `isExecute` ~L581 | `R/hubStageSearch.tsx`, `R/hubStageExecute.tsx` | built from served facts or recorded VD | M | none | OPEN (record) |
| HT-5 | Two readiness cells on Search tab (hub `COMPLETE` vs S06 `partial/READY`) | HIFI | — | same | one, or both labelled by read | S | none | OPEN (record) |
| HT-6 | Claim tab: manifest name col 170 px (HiFi 190), digest in note column; extra claim-state + source-absence panels; HiFi 10 engine artifacts vs 2 served | HIFI | H04:714-789 | `R/EvidenceFlow.tsx` ClaimTab, reused `ArtifactsTable` | column + digest col; panels VD | S | manifest content = BE | OPEN (record) |
| 04-AD | P04 series density 25/744 points | BIND | — | — | nothing FE until BE | — | BE (hub cap) | OPEN = |
| 04-AC | Server prose inline in RefusalNote | DECISION | — | `R/ResearchPanel.tsx:242-253`; `R/EvidenceFlow.tsx:2097-2099` | per VD-FG-01-01 | S | VD-FG-01-01 | OPEN = |

### S05 Split (H05)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| X3 / FG 05-07/08 | θ* flow lane prints raw `0`/`1` next to `fold_01`; row aria/title raw id | HIFI | H05 θ* flow | `R/SplitDetail.tsx:2278-2280` (`id={fold.fold_id}`), `:824,839,1892` | `foldLabel` | S | none | OPEN ✓ |
| FG 05-06 | Per-fold date ranges `hidden … lg:block` vanish at 660 | HIFI | H05 fold rows | `R/SplitDetail.tsx:529,565,861` | visible at 660 | S | none | OPEN ✓ |
| FG 05-14 | No "purge applied / embargo applied" integrity rows (guards served) | HIFI | H05:187 boundary integrity | `R/SplitDetail.tsx:1833-1887` | rows from served guards | S | none | OPEN ✓ |
| FG 05-09 | IS bar lacks `search · N trials · IS only` though `n_studies`/`source_trial_count` fetched | HIFI | H05 θ* flow IS bar | `R/SplitDetail.tsx:~2285` `isLabel="IS"` | trial count | S | none | OPEN = |
| X7 / FG 05-03, 05-13 | P04 lane raw enums `THREE_WINDOW_CURRENT`, `FIXED_PROFILE_NO_SEARCH`, `P08_METADATA_BOUND`, `NOT_EXPOSED_TO_CHILD_TAPE`; metric reason generic not `P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE` | HONESTY-lite | H05 facts | `R/SplitDetail.tsx:1535-1536`, `:1561-1562`, `:918-919`, `:1865-1867`; `~2586-2588` | words(); served reason | S | none | OPEN ✓ |
| FG 05-05 | Purge/embargo hatch not bound to `anatomy.purge/embargo` (latent) | BIND | H05 fold rows hatch | `R/SplitDetail.tsx:~800-864` | bind | S | none | OPEN = |
| 2_wiring S05 | `gap_scan.boundaries[]` per row unread (counts only) | BIND | H05 gap scan | `R/SplitDetail.tsx:~1169-1202` | optional detail | S | none | OPEN = |
| FG X-08 | Inner folds bare `n/a`, reason only in `title` | HIFI | H05 facts grid | `R/SplitDetail.tsx:~1557-1660` | visible reason | S | none | OPEN = |
| VD-FG-01-06 | ❖ freeze marker from `anatomy.cutoff_utc_ms` | DECISION | H05 ❖ marker | `R/SplitDetail.tsx:~2108-2113` | per Bobby | S | Bobby (+ Codex semantics) | OPEN = |

### S06 Search & Selection (H06)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| G8 F-1 | OOS column chip says `selection input`, fold strip says `retrospective` (mode_1_decay × global) | DECISION | H06 claim row | `R/SearchDetail.tsx:~1984`, `RetainedOosColumn ~410` | one word (proposal `retrospective`) | S | Bobby | OPEN = |
| X4 | `imported_alpha` (source_digest, entrypoint, categorical params) served, never read | BIND | H06 header/params | `R/SearchDetail.tsx` (0 hits) | render on imported runs | S | none (served) | OPEN ✓ |
| 2_wiring S06 | Retained lane never sends `fold`/`before` → `ledger.fold_filter` always null | BIND | H06 trial ledger | `R/SearchDetail.tsx:826`, `:2388-2396` | send `fold` from cursor | S | none | OPEN ✓ |
| 8_sweep #4 / D6 | No typed placeholder where the search cinema sits | HIFI | H06:93-120 | `R/SearchDetail.tsx` top | one-line "search cinema — sampler trace not published" | S | none (cinema itself = engine) | OPEN = |
| FG 06-10/11 | Rounded numbers without `data-exact` (one on page); `?? "—"` placeholders | HONESTY-lite | — | `R/SearchStageB.tsx:60-80`; `R/SearchDetail.tsx:911-916` | exact in title; typed absence | S | none | OPEN = |
| FG 06-14 | Rules footer lacks PRUNED/`duplicate_policy` sentence | HIFI | H06 footer | `R/SearchDetail.tsx:~2380` | sentence | S | none | OPEN = |
| X-09 | `scrollIntoView` on ledger pick | A11Y | — | `R/SearchDetail.tsx:~806` | focus-safe scroll | S | none | OPEN = |
| G7 S06 | axe `heading-order` | A11Y | — | `R/SearchDetail.tsx` headings | axe clean except D-B1 | S | none | OPEN ? (probe not re-run on merged tree) |
| S06 binds | `selector_confidence` tag, P04 `levels`, `surface.grid` heatmap, `pool.frozen_at_utc_ms`, `Trial.params_digest`/seed | BIND | H06 claim tag, A1 levels, A6 heatmap, freeze line, ledger | `R/SearchDetail.tsx:1617`, `:516` `LEVELS_REASON`, `:2296`; `R/SearchStageB.tsx:143`; `R/SearchDetail.tsx:742,868` | bind each as published | S each | B3#9, #7, #10, #6, #8 | OPEN = |
| 6.10b | Mode 2–5 B2 panels (bootstrap/cluster/shard) | BIND (latent) | H06 B2 variants | — | only once such a run exists | L | engine E5-O2 | OPEN (latent) |

### S07 Freeze (H07)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| FG 07-08 | "digest drift → Certification BLOCKED" banner only on byte MISMATCH; integrity BLOCKED / Stage4 DRIFT only badge | HONESTY-lite | H07 banner | `R/FreezeDetail.tsx:~419`, `~1636` | banner from integrity + binding | S | none | OPEN = |
| FG 07-11 | "global" derived from progress folds instead of served `selection_scope`; "folds 1–2" vs `fold_01–02` | HONESTY-lite | H07 F2 | `R/FreezeDetail.tsx:1200` (`foldSpan :932`), `~1134-1139` | bind `selection_scope`; foldLabel | S | none | OPEN ✓ |
| FG 07-04/05 | No outcome line after 202 ADMITTED; evaluate 409 copy | HIFI | H07 what-if | `R/WhatIfCard.tsx:~374-386` | outcome + copy | S | none | OPEN = |
| X6 / 07-10 / 07-17 | Two timestamp formats (`iso()` vs `formatUtc`); candidate id 8 hex vs 12 in chain; back-link echoes hash not `stage=freeze` | HIFI | H07 header/strip | `R/FreezeDetail.tsx:156`, `:1415`, crumb `~1584-1620` | one helper; 12 hex; stage | S | none | OPEN ✓ |
| X4 | `imported_alpha` served, unread | BIND | H07 F2/F3 | `R/FreezeDetail.tsx` (0 hits) | render | S | none | OPEN ✓ |
| 07-12 | Null fold renders `—` in F4 binding | HONESTY-lite | H07 F4 | `R/FreezeDetail.tsx:~1810-1812` | typed absence | S | none | OPEN = |
| VD-FG-01-14 / -09 | Fold selector control; S07 footer text | DECISION | H07:116-123; footer | `R/FreezeDetail.tsx:~1195-1205`, `:89` | per Bobby | S | Bobby | OPEN = |

### S08 Execute Replay (H08)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| 08-16 / D11 | Fold named `fold_01` in chips but `fold 0` in titles/checkpoint/child-audit text | HIFI | H08 fold chain | `R/ExecuteCandleReplay.tsx:392`, `:413` | foldLabel everywhere | S | none | OPEN ✓ |
| FG 08-04 / 08-03 | Default speed 1× vs HiFi 4×; P04 transport glyph meanings differ | HIFI | H08 transport | `R/replayTransport.ts:53` | 4× default (or VD) | S | none | OPEN ✓ |
| 08-09 | PnL distribution card missing entirely (no typed absence) | HONESTY-lite | H08 blotter/MAE×MFE/PnL | `R/ExecuteDetail.tsx` | typed-absence card | S | none | OPEN = |
| D10 walk | 660: candle top price label + x-axis end labels clipped ("ul", "23:(") | HIFI | H08 @660 | `R/ExecuteCandleReplay.tsx` chart setup | labels inside plot | S | none | OPEN ? |
| G7 S08 | axe heading-order (`<h3>` "execution contract") | A11Y | — | `R/ExecuteDetail.tsx:935`, `:1397`; `R/ExecuteCandleReplay.tsx:1185` | axe clean | S | none | OPEN ? |
| 2_wiring S08 | `market_overview` (hub core) served, unread; `candle_overview` (bundle) only — absence shown when hub side has data | DECISION → BIND | H08 candle chart P04 | `R/ExecuteDetail.tsx:183`; `R/ExecuteCandleReplay.tsx:354` | Bobby picks one; FE reads it (or falls back) | S | Bobby | OPEN ✓ (0 hits) |
| CG-FG-S08-01 FE | Per-fold `params prm_…` absent; FE could bind progress `selection.params_digest` / freeze REPLAY_PARAMS now | BIND | H08 fold chain params | `R/ExecuteCandleReplay.tsx ~1112` | bind alternative or served join | S | none (or B3#2) | OPEN = |
| CG-FG-S08-03 | P04 verdict tiles counts | BIND | H08 tiles | `R/ExecuteDetail.tsx:~1458` | bind subset | S | B3#15 | OPEN = |
| G1 width / VD-FG-04-02/03 / VD-FG-01-15 / bucket res | play-across pill 406 vs 154 px; PRICE OVERVIEW eyebrow; wick-only P04 candles; S08 title/lens; WFO 151–160 vs P04 48 buckets | DECISION | H08 | — | per Bobby | S | Bobby | OPEN = |

### S09 Run Report (H09)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| 09-03 | Fold boundary marks print raw `fold_id` (`0`,`1`) | HIFI | H09 equity fold marks | `R/ReportDetail.tsx:~683` (`label: row.fold_id`), `:752-775` | foldLabel | S | none | OPEN ✓ |
| 09-05 | Δ decay no red at >0.3, no DRAG row tint (served `failed_criteria`) | HIFI | H09 per-fold verdict | `R/ReportDetail.tsx:~857-944` | tint | S | none | OPEN = |
| 09-04 | OOS Sharpe coloured by sign; HiFi keeps ratios in ink | HIFI | H09 headline | `R/ReportDetail.tsx` headline tiles | ink | S | none | OPEN = |
| 09-02 | Meta line raw tokens `research.report-presentation.v1`, `RS02_RETAINED_CURRENT_SOURCE` | HONESTY-lite | H09 meta | `R/ReportDetail.tsx` meta | words | S | none | OPEN = |
| AN-20 / AN-21 FE | Metrics grid reads v2 all-time facts; P04 headline OOS Sharpe lights when BE fixes it (verify no FE hard-code) | BIND | H09 metrics, D-AN-01 §3 | `R/ReportDetail.tsx` metrics | renders served facts; receipt = S04 values | S | AN-20, B1#4 (AN-21) | OPEN = |
| CG-FG-S09-02 | Equity series digest/path caption | BIND | H09 key artifacts | `R/ReportDetail.tsx:~704-707` | bind digest (+ logical name) | S | B3#16 | OPEN = |
| G5b | Real-data print Letter/A4; 6-rule grid seen on real run | LANE | H09 footer "prints on letter or A4" | — | PDFs both sizes from preview | S | none | OPEN (NOT_RUN) |

### S10 Attempt Lineage (H10)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| FG 10-11 / D3 walk | Nodes/pick/rows print `ratt_…·rrun_…`; `sid()` bypasses run-label registry (lineage read carries `display_label`) | HIFI | H10:95 `att_03 · R-WFO-118` | `R/LineageDetail.tsx:594-596` | `runLabelFor` like CompareDetail | S | none | OPEN ✓ |
| 10-29 | Tree-empty copy wrong when only the probe toggle hides rows | HONESTY-lite | H10 tree | `R/LineageDetail.tsx` empty state | copy names the toggle | S | none | OPEN = |
| 10-17 / 10-21 | Spec-line fallback raw `CLONE_FOR_EXPERIMENT · space …`; raw enums in technical rows | HONESTY-lite | H10 cards | `R/LineageDetail.tsx` | words() | S | none | OPEN = |
| 10-28 | Bounded history: counts not mono; `mergeOlder` recounts in FE and sets COMPLETE | HONESTY-lite | H10 counter | `R/LineageDetail.tsx` `counterText :213` | server total | S | none | OPEN = |
| D3 walk b | Clone R-P04-019 hidden behind "show 35 probe attempts" (server `presentation_kind` STORIED=1) | DECISION | H10 tree | — | Bobby: surface CLONE/REPRODUCTION children regardless of probe class? | S | Bobby / Codex | OPEN = |
| G7 S10 | Dimmed SUPERSEDED/ABANDONED rows via opacity .75/.82 → 12 contrast nodes | A11Y / DECISION | H10 dimmed rows | `R/LineageDetail.tsx:380`, `:417` | `--ink-soft`, no opacity | S | Bobby (HiFi colour) | OPEN ✓ |
| CG-FG-S10-03 / VD-FG-05-05 | claim.family; P22 pick states | BIND | H10 selected panel / pick | `R/LineageDetail.tsx:~1700`, `~1030-1085` | bind | S | B3#3; VD-FG-05-05 Bobby | OPEN = |
| VD-FG-01-19/20/22 | extra links; default selection; PARTIAL notice vs pick | DECISION | H10 | `R/LineageDetail.tsx:~1151,2178,1939` | per Bobby | S | Bobby | OPEN = |

### S11 Release Candidate & Publish (H11)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| 2_wiring S11 | Publication `promotion_pick.{approval_status, artifact_id, fact_digest, selected_trial_id}` unread — no WRITTEN/PENDING state, no trial id | BIND | H11 lineage rail / mirror | `R/ReleaseCandidateDetail.tsx` (0 hits) | render pick state + trial id | S | none (served) | OPEN ✓ |
| 11-08 | Pack header wraps (no `margin-left:auto` on `.rc-packhead`) | HIFI | H11:110 evidence pack header | `R/ReleaseCandidateDetail.tsx:~335` | one line, chips right | S | none | OPEN = |
| 11-10/15/17 + 8_sweep #5 | Digests: CSS ellipsis on full value; full 64-hex in confirm/published card; record-preview digests overflow the card | HIFI | H11 `sha256:3fe4a1…` | `R/ReleaseCandidateDetail.tsx` rc-yaml / confirm | `shortDigest()` + title; wrap in preview | S | VD-FG-01-23 for YAML | OPEN = |
| 11-03 / 11-28 | Raw `SEALED_LOCAL NOT_DELIVERED · NOT_APPROVED`; identity card stretches ~380 px empty | HONESTY-lite / HIFI | H11 state chip | `R/ReleaseCandidateDetail.tsx` | words; height auto | S | none | OPEN = |
| D10 walk | 660: evidence-pack table clipped right, rows tall/empty | HIFI | H11 @660 | same | scroll affordance / restack | S | none | OPEN ? |
| CG-FG-S11-02 | `selected_params.param_set_id` + trial number | BIND | H11 rail selected params | `R/ReleaseCandidateDetail.tsx:~117` | bind | S | B3#11 | OPEN = |
| VD-FG-05-04/08/09/10, VD-FG-01-24/25/26 | SLA relative, pool as team, outcome enum words, raw/effective split, retry confirm, inbox link, pack chips | DECISION | H11 mirror | — | per Bobby | S | Bobby | OPEN = |

### S12 Engine / Mode Atlas (H12)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| G7 §2.4 | Claims tab: 3 elements need sideways scroll (unidentified) | HIFI | H12 claims card | `E2E/_probe-research-product.spec.ts:116-120` | identify + fix; probe 0 | S | none | OPEN ? |
| 12-15 | 503 has no "read again"; 403/404 lose request id | HIFI | H12 states | `R/foundationRoutes.tsx` | retry button; request id | S | none | OPEN = |
| 7_root | "WHAT IT READS" illustrative strip (IS pulse / OOS hatched / bootstrap ghosts / plateau / shards) rendered as text chips; objective formula mono vs typeset | HIFI | H12 mode cards | `R/EngineAtlas.tsx` | glyph strip from served `reads.*` (reuse `SearchFoldStrip` cells); KaTeX like S06 | M | none | OPEN = |
| FG 12-02 / R-15 / aria | Release block `min-w-[260px]` 3 px overrun @1280/1440; open route row can't deselect; tabs lack `aria-controls`; footer copy drift | HIFI / A11Y | H12 header/tabs | `R/EngineAtlas.tsx:1176`, tabs | fixed | S | none | OPEN ✓ (0 `aria-controls`) |
| 2_wiring S12 | `walk_forward_status` served, unread (possible HiFi route column) | BIND | H12 routes | `R/EngineAtlas.tsx` | render if it is the HiFi column | S | none | OPEN = |
| VD-FG-01-27/29 | tab replace vs push; 404 selection-miss EMPTY | DECISION | — | — | per Bobby | S | Bobby | OPEN = |

### S13 Compare (H13)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| AN-22 FE | P04 OOS Sharpe "not published" although Library has 0.744 — FE lights when BE binds v3 | BIND | H13 big number | `R/CompareDetail.tsx:~603-609` | receipt = Library value | S | B1#5 | OPEN = |
| 8_sweep S13 | P04 has one outer-OOS window but gets no per-fold bar | DECISION | H13 EChart 1 | `R/CompareDetail.tsx` per-fold chart | Bobby: one bar labelled "single OOS window" or keep absence | S | Bobby | OPEN = |
| 13-06 | Fold axis `fold 1` vs HiFi `fold_01`; FE adds a `0` tick | HIFI | H13 per-fold bars | `R/CompareDetail.tsx` | foldLabel; no 0 tick | S | none | OPEN = |
| P3 trajectory | Raw `P20_ATTEMPT_TRAJECTORY_V1` visible | HONESTY-lite | H13:132 trajectory | `R/CompareDetail.tsx:~1328` | hidden in title | S | none | OPEN = |
| 13-11 / 13-01 / 13-04 | pp shown as %; raw window/missing-policy tokens; alpha appended to crumb; bare `rc_` link text | HIFI | H13 pair / crumb | `R/CompareDetail.tsx:~1888` | fixed | S | none | OPEN = |
| 8_sweep S13 diff | Config diff: 15 columns, cut at right, no cap | HIFI | H13 config diff | `R/CompareDetail.tsx` | cap "top N / total" or visible scroll affordance | S | none | OPEN = |
| CG-FG-S13-02 / AN-23 / AN-14 | cert grade; common-window Sharpe; win rate | BIND | H13 cert, pair | `R/CompareDetail.tsx` | bind | S | B1#6, AN-23, AN-14 | OPEN = |
| >12 density / VD-FG-04-01 | ladder when >12 claimed attempts; wrap connector + header wording | DECISION | H13:77 (4 cards) | — | per Bobby | S | Bobby | OPEN = |

### S14 Alpha Import (H14)

| id | title | class | HiFi | code | done = | size | dep | status |
|---|---|---|---|---|---|---|---|---|
| 14-18 | Registry 503 has no retry button | HIFI | H14 registry | `R/AlphaImport.tsx` registry strip | retry | S | none | OPEN ✓ (0 "retry") |
| 14-04 | Stepper lacks arrow keys / roving tabindex | A11Y | H14 stepper | `R/AlphaImport.tsx` stepper | keyboard | S | none | OPEN = |
| P3 set | `quarantine_code` not rendered; gate timing `toFixed(3) ms`; registry chip not linked to lineage; empty-registry copy unreachable | HIFI | H14 mirror/gates/registry | `R/AlphaImport.tsx:484`, `:596` | fixed | S | none | OPEN ✓ (`:484`) |
| CG-FG-S14-04 FE | FE filters registry client-side though server takes `alpha_id`; no total/cursor; G9 cap | BIND | H14 registry | `R/AlphaImport.tsx:853`; `R/useAlphaImport.ts:99` | server filter now; cap "top N / total" when `total` served | S | B3#12 | OPEN ✓ |
| S14-C1 | DRAFT note contradicts OL-01 sentence ("can run as evidence" vs "refuses a DRAFT") | DECISION | H14 step 3 | `R/AlphaImport.tsx:70` vs `:121` | copy per Bobby | S | Bobby | OPEN ✓ |
| S14-RW retake | Register replay-after-activate + FAIL-row receipt on rebuilt preview | LANE | — | — | real write receipt | S | B1#1, B1#2 | OPEN |

---

## 3. Cross-screen

| id | title | class | locator | done = | size | dep | status |
|---|---|---|---|---|---|---|---|
| X-07 | No `<title>` per screen (HiFi: "QuantBT — Run Library", "QuantBT Stage 1 — Split & Windows", "QuantBT Evidence Flow — R-WFO-118", "Backtest Evidence Report — R-WFO-118" …) | HIFI / A11Y | HiFi `<title>` line 11 of every file; `grep document.title src/` = 0 | one hook sets title per route (run label where HiFi has it) | S | none | OPEN ✓ |
| X-2 gutter | S09 report, S11 RC, S10 lineage, S12 atlas, S13 compare, S02 new, S00 journey sit at x=280 not 272 (not in `OWN_FRAME_SCREEN`) | HIFI | `QB/QuantBTModule.tsx:247-248` | regex covers them; `_probe-gutter.spec` 272 on all | S | shared router file (tell Codex) | OPEN ✓ |
| minus | `formatMetric` currency/ratio print hyphen-minus `-5.355`; fractions print `−` (S09, S10, S13, S08 tooltips) | HONESTY-lite | `R/researchFormat.ts:31,40` (`GROUPED`) | U+2212 for negatives in every unit; unit | S | none | OPEN ✓ |
| sidebar | Sidebar grey stops ~1100 px on long pages | HIFI | `styles/shell.css:163-177` (`.portal-rail` sticky, `height: calc(100vh - topbar)`) | confirm in a scrolling browser (full-page screenshots cut sticky rails); if real, rail background spans `.portal-body` height | S | none | OPEN ? |
| D9 walk | Topbar cold-load flash `rrun_…` 150–300 ms before label read lands | HIFI | `APP/TopBar.tsx:48`, `R/useRunLabelRead.ts` | render no id (or skeleton) until label read settles/refuses | S | none | OPEN ? |
| VD-FG-01-01 | Server prose in RefusalNote / `<details>` (S01, S04–S07; blocks 15 runner cells) | DECISION | `R/ResearchPanel.tsx:102-110`, `:242-253`; `R/researchRefusal.ts:231` | per Bobby | S | Bobby | OPEN = |
| D-B1 / F9 | `--ink-faint` `#939db0` contrast (2,389 axe nodes) + deliberate HiFi colours S01/S03/S04/S10 | DECISION / A11Y | token | token step on its own (baseline) | S | Bobby | OPEN |
| VD-FG-01-17 | Shell crumb depth S10–S14 | DECISION | shell router | per Bobby | S | Bobby | OPEN = |
| LEGACY-EXPORT FE | Legacy `/api/runs/:id/export` links (unguarded endpoint) | BIND | `R/AuditView.tsx:80`; `QB/QuantBTModule.tsx:337` | hide/disable link if BE gates or retires it | S | B1#13 | OPEN = |

## 4. LANE / TEST / TOOLING debt

| id | title | locator | done = | size | dep | status |
|---|---|---|---|---|---|---|
| F3 | Real-API lane 50/54: X1 P22 publish DOUBLE ×2 (stub predates FG-05 — rebuild from P22 contract, FE-owned); S00 alpha-version ×2 (CG-S00-AV-01) | `E2E/_preview-research-real-api.spec.ts` | 54/54 on one exact candidate | S (FE part) | B1#3; candidate freeze (Codex B5) | OPEN |
| F4 cells | No real-lane cells yet for D7 play-across, D4 prefill, G8 strip, S05–S08 cold labels, hub-tab bodies (V2), `/research/quantbt` index (V1) | same spec | cells added + green | S | none | OPEN |
| G6 / VD-FG-07-01 | Visual baseline not re-run after S08/S12/topbar A/V1/V2 (8 known drifts + new Research drifts) — only `./scripts/portal-web-visual.sh`, then Bobby approves per cell | `scripts/portal-web-visual.sh` | 332 pass or approved drift list; never blind `--update` | S (+~18 min) | Bobby per cell | OPEN |
| G7 run | axe probe (15 screens × 3 widths) not run on the consolidated tree; heading-order S02/S06/S08 status unknown | `E2E/_probe-research-rf04-a11y.spec.ts`, `E2E/axeReceipt.ts` | receipt: only D-B1 remains | S | none | OPEN ? |
| F5 | Browser-visible refusal presentation (400/401/403/404/409/503) + source-honest 502 on S02/S14 | P23 F5 receipts | receipts per state | S (FE) | Codex F5-502 | OPEN |
| S11-REAL | S11/P22 real-API browser cells (`S11-REAL-API`, `S11-P22-REAL-E2E`); OL-05 receipt | lane | VERIFIED real | S | Codex OL-05 on candidate | OPEN |
| hook gap | Pre-commit hook does not run frontend vitest (token test went red unnoticed) | hook / `scripts/verify-workspace.sh` | hook (or CI step) runs `src/research src/app src/features/quantbt` vitest | S | none (fix tooling, per memory) | OPEN |
| e2e fixture | `atlas-historical.json` violates DTO union (full `atlas`, no `historical_identity`) | `E2E/research-foundation/atlas-historical.json` | load canonical `research-foundation.historical-identity.valid.json` | S | none | OPEN ✓ |
| typed fixtures | `engine_pin` now required — confirm no stale typed fixture (tsc clean today, keep in checklist) | — | tsc clean | — | — | OK today (tsc clean per `925d4f22`) |
| HiFi 09 | `QuantBT 09 Run Report.dc.html` loads missing `doc-page.js` → renders blank; needs HTTP | `release-v1.1/` | add file or note in README | S | Bobby (HiFi owner) | OPEN |
| ledger | Correct §13.4.1: E4 (S03 part) and E15 marked ĐÓNG with no S03 code; E1 claims S04 a11y table rounding done; OL-13/(c) "chờ Codex" stale; CG-FG S03-03/S04-03/S12-01 BE close; G-list superseded by this file | `UNIFIED_IMPLEMENTATION_PLAN.md:3772,3786,3769,3957-3959` | rows amended (A13.1: append, never delete) | S | none | OPEN |

---

## 5. Counts

189 rows. Each row is counted once, under the first class in its class cell. Some rows bundle several P3 ids, and DECISION rows carry about 45 VD ids between them.

| Class | Rows |
|---|---|
| HONESTY (incl. honesty-lite) | **48**. 33 are in §1; 15 are lighter raw-token or placeholder leaks in §2–§3 |
| HIFI | **62** |
| BIND | **39**. About 15 of them need nothing from Codex, because the field is already served: `net_oos_return`, `historical_identity`, `import_attestation`, `imported_alpha`, `rc_availability`, `relationship`, `best_objective`/cancel status, P22 pick, `market_overview` (after Bobby picks), `requires_run`, `walk_forward_status`, S06 `fold` param, S08 params digest, S14 server filter, `cert_cap.reason` |
| DECISION | **20** |
| LANE | **13**. 11 are in §4, plus S09 real-data print and the S14 write retake |
| A11Y | **7** |

Per screen (§1 honesty rows included): S00 6 · S01 9 · S02 23 · S03 9 · S04 27 · S05 12 · S06 10 · S07 8 · S08 12 · S09 9 · S10 10 · S11 8 · S12 7 · S13 9 · S14 10 · cross-screen 9 · lane/test 11.

Size: no L except latent S06 mode 2–5 panels. M: S03 claims (03-I/J), S04 D-AN-01 (EChart 3, hero tiles, Behavior), S02 02-16, S12 reads strip, S04 HT-3/HT-4 if Bobby asks for compact tabs. The rest are S.
