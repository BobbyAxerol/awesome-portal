# DOCS_B audit — S07 Freeze, S08 Execute Replay (2026-10-02, HEAD b965741e)

Paths: code = apps/portal/frontend/src/research/ (no R/ subdir at HEAD). Screenshots = /home/bobby/portal-research-qa-2026-10-02/audit-final/DOCS_B/{S07,S08}/ (all looked at). No server mutation: evaluate-grid, verify-now, sibling attempt, create were NOT clicked; non-GET requests during nav = none.

## 0. Preview vs HEAD
Image revision unreadable (docker socket denied; bundle chunks lazy-loaded, string grep of entry chunk inconclusive). Live UI shows HEAD-era features (4x default, window IS/OOS/HOLDOUT, "play across folds" switch, causal reveal, P04 typed-absence cards, 12-hex candidate ids, fold_01 labels), so it is at least F7/G1-era; exact == b965741e NOT proven. Entry bundle: /assets/index-Bg1CpS5q.js.
Runs used: WFO global rrun_3d5633d2 (R-WFO-023), causal rrun_686af4b1 (R-WFO-027), P04 rrun_9ec42333 (R-P04-022), FAILED rrun_3955ea93 (R-P04-020). Not covered: imported-alpha run (none exists), BLOCKED/DRIFT state (none exists), 660 px width, axe.

## 1. S07 Freeze rows
| row | claim (B1/§8) | status | evidence | note |
|---|---|---|---|---|
| FG 07-08 | drift/BLOCKED banner only on byte MISMATCH | PARTIAL (unchanged) | FreezeDetail.tsx:436-452,1698 (`bytesBlock(bytes)` only); Stage4Binding.tsx:34 DRIFT badge "✕ DRIFT — BLOCKED" inside F4 card only; integrity BLOCKED only badge (:178,1628) | Not reproducible live (all runs BOUND/match). No page-level banner from integrity/binding. |
| FG 07-11 | "global" from progress folds; "folds 1–2" vs fold_01 | PARTIAL | `selection_scope` bound: FreezeDetail.tsx:1366-1367 (banner). But FreezeDetail.tsx:944-948,1212 still prints "shared θ* · folds 1–9" while rows say fold_01 (01-wfo-global-freeze-desktop.png) | label mismatch survives |
| FG 07-04/05 | outcome line after 202; evaluate 409 copy | DONE (code only) | WhatIfCard.tsx:191-192,527-538 (EVALUATE_OUTCOME_WORDS, 409 "grid changed…") | not exercised live (mutation) |
| X6 / 07-10 / 07-17 | one timestamp format; 12 hex; back-link stage=freeze | PARTIAL | iso() = formatUtc FreezeDetail.tsx:154; but ordering header prints `2026-06-01T00:00:00Z → …` (ISO) vs `2026-10-01 13:44 UTC` vs fold-bar text (FreezeDetail.tsx:1413) = 2 formats still visible (01-…png). Candidate id 12 hex in F1 rows, 24 hex in S06-style table (causal screenshot), 8 hex in F4 chain (Stage4Binding.tsx:138 `.slice(0,8)`). Crumb "Evidence Flow" href carries `#stage=freeze&fold=3&trial=12` = DONE | id width inconsistent = OPEN |
| X4 | imported_alpha unread | DONE (code) / UNVERIFIED live | FreezeDetail.tsx:1723 + ImportedAlphaLine.tsx (renders null for built-in) | no imported run to see |
| 07-12 | null fold prints "—" in F4 | OPEN | Stage4Binding.tsx:138 `fold.value ? …slice(0,8) : "—"` | rubric 1 violation |
| VD-FG-01-14 | fold selector control | DECISION_PENDING | none on S07 except the child-audit FOLD free-text input (01-…png); fold comes from hash only | |
| VD-FG-09 | S07 footer text | DONE | FreezeDetail.tsx:80-90 footer removed (VD-TEXT-01); not on screen | |
| D7 walk (F1 claim DONE) | what-if raw float / slider / demo names / enum | DONE | live: `J 5.88522 · base 5.88522`, slider ends 1/1.4, 1.2/2, names rvol/slpercent (01-…png) | |
| F2 X4 etc. | "F1b S07 DONE, text trimmed" | DONE | page has no subtitle/footer; "Code-fixed values: not published" remains (backend N29) | |
| N28/N29/N43 (QA inventory) | wall clock, code-fixed values, "frozen at" | BLOCKED_BY_BACKEND | text "WALL CLOCK ORDERING not published", "Code-fixed values: not published" | honest absences, fine |
| N30/N31/N39 | byte verify / what-if grid | LEGIT (on-demand) | "ARTIFACT BYTES not verified yet", 44 missing, P04 what-if "not applicable" | |
| N42 | "readiness partial" lacks reason (P04) | OPEN (UX) | 20-p04-freeze-desktop.png: "readiness partial", "retained binding check partial", reason not on screen | tooltip only |
| HT-1/HT-3 | hub-tab embedded bodies | not in my scope (S04 hub) | — | |

## 2. S08 Execute rows
| row | claim | status | evidence | note |
|---|---|---|---|---|
| 08-16 / D11 | fold_01 vs fold 0 | DONE | foldLabel at ExecuteCandleReplay.tsx:889,918,923,975,1125,1486,1687-1703; screenshots show fold_01 everywhere | |
| FG 08-04 | default 1x vs HiFi 4x | DONE | replayTransport.ts:26 `DEFAULT_SPEED = 4`; 4× selected in 02-…png | glyph meanings not re-diffed |
| 08-09 | PnL distribution card absent | PARTIAL | P04/failed runs show "TRADE PNL DISTRIBUTION — needs trade records (not published)" (20-failed-execute-desktop.png); WFO page has NO such card (blotter, MAE×MFE, cost timeline only; kb.mjs "pnl dist wfo: false") | inconsistent between lanes |
| D10 walk | 660 clipped labels | UNVERIFIED | not tested at 660 | at 1280 desktop price/x labels fine |
| G7 S08 | axe heading-order | LEDGER_STALE (likely DONE) | main headings now h1 → h2 only (no h3), but axe not run | |
| 2_wiring S08 | market_overview vs candle_overview | DONE | ExecuteDetail.tsx:181-199 candle_overview primary, market_overview fallback chip | Bobby pick recorded F2b |
| CG-FG-S08-01 | per-fold params | PARTIAL / UX | ExecuteCandleReplay.tsx:123-137,163-170 bind served digest; but on screen the fold header shows bare word "params" — digest only in `title` (02-…png, mobile 21-…png) | label with no value; show 8 hex |
| CG-FG-S08-03 | P04 verdict tiles | DONE-as-absent | P04: no tiles, typed absence cards; WFO tiles `0 · 0 · 0`, 32, 32.12, 0, carried | "0 · 0 · 0" = published records orders/fills/trades? unlabelled triple (UX P3) |
| G1 / VD-FG-04-02/03 / 01-15 / bucket | pill width, wick-only, 160 vs 48 buckets | DECISION (recorded) | caption "79 candles (28 bars each)" / P04 "12 candles (62 bars each)" honest | |
| FG 08-05 | raw floats at cursor | WRONG_IN_LEDGER (claims DONE) | WFO readout `pos 0.03386197520287556` raw 17-digit (30-hover-chart-desktop.png). equity is formatted (20,114.47) | pos raw; fix with formatMetric |
| FG 08-06/07 | FE-derived return / fee sum | PARTIAL | per-fold return removed (end equity shown, :927); window fee sum still computed in browser: ExecuteCandleReplay.tsx:232-234 (sum of served decimals; NOT_PUBLISHED if any absent) | violates "UI computes nothing derived"; wants server `window_fee` |
| D11 carry_position + price fmt | raw enum / grouped | DONE | headline "carried / fold to fold"; axis `66,000.00` (02-…png) | |
| 8.10 / D7 play across folds | switch default off, one read when on | DONE | switch present "play across folds · off"; receipt in §8 G1 (not re-run: would be GETs only but long) | |
| F7 chart alive | crosshair real values, draw-in, group zoom | PARTIAL | hover shows O/H/L/C/pos/equity (30-hover…png); echarts group="execute-replay" used for P04 charts (ExecuteDetail.tsx:434,441,872) but §8 itself says S08 candle dataZoom still pending | |
| F2b windows | IS/OOS/HOLDOUT + `?window=` | PARTIAL | switch works; HOLDOUT button disabled on WFO ("not applicable"); `?window=is` is a QUERY param while fold/trial are in the hash (…/execute?window=is#stage=execute&fold=4…). Window NOT carried by Freeze/Report/Split links (links have hash only) | cursor rubric 4 |
| 4 HiFi deviations (F7) | warn ink, faint ink, grey chips, link underline | DONE (not visually diffed; tokens only) | | |

## 3. Navigation (real clicks, desktop 1280, WFO global)
| step | action | result | fwd | back | cursor kept | verdict |
|---|---|---|---|---|---|---|
| 1 | open S07 `#fold=3&trial=12` | hash normalised `#stage=freeze&fold=3&trial=12` | yes | yes (Evidence Flow, S2 Search, lineage) | y | OK |
| 2 | click "next: S4 Execute" | /execute#stage=execute&fold=3&trial=12 | | | y | OK (10-after-next…png) |
| 3 | goBack / goForward | freeze fold=3 / execute fold=3 | | | y | OK |
| 4 | click fold_04 chip | hash fold=4 | | | y | OK; history entry per fold |
| 5 | click IS | URL `/execute?window=is#…fold=4` | | | window query only | ISSUE |
| 6 | Back x3, Fwd x2 | restores fold 4→3→freeze, forward lands fold 4 | | | y | OK |
| 7 | links: ← S3 Freeze, next: Run Report, Split, Run Library | all resolve; fold/trial carried, stage rewritten; Back returns to execute fold=4 | | | y | OK |
| 8 | S07 links: S2 Search, lineage, propose new attempt, REPLAY IN S4 | present; lineage link carries no cursor; propose = `/runs/new?from=` | | | | OK |
| 9 | S08 → Lineage / RC / Compare / Atlas | no direct link from S08 (only via Report) | | | | UX P3 |
Mobile 390: no horizontal page scroll in any of 14 captures (sw=cw). S08 WFO mobile has 4 SPANs beyond viewport (inside clipped/scroll containers; ledger table cut at "POSIT…", scrollable), P04 mobile table r=718 inside scroll region. Touch targets: 96 elements <24 px on S07 WFO (what-if 9x9 grid cells, copy chip) / 45 on S08 — A11Y P2.
Keyboard: focus ring visible (3px shadow) on all stop types; Space on play button starts playback (bar 45/168 after 2.5 s at 4x). 29 tab stops through sidebar before content; "Skip to content" present.

## 4. Failed / absent states
- Failed run S07 (20-failed-freeze-desktop.png): pill "not published", "readiness not_ready", then generic "EMPTY — No rows in this scope." No statement that the run FAILED, no link to Progress/Library; only "Propose new attempt" + crumb. Rubric 5 weak: P2 UX.
- Failed run S08 (20-failed-execute-desktop.png): honest typed absences with P04_SOURCE_DID_NOT_PUBLISH_* codes, but none says the run failed; no exit link beyond header Split/Run Library.
- P04 complete S08: equity line + 744-bar overview with 12 candles, PARTIAL banner; honest.

## 5. NEW gaps (not in any row)
| sev | class | gap | where |
|---|---|---|---|
| P2 | BUG/HIFI | Causal S07 fold rows clip at 1280: "OOS child = frozen θ* · candidate 9f93eca761aa" cut at card edge; at 390 "IS ends before OOS" clipped | FreezeDetail.tsx ~1398-1413; 20-causal-freeze-desktop.png, 20-wfo-freeze-mobile.png |
| P2 | DATA/TEXT | S08 fold header shows bare "params" with digest only in title | ExecuteCandleReplay.tsx:163-170 |
| P2 | DATA | cursor readout `pos 0.03386197520287556` raw float | ExecuteCandleReplay.tsx readout (~1486 area), 30-hover…png |
| P2 | UX | failed run S07/S08 indistinct, no exit to Progress | above |
| P2 | A11Y | many <24px targets (what-if grid cells, chips) | S07 |
| P3 | HIFI | "168 bars" label overlaps the OHLC readout timestamp at top-left of chart | 02-…png, 30-…png |
| P3 | UX | `0 · 0 · 0` "PUBLISHED RECORDS" tile unlabelled triple | 03-…png |
| P3 | UX | window cursor lives in query not hash; not carried to other stages | §3 step 5 |
| P3 | DATA | WFO lane lacks PnL-distribution typed absence that P04 lane has | |
| P3 | TEXT | candidate id 8/12/24 hex across S07; ordering window uses ISO `T…Z` vs `UTC` | |

## 6. Ledger corrections
- FRONTEND_GAPS §8 F1 "S08 FG 08-05 DONE": WRONG (pos raw float live).
- §8 F1 "FG 08-06/07 DONE": window fee sum is still browser-side (:232).
- B1 FG 07-11/X6/07-12 "OPEN" correct; 07-04/05, 08-16, FG 08-04, X4, 2_wiring, G7 S08 heading: LEDGER_STALE (now done in code; B1 still OPEN).
- B1 08-09 "missing entirely": stale for P04, true for WFO.

## 7. Rubric verdict ((1)..(9))
S07: (1) mostly met, exceptions 07-12 "—", raw ids; (2) HiFi layout good, causal clip; (3) one next step clear (REPLAY IN S4); (4) links + cursor + Back/Forward OK; (5) failed state weak; (6) n/a; (7) n/a; (8) no page h-scroll, tiny targets, focus OK; (9) text trimmed. VERDICT: PASS with P2 fixes.
S08: (1) fails on pos raw float + browser-side fee sum; (2) good, label overlap; (3) clear; (4) good except window cursor; (5) failed state generic; (6) all-time stitched shown; (7) alive, hover real values, 4x default; (8) no page h-scroll, focus OK; (9) trimmed. VERDICT: PASS with P2 fixes (honesty rows).
