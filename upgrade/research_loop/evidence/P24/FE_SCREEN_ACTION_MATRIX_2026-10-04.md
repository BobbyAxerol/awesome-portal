# FE screen/action matrix — 15 screens × real runs (P24-T09 / P24-T13 / FND-20)

2026-10-04 · agent AB · spec `apps/portal/frontend/e2e/_preview-research-p24-matrix.spec.ts` · receipt `fe-screen-action-matrix-receipt.json` (same dir, one row per cell × check, evidence strings are the measured values).

**Target:** deployed preview `http://localhost:8095` (public `research-portal.primusspark.com`), bundle `index-Dim4AT4Z.js`, stack rebuilt 04:14Z by the lead; the matrix below is a full run on that bundle (five parallel shards, then one re-run of 11 cells after the F-07 allow-list entry). **GET and navigation only**: `getOnly` aborts every non-GET `/api/` call; no write control was clicked.

## Re-run on the final bundle — 2026-10-04 (supersedes the per-cell FAIL table below)

Bundle `index-Bu8sUwob.js` (lane HEAD `0d1b54d7` + this spec change), full spec, GET/navigation only.
**73 cells · 682 checks = 613 PASS / 0 FAIL / 69 NA.** The 29 FAILs of the first run (F-01…F-06) were fixed in `0d1b54d7`:
F-01 copy-link no-print · F-02 write-named controls no-print · F-03/F-04 ink-token contrast + focusable scroll regions ·
F-05 S14 step in the hash only where restorable · F-06 deterministic S08 selected transition · F-07 linked-audit panel asks only for
`SINGLE_PARAMETER_SET` (typed "not applicable" otherwise; 6 failing lane cells now pass). S14 `refresh`: the wizard keeps the pasted source
in memory only, so a reload cannot restore step 2/3; the contract is "return to the entry state, clean URL, no error" and the cell now asserts that
(`refreshFallback`), not "same state".

Lane + gate on the same bundle: real-API + W1 + W5 gate 227/228 (the one failure, `S06 on real reads at mobile`, is a load flake: 3/3 pass alone).

Verdict: **T09 / T13 = READY_FOR_BOBBY_REVIEW for the GET/navigation denominator** (nav, deep link, reload, print, responsive 1440/1280/390/360, a11y, console on every screen × run state).
Still not covered, by design or by missing data: write controls are enumerated `NOT_RUN_WRITE` here (real receipts: P22 publish of R-WFO-027 and the journey receipt `FE_JOURNEY_RECEIPT_2026-10-04.md`);
`denied` and `stale` states do not exist on the preview (stale seals exist on R-WFO-022/023 and are exercised by the lane); Operations Dark and mobile print are covered by the QA REPORT.md addendum, not re-run here;
real-device print is a review item. Everything below is the FIRST run, kept as history.

**Totals:** 73 cells · 682 checks = **584 PASS / 29 FAIL / 69 NA** · cells with every check PASS/NA: **50**, cells with ≥1 FAIL: **23**. (A cell = screen × tab/mode × run; 15 screens, 73 cells.)

## Verdict

**T09 / T13 stay OPEN_FE.** Coverage of the denominator is complete for navigation, deep link, reload, responsive and console (all PASS on both full runs and the state runs); the print, a11y and reload columns carry real FAILs (F-01…F-07 below) that are src/ defects, not spec weakness. Nothing here is a release verdict; owner acceptance (Bobby) is not claimed.

## Method and what each column means

| Column | Check (spec step) | PASS means |
|---|---|---|
| states | `load` | the screen root renders for the run kind; no raw `undefined`/`NaN`/`[object Object]`; NOT_FOUND shows the typed "Run not available" and links nothing to the missing run |
| nav | `nav` | every listed control is clicked (navigation only), lands on the expected route/hash, **cursor (fold, trial) preserved in the hash** where the control must carry it, then Back |
| refresh | `act` + `refresh` | one GET-only state change (fold chip / window / tab / filter / wizard step), then `page.reload()` gives the same screen signature (route, hash, selected tab, pressed/current/selected controls, filter text, heading) |
| deep link | `deeplink` | the final URL opened cold in a fresh context (new sign-in, empty storage) renders the same signature |
| print | `print` | `emulateMedia(print)` + `page.pdf` A4: pages>0, a text layer extracted from the PDF itself (`e2e/pdfText.ts`, own Flate/ToUnicode reader) contains none of the shell words, and no no-print control (selector list + any button named like a write) is visible |
| responsive | `responsive` | `scrollWidth<=clientWidth` at 1440/1280/390/360 (state cells: 1440/390) |
| a11y | `a11y` | axe-core 4.13.0 on `body`: 0 critical and 0 serious at 1440 and 390 (state cells: 1440); reduced motion on |
| console | `console` | 0 console errors / page errors / failed API requests, except the documented 4xx listed under F-07 and the typed 404s for the unknown run |
| writes | `writes` | every write control enumerated (tag, `data-action`, label, disabled + reason) and asserted present / disabled-with-reason / absent for the state; **never clicked** |

Runs: R-WFO-023 `rrun_3d5633d2adb712722fe4ba108102aa5d` (LOCAL_SEAL, 9 folds, retrospective calibration) and R-WFO-027 `rrun_686af4b1d64472591b6a64a1db1233a3` (LOCAL_SEAL, published RC, causal 3 folds) get the full battery. State runs (load, reload, deep link, 1440+390 overflow, a11y, console, writes) on R-P04-022 `rrun_9ec42333…` (COMPLETED, no RC), the first FAILED run (R-P04-020 `rrun_3955ea93…`), the first QUEUED run (R-WFO-025 `rrun_5e1185f8…`) and the all-zero id (NOT_FOUND). "denied" and "stale" states are **not** reachable on this preview (claude-preview has no denied run and no stale seal in the list): marked NOT_COVERED, see Gaps.

Results for the six HiFi-referenced HTML files: `upgrade/research_loop/release-v1.1/QuantBT NN *.dc.html`; spec text per screen in `release-v1.1/docs/screens/NN_*.md` (file names in each section).

## S00 · Journey map

- Route: `/research/quantbt/research/quantbt/journey` · HiFi: `release-v1.1/QuantBT 00 Journey Map.dc.html` · spec: `release-v1.1/docs/screens/00_journey_map.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/research/alpha-versions/av_delta_rsi_polynomial_alpha_1_0_0/publication`; `/api/v1/research/alphas`; `/api/v1/research/datasets/catalog-v2`; `/api/v1/research/journey`; `/api/v1/research/quantbt/atlas`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S00@-` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S00@-` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S00@-` (PASS) | card: Run Library → /runs ; card: New Run → /runs/new ; card: Alpha Import → /alpha-import ; card: Engine Atlas → /atlas ; card: run-picking (Run Progress) lands on the Library with ?to= → /runs?to=run_progress ; card: run-picking (Compare) lands on the Library with ?to= → /runs?to=compare_runs ; back link (Run Library) → /runs |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| all | none: this screen has no control that writes (links to forms create nothing) |

## S01 · Run Library

- Route: `/research/quantbt/research/quantbt/runs` · HiFi: `release-v1.1/QuantBT 01 Run Library.dc.html` · spec: `release-v1.1/docs/screens/01_run_library.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/current-source/split`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/search`; `/api/v1/quantbt/runs/{run}/split`; `/api/v1/research/alpha-versions/av_delta_rsi_polynomial_alpha_1_0_0/publication`; `/api/v1/research/alphas`; `/api/v1/research/datasets/catalog-v2`; `/api/v1/research/journey`; `/api/v1/research/quantbt/atlas`; `/api/v1/research/release-candidates/{rc}`; `/api/v1/research/runs/{run}/events`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S01@-` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S01@-` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S01@-` (PASS) | header: + new run → /runs/new ; header: journey map → /journey ; header: attempt lineage → /alphas/delta-rsi-polynomial-alpha/lineage ; card: open evidence → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/evidence ; card: open S1 → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/split ; card: open S2 → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/search ; card: open S3 → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/freeze ; card: open S4 → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/execute ; card: open S5 (report) → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/report ; card: watch progress (RUNNING/QUEUED) → /runs/rrun_5e1185f847dddd418bdbd1f9f32b87c7/progress ; card: rc chip → /release-candidates/rc_06GG2K1TN6QQNJJN3RJ5AS5XC1 |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S01@-` (PASS) | + new run (link, creates nothing): enabled |

## S02 · New Run

- Route: `/research/quantbt/research/quantbt/runs/new?step=` · HiFi: `release-v1.1/QuantBT 02 New Run Preflight.dc.html` · spec: `release-v1.1/docs/screens/02_new_run.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/research/alpha-versions/av_delta_rsi_polynomial_alpha_1_0_0/publication`; `/api/v1/research/alphas`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/datasets/catalog-v2`; `/api/v1/research/quantbt/atlas`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S02@-` | PASS | PASS | PASS | PASS | FAIL F-02 | PASS | FAIL F-03 | PASS | `S02@-` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S02@-` (PASS) | back: Run Library → /runs ; Import a version → /alpha-import ; lineage link → /alphas/delta-rsi-polynomial-alpha/lineage?av=av_delta_rsi_polynomial_alpha_1_0_0 ; runs of this alpha → /runs?alpha=delta-rsi-polynomial-alpha ; wizard tab: Walk-forward → ?step=windows ; wizard tab: Parameters → ?step=parameters ; wizard tab: Optimization → ?step=optimization ; wizard tab: Review & run → ?step=review |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S02@-` (PASS) | Start over (drops the LOCAL draft only): enabled \| Create run (Review & run step): not rendered in this state |

## S03 · Run Progress

- Route: `/research/quantbt/runs/:run/progress#fold=` · HiFi: `release-v1.1/QuantBT 03 Run Progress.dc.html` · spec: `release-v1.1/docs/screens/03_run_progress.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/current-source/replay`; `/api/v1/quantbt/runs/{run}/current-source/replay/child-audit`; `/api/v1/quantbt/runs/{run}/current-source/replay/transitions`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/current-source/split`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/search`; `/api/v1/quantbt/runs/{run}/split`; `/api/v1/research/alphas`; `/api/v1/research/quantbt/atlas`; `/api/v1/research/runs/{run}/console`; `/api/v1/research/runs/{run}/events`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S03@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S03@FAILED` |
| `S03@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S03@NOT_FOUND` |
| `S03@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S03@QUEUED` |
| `S03@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S03@R-P04-022` |
| `S03@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | FAIL F-03 | PASS | `S03@R-WFO-023` |
| `S03@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | FAIL F-03 | PASS | `S03@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S03@R-WFO-023` (PASS) | back: Library → /runs ; Evidence Flow → keeps fold → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence#stage=summary&fold=3&trial=351&params=a ; stage rail: Stage 1 Split → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/split#stage=split&fold=3&trial=351&params=a74 ; stage rail: Stage 2 Search → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/search#stage=search&fold=3&trial=351&params=a7 ; stage rail: Stage 3 Freeze → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/freeze#stage=freeze&fold=3&trial=351&params=a7 ; stage rail: Stage 4 Execute → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute#stage=execute&fold=3&trial=351&params=a ; stage rail: Stage 5 Claim → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence#stage=claim&fold=3&trial=351&params=a74 ; fold row: fold_03 → #fold=3 ; tab: Stage log → #fold=3 |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S03@FAILED` (PASS) | Cancel run: absent \| Retry run: not rendered in this state \| Copy link (clipboard only): enabled |
| `S03@QUEUED` (PASS) | Cancel run: not rendered in this state \| Retry run: not rendered in this state \| Copy link (clipboard only): enabled |

## S04 · Evidence hub (7 stage tabs)

- Route: `/research/quantbt/runs/:run/evidence#stage=&fold=&trial=` · HiFi: `release-v1.1/QuantBT 04 Evidence Flow.dc.html` · spec: `release-v1.1/docs/screens/04_evidence_flow.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/evidence/series`; `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/current-source/replay`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/current-source/split`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/evidence/series`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/final-audit`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/release-candidate`; `/api/v1/quantbt/runs/{run}/report`; `/api/v1/quantbt/runs/{run}/search`; `/api/v1/quantbt/runs/{run}/split`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/release-candidates/{rc}/publication`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S04:atlas@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:atlas@R-WFO-023` |
| `S04:atlas@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:atlas@R-WFO-027` |
| `S04:claim@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-02 | PASS | FAIL F-03 | PASS | `S04:claim@R-WFO-023` |
| `S04:claim@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-02 | PASS | FAIL F-03 | PASS | `S04:claim@R-WFO-027` |
| `S04:execute@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:execute@R-WFO-023` |
| `S04:execute@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:execute@R-WFO-027` |
| `S04:freeze@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:freeze@R-WFO-023` |
| `S04:freeze@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:freeze@R-WFO-027` |
| `S04:search@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:search@R-WFO-023` |
| `S04:search@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:search@R-WFO-027` |
| `S04:split@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:split@R-WFO-023` |
| `S04:split@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:split@R-WFO-027` |
| `S04:summary@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S04:summary@FAILED` |
| `S04:summary@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S04:summary@NOT_FOUND` |
| `S04:summary@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S04:summary@QUEUED` |
| `S04:summary@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S04:summary@R-P04-022` |
| `S04:summary@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:summary@R-WFO-023` |
| `S04:summary@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-01 | PASS | PASS | PASS | `S04:summary@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S04:atlas@R-WFO-023` (PASS) | fold stepper: previous fold → #stage=atlas&fold=2&trial=1 ; report link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 |
| `S04:claim@R-WFO-023` (PASS) | fold stepper: previous fold → #stage=claim&fold=2&trial=1 ; report link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 |
| `S04:execute@R-WFO-023` (PASS) | deep dive → S4 → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute#stage=execute&fold=3&trial=1 ; fold stepper: previous fold → #stage=execute&fold=2&trial=1 ; report link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 |
| `S04:freeze@R-WFO-023` (PASS) | deep dive → S3 → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/freeze#stage=freeze&fold=3&trial=1 ; fold stepper: previous fold → #stage=freeze&fold=2&trial=1 ; report link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 |
| `S04:search@R-WFO-023` (PASS) | deep dive → S2 → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/search#stage=search&fold=3&trial=1 ; stage nav ← S1 Split → #stage=split&fold=3&trial=1 ; fold stepper: previous fold → #stage=search&fold=2&trial=1 ; report link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 |
| `S04:split@R-WFO-023` (PASS) | deep dive → S1 → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/split#stage=split&fold=3&trial=1 ; fold stepper: previous fold → #stage=split&fold=2&trial=1 ; report link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 |
| `S04:summary@R-WFO-023` (PASS) | stage tab: split → #stage=split&fold=3&trial=1 ; stage tab: search → #stage=search&fold=3&trial=1 ; stage tab: freeze → #stage=freeze&fold=3&trial=1 ; stage tab: execute → #stage=execute&fold=3&trial=1 ; stage tab: claim → #stage=claim&fold=3&trial=1 ; stage tab: atlas → #stage=atlas&fold=3&trial=1 ; fold stepper: previous fold → #stage=summary&fold=2&trial=1 ; report link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 ; promotion link keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/release-candidate#stage=claim&fold=3&trial=1 ; runs (library) link → /runs ; attempt lineage link → /alphas/delta-rsi-polynomial-alpha/lineage?av=av_delta_rsi_polynomial_alpha_1_0_0 ; reset to θ* → #stage=summary&fold=9&trial=351&params=a74872817bf |
| `S04:summary@R-WFO-027` (PASS) | stage tab: split → #stage=split&fold=2&trial=1 ; stage tab: search → #stage=search&fold=2&trial=1 ; stage tab: freeze → #stage=freeze&fold=2&trial=1 ; stage tab: execute → #stage=execute&fold=2&trial=1 ; stage tab: claim → #stage=claim&fold=2&trial=1 ; stage tab: atlas → #stage=atlas&fold=2&trial=1 ; fold stepper: previous fold → #stage=summary&fold=1&trial=1 ; report link keeps cursor → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/report#stage=claim&fold=2&trial=1 ; promotion link keeps cursor → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/release-candidate#stage=claim&fold=2&trial=1 ; runs (library) link → /runs ; attempt lineage link → /alphas/delta-rsi-polynomial-alpha/lineage?av=av_delta_rsi_polynomial_alpha_1_0_0 ; reset to θ* → #stage=summary&fold=3&trial=2&params=8ea57bdd68814 |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S04:claim@R-WFO-023` (PASS) | Send to Approval Gate: DISABLED (soonrequires a methodology certificate · currently not publi) \| Register for Paper Trading: DISABLED (soon) |

## S05 · S1 Split

- Route: `/research/quantbt/runs/:run/split#stage=split&fold=&trial=` · HiFi: `release-v1.1/QuantBT 05 S1 Split.dc.html` · spec: `release-v1.1/docs/screens/05_s1_split.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/replay`; `/api/v1/quantbt/runs/{run}/current-source/replay/transitions`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/current-source/split`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/search`; `/api/v1/quantbt/runs/{run}/split`; `/api/v1/research/alphas`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/quantbt/atlas`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S05@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S05@FAILED` |
| `S05@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S05@NOT_FOUND` |
| `S05@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S05@QUEUED` |
| `S05@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S05@R-P04-022` |
| `S05@R-WFO-023` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S05@R-WFO-023` |
| `S05@R-WFO-027` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S05@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S05@R-WFO-023` (PASS) | breadcrumb Evidence Flow keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence#stage=split&fold=3&trial=1 ; next stage (search) → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/search#stage=search&fold=3&trial=1 ; window link: IS → S4 window=is → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute#stage=execute&fold=3&trial=1&window=is ; window link: OOS → S4 window=oos → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute#stage=execute&fold=3&trial=1&window=oos ; fold chip F2 → #stage=split&fold=2&trial=1 ; series → hub summary → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence#stage=summary&fold=3&trial=1 ; this alpha's attempts → lineage → /alphas/delta-rsi-polynomial-alpha/lineage |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| all | none: this screen has no control that writes (links to forms create nothing) |

## S06 · S2 Search

- Route: `/research/quantbt/runs/:run/search#stage=search&fold=&trial=&pick=` · HiFi: `release-v1.1/QuantBT 06 S2 Search and Selection.dc.html` · spec: `release-v1.1/docs/screens/06_s2_search.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/current-source/split`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/search`; `/api/v1/quantbt/runs/{run}/split`; `/api/v1/research/alphas`; `/api/v1/research/quantbt/atlas`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S06@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S06@FAILED` |
| `S06@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S06@NOT_FOUND` |
| `S06@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S06@QUEUED` |
| `S06@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S06@R-P04-022` |
| `S06@R-WFO-023` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S06@R-WFO-023` |
| `S06@R-WFO-027` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S06@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S06@R-WFO-023` (PASS) | breadcrumb Evidence Flow keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence#stage=search&fold=3&trial=1 ; prev stage (split) → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/split#stage=split&fold=3&trial=1 ; next stage (freeze) → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/freeze#stage=freeze&fold=3&trial=1 ; Engine Atlas → (mode/schedule, run) → /atlas#tab=modes&mode=mode_1_decay&schedule=gl ; θ* sealed in S3 → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/freeze#stage=freeze&fold=3&trial=1 ; trial chip (second) moves the cursor trial → #stage=search&fold=3&trial=1&pick=1 |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| all | none: this screen has no control that writes (links to forms create nothing) |

## S07 · S3 Freeze

- Route: `/research/quantbt/runs/:run/freeze#stage=freeze&fold=&trial=` · HiFi: `release-v1.1/QuantBT 07 S3 Freeze.dc.html` · spec: `release-v1.1/docs/screens/07_s3_freeze.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/current-source/replay`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/search`; `/api/v1/research/alpha-versions/av_delta_rsi_polynomial_alpha_1_0_0/publication`; `/api/v1/research/alphas`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/datasets/catalog-v2`; `/api/v1/research/quantbt/atlas`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S07@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S07@FAILED` |
| `S07@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S07@NOT_FOUND` |
| `S07@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S07@QUEUED` |
| `S07@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S07@R-P04-022` |
| `S07@R-WFO-023` | PASS | PASS | PASS | PASS | FAIL F-02 | PASS | PASS | PASS | `S07@R-WFO-023` |
| `S07@R-WFO-027` | PASS | PASS | PASS | PASS | FAIL F-02 | PASS | PASS | PASS | `S07@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S07@R-WFO-023` (PASS) | breadcrumb Evidence Flow keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence#stage=freeze&fold=3&trial=1 ; prev stage (search) → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/search#stage=search&fold=3&trial=1 ; next stage (execute) → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute#stage=execute&fold=3&trial=1 ; attempt lineage → → /alphas/delta-rsi-polynomial-alpha/lineage?av=av_delta_rsi_polynomial_alpha_1_0_0&run=rrun_3d5633d2adb712722fe4ba108102aa5d ; propose new attempt → (?from=, a form, writes nothing) → /runs/new?from=rrun_3d5633d2adb712722fe4ba108102aa5d ; child audit → S4 → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute#stage=execute&fold=3&trial=1 |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S07@FAILED` (PASS) | evaluate grid (what-if): not rendered in this state \| create sibling attempt: not rendered in this state \| verify now (POSTs a verification receipt): not rendered in this state |
| `S07@R-P04-022` (PASS) | evaluate grid (what-if): not rendered in this state \| create sibling attempt: not rendered in this state \| verify now (POSTs a verification receipt): enabled |
| `S07@R-WFO-023` (PASS) | evaluate grid (what-if): enabled \| create sibling attempt: DISABLED (move a slider first — the frozen θ* itself is not a fork) \| verify now (POSTs a verification receipt): enabled |
| `S07@R-WFO-027` (PASS) | evaluate grid (what-if): DISABLED (no registered walk-forward declaration to build a grid from) \| create sibling attempt: DISABLED (no registered walk-forward declaration to build a grid from) \| verify now (POSTs a verification receipt): enabled |

## S08 · S4 Execute / Replay

- Route: `/research/quantbt/runs/:run/execute#stage=execute&fold=&trial=&window=` · HiFi: `release-v1.1/QuantBT 08 S4 Execute Replay.dc.html` · spec: `release-v1.1/docs/screens/08_s4_execute.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/current-source/replay`; `/api/v1/quantbt/runs/{run}/current-source/replay/child-audit`; `/api/v1/quantbt/runs/{run}/current-source/replay/transitions`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/current-source/split`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/final-audit`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/replay/observations`; `/api/v1/quantbt/runs/{run}/report`; `/api/v1/quantbt/runs/{run}/split`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S08@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S08@FAILED` |
| `S08@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S08@NOT_FOUND` |
| `S08@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S08@QUEUED` |
| `S08@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S08@R-P04-022` |
| `S08@R-WFO-023` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S08@R-WFO-023` |
| `S08@R-WFO-027` | PASS | PASS | FAIL F-06 | PASS | PASS | PASS | PASS | PASS | `S08@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S08@R-WFO-023` (PASS) | breadcrumb Evidence Flow keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence#stage=execute&fold=3&trial=1 ; prev stage (freeze) → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/freeze#stage=freeze&fold=3&trial=1 ; next: Run Report → keeps cursor → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report#stage=claim&fold=3&trial=1 ; window switch: OOS (after IS) → #stage=execute&fold=3&trial=1&window=oos ; window switch: IS → #stage=execute&fold=3&trial=1&window=is ; fold stepper: next fold (OOS window) → #stage=execute&fold=4&trial=1 ; fold chip F1 → #stage=execute&fold=1&trial=1 ; Split ↗ → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/split#stage=split&fold=3&trial=1 |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S08@FAILED` (PASS) | holdout window (disabled, reason in title): not rendered in this state |
| `S08@R-WFO-023` (PASS) | holdout window (disabled, reason in title): DISABLED (This run has no holdout window.) |

## S09 · Run Report

- Route: `/research/quantbt/runs/:run/report` · HiFi: `release-v1.1/QuantBT 09 Run Report.dc.html` · spec: `release-v1.1/docs/screens/09_run_report.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/replay`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/final-audit`; `/api/v1/quantbt/runs/{run}/release-candidate`; `/api/v1/quantbt/runs/{run}/report`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/release-candidates/{rc}/publication`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S09@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S09@FAILED` |
| `S09@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S09@NOT_FOUND` |
| `S09@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S09@QUEUED` |
| `S09@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | FAIL F-03 | PASS | `S09@R-P04-022` |
| `S09@R-WFO-023` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S09@R-WFO-023` |
| `S09@R-WFO-027` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S09@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S09@R-WFO-023` (PASS) | ← Hub → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence ; ← Execute → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute ; Release → → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/release-candidate ; Lineage → /alphas/delta-rsi-polynomial-alpha/lineage?av=av_delta_rsi_polynomial_alpha_1_0_0&run=rrun_3d5633d2adb712722fe4ba108102aa5d |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S09@FAILED` (PASS) | Export JSON: not rendered in this state \| Export CSV: not rendered in this state \| Read audit again (linked final audit panel; write-capable, not clicked): not rendered in this state \| Run pinned audit (linked final audit panel; write-capable, not clicked): not rendered in this state \| Print (window.print, not a write; not clicked): enabled |
| `S09@NOT_FOUND` (PASS) | Export JSON: not rendered in this state \| Export CSV: not rendered in this state \| Read audit again (linked final audit panel; write-capable, not clicked): not rendered in this state \| Run pinned audit (linked final audit panel; write-capable, not clicked): not rendered in this state \| Print (window.print, not a write; not clicked): not rendered in this state |
| `S09@R-P04-022` (PASS) | Export JSON: enabled \| Export CSV: enabled \| Read audit again (linked final audit panel; write-capable, not clicked): enabled \| Run pinned audit (linked final audit panel; write-capable, not clicked): not rendered in this state \| Print (window.print, not a write; not clicked): enabled |
| `S09@R-WFO-023` (PASS) | Export JSON: enabled \| Export CSV: enabled \| Read audit again (linked final audit panel; write-capable, not clicked): enabled \| Run pinned audit (linked final audit panel; write-capable, not clicked): enabled \| Print (window.print, not a write; not clicked): enabled |

## S10 · Attempt Lineage

- Route: `/research/quantbt/alphas/:alpha/lineage?av=&run=` · HiFi: `release-v1.1/QuantBT 10 Attempt Lineage.dc.html` · spec: `release-v1.1/docs/screens/10_attempt_lineage.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/final-audit`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/release-candidate`; `/api/v1/quantbt/runs/{run}/report`; `/api/v1/research/alpha-versions/av_delta_rsi_polynomial_alpha_1_0_0/publication`; `/api/v1/research/alphas`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/compare`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/datasets/catalog-v2`; `/api/v1/research/quantbt/atlas`; `/api/v1/research/release-candidates/{rc}/publication`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S10@R-WFO-023` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S10@R-WFO-023` |
| `S10@R-WFO-027` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S10@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S10@R-WFO-023` (PASS) | Library → /runs?group=1&alpha=delta-rsi-polynomial-alpha ; New run → /runs/new?alpha=delta-rsi-polynomial-alpha&av=av_delta_rsi_polynomial_alpha_1_0_0 ; Compare → /alphas/delta-rsi-polynomial-alpha/compare ; Import version → /alpha-import?alpha=delta-rsi-polynomial-alpha ; Open run in Evidence → /runs/rrun_9c3f208114d4b4994e8cd2601f5ae04d/evidence ; rc chip → S11 → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/release-candidate ; action: Report → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report ; action: Freeze → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/freeze ; action: Clone (?from=, a form) → /runs/new?from=rrun_3d5633d2adb712722fe4ba108102aa5d |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S10@R-WFO-023` (PASS) | Clone / Declare in New run (links to a form, create nothing): enabled |

## S11 · Release candidate

- Route: `/research/quantbt/runs/:run/release-candidate` · HiFi: `release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html` · spec: `release-v1.1/docs/screens/11_release_candidate.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/current-source/freeze`; `/api/v1/quantbt/runs/{run}/current-source/replay`; `/api/v1/quantbt/runs/{run}/current-source/search`; `/api/v1/quantbt/runs/{run}/current-source/split`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/execute/replay`; `/api/v1/quantbt/runs/{run}/final-audit`; `/api/v1/quantbt/runs/{run}/freeze`; `/api/v1/quantbt/runs/{run}/release-candidate`; `/api/v1/quantbt/runs/{run}/report`; `/api/v1/quantbt/runs/{run}/split`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/compare`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/quantbt/atlas`; `/api/v1/research/release-candidates/{rc}/publication`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S11@FAILED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S11@FAILED` |
| `S11@NOT_FOUND` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S11@NOT_FOUND` |
| `S11@QUEUED` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S11@QUEUED` |
| `S11@R-P04-022` | PASS | NA | PASS | PASS | NA | PASS | PASS | PASS | `S11@R-P04-022` |
| `S11@R-WFO-023` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S11@R-WFO-023` |
| `S11@R-WFO-027` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S11@R-WFO-027` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S11@R-WFO-023` (PASS) | Evidence → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/evidence ; Report → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/report ; Lineage → /alphas/delta-rsi-polynomial-alpha/lineage?av=av_delta_rsi_polynomial_alpha_1_0_0&attempt=ratt_3d5633d2adb712722fe4ba108102aa5d&run=rrun_3d5633d2adb712722fe4ba108102aa5d ; Engine Atlas → /atlas ; evidence pack: Freeze & integrity → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/freeze ; evidence pack: Replay → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/execute ; evidence pack: Split & chronology → /runs/rrun_3d5633d2adb712722fe4ba108102aa5d/split ; Compare → /alphas/delta-rsi-polynomial-alpha/compare |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S11@FAILED` (PASS) | Read audit again (linked final audit panel; write-capable, not clicked): not rendered in this state \| Run pinned audit (linked final audit panel; write-capable, not clicked): not rendered in this state \| Publish (POST publish): not rendered in this state \| Seal / Prepare local RC: not rendered in this state \| copy yaml (clipboard only): not rendered in this state |
| `S11@R-P04-022` (PASS) | Read audit again (linked final audit panel; write-capable, not clicked): enabled \| Run pinned audit (linked final audit panel; write-capable, not clicked): not rendered in this state \| Publish (POST publish): not rendered in this state \| Seal / Prepare local RC: DISABLED (Local seal evidence pack. Sealing freezes this exact combina) \| copy yaml (clipboard only): enabled |
| `S11@R-WFO-023` (PASS) | Read audit again (linked final audit panel; write-capable, not clicked): enabled \| Run pinned audit (linked final audit panel; write-capable, not clicked): enabled \| Publish (POST publish): DISABLED (Publish rc_06GFFDG3SA17Y5WPBN58NFM5B2. Separation of duties:) \| Seal / Prepare local RC: not rendered in this state \| copy yaml (clipboard only): enabled |
| `S11@R-WFO-027` (PASS) | Read audit again (linked final audit panel; write-capable, not clicked): enabled \| Run pinned audit (linked final audit panel; write-capable, not clicked): not rendered in this state \| Publish (POST publish): not rendered in this state \| Seal / Prepare local RC: not rendered in this state \| copy yaml (clipboard only): enabled |

## S12 · Engine Atlas (3 tabs)

- Route: `/research/quantbt/atlas#tab=modes|routes|claims` · HiFi: `release-v1.1/QuantBT 12 Mode Atlas.dc.html` · spec: `release-v1.1/docs/screens/12_engine_atlas.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/research/alphas`; `/api/v1/research/datasets/catalog-v2`; `/api/v1/research/journey`; `/api/v1/research/quantbt/atlas`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S12:claims@-` | PASS | NA | PASS | PASS | PASS | PASS | PASS | PASS | `S12:claims@-` |
| `S12:modes@-` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S12:modes@-` |
| `S12:routes@-` | PASS | NA | PASS | PASS | PASS | PASS | PASS | PASS | `S12:routes@-` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S12:modes@-` (PASS) | tab: Execution routes → #tab=routes ; tab: Claims by contract → #tab=claims ; tab: WFO modes → #tab=modes ; Declare a run in <mode> → New Run ?mode= → /runs/new?step=optimization&mode=mode_1_decay&schedule=global ; Runs of <mode> → Library ?mode= → /runs?mode=mode_1_decay ; Journey → /journey ; Library → /runs ; New run → /runs/new?step=route |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| all | none: this screen has no control that writes (links to forms create nothing) |

## S13 · Compare (3 modes + pair with runs)

- Route: `/research/quantbt/alphas/:alpha/compare[?mode=markets|pair[&runs=a,b]]` · HiFi: `release-v1.1/QuantBT 13 Compare.dc.html` · spec: `release-v1.1/docs/screens/13_compare.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/quantbt/runs/{run}/current-source/evidence`; `/api/v1/quantbt/runs/{run}/evidence`; `/api/v1/quantbt/runs/{run}/final-audit`; `/api/v1/quantbt/runs/{run}/release-candidate`; `/api/v1/quantbt/runs/{run}/report`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/compare`; `/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage`; `/api/v1/research/release-candidates/{rc}/publication`; `/api/v1/research/runs/{run}/progress`; `/api/v1/research/runs/{run}/requested-spec`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S13:attempts@-` | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | `S13:attempts@-` |
| `S13:markets@-` | PASS | NA | PASS | PASS | PASS | PASS | PASS | PASS | `S13:markets@-` |
| `S13:pair-runs@-` | PASS | NA | PASS | PASS | PASS | PASS | FAIL F-03 | PASS | `S13:pair-runs@-` |
| `S13:pair@-` | PASS | NA | PASS | PASS | PASS | PASS | PASS | PASS | `S13:pair@-` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S13:attempts@-` (PASS) | tab: Markets → ?mode=markets ; tab: Pair → ?mode=pair ; tab: Attempts → ?mode=attempts ; Library → /runs?group=1&alpha=delta-rsi-polynomial-alpha ; Lineage → → /alphas/delta-rsi-polynomial-alpha/lineage ; run link → evidence → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/evidence ; Run report link → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/report ; Release candidate link → /runs/rrun_686af4b1d64472591b6a64a1db1233a3/release-candidate |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| all | none: this screen has no control that writes (links to forms create nothing) |

## S14 · Alpha Import

- Route: `/research/quantbt/alpha-import` · HiFi: `release-v1.1/QuantBT 14 Alpha Import.dc.html` · spec: `release-v1.1/docs/screens/14_alpha_import.md`
- Data source (GETs observed by the cell, run id elided): `/api/v1/research/alpha-versions/av_delta_rsi_polynomial_alpha_1_0_0/publication`; `/api/v1/research/alpha-versions/av_p24_journey_alpha_0_1_0/publication`; `/api/v1/research/alphas`; `/api/v1/research/alphas/p24-journey-alpha/lineage`; `/api/v1/research/datasets/catalog-v2`; `/api/v1/research/journey`; `/api/v1/research/quantbt/atlas`

| cell | states | nav | refresh | deep link | print | responsive | a11y | console | evidence id |
|---|---|---|---|---|---|---|---|---|---|
| `S14@-` | PASS | PASS | FAIL F-05 | PASS | FAIL F-02 | PASS | PASS | PASS | `S14@-` |

Controls exercised (control → landing, from the receipt `nav` evidence; first full cell shown per variant):

| cell | control → landing |
|---|---|
| `S14@-` (PASS) | Journey → /journey ; New run → → /runs/new ; registry strip (step 3): Library → /runs ; registry strip (step 3): lineage → → /alphas/p24-journey-alpha/lineage?av=av_p24_journey_alpha_0_1_0 ; registry strip (step 3): run → → /runs/new?alpha=p24-journey-alpha&av=av_p24_journey_alpha_0_1_0 |

Write controls (enumerated, **NOT_RUN_WRITE**, never clicked):

| cell | enumeration (control: state in this cell) |
|---|---|
| `S14@-` (PASS) | Parse (POST parse) · step 1: DISABLED (Add a file or paste code.) \| Run gates (POST gates) · step 2: DISABLED (Parse first.) \| Register draft (POST register) · step 3: DISABLED (Run gates first.) |

## Write-control receipt status

| screen | write controls | receipt status |
|---|---|---|
| S11 | see section | Publish: **real P22 publish of R-WFO-027** exists — `evidence/P22/README.md`, `evidence/P22/real-preview-receipt.json` (cited, not re-proved; here it is only asserted present/disabled-with-reason). Seal/Prepare: P22 same packet. |
| S09 | see section | Export JSON/CSV: prepare-then-download landed in `f0346ef8` (`evidence/FE-W1-W5/thanhvuong-frontend-receipt.md`); no browser export receipt is cited here → NOT_RUN_WRITE. Linked audit buttons (Codex): NOT_RUN_WRITE. |
| S02 | see section | Create run: `evidence/G10_WRITABLE_PREVIEW_RECEIPT_CLAUDE_2026-09-30.md` / `OL23_PREVIEW_RECEIPT_CLAUDE_2026-09-26.md` (earlier writable-preview receipts, not re-verified on this bundle) → NOT_RUN_WRITE here. |
| S14 | see section | Parse / gates / register: `evidence/P10/E17_IMPORTED_DRAFT_EXECUTION_BACKEND_RECEIPT_2026-09-27.md` (backend); browser write path NOT_RUN_WRITE here. |
| S07 | see section | evaluate grid / create sibling attempt / verify now: NOT_RUN_WRITE (no existing browser receipt cited). |
| S03 | see section | Cancel / Retry: absent on COMPLETED runs, not rendered on FAILED/QUEUED in this stack; NOT_RUN_WRITE. |
| S04 | see section | Send to Approval Gate / Register for Paper Trading (S5 Claim): NOT_RUN_WRITE. |

Every other write control not named above (S08 holdout is a disabled window chip, not a write) has status `NOT_RUN_WRITE`.

## Findings (src/ defects; none edited, per instruction)

| id | sev | where | what | evidence |
|---|---|---|---|---|
| F-01 | Low | S03 ("Copy link" icon button), S04 all 7 stage cells ("copy evidence link") | `[data-action=copy-link]` is visible in print (no `.no-print`) on both full runs | `print` rows of S03@*, S04:*@* |
| F-02 | Med | S02 "Start over"; S04 claim "Send to Approval Gate", "Register for Paper Trading"; S07 "evaluate grid", "create sibling attempt →", "verify now"; S14 "Parse" (disabled) | write-named controls print on paper (QA D4 carry-over, still open on these screens; S09/S11/S10 incl. the new linked-audit buttons are clean) | `print` rows of S02, S04:claim@*, S07@*, S14 |
| F-03 | Med | S02 (`span[data-route-status=DEFAULT]` 4.4:1 at 1440 and 390); S03 (`span[data-ledger-objective]` 4.4:1 ×2 at 1440 and 390; `div[data-stage-ledger]` scrollable-region-focusable at 390 on R-WFO-027) | axe serious, state reached after the cell action (fold 2 selected on S03) | `a11y` rows S02, S03@* |
| F-04 | Med | S04 claim tab (`tr[data-window-row=IS]` 3.68:1, both widths; R-WFO-027 also `section[data-window-disclosure-panel]` scrollable-region-focusable); S09 on R-P04-022 (`.rr-eq-legend` aria-hidden-focus; `span[data-window-legend=is]` 3.68:1); S13 pair with runs at 390 (`.cp-deltacard > .cp-scroll` scrollable-region-focusable ×2) | axe serious, not hit on the W5 gate cells because they use other runs/states | `a11y` rows of S04:claim@*, S09@R-P04-022, S13:pair-runs |
| F-05 | Low | S14 | the wizard step (Source / Gates / Register) is not in the URL: reload and cold open return to step 1 | `refresh` row of S14 |
| F-06 | Low | S08 on R-WFO-027 (R-WFO-023 intermittent) | after a fold-chip change the selected transition row differs after reload (seq is not in the hash until a transition is chosen) | `refresh` row of S08@R-WFO-027 |
| F-07 | Low | S04, S08, S09, S10, S11, S13 on R-WFO-027 and R-P04-022 | the new linked-audit panel reads `GET /api/v1/quantbt/runs/{run}/final-audit`; a run whose audit is not reusable answers a typed **409**, which Chrome logs as a red console error (same class as QA D6). Allow-listed in the spec as documented-expected; a quiet typed result would remove it | `console` rows with "documented expected 4xx" |

Stale-bundle note: rows measured before the 04:14Z rebuild were discarded; the first full run on the new bundle also showed one transient 504 / `ERR_CONNECTION_RESET` set during the restart on S11@R-WFO-023 (re-measured, PASS).

## Already-proved elsewhere (cited, not re-proved)

- W5 gate (axe matrix 15 screens × 2 runs × 2 widths × 2 themes, charts, cursor): `apps/portal/frontend/e2e/_preview-research-w5.spec.ts`; closure packet gate 228/228 — `upgrade/research_loop/evidence/FE-W1-W5/README.md`, `thanhvuong-test-results.json`, `thanhvuong-frontend-receipt.md`.
- Print, browser walk-through, flows, touch, compare Markets/Pair, Operations Dark: `/home/bobby/portal-research-qa-2026-10-03/REPORT.md` (D1–D12, T-D1–T-D13). This matrix re-measured print only for the **Research Light** theme on the current bundle; Operations Dark print (T-D1/T-D2) was **not** re-run.
- Real publish R-WFO-027: `evidence/P22/README.md`.

## Gaps (marked, not claimed)

1. `denied` and `stale` states: no such run/seal on the preview; not covered by a browser cell.
2. Operations Dark theme, mobile print, real print dialog: not measured here (QA REPORT covers them on the earlier bundle).
3. Chart keyboard/touch and visual diff against HiFi pixels are not part of this matrix (W5 gate and visual baseline own them).
4. Clicking any write control (Seal, Publish, Export, Create run, Register, Cancel, Retry, Verify now, linked audit): NOT_RUN_WRITE by instruction.
5. S09 Print button and chart zoom/transport controls were enumerated but not exercised (local state, no URL).
