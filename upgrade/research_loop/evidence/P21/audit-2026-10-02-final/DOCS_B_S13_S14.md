# DOCS_B audit: S13 Compare + S14 Alpha Import (2026-10-02, HEAD b965741e)

Shots: /home/bobby/portal-research-qa-2026-10-02/audit-final/DOCS_B/{S13,S14}/ (key ones viewed). Audit-only: register/activate URLs were route-aborted in Playwright; no non-GET reached the server except the refused parse POSTs below.
Preview check: :8095 serves /home/bobby/portal-research-fe dist built 16:22, after the last FE src commit (3a1378bf 15:57); HEAD strings (Request refused..., Retry registry read, claim strengthens, no ACTIVE attempt) are in its chunks. HEAD-equivalent for FE (b965741e is docs only).
Prefix R/ = apps/portal/frontend/src/research/.

## Reachability limits
- S14 parse is REFUSED on :8095 for a real POST: 403 RESEARCH_ALPHA_IMPORT_INVALID "Request origin is not allowed." (Origin http://localhost:8095). Gates (filled), register and activate states could not be driven live; steps 2/3 seen only in empty/blocked states. Code evidence only for: gate list, quarantine_code, gate timing, receipt, may_activate_reason, run_admission slot, attestation row. (BLOCKED_BY_ENV; I did not spoof Origin.)
- S14 registry next_cursor: server returned none (3 entries), load-more not observable live.
- Not tested live: draw-in animation once / reduced motion.

## S13 rows
| id | claim | status | evidence | note |
|---|---|---|---|---|
| AN-22 FE | P04 OOS Sharpe bound | DONE | R/CompareDetail.tsx:1151-1153; shots 01, 12 | R-P04-013..022 ladder 0.744; pair p22xp21 0.744/0.744. R-P04-006 still "not published P20_P13_OOS_SHARPE_NOT_AVAILABLE" (old seal, backend) |
| 8_sweep single OOS window bar | one bar "single OOS window" | PARTIAL | R/CompareDetail.tsx:1372-1406 | drawn only when real fold ordinals < LINES_PAST_FOLDS. In alpha view with WFO 9 folds the P04 attempts land in "34 attempts have no per-fold rows" (shots 02, 04b). Honest, but P04 value missing from chart in mixed view |
| 13-06 | fold_01 label, no 0 tick | DONE | R/CompareDetail.tsx:1530 foldLabel; shot 01 | min/max y labels only, zero line drawn |
| P3 trajectory | raw template id hidden | DONE | R/CompareDetail.tsx:1696 (title only) | |
| 13-11/01/04 | pp, tokens, crumb, rc link | DONE | R/CompareDetail.tsx:2285, :2532; shot 10 | "-1.42 pp", "raw returns · overlapping window only", crumb "Runs / Compare", link text "RC" |
| config-diff cap | cap or scroll affordance | PARTIAL | R/CompareDetail.tsx:1593-1607 | 23 columns, no "top N / total"; only "23 attempts ⇄" + scroll region tabindex 0 (scrollWidth 1906 vs 656). Cells wrap mid-token ("per_fol d_causa l", digest "69c9431 e"), shot 05 |
| CG-FG-S13-02 cert | grade | BLOCKED_BY_BACKEND | R/CompareDetail.tsx:1217 | "cert not published P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE" (LEGIT) |
| AN-23 common-window Sharpe | bind | DONE (WFO) / BLOCKED (P04) | R/CompareDetail.tsx:2334-2357; shots 10, 12 | WFO pair 9.326 / -0.999 / -10.324; P04 "PORTAL_ANALYTICS_COMMON_WINDOW_NOT_AVAILABLE" |
| AN-14 win rate | bind | BLOCKED_BY_BACKEND | shots 10, 12 | "not applicable P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS..." |
| >12 density / VD-FG-04-01 | wrap, header wording | DECISION_PENDING | shot 01 | 23 cards wrap cleanly in 4 cols, no dangling arrow; no Bobby ruling on >12 wording |
| equal-claim arrow + ATTEMPTS_RULE (B1 cross-screen row) | | DONE; ledger LEDGER_STALE | R/CompareDetail.tsx:196-245, 1196-1217 | row says OPEN "same claim ->"; code prints nothing between equal ranks |
| VD-F1-03 | no connector for equal claim; "claim ↑" only on rise; one-claim line; rule in tooltip | DONE | R/CompareDetail.tsx:227-245, 1196-1205; shot 01 | live data is mixed ranks: one "claim ↑ →" plus "claim strengthens →"; one-claim line is unit-only (not observable on this data) |
| claim rank direction | rank 1 strongest | DECISION_PENDING / DATA | shots 01, 10 | card 1 STRICT_OUTER_OOS "rank 4", next WALK_FORWARD "rank 3" gets "claim ↑"; pair says "weaker STRICT_OUTER_OOS". Confirm direction with backend/Bobby |
| F7 link underline (HiFi dev) | in-text links underlined | DONE | R/CompareDetail.tsx:579-580; shot 01 | |
| F7 other 3 HiFi deviations | warn ink #8f6118, faint ink, grey chips | DONE (tokens) | styles/tokens.css:661-673 | |
| legacy export link | hide/disable | OPEN (BLOCKED B1#13) | features/quantbt/QuantBTModule.tsx:339 | legacy shell, not on S13/S14 |
| fold-chart hover | real values | PARTIAL | R/CompareDetail.tsx:1497 (svg title only) | fold chart: native tooltip + legend hover-dim, no scrub/zoom. Equity mini (shot 09: "2026-06-27 23:00Z 20000") and overlay have crosshair, tooltip, arrow keys, visible focus |
| F7e causal bind | R-WFO-027 | PARTIAL | shots 01, 10 | pair AVAILABLE (3 folds); ladder "-0.000"; fold chart "STRICT +2 identical · no value" |
| /compare resolver route | alpha compare route | DONE | R/CompareRoute.tsx:74-80; shot 25 | /compare?alpha&runs -> canonical ?mode=pair; bare /compare -> EMPTY with "open the run library" |
| VD-F1-03 / display labels | R-labels | DONE | shot 01 | except one-run pair (N-S13-3) |

## S13 flows (desktop, real clicks, Playwright)
| step | action | result | fwd | back | cursor kept | verdict | shot |
|---|---|---|---|---|---|---|---|
| 1 | open /alphas/A/compare#fold=3 | ladder 23 + 26 off-ladder | report/RC/lineage/evidence | Runs crumb | n/a | OK | 01 |
| 2 | click R-WFO-027 | /runs/rrun_686a.../evidence#stage=summary&fold=1 | | goBack restores #fold=3 and ladder | incoming fold=3 not carried (outgoing fold=1) | ISSUE P3 | 20, 21 |
| 3 | report, RC, attempt lineage | each opens; lineage has open-compare link | | goBack/goForward OK | | OK | 22-24 |
| 4 | tabs attempts / markets / pair | ?mode= pushes history; back/forward walk modes | | OK | | OK | 06-08 |
| 5 | markets | single BTCUSDT card (R-WFO-027) under red "RULE OF THIS MODE" bar | | | | ISSUE P3 | 06 |
| 6 | pair WFO global x causal | AVAILABLE: overlay, deltas, rho 0.00, spec diff optimization_schedule | | | | OK | 10 |
| 7 | pair WFO global x P04 | REFUSED contract-key mismatch + facts + markets hint | | | | OK | 11 |
| 8 | pair p22 x p21 | PARTIAL banner, overlay typed absence, Sharpe 0.744/0.744, trades 45/33 | | | | OK | 12 |
| 9 | pair p21 x FAILED p20 | PARTIAL, B column typed absences | | | | OK | 13 |
| 10 | unknown alpha | DENIED + request id, no exit link | | breadcrumb only | | ISSUE P2 | 27 |
| 11 | ?mode=bogus | TERMINAL text mentions run library, no link | | | | ISSUE P3 | 28 |
| 12 | pair with one run | EMPTY "Nothing was requested." + raw rrun_ chip | run library | | | ISSUE P3 | 29 |
Mobile 390 (attempts, markets, pair x2, refused): sw=cw=390 on all, no horizontal scroll (shots 30-35, 38, 39); 105 targets <24px on the ladder. Keyboard: visible focus ring on links (shot 37); config-diff region tabindex 0; mode tabs: only active tab is tabbable. Console clean except my deliberate bad URLs.

## S14 rows
| id | claim | status | evidence | note |
|---|---|---|---|---|
| S14-RW | register replay-after-activate + FAIL-row receipt | OPEN (LANE; forbidden here) | | |
| 14-18 registry 503 retry | retry button | DONE | R/AlphaImport.tsx:1540; shots 13, 14 | live (503 mocked once): "UNAVAILABLE ... Try again." + "Retry registry read"; click re-reads OK |
| 14-04 stepper keyboard | arrows / roving tabindex | OPEN | R/AlphaImport.tsx:1117-1135 | live: 3 tabs all tabindex 0; ArrowRight no-op; shot 02 |
| quarantine_code | rendered | DONE (code only) | R/AlphaImport.tsx:669-672 | live blocked |
| gate timing toFixed(3) | | DONE; ledger LEDGER_STALE | R/AlphaImport.tsx:569 | µs below 1000 else toFixed(1) ms |
| registry chip -> lineage | | DONE | R/AlphaImport.tsx:720-724; shot 12 | "lineage →" per row; "run →" only where may_create_run (delta); s14-* rows show neither run link nor reason |
| empty-registry copy | | NOT OBSERVABLE | R/AlphaImport.tsx:219 | |
| CG-FG-S14-04 server alpha_id filter | | DONE | R/useAlphaImport.ts:99-132; alphaImportClient.ts:98-101; live GET /alphas?alpha_id=delta-... | an unfiltered GET fires first, then filtered (double read) |
| next_cursor / total | | code DONE; ledger LEDGER_STALE | R/AlphaImport.tsx:1529, 1564; useAlphaImport.ts:165 | FRONTEND_GAPS "chưa có phân trang con trỏ" stale; not observable live |
| S14-C1 DRAFT note | OL-01 contradiction | DONE; ledger LEDGER_STALE | R/AlphaImport.tsx:73 | "a DRAFT can run, not seal a candidate"; the contradicting sentence is gone |
| legacy export link | | OPEN (BLOCKED B1#13) | QuantBTModule.tsx:339 | |
| VD-F1-01 origin sentence | "Request refused — reload the page and try again." | DONE | R/alphaImportClient.ts:269; live shot 09 | verbatim; code in details. Printed twice (banner + mirror panel), no reload action |
| S14-02A may_activate_reason | | DONE (code) | R/AlphaImport.tsx:747, 1443 | |
| S14-03 run_admission | | DONE (code + live) | R/AlphaImport.tsx:149-151, 726 | |
| 14-09 attestation | | DONE (code) | R/AlphaImport.tsx:1701 (fallback :1607) | |
| IMPORT_META | | DONE | R/AlphaImport.tsx:90 | empty |
| 14-21/22 403/404 banners | | DONE | R/alphaImportClient.ts:269 | live 403: one sentence |
| VD-F1-03 same-claim connector removal | (S13) | DONE | see S13 | |
| steps up to register | | PARTIAL | shots 01-14 | blocked steps honest ("Parse a source first.", "Run the gates first.", Register disabled with title). Steps are local state: not in URL/history, reload returns to step 1 |

## Ledger corrections
- B1 S14: "toFixed(3) ms" fixed (AlphaImport.tsx:569); "DRAFT note contradicts OL-01" resolved; "no total/cursor" outdated (next_cursor + load more in code); FRONTEND_GAPS §8 "chưa có phân trang con trỏ" stale.
- B1 cross-screen S13 equal-claim row: DONE via VD-F1-03. B1 S13 13-06, 13-11/01/04, P3 trajectory, AN-22: DONE. 14-18: DONE. 14-04 stays OPEN. Config-diff cap stays PARTIAL.
- QA inventory #48/#54 (P04 OOS Sharpe not published): now bound for R-P04-013..022; only R-P04-006 still absent.
- FRONTEND_GAPS F7 "zoom S13 pending": still true (fold chart has no zoom/scrub).

## New gaps
| id | sev | class | gap |
|---|---|---|---|
| N-S14-1 | P1 | BLOCKED_BY_ENV | preview refuses parse POST with origin 403 from localhost:8095; S14 live flow beyond step 1 cannot be exercised through this origin |
| N-S13-1 | P2 | DATA/UX | R-WFO-027 prints "-0.000" for server -3.3e-16 (ladder, markets "sharpe -0.000", pair); also absent from fold chart ("no value") though pair shows 3 folds |
| N-S13-2 | P2 | UX | unknown alpha -> DENIED with no exit link (shot 27); EMPTY has one, DENIED/TERMINAL do not |
| N-S13-4 | P2 | A11Y | 105 touch targets <24px on the ladder at 390; S14 step-3 registry links ~13px |
| N-S13-9 | P2 | DATA | claim-rank direction (strict rank 4 "weaker") needs backend/Bobby confirmation |
| N-S13-3 | P3 | BUG/TEXT | pair with one run: EMPTY "Nothing was requested." though one run is named; raw "rrun_9ec42333" chip |
| N-S13-5 | P3 | UX | config diff: 6/23 columns visible, cells wrap mid-token, no cap line |
| N-S13-6 | P3 | UX | markets neutral rule in red error tone; one market card only |
| N-S13-7 | P3 | UX | link to Evidence resets cursor to fold=1; incoming #fold dropped |
| N-S13-8 | P3 | TEXT | PARTIAL banner prose + raw code; "1 folds"; "overlapping window only" printed twice in correlation card |
| N-S14-2 | P3 | TEXT/UX | refusal sentence printed twice; terminal state with no reload action |
| N-S14-3 | P3 | UX | step not in URL/history; initial double registry GET |
| N-S14-4 | P3 | HIFI | HiFi 14 has a state chip beside the title; live shows none before parse |
| N-S14-5 | P3 | A11Y | stepper arrow/roving keys (= 14-04) |

## Rubric verdicts
- S13: (1) PARTIAL (typed absences with server codes; "-0.000" noise); (2) PASS with approved deviations; (3) PASS except DENIED dead end; (4) PASS on clicks, goBack/goForward, mode tabs, lineage<->compare; cursor not carried outward; (5) PASS: AVAILABLE/PARTIAL/REFUSED/EMPTY/DENIED/TERMINAL distinct; (6) PASS all-time; (7) PARTIAL (scrub on equity/overlay only); (8) no h-scroll at 390 PASS, focus PASS, touch targets FAIL; (9) PARTIAL. WFO global x causal PASS; global x P04 honest REFUSED; P04 pair honest PARTIAL; alpha compare route PASS.
- S14: (1) PASS for reachable parts; (3) PASS (blocked steps say why); (4) PASS (lineage, run library, new run, journey crumb); (5) refused / 503 / empty distinct; (8) mobile no h-scroll PASS, stepper keyboard FAIL; (9) refusal copy short. Steps beyond parse NOT verified live (N-S14-1); register never attempted.
