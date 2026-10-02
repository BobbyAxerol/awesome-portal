# DOCS_B audit — S09 Run Report, S10 Attempt Lineage (2026-10-02, read-only)

Code: worktree HEAD b965741e (last frontend commit 3a1378bf, 15:57Z). Preview :8095 `Last-Modified 16:11:27Z` (after 3a1378bf; later commits are test/docs only). Parity confirmed by string probe of the served chunks: `ReportRoute-D2J8TsSd.js` contains `PER_FOLD_SELECTION_APPLIES_TO_OWN_OOS`, `PER_FOLD_PARAMETER_SELECTIONS`, `score_basis` (commit 3a1378bf); `LineageRoute-DCdkqjeq.js` contains `OUTER_FOLD_SELECTED_OOS_MEAN`, `selected_params_digest`, `REPRODUCE_EXISTING`. => preview serves HEAD-equivalent frontend code. Only GETs were issued (NONGET watcher: 0 mutations). Server-side console noise: S09 of a run without a report logs a 404 (and Hub/Execute of a cancelled run log 409s).
Screenshots: `/home/bobby/portal-research-qa-2026-10-02/audit-final/DOCS_B/S09/` and `/S10/` (PDFs Letter+A4 for 4 runs: `S09/30-*-print-*.pdf`; print-media captures `31-*`; HiFi renders `60-hifi-h09.png`, `S10/60-hifi-h10.png` via a local static server with an empty `doc-page.js` shim).
All paths below `R/` = `apps/portal/frontend/src/research/`.

## S09 Run Report

| row | claim | status | evidence | note |
|---|---|---|---|---|
| 09-03 | fold marks raw `fold_id` | DONE (ledger STALE) | R/ReportDetail.tsx:800,1127,1171,1227 `foldLabel`; S09/20-w23-desktop-slice01 shows `fold_01..09` | |
| 09-05 | Δ decay red + DRAG row tint | DONE (STALE) | R/ReportDetail.tsx:233,237,246,1183-1186; slice02: pink DRAG rows, red decay | |
| 09-04 | OOS Sharpe coloured by sign | DONE (STALE) | R/ReportDetail.tsx:683 `SIGNED_HEADLINE` = NET_RETURN, MAX_DRAWDOWN, FUNDING only; Sharpe tile is ink | return/drawdown still green/red (HiFi H09 also colours them) |
| 09-02 | meta raw tokens | OPEN (TEXT P3) | w23 header: `report revision p18r1_45e0…· research.report-presentation.v1 · source profile RS02_RETAINED_CURRENT_SOURCE` (S09/20-w23-desktop-slice00) | HiFi meta is "generated … · from immutable artifacts · engine version"; tokens belong in a title |
| AN-20/21 | metrics grid reads v2 all-time; P04 OOS Sharpe lights | DONE | w23 tile "ALL-TIME OOS SHARPE 4.337"; 22 v2 rows in Metrics; p21 0.744 / decay −1.082 / win 44.44% (slice00/01) | old seals w17/w20 now carry the supplemental block (operator backfill) — QA#7/#8 LEDGER_STALE |
| CG-FG-S09-02 | equity series digest caption | DONE (new seals) | R/ReportDetail.tsx:861-869; w23 slice01 "series sha256:858a5cd71095… · full stitched source series" | P04 p21 has no digest caption (series 25 of 744, sampled) — not checked as absent-with-code |
| G5b | print Letter/A4 on real data | PARTIAL | PDFs produced read-only: w23 Letter 6 pp / A4 7 pp, p21 5/5, p20f(failed) 2/1, w19c(cancelled) 1/1 (S09/30-*.pdf); print-media capture S09/31-w23-printmedia-816.png legible, grid ok | I could not rasterise PDFs (no pdftoppm); page counts from PDF objects. Bobby to eyeball the 6/7-page w23 sheet. **Unsealed run prints a blank sheet** (see N-09) |
| HiFi 09 doc-page.js | missing, blank render | OPEN (Bobby) | `release-v1.1/` still has no doc-page.js; H09 line 15 loads it; renders blank without a shim | with shim: HiFi has Params column (prm_… per fold), cert grade card, 4 tiles; ours has none of Params column (same global θ on WFO-global; causal run w27 shows own-fold params elsewhere) |
| D8 | legend "IS account" vs absence | DONE | w23: legend "Account before the first OOS window", subtitle "before OOS 261 points · OOS 598 of 1488 points"; p21 still prints `IS account — P04_SOURCE_DID_NOT_PUBLISH_IS_EQUITY_SERIES` (slice01), coherent with typed absence | |
| D2 | printed evidence link 404 | DONE | R/ReportDetail.tsx:1432-1448; slice03 prints full `http://localhost:8095/research/quantbt/runs/rrun_…/report?report_revision=…` | prints the *report* URL labelled "evidence link" |
| 'DENIED' vs unsealed | PARTIAL, needs LW-02 | PARTIAL (confirmed) | R/ReportDetail.tsx:1657-1680 `reportNoticeState` + 1705 `useRunVisibility`; reportClient.ts:371 still maps 404 -> denied. Live cancelled R-WFO-019 / queued R-WFO-025: "EMPTY — No sealed report is available for this run" (S09/10-w19c-report-desktop-full.png) | distinct from denied: yes. Still a second Library request + console 404. Run status (CANCELLED/QUEUED) only in collapsed `details` ("run status CANCELLED · report read answered 404 …") |
| crumb/title run label | DONE | topbar "R-WFO-019 / Run Report", `<title>` "Backtest Evidence Report — R-WFO-019" (all 10 runs) | |
| VD-TEXT-01 (S09) | footer "rules of this screen" removed | DONE | no rules footer on any capture | |
| LANE-04 | notice PARTIAL names count | DONE | R/reportClient.ts:391-408; "Partial — not published: 1 of 7 headline values · 4 of 10 artifact digests · 1 of 6 passport facts" | |
| QA #1-#47 groups | typed absences | mostly LEGIT, see ledger corrections | #7 #13 #24 #32 #35 #42 LEDGER_STALE (w17/w20/w23 now render supplemental, histogram, sampling count); #11 (benchmark return `available` with null) not visible on p21 now (row says "not published"); #16 per-fold empty card still drawn on p21 ("per-fold rows — not applicable … verdict rule not published") = OPEN UX; #47 console 404 = OPEN (needs LW-02); #10 hide "IS minus OOS Sharpe" row: OPEN (w23 row still prints `not applicable PORTAL_ANALYTICS_IS_OR_OOS_SHARPE_UNAVAILABLE`) | |
| F7 deviations | warn ink #8f6118, faint ink, grey chips | DONE (as approved) | S09 mono labels legible; no contrast flags | not re-measured with axe here |

## S10 Attempt Lineage

| row | claim | status | evidence | note |
|---|---|---|---|---|
| FG 10-11 / D3 | `sid()` bypasses run-label registry | DONE (STALE) | R/LineageDetail.tsx:645 `runLabelOrShortId`; S10/10-lineage-desktop: `ratt_9c3f2081 · R-P04-001` | pick/ATTEMPTS chips still print raw `ratt_9c3f2081` (HiFi: `att_03`) — fine, HiFi order |
| CG-FG-S10-01 | digest in param-set slot | DONE (code), UNVERIFIED live | R/LineageDetail.tsx:1186-1188 `selected_trial_id` / `selected_params_digest` with availability; live: no pick published ("no promotion pick published P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK") | branch with a pick only fixture-tested |
| CG-FG-S10-02 / VD-F1-02 | FAILED chip ACTIVE; remove chip | DONE | R/LineageDetail.tsx:260 `lineageStatus` = attempt state only; 253 filter labels "version active…"; live: FAILED/READY pills, lifecycle only in band header "av_1_0_0 · ACTIVE" (S10/10-lineage-desktop-slice00) | filter chips still lifecycle-based, per decision |
| 10-29 | tree-empty copy | PARTIAL | R/LineageDetail.tsx:1696-1706 "No attempt matches." + clear filters | does not name the probe toggle; has an exit |
| 10-17/21 | spec-line raw enums | PARTIAL | R/LineageDetail.tsx:1470-1476 fallback `${intent_kind} · space …` raw | live cards use label path, fallback not seen |
| 10-28 | counter / mergeOlder | OPEN (unchanged) | R/LineageDetail.tsx:278 `counterText`; useLineage.ts:101 `mergeOlder` | counts panel says probes 47 / storied 2 while band says "+46 probes", "showing 3 of 49" (see N-12) |
| D3 walk b | CLONE hidden behind probes | DONE | R/LineageDetail.tsx:178-186 `isTracedChild`; live R-P04-019 visible by default | |
| G7 S10 | dimmed rows via opacity | DONE (code) | R/LineageDetail.tsx:480-481 colour `--ink-soft`, no opacity; opacity left only on disabled controls (462,565) | no ABANDONED data on preview (0 abandoned) -> not seen live |
| CG-FG-S10-03/VD-FG-05-05 | claim.family, pick states | DONE/BLOCKED | label `OUTER_FOLD_SELECTED_OOS_MEAN` present in chunk; "decay 1.741 (selected trial, mean of folds)" visible | pick states need a published pick (backend) |
| VD-FG-01-19/20/22 | extra links, default selection, notice vs pick | DECISION_PENDING | default view shows only 3 of 49 attempts: R-P04-001 (FAILED, oldest), R-P04-019, R-WFO-023; newest five (R-WFO-024..027, R-P04-021/022) hidden in "+46 probes" | see N-01 |
| VD-FG-01-17 | shell crumb depth S10 | OPEN | topbar on S10 is `Research / QuantBT Backtest` only (S10/10-lineage-desktop-slice00); page has its own `Runs / Attempt Lineage — …` crumb | |
| HiFi 10 | parity | PARTIAL | H10 render (S10/60-hifi-h10.png): depth-indented tree, diff line per card ("optimization_schedule: global → per_fold_causal"), quote line; ours: flat rail, no per-card diff, a mix of text blocks removed by VD-TEXT-01/VD-F1-02 | approved deviations; per-card semantic-diff line absent = HIFI P3 |
| F2b/E1 | S10 title label | DONE | `<title>` "QuantBT — Attempt Lineage" (no alpha; HiFi same) | |

## Navigation / cursor flows (actual clicks, goBack/goForward)

| step | action | result | fwd link | back | cursor kept | verdict | shot |
|---|---|---|---|---|---|---|---|
| 1 | S09 w23 loaded with `#stage=claim&fold=4&trial=350` | bar hrefs carry `fold=4&trial=350` | Hub, Execute, RC, Lineage | — | yes | OK | S09/10-w23-report-desktop-full |
| 2 | click Hub, goBack | `/evidence#stage=claim&fold=4&trial=350`, Back returns to report with hash | yes | yes | yes | OK | S09/40 |
| 3 | click Execute, goBack | `/execute#stage=execute&fold=4&trial=350` | yes | yes | yes | OK | |
| 4 | click Release Candidate, goBack | RC has no cursor in href; report hash restored on Back | yes | yes | n/a (RC has none) | OK | S09/41 |
| 5 | click Attempt lineage, goBack, goForward | `lineage?av=…` (no `attempt=`) so lineage opens on its default attempt, not this run's | yes | yes | no (S10 has no evidence cursor) | ISSUE (N-04) | S09/42 |
| 6 | cancelled R-WFO-019 report: Hub link | Hub shows "not read" everywhere + banner, 409 in console | Hub, Execute only | — | | ISSUE (N-02) | S09/44,45 |
| 7 | S10 select 4th node | URL `?attempt=ratt_5bc5…` written | | | yes | OK | S10/21 |
| 8 | S10 -> open evidence -> Back / Forward / Back | evidence `#stage=summary&fold=1`; Back restores `?attempt=` selection and the revealed probes | | | yes | OK | S10/22,23 |
| 9 | S10 unknown alpha `/alphas/does-not-exist/lineage` | "DENIED — You don't have access … or it doesn't exist" (F-04), but empty SELECTED ATTEMPT / DIFF / PROMOTION / COUNTS frames drawn under it | Runs crumb | | | ISSUE P3 (N-08) | S10/32 |
| 10 | S10 `?attempt=ratt_nonexistent` | honest notice "Attempt … was not returned for this alpha — showing R-WFO-023 instead" | | | | OK | S10/33 |
| 11 | S10 FAILED attempt selected | `run report` disabled, but `freeze` and `release candidate` links enabled; RC of a failed run opens "PARTIAL … seal stays blocked" | | | | ISSUE (N-05) | S10/30,31 |

## Rubric verdicts

S09 Run Report. (1) clear sources: PASS on sealed runs; ISSUE N-03 (two different "net OOS return" on p21). (2) HiFi/UI: mostly; Params column and cert grade absent (data). (3) one next step: PASS on sealed (RC link); FAIL on unsealed/failed/cancelled (no Progress/Library/New Run exit; N-02). (4) links: Hub/Execute/RC/Lineage with cursor; no Progress, Library, Compare, New Run. (5) lifecycle: empty/failed/partial/old-seal distinct (good); cancelled vs queued vs "not yet sealed" not named on the face; no print sensible for unsealed. (6) all-time: PASS (all-time block, daily histogram, drawdown episodes). (7) charts: draw-in/hover not exercised by me beyond static; reduced-motion not tested. (8) mobile 390: no horizontal page scroll on all 10 runs; tables clipped inside scroll regions (tab-stop present, no visual affordance); equity chart labels collide; touch targets 13-18 px. Keyboard focus visible everywhere. (9) hard-coded text: low; "is plus oos" scope tokens leak.
S10 Attempt Lineage. (1) PASS except 47-vs-46 counts. (2) approved deviations. (3) default view hides the newest runs (N-01) = UX. (4) links to Runs/New Run/RC/Compare/Import/Evidence/Report/Freeze/Clone present; selection and probe state survive Back/Forward. (5) denied/unknown-attempt/not-published distinct. (8) 390: page no overflow; but compact probe row clips chip+date (overflow r=485/580), 33 targets under 24 px; focus visible, 30+ tab stops fine. (9) "cert not published" repeated per card; `PORTAL_PERSISTED_RESEARCH` raw token in header.

## Ledger corrections (STALE / WRONG)

- B1 S09 rows 09-03, 09-04, 09-05, CG-FG-S09-02, AN-20/21, D8, D2: now DONE (see above). B1 S10 FG 10-11, G7 S10, D3 walk b: DONE. B1 "G5b OPEN (NOT_RUN)" -> PARTIAL (PDFs exist; visual review pending).
- FRONTEND_GAPS §8 "S09 DENIED PARTIAL needs LW-02": CONFIRMED PARTIAL (second Library request at R/ReportDetail.tsx:1705).
- QA inventory S09 #7, #13, #24, #32, #35, #42 and S10 "promotion state"/"rc & publish header dead link" (row 582): header link is live (rc & publish -> R-WFO-023 RC); inventory row LEDGER_STALE. "UI should print one chip instead of 44 cert chips": still per card (OPEN TEXT).
- §8 "S10 DONE (VD-F1-02) 176 -> 55 words": not re-counted; visible text on default view is still dense (Counts panel, EXERCISED/UNTRIED lists).
- HiFi 09 doc-page.js: OPEN (Bobby).

## New gaps

| id | sev | class | gap | where |
|---|---|---|---|---|
| N-01 | P1 | UX | S10 default view lists 3 of 49 attempts: oldest FAILED R-P04-001, R-P04-019, R-WFO-023. The five newest runs (R-WFO-024..027, R-P04-021/022), including the causal run, appear only after "+46 probes". A reader landing from S09 of R-WFO-027 sees another run selected. Better: default to newest N or always reveal the attempt the reader came from. | R/LineageDetail.tsx:82 (default selection rule), 2368 |
| N-02 | P1 | UX | S09 for a cancelled/queued/unsealed run: face says only "EMPTY — No sealed report is available" with `Print`; the run state is hidden in collapsed details; cert box says "not read"; the only exits are Hub (which then shows "not read" x9 + 409) and Execute replay. No link to Run Progress, Run Library, New Run. Failed sheet (p20f) also lacks Progress/New Run although it says "submit a new attempt". | R/ReportDetail.tsx:474-549 (`NoPrintBar`), 1657-1680 |
| N-03 | P1 | DATA/BUG | p21 prints two net OOS returns with opposite signs: headline "NET OOS RETURN +0.12%" (+ metrics row "Net OOS return +0.12%", engine direct) vs metrics row "OOS net return −0.15%" (source derived) and all-time "RETURN −0.15%". No note says which path each comes from. Rubric 1. | S09/20-p21-desktop-slice00,01,02 |
| N-04 | P2 | UX | S09 "Attempt lineage" link carries `?av=` only, not `?attempt=`; S09 knows the run, so lineage should open selected on that run's attempt. | R/ReportDetail.tsx:519-525 |
| N-05 | P2 | UX | S10 FAILED attempt keeps "freeze" and "release candidate" links enabled (lands on S11 partial/blocked); S09 hides the RC link when there is no claim, S10 does not. | R/LineageDetail.tsx (selected panel links) |
| N-06 | P2 | UX/A11Y | Mobile 390: S09 Metrics and Per-fold tables are clipped to 4 columns inside a scroll region (keyboard tab stop exists) with no visible affordance; equity chart fold labels and x dates overlap and the legend is cut ("ccount before…"); drawdown-episode table wraps "−0.47 / %" and dates (also on desktop: narrow column, known leftover). | S09/20-w23-mobile-slice02,04; desktop slice03 |
| N-07 | P2 | A11Y | Touch/pointer targets < 24 px: S09 nav links 18 px, chart zoom buttons 19x17, "Release candidate →" 13 px; S10 33 controls 13-19 px (filter chips 18 px, node chips). S10 compact probe row on 390 clips cert chip and date (overflow right). | measured via bounding boxes |
| N-08 | P3 | UX | S10 unknown/denied alpha draws empty frames (SELECTED ATTEMPT, DIFF, PROMOTION RULE, COUNTS) under the DENIED panel, plus console 404. | S10/32 |
| N-09 | P2 | UX | Print of an unsealed run: Print button is offered and prints a header + "CERTIFICATION not read" on a blank page (screen notice is `no-print`). Hide Print or print the notice. | S09/31-w19c-printmedia-816.png; R/ReportDetail.tsx:531 |
| N-10 | P3 | TEXT | Raw tokens: scope "is plus oos" in tiles/table; `research.report-presentation.v1`/`RS02_RETAINED_CURRENT_SOURCE` in meta line; `PORTAL_PERSISTED_RESEARCH` S10 header; per-card "cert not published" x N; Counts panel jargon ("technical retries (not attempts)"). | |
| N-11 | P3 | UX | Metrics units: "max drawdown duration · days 17.38" unit "count"; "episode average hold · seconds 187,875" raw seconds (≈52 h) while the supplemental block shows "17 d 9 h". | S09/20-w23-desktop-slice01 |
| N-12 | P3 | DATA | S10 band "+46 probes" / "showing 3 of 49" vs Counts "storied 2 · probes 47": FE promotes the CLONE out of the probe class without saying so. | S10/10-lineage-desktop-slice00 |
| N-13 | P3 | HIFI | S09 per-fold table lacks HiFi `Params` column; S09 p21 still draws an empty per-fold block ("not applicable") instead of one line (QA #16). Expanded S10 card leaves ~90 px blank gap below its detail in the windowed list (S10/21). | |
| N-14 | P3 | TEXT/DATA | Source absences still list "rolling sharpe — not published" although D-AN-01 dropped rolling (server-supplied list; Codex or FE filter). | S09/20-w23-desktop-slice03 |
| N-15 | P3 | A11Y/HONESTY-lite | Sr-only equity data table prints full floats (`-0.00004999999999999449`); exact-values by design but Row 04-AA open. | S09 text dump |

Verified good: cursor survives S09 -> Hub/Execute and Back (`fold=4&trial=350`); S10 `?attempt=` persistence incl. Back/Forward; focus ring visible on every stop; no horizontal page scroll at 390 on all reached screens; HiFi order of S10 chips; honest "not returned for this alpha" fallback; typed absences with server codes throughout.

Top fixes: N-02, N-01, N-03, N-04, N-05, N-06, N-09, N-07, LW-02 (drop second Library request), doc-page.js for HiFi 09.
