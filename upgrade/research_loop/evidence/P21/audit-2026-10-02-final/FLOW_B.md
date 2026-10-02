# FLOW_B audit — Progress ↔ Evidence Hub ↔ S05–S08 (base b965741e, 2026-10-02)

Screenshots: `/home/bobby/portal-research-qa-2026-10-02/audit-final/FLOW_B/` (295 files; prefixes glob-/caus-/p04-, `-desktop`/`-mobile`; `i`=execute interactions, `s`=search/freeze/split interactions, `x`=execute full page).
Runs: glob=R-WFO-023, caus=R-WFO-027, p04=R-P04-022. No server state was mutated.

## 1) Coverage
Done: scripted Playwright drive of Progress → Hub (all 7 tabs, IS/OOS/Holdout/Compare, Capital/Rebased, fold select/stepper, copy link, reset, Back/Forward) → each deep-dive → back, on all 3 runs at 1440x900 and 390x844; deep link of the copied link in a fresh page (all 6 combos restored the same URL/fold/window); hand-edited hashes on /execute; execute transport (play/pause/step/speed/next transition/seek/next fold/chips/causal reveal/play-across/window); search stage links; touch-target measurement on mobile; no horizontal page scroll on any mobile page tested (scrollWidth == 390 everywhere).
Not fully reached: (a) scatter hover/click on S06 — 4 mouse positions over the trial-surface SVG showed no tooltip and no hash change; I did not hit an exact point, so "no tooltip" is unconfirmed; (b) trial-table paging was seen only as a "show more trials (100 of 400)" button (not exercised); (c) play-across-folds switch click timed out on WFO global fold 1 (button text is "play across folds · off"; click failed with the causal-reveal state on — not re-verified); (d) zoom +/− and shared-crosshair controls do not exist on S08 (pan = "earlier/later bars" buttons), so nothing to test; (e) causal run's execute page and mobile execute interactions were only screenshotted, not driven; (f) keyboard focus rings were not visually verified beyond seek-slider ArrowRight/End working.

## 2) Flow tables (condensed; same behaviour on all three runs unless stated)
Legend: fwd = forward link present; back = way back; cursor = kept on browser Back.

| # | step | result | fwd | back | cursor on Back | verdict | shot |
|---|---|---|---|---|---|---|---|
| 1 | Progress → "OPEN EVIDENCE FLOW" | hub opens on `#stage=summary&fold=9&trial=351&params=…` (glob), fold=1 (p04) | yes | "Runs" crumb | yes | OK | glob-02 |
| 2 | Hub Back/Forward to Progress | exact hash restored | – | – | yes | OK | glob-03/04 |
| 3 | Hub tabs SPLIT/SEARCH/FREEZE/EXECUTE/CLAIM/ATLAS/SUMMARY | `#stage=` changes, fold/trial/params kept; one history entry per tab | yes | tabs | yes | OK | glob-05..11 |
| 4 | IS / OOS / Holdout / Compare | `?window=` in the query (not hash). glob/caus: IS and Compare disabled "not published · RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD"; Holdout shows server reason `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT`. p04: IS works; Compare still disabled although IS shown | – | – | yes | OK / UX (reasons only in `title`) | glob-12..15, p04-12 |
| 5 | Capital / Rebased 100 | Rebased permanently disabled on all 3 runs ("drawn in the strategy-vs-benchmark chart") | – | – | – | UX dead control | glob-16 |
| 6 | Fold select (glob 9 folds) | hash fold changes, Back returns previous fold | yes | yes | yes | OK | glob-22/23 |
| 7 | Fold stepper ‹ › | 13x14 px hit area; works (disabled at ends) | – | – | – | A11Y | – |
| 8 | Copy evidence link | clipboard = full current URL incl. ?window, trial, params | – | – | – | OK | glob-26 |
| 9 | Deep-link in fresh page | same URL/fold/window/trial restored (6/6) | – | – | – | OK | glob-99 |
| 10 | "reset to θ*" | URL becomes `?window=oos#stage=summary&fold=1` — drops trial/params, resets fold to 1 even when Progress handed off fold 9/trial 351 | – | – | – | ISSUE | glob-27 |
| 11 | Hub tab → deep-dive link (S5/S6/S7/S8), full cursor `?window=is…&trial&params&seq` | all preserved in the href | yes | "Evidence Flow" crumb | yes (2 Backs) | OK | cursor.mjs |
| 12 | Deep-dive "Evidence Flow" crumb | returns to hub on the same stage tab, fold/trial/params/seq kept, but `?window=` dropped on S1/S2/S3 (kept on S4 only for IS) | – | – | – | ISSUE | cursor.mjs |
| 13 | next/prev chain S1→S2→S3→S4→Report | links exist at every stage; fold/trial/params/seq kept; window not carried (chain started without it — see finding 7) | yes | yes | yes | OK | cursor.mjs |
| 14 | Hand-edited hash on /execute | `fold=99`→clamped to 9 and URL rewritten; `fold=abc`→9; `stage=nope`→execute; `trial=zzz`, `seq=999999` kept verbatim with no message | – | – | – | sane, silent | glob-i21..25 |
| 15 | S8 transport: play/pause/step/speed/next transition/seek(Arrow,End)/next fold/fold chips | all work; clock label, bar n/N, equity/position update; hash gets `fold` only, never `seq` | – | – | – | OK / UX (position not in copied link) | glob-i02..i10 |
| 16 | S8 causal reveal | hides future bars, fees, transitions ("hidden by causal reveal"); honest | – | – | – | OK | glob-i16 |
| 17 | S8 `?window=holdout` | "THIS RUN HAS NO HOLDOUT WINDOW. Split · windows →" | yes | – | – | OK | glob-i20 |
| 18 | P04 S8 | equity samples only, no transport; candle windows `P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS`, typed | next: Report | S3 | – | OK | p04-34 |
| 19 | Causal S6 study selector | exists ("INNER-VALIDATION STUDY PER OUTER FOLD [0][1][2]") but does not follow the cursor fold (see F4) | – | – | – | ISSUE | caus-s01 |
| 20 | Mobile hub tab strip | S3 FREEZE tab covered by the PROMOTION cell → click times out (glob, caus, p04) | – | – | – | BROKEN | p04-07-mobile, glob-a11y-mobile |

## 3) Findings (severity order)

**P1**
1. BUG (mobile) — Hub tab strip: the "→ PROMOTION · SOON" cell overlaps the S3 FREEZE tab at 390px (tabs 378–495px, promo cell 385–542px). FREEZE (and part of EXECUTE) cannot be tapped; Playwright click on the tab and via hub→freeze failed on all 3 runs. Fix: make the strip scroll-snap with the promo cell outside the tab row (or hide it on narrow widths). Shot p04-07-tab-FREEZE-mobile.png.
2. UX — Hub tab ≡ deep-dive. The Split/Search/Freeze/Execute hub tabs render the entire deep-dive body (compare glob-06 vs glob-30: identical content, hub only adds the 3-block header + cursor bar), and the stage title is itself a small "↗" link to the deep-dive. User gets two URLs, two scroll positions, and two sets of the same controls (copy link, child-audit filters, window toggles) for one thing. Better: hub tabs show a compact stage card (key facts + "open S06 →"), the deep-dive is the only full view; or drop the deep-dive routes' own header duplicate. Also the 3-block claim passport (~290px desktop, ~700px mobile) is repeated above every tab, pushing content/tabs below the fold on mobile (glob-02-hub-summary-mobile.png: tab strip starts at y≈760).
3. A11Y (mobile) — touch targets: of ~56 links/buttons on the hub, 49 are <32px in one dimension; fold stepper ‹ › is 13x14px, "next: S2 Search →" 13px high, copy link 21px, chips 14–18px. Same on split/search (433 of 533 on search)/freeze/execute/progress. Not WCAG 2.5.8 (24px) compliant on most.

**P2**
3a. BUG — "reset to θ*" does not reset to the run's hand-off cursor: Progress hands off fold 9 / trial 351 / params a74872…, but reset lands on `fold=1` and drops trial/params (glob-27). Fresh hub load without hash also lands on fold 1 whereas Progress says fold 9: two different defaults for the same run. Pick one (server's hand-off cursor).
4. BUG/UX — S06 causal study selector is not bound to the cursor: URL fold=2, but the trial surface header reads "STUDY 0 · OUTER FOLD 0", ledger rows are named study_1.trial_*, and the selected trial is `study_2.trial_1`. Indexing is 0-based in the panel vs 1-based fold in the hash and the three numbers disagree on screen (caus-s01). Selector state is also not in the hash, so it is lost on copy link/Back.
5. UX — Window cursor dropped by stage navigation: `?window=` is kept hub→deep-dive but dropped by the deep-dive's "Evidence Flow" crumb for S5/S6/S7 and by the next/prev links, so IS → S06 → Evidence Flow returns to OOS. Because window lives in the query and the rest in the hash, history entries mix both; consider putting window into the hash with the rest of the cursor.
6. UX — Progress inconsistent links: chips S1–S3 go to deep-dives (`/split`, `/search`, `/freeze`), S4/S5 go to hub tabs (`/evidence#stage=execute|claim`). Pick one convention (S4 has a deep-dive: link it).
7. UX — S8 replay position (seq) is never written to the hash while playing/seeking (hash only changes on fold). "Copy evidence link" inside S8 therefore cannot share "this bar". Conversely P04 lands on S8 with `seq=1` appended although the hub says `seq not served for this lane` — URL carries a cursor value the lane does not have.
8. UX — Disabled controls explain themselves only via `title` tooltip (IS, Compare, Rebased, Holdout): invisible on touch/keyboard. Show the reason as visible text under the segmented control (the Holdout empty panel does this well). "Rebased 100" is disabled on every run and its reason says it is drawn elsewhere: remove the toggle (LESS TEXT).
9. TEXT/UX — Child-audit panel appears on both S3 and S4 (same "CHILD AUDIT · SOURCE LIFECYCLE OBSERVATIONS" block with free-text FOLD / EXACT # inputs without labels) and on S8 the "strategy isolation" table is a ~40-page long unpaginated list (glob-x01, page height 5461px at 1440): users scroll past 2,000px of 8-hex digests to reach the end. Collapse by default, paginate, link to the S3 copy instead of repeating.
10. A11Y — unlabeled inputs in Freeze child audit (`FOLD`, `EXACT #` render as empty-name inputs in the control list).

**P3**
11. HIFI/UI — S8 chart header: the crosshair readout row ("2026-07-15 03:00Z O … equity …") overlaps the "168 bars" caption at top-left of the candle pane (glob-i16, glob-x01 at 553px).
12. UI — Claim tab "Window disclosure" card clips right-aligned values at the card edge ("Σ 12,528 bars", "not published", "0 denied") at 1440px (glob-09).
13. UI (mobile) — `params` chip breaks mid-word ("par / ams") when the digest wraps (p04-07-mobile).
14. UX — S5/S6/S7 have only "Evidence Flow" as back link; the Run Library link exists only on S8 ("Run Library ↗") and S8 has "Split ↗" for no stated reason beside "← S3 Freeze". Add the same breadcrumb (Runs / R-xxx / stage) on all four, as Progress has. Split page bottom card says "next: S4 Execute" (SplitDetail.tsx:2279) while the header says "next: S2 Search" — two different "next" on one page.
15. UX — Hand-edited garbage is preserved (`trial=zzz`, `seq=999999`) without any "not found" message; fold is clamped silently. Suggest a one-line notice "cursor value not found on this run" and strip it.
16. UX — Holdout Live is enabled on runs with no holdout and the empty panel appears with duplicate "S1 SPLIT →" buttons (one in panel, one below, glob-13); keep one.
17. DATA — S06 scatter: no hover tooltip observed over the trial surface in 4 probe positions and no hash/selection change on click ("Click a point to select that trial" caption). Needs manual confirmation; if confirmed, selection should write `trial=` to the cursor.
18. DATA — S6 sampler trace, warm start, dedupe, freeze clock, per-stage caps, certification are all typed "not published" (correct per rubric; backend to supply if wanted). No FE-invented codes seen.
19. UX — P04 (1 fold): fold stepper/select still shown (fold_01 only); Compare disabled although IS exists (reason text is truncated: "Compare needs the IS window — not published" while IS is published) — reason is wrong for p04.

## 4) Genuinely good
- Cursor round-trip is solid: copied link restores identical state in a fresh page on all 3 runs and both viewports; hub↔deep-dive links carry fold/trial/params/seq; Back/Forward behave per fold/tab.
- Absence is typed with the server's reason (`P10_…NO_HOLDOUT_SEGMENT`, `RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD`, `P04_SOURCE_DID_NOT_PUBLISH_…`); causal reveal honestly hides future values.
- S8 transport/seek/speed/keyboard seek work and the crosshair readout shows real OHLC/equity; no horizontal scroll at 390 on any stage page.

## 5) Top-10 fixes
1. Fix mobile hub tab strip overlap (promo cell over FREEZE tab).
2. Collapse hub-tab / deep-dive duplication (compact stage cards on hub; deep-dive is the one full view).
3. Mobile: shrink claim passport/collapse it so tabs are above the fold; raise all hit targets to >=24–44px (stepper, next/prev, chips, copy link).
4. One hand-off cursor: reset-to-θ* and fresh hub load must equal Progress's fold/trial/params.
5. Bind causal study selector to cursor fold (and 1-based labels), put it in the hash.
6. Keep `window` in every stage link/crumb (move into hash with the rest of the cursor).
7. Write replay `seq` to the hash from S8 transport; do not append `seq=1` where the lane serves none.
8. Show disabled-reason text visibly; remove the always-disabled Rebased toggle; fix p04 Compare reason.
9. Paginate/collapse the S8 and S3 child-audit panels; de-duplicate across stages; label inputs.
10. Consistent breadcrumbs/back (Runs / R-xxx / stage) and consistent Progress chip targets on S1–S8; one "next" per page.
