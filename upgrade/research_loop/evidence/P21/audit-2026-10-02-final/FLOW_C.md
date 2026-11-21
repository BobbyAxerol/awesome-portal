# FLOW_C audit — S09 Report ↔ S10 Lineage ↔ S11 RC ↔ S12 Atlas ↔ S13 Compare + lifecycle exceptions

Base b965741e, preview http://localhost:8095, 2026-10-02. Screenshots: /home/bobby/portal-research-qa-2026-10-02/audit-final/FLOW_C/ (NN-name-{desktop|mobile}.png). Nothing mutated.

## 1. Coverage
Reached (desktop 1440 + mobile 390 unless noted): S09 WFO-023 (all panels, zoom +, chart hover, print via emulateMedia, export button state), S09 failed/cancelled/queued/non-existent/garbage id; S10 lineage (nodes, node select, probe toggle, selected panel, links, clone/new-run state), lineage denied; S11 sealed (WFO-023) and unsealed (P04-022, WFO-024/026/027, cancelled, queued, failed), RC not-found; S12 Atlas (3 tabs, causal schedule, Declare link, retained-history release); S13 attempts/markets/pair tabs, pair WFO-023×WFO-024 both orders, legend toggle, hover, deltas; library empty filter x2; loading states (6 s delay on quantbt/research API, desktop); Back/Forward chain; mobile 19 routes with overflow + target-size scan.
NOT reached: seal-confirm dialog (every unsealed run has MISSING rows so the seal button is aria-disabled on all of them: WFO-024/026/027, P04-021/022, failed, cancelled, queued) — DATA gap on the preview, need one sealable unsealed run; Publish click (state only; button is live and enabled on sealed WFO-023, not clicked); draft->preflight->create (mutation / out of group); export clicks; mobile hover/legend interactions; mobile loading states; compare annotations (none rendered for this alpha pair).

## 2. Flow tables
Cursor = `#stage=…&fold=…` evidence cursor.

### S09 Run Report
| step | action | result | fwd | back | cursor on Back | verdict | shot |
|---|---|---|---|---|---|---|---|
| 1 | open WFO-023 /report | all panels render, no hscroll; headline numbers carry source/origin; absent -> typed reason | RC, lineage | ← Hub, ← Execute | n/a | OK | 01-report-wfo |
| 2 | hub(fold=3) -> report -> "← Hub" | link hardcodes `fold=1` | — | — | link resets fold 3->1 (browser Back restores 3) | ISSUE | 70-nav-report-from-hub |
| 3 | zoom + (19x17 px) / hover | zoom + Reset zoom work, tooltip shows real date/strategy/benchmark/dd/episode | — | — | — | OK (small target) | 21/23 |
| 4 | episodes table, histogram, monthly | table wraps "-0.47 / %", "17 d 9 / h"; histogram has one grey bar, no mean/median/VaR markers (text only) | — | — | — | ISSUE | 20-sec13 |
| 5 | print (emulateMedia print) | clean one-column print, nav chrome hidden, exports/annotation excluded | — | — | — | OK | 22-report-print |
| 6 | exports | JSON/CSV enabled, Parquet/Archive disabled with server reason below (PUBLISH-reasons shown) | — | — | — | OK | 01 |
| 7 | failed run /report | honest "NO CLAIM — RUN FAILED AT S4", stage checks to failure | only ← Hub/← Execute | no Library, no "new run", no lineage | — | ISSUE | 02-report-failed |
| 8 | cancelled and queued /report | same generic "EMPTY — No sealed report" for both (404 in console), queued has no link to Progress | none | ← Hub only | — | ISSUE | 40-cancelled-report, 42-queued-report |
| 9 | non-existent id /report | "DENIED … or it doesn't exist", Print still shown, links point to Hub/Execute of the missing run, no Library link | none useful | breadcrumb "QuantBT Backtest" only | — | ISSUE | 14-notfound |
| 10 | loading (6 s) | "CERTIFICATION reading…", empty RUN REPORT body, no skeleton | — | — | — | OK-ish | 90-loading-report |

### S10 Lineage
| step | action | result | fwd | back | cursor | verdict | shot |
|---|---|---|---|---|---|---|---|
| 1 | open | root card, 3 of 49 attempts, 46 probes hidden, counts block | runs/new run/rc/compare/import | breadcrumb Runs | n/a | OK | 30-lineage |
| 2 | select node | URL `?attempt=ratt_…` (deep-linkable, Back works) | open evidence/report/compare/freeze/RC/clone | — | kept | OK | 73 |
| 3 | show 46 probes | list of 49, internal scroll box; toggle not in URL | — | — | lost on reload | UX | 74 |
| 4 | "new run →" | /runs/new?alpha&av | — | Back returns to selected attempt | kept | OK | 75 |
| 5 | clone → | /runs/new?from=… "COPIED FROM R-P04-019 · fresh preflight"; but panel shows `estimate — request refused · 403 · RESEARCH_PREFLIGHT_INVALID` | — | — | — | BUG | 76 |
| 6 | denied alpha | DENIED banner but full skeleton (ROOT·ALPHA, disabled filters, COUNTS, PROMOTION RULE) under it, exit only breadcrumb | — | breadcrumb | — | ISSUE | 18 |

### S11 Release Candidate
| step | action | result | verdict | shot |
|---|---|---|---|---|
| 1 | WFO-023 (sealed) | SEALED LOCALLY box, pack digest, live "Publish release candidate …" button (not clicked); BUT gate verdict still reads "local seal blocked — review evidence" | ISSUE | 32, c_32bottom |
| 2 | P04-022 / WFO-024/026/027 (unsealed) | DRAFT, editors for #10/#12 open a textarea (OK), seal button aria-disabled with reason "resolve MISSING rows first · P21_REQUIRED_EVIDENCE_MISSING", publish blocked "seal the evidence pack first · P22_LOCAL_SEAL_REQUIRED" | OK | 33, 44-46, 50/51 |
| 3 | failed / cancelled / queued run | identical normal DRAFT composer ("1 · IDENTITY & LINEAGE …"), no banner saying the run failed/was cancelled/is still queued; failed shows PARTIAL "source gap" | ISSUE | 13, 40-cancelled-rc, 43 |
| 4 | rc_NOPE | TERMINAL "request is not valid", "← Run Library" exit | OK | 17 |
| 5 | seal confirm dialog | unreachable (see coverage) | NOT REACHED | 50 |

### S12 Atlas
Tabs WFO modes / Execution routes / Claims by contract all render, URL hash `#tab=…&mode=…&schedule=…` (Back restores it). per_fold_causal selectable, shows causality text. "Declare →" -> /runs/new?step=optimization&mode=mode_1_decay&schedule=per_fold_causal; routes tab "declare →" -> ?step=route&route=…; "RUNS IN MODE →" -> /runs?mode=…; retained-history release 1.0.8 via `?release_id=`. Verdict OK. Gaps: Claims tab has no link out; no loading indicator while the API is slow (94-loading-atlas is blank). Shots 34, 80-84.

### S13 Compare
| step | action | result | verdict | shot |
|---|---|---|---|---|
| 1 | attempts tab | 49 attempts weakest->strongest claim, report/RC links per row, typed absences ("OOS sharpe — not published · P20_…") | OK | 31, 68 |
| 2 | markets tab | one market only, "side by side, never overlaid" | OK | 60 |
| 3 | pair tab, no runs | "Nothing was requested" + "open the run library →" (no in-page picker) | UX | 61 |
| 4 | R-WFO-023 × R-WFO-024 | from Library selection (`?sel=` kept on Back); key MATCH, overlay, common-window deltas, corr ρ=0.33, honest "Δ — not applicable · P20_…" | OK | 63, c_63a |
| 5 | reverse order (024 × 023) via URL | A/B swap, signs flip consistently (deltas B−A), same page | OK | 64 |
| 6 | legend toggle / hover | toggle strikes series; tooltip prints raw float `19909.419272059647` and only the visible series | ISSUE | 65, 66 |
| 7 | Back/Forward Library<->pair | URL-state correct both ways | OK | — |

### Lifecycle exceptions
| state | progress | hub | split | report | RC | verdict |
|---|---|---|---|---|---|---|
| FAILED P04-020 | "Run failed", failure S4, stage chain, new-run-same-draft link | banner + "OPEN PROGRESS RECORD", **S4 chip says RUNNING** + 20 "not published" cards | honest PARTIAL "source has not reported" | honest NO CLAIM, no new-run/lineage exit | normal DRAFT composer | ISSUE |
| CANCELLED WFO-019 | "Run cancelled", new-run link, sparse | stages PENDING, text "pending retention, or run predates it" (409 in console) | TERMINAL "run cancelled before a split was retained" (best screen) | generic EMPTY | normal DRAFT | ISSUE |
| QUEUED WFO-025 | "QUEUED — WAITING FOR A WORKER" (stuck since 16:31, G-23) | not opened | — | generic EMPTY, no link to Progress | normal DRAFT | ISSUE |
| non-existent / other-workspace id | "Run not available" + Open Run Library (good) | same, OPEN RUN LIBRARY | — | DENIED, no Library link | TERMINAL 400 + ← Run Library | report ISSUE, rest OK |
| loading | "Loading." + RETRY button | — | — | "reading…" | "loading" per block | OK (Retry while loading odd) |
| empty library filter | "0 of 49 runs match — loosen a filter" + CLEAR FILTERS | | | | | OK (47, 48) |

Lifecycle traversability: Library -> Progress/hub -> S1-S4 -> Report -> RC -> Lineage -> Compare -> Library is walkable with forward and back links on every success screen (checked by clicking). It breaks on non-success runs: report and RC do not branch on terminal status, so the next step is not obvious. draft->preflight->create not exercised (mutation).

## 3. Findings (severity order)
P1
1. BUG — Failed-run hub shows "S4 EXECUTE · RUNNING · signal_notional" while the run is FAILED (and the banner says failed). Chip state must come from run status. screen 11-evidence-failed. FE (hub stage-chip mapping).
2. BUG/UX — RC page ignores run terminal status: failed, cancelled and queued runs get the normal DRAFT composer (edit buttons, "rc_(draft)", copy yaml) with no "run failed/cancelled/not finished — nothing to release" screen. Needs a distinct exit state pointing to Progress/new run. screens 13, 40-cancelled-rc, 43. FE.
P2
3. BUG — Sealed RC (WFO-023) still prints "GATE VERDICT … local seal blocked — review evidence" next to "SEALED LOCALLY". Contradiction. ReleaseCandidateRoute. FE.
4. UX — Report for cancelled and queued runs: same generic EMPTY 404, queued has no Progress link, cancelled no exit; failed report has no new-run/lineage link. Make S09 status-aware like the progress screen.
5. UX — Non-existent/denied report: Print button and links to Hub/Execute of the missing run, no Library link. Denied lineage/compare keep the whole skeleton under the banner; only exit is the breadcrumb. Add one "Open Run Library" action, hide skeleton.
6. BUG — Cursor loss: report back-link "← Hub · Stage 5 Claim" and "← Execute replay" hardcode `fold=1`; the hub->report link carries no cursor (started fold=3). ReportDetail. FE.
7. BUG — New Run via lineage clone: `estimate — request refused · 403 · RESEARCH_PREFLIGHT_INVALID` (GET /datasets/declaration-estimates 403) shown on the Context step. Either gate the call until data step or show server reason; code text is internal. FE/backend to confirm.
8. TEXT — Failed-run hub: 20 "not published" metric cards plus empty equity block; collapse to one line "no metrics: run failed" (LESS TEXT).
9. UX — Cancelled hub says "pending retention, or the run predates it" and chips PENDING; split page correctly says TERMINAL. Make hub use the same terminal reading. Also 409 on current-source/evidence logged.
10. A11Y — Touch/click targets under 32px on every mobile screen (shell nav 28px, breadcrumb 18px, zoom +/- 19x17, 42-109 small controls on lineage/compare-attempts). Keyboard focus not audited visually beyond textarea focus on RC edit.
11. UX (mobile) — Report "Key artifacts & digests" value column collapses to one character per line (c_m01b). Needs wrap/ellipsis of digests.
P3
12. TEXT — Compare tooltip prints raw float 19909.419272059647; format and show both series.
13. UX — Compare pair tab has no in-page run picker (only "open the run library"); A|B swap not verified as control.
14. HIFI — Report episodes table: depth and duration wrap in narrow columns ("-0.47 / %"); histogram has no mean/median/VaR markers, a lone dark bar unexplained.
15. UX — Lineage probes toggle not in URL; default shows 3 of 49 while the hub-of-record list is 49; mobile lineage has spans clipped beyond card (ln-cert r=485, ln-rowwhen r=580, no page hscroll).
16. UX — Atlas: blank screen while loading; Claims tab has no link to New Run; progress loading shows a RETRY button before any failure.
17. DATA — No sealable unsealed run on the preview, so seal-confirm and publish flows cannot be audited; backend/fixture needed (a run with all MISSING rows resolved, e.g. complete evidence + both declarations).
18. TEXT — Queued R-WFO-025 stuck QUEUED since 2026-10-02 16:31Z; progress page honest but no hint that it may never start (G-23, backend).

Counts: P0 0, P1 2, P2 9, P3 7 (18 total incl. DATA).

## 4. Genuinely good
Honest typed absences everywhere (reason codes, never 0); print stylesheet is clean; pair compare is carefully scoped (contract key match, common-window deltas, "not applicable" with reason, both orders consistent); Atlas deep-links with hash cursor that survives Back; split TERMINAL screen for cancelled runs and rc_NOPE terminal screen both have exits; no horizontal page scroll on any of 19 mobile routes.

## 5. Top fixes in order
1 hub stage chip from run status (S4 not RUNNING when failed); 2 status-aware RC and Report (failed/cancelled/queued screens with exit); 3 remove "local seal blocked" on sealed RC; 4 report back-links carry the live cursor; 5 Library exit on denied report/lineage/compare, drop skeleton; 6 New Run 403 estimate message; 7 mobile digest wrap in Key artifacts; 8 raise tap targets to 32-44px; 9 collapse failed-hub "not published" wall; 10 supply a sealable unsealed run on the preview and re-audit seal dialog and publish.
