# DOCS_A — S00–S06 + cross-cutting row re-verification (audit only, 2026-10-02)

Base `b965741e` (FRONTEND_GAPS file present). Code = worktree at that commit. Browser = live preview `http://localhost:8095` (Playwright, 1440x900, 390x844, 360x740). Nothing was created, sealed, published, imported or saved; preflight was not run. Screenshots (outside git): `/home/bobby/portal-research-qa-2026-10-02/audit-final/DOCS_A/` — short names below; `top-*` = viewport crop, no prefix = full page; `.txt` beside each = page text. Logs: `nav-log.txt`, `nav2-log.txt`, `s02-log.txt`, `a11y-log.txt`.

Preview-vs-HEAD caveat: image revision of :8095 not readable (no docker). Last FE commit at HEAD is `3a1378bf`; the preview shows F7e causal UI (per_fold_causal runs), so it is at or near HEAD. Where code and browser disagree I say so.

## 1. Coverage

Reached: S00, S01 (list, filters, pick mode, open-evidence, Back), S02 (context, all 8 steps by pill at 1440; read-only, no preflight/create), S03 (completed WFO, completed P04, causal, FAILED, QUEUED/stuck, 404), S04 (hub summary/all 7 tabs, window switch, fold select, FAILED, QUEUED, 404), S05 (WFO, P04, FAILED, QUEUED, 404, cursor deep link), S06 (WFO, P04, causal, FAILED, QUEUED, 404). Mobile 390/360 overflow + tap-target + keyboard-ring sweep on S00–S06.

Not reached: S02 preflight result/`?from=` clone (would record server state, F1 says live preflight is refused for the auto-login actor); S06 trial pick / ledger interaction in depth; S04 Compare window (button did not accept the click: disabled or not a button — not investigated); axe itself (no run; only DOM probes); S02 steps on mobile (step pills have no accessible name matching my locator at 390 — see N-12); P04-claim S04 tabs beyond summary.

Status vocabulary: DONE / PARTIAL / OPEN / BLOCKED_BY_BACKEND / DECISION_PENDING / WRONG_IN_LEDGER / LEDGER_STALE (done in code, ledger still says open).

## 2. Per-screen tables

Evidence format `file:line` = code at b965741e; `br:` = browser fact; shot = file name stem.

### S00 Journey Map

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| 00-1a…d | kicker/title/subtitle/legend | OPEN ("still QuantBT Backtest — journey map") | LEDGER_STALE. Title is now "Journey Map" (VD-TEXT-01 deliberate trim vs HiFi "Journey Map — shipped portal × redesigned evidence flow", H00:31); legend right ✓ | JourneyMap.tsx:465; br h1 "Journey Map" | 00-journey-desktop |
| 00-2 | phase label Inter | OPEN | LEDGER_STALE. DONE | JourneyMap.tsx:251 `fontFamily var(--font-body)` | 00-journey-desktop |
| 00-8…10 | mapping block as links | OPEN | LEDGER_STALE. DONE: 11 mapping links, "no shipped tab" row is plain | JourneyMap.tsx:343-391; br anchors list | nav-log.txt |
| 00-6 | Paper card "— SOON" + BLOCKED | DECISION | DECISION_PENDING. Card still reads "Paper Trading — SOON" with a BLOCKED badge (word twice) | br | 00-journey-desktop |
| 2_wiring requires_run | read served flag | OPEN | PARTIAL. `journeyCardScope` reads `requires_run/requires_alpha` (screenRoutes.ts:172) but picker context + mapping still call route-table `needsRunToOpen` (JourneyMap.tsx:174,346) | code | – |
| CG-S00-AV-01 | Alpha version card forces a run pick | BLOCKED_BY_CODEX (FE ledger) / DONE (F1 table) | DONE but WRONG destination copy (N-02): card says "pick an alpha →", lands on Library banner "Pick a run to open **Attempt Lineage**" | br click -> `/runs?to=alpha_version_legacy&group=1`; RunLibrary.tsx:1696 vs :1720 | n02-s00-click-alphaversion-desktop |
| (X-2 gutter) | x=272 | OPEN | DONE. content starts x=272 | br | 00-journey-desktop |

### S01 Run Library

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| 01-14 | raw `alpha_version_legacy` in picker | OPEN | DONE (maps to "Alpha version" / banner "Attempt Lineage") | RunLibrary.tsx:1696,1720 | n02-… |
| 01-1 | header "attempt lineage" link | OPEN | LEDGER_STALE. DONE: link to `/alphas/<alpha>/lineage` | RunLibrary.tsx:2727,2740; br | top-01-library-desktop |
| 01-6 | claim note under trail on failed cards | OPEN | not re-measured at 1440 for failed cards; visible cards OK (note right column). PARTIAL/unverified | br | 01-library-desktop |
| 01-10 | `?status=running` dropped | OPEN | LEDGER_STALE. DONE: upper-cased, filter applies ("0 of 49" — no RUNNING run exists, correct) | useRunLibrary.ts:31; br | n03-s01-status-running-desktop |
| 01-2 | running stats vs HiFi `fold 3/5`·`42m` | OPEN | OPEN, not testable (no RUNNING run; QUEUED R-WFO-025 shows "pending source") | br | 01-library-desktop |
| rel | `relationship` marker | OPEN | LEDGER_STALE. DONE: `RelationshipMark` | RunLibrary.tsx:1923 | – |
| AN-19 | last-30D label on spark + trio | OPEN | PARTIAL. Trio is labelled LAST 30D; the card chart is labelled "ALL TIME" (two scopes on one card). `last30dSeries` exists but the visible chart is the all-time one | RunLibrary.tsx:489,977,1050; br | top-01-library-desktop |
| FG 01-13 | legacy row evidence link | OPEN | DONE per F1; not browsed (legacy rows not in first 50) | – | – |
| 2_wiring rc_availability | rc chip silent | OPEN | LEDGER_STALE. DONE, but chip "rc — not published" on 43/49 cards = noise (N-07) | RunLibrary.tsx:2048-2052; br | top-01-library-desktop |
| cursor on open | Library → hub | n/a | OK. "OPEN EVIDENCE →" lands on `#stage=summary&fold=1`; Back returns to `/runs` (scroll reset to 0: UX, N-08) | nav-log.txt | n05-s04-from-library-desktop |
| filter+Back | | n/a | OK. `?status=FAILED` -> 21 of 49; Back restores `/runs` | nav-log.txt | n04-s01-filter-failed-desktop |

### S02 New Run

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| A2b-PF | null→0 in preflight window table | OPEN ✓ (B1) / DONE (F1) | DONE. 0 hits of `?? 0` in PreflightPanel; not exercisable live | PreflightPanel.tsx | – |
| S02-01 / CG-P04-05 | cert ceiling hard-coded | OPEN / DONE | DONE: prints `cert_cap.reason` | NewRun.tsx:2822-2828 | – |
| FG 02-8b | unvisited steps show ✓ | OPEN / DONE | DONE: "not visited" captions; br confirms unvisited pills neutral, visited pills ✓ | NewRun.tsx:303-331; br | s02-step-Reviewrun-desktop |
| D6 | review 4h vs select 1h | OPEN / DONE | DONE (undeclared value shown "not declared") | NewRun.tsx | – |
| CG-P02-02/P08-02 | create refuses v2 | OPEN / DONE (static sentence) | WRONG_IN_LEDGER: the sentence "create does not admit it yet" does not exist in code (grep 0). Replaced by served-admission gating (controls appear only when profile admits them, NewRun.tsx:1545-1550, F7e). Behaviour is better, ledger text is stale | grep | – |
| D4 label | clone banner shortId | OPEN | DONE (`useRunLabel`, NewRun.tsx:277) | code | – |
| 02-2 | frame/typography | OPEN | PARTIAL: h1 serif, panel titles uppercase mono, frame 272; not measured vs HiFi | br | top-02-newrun-desktop |
| 02-4 | six "not reported" before choice; preselect single ACTIVE | OPEN | OPEN (alpha not preselected: "Select an alpha"; version "Select a version"; rail shows 10 "not declared" rows). Placeholder rows are typed ("no version chosen"), not 0 | br | top-02-newrun-desktop |
| 02-5/5b | context links + supersedes absence | OPEN | LEDGER_STALE. DONE: lineage · runs of this alpha · import new version, "supersedes not recorded", last published rc "No release candidate yet" | br | s02-ctx-version-desktop |
| 02-6 time | rc time `toISOString()` | OPEN | OPEN (NewRun.tsx:687 title only; :993 helper slices to minutes) -> mostly fine, PARTIAL | code | – |
| 02-7 | stepper wraps / live captions | OPEN | LEDGER_STALE. DONE at 1440: one row, captions valid / not visited / in progress / preflight pending. At 390 pill labels are not reachable by name (N-12) | br | s02-step-Walkforward-desktop |
| 02-10a | window timeline bars | OPEN | DONE (proportional bars in rail; empty "not declared" until dates) | br | s02-ctx-version-desktop |
| 02-10b | bar counts per window | BLOCKED B3#13 | LEDGER_STALE: B7 `researchDatasetBarMetadataGetV1` bound (F4/F7c). Not verifiable without dates; do not claim | code F4 | – |
| 02-9 | claim forecast card | OPEN | PARTIAL: gold card, "payload sha256 · after preflight" present; sha only after preflight (not run) | br | top-02-newrun-desktop |
| 02-11 | route panel heading/"Data" label | OPEN ✓ | DONE: pill reads "Market data" (runDraft.ts:189) | code, br | s02-step-Marketdata-desktop |
| 02-15 | trials/seed editable when pinned | OPEN | DONE (`trialsLocked`, "pinned by <profile>") | NewRun.tsx:2374 | – |
| 02-16 | review table in main | OPEN | LEDGER_STALE. DONE; but the same facts are in the right rail as well (duplicate, N-09) | br | s02-step-Reviewrun-desktop |
| 02-17 | RULES footer / half-open note | OPEN | OPEN by LESS-TEXT choice (0 hits). Treat as WONT unless Bobby wants it | grep | – |
| 02-18 | `?step=` written | OPEN ✓ | LEDGER_STALE. DONE: every pill writes `?step=` | br nav-log | – |
| 02-l | fold-plan estimate | DECISION | DONE as typed: "outer folds — not published · pick a mode and schedule" / "≈ N · server plan" | NewRun.tsx:2572-2590; br | top-02-newrun-desktop |
| D4 interior | prefill interior bounds | BIND B3#13/14 | OPEN/BLOCKED_BY_BACKEND (BR-D4-2 Bobby) | – | – |
| DR-05 | reproduce entry / intent_kind NEW | OPEN opt | OPEN (useNewRun.ts:156 `"NEW"`) | code | – |
| atlas hard-codes | min_folds_maximum etc | OPEN | not re-read; leave OPEN | – | – |
| (6.2) test alphas in picker | s14-ui-receipt / s14-api-receipt "cannot create runs" | in 6.2 only | OPEN: still listed in Alpha select | br | s02-log.txt |

### S03 Run Progress

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| 03-I/J | 4 methodology claims + forecast | BLOCKED_BY_CODEX / PARTIAL | LEDGER_STALE (completed run): passport shows 4 claims (validation, chronology, causality, OOS selection) + seal + hand-off. QUEUED run has no forecast passport, only "QUEUED — WAITING FOR A WORKER" (forecast part still open) | RunProgress.tsx:1697-1781; br | top-03-progress-wfo-desktop, q-queued-progress-desktop |
| FG 03-T | transport label | OPEN / DONE | DONE: "stream closed at terminal frame" only on terminal; QUEUED shows "SSE streaming · poll floor 5s underneath" | RunProgress.tsx:72-107; br | q-queued-progress-desktop |
| X7 | workspace on console/events | OPEN / DONE | DONE (suffix on all reads) but source is `?workspace_id=` only | progressClient.ts:131-170, RunProgressRoute.tsx:24 | – |
| 03-M | IMPORTED_* | OPEN / DONE | DONE (unit only) | StageLedger.tsx:28-39 | – |
| 03-N | PENDING rows for unreached folds | OPEN | PARTIAL: declared/planned/reported kept apart; FAILED shows dashed bar "No fold has reported yet"; no PENDING rows | RunProgress.tsx:272-285; br | top-03-progress-failed-desktop |
| 03-O | Gantt blank above cursor | OPEN | DONE (F1c) | br: Gantt/Artifacts aligned | top-03-progress-wfo-desktop |
| 2_wiring best_objective/cancel marker | unread | OPEN ✓ | DONE | RunProgress.tsx:2365,2462 | – |
| 03-Q/T | manifest | OPEN | DONE as served: 5 sealed artifacts + retained table; holdout DENIED row on FAILED | br | top-03-progress-failed-desktop |
| CG-P10-04 | trial rate | OPEN | DONE: "rate 9.15 trials/s" / "rate not published" | br | top-03-progress-wfo-desktop |
| nav | S03 → S04, back | n/a | OK. Next links keep `fold=9&trial=351&params=…`; Back from S04 returns `progress#fold=9` | nav2-log.txt | n10-s04-from-progress-desktop |
| QUEUED stuck | R-WFO-025 since 16:31 | G-23 | UX: honest state but no age/"overdue" cue, no way out except back (N-06) | br | q-queued-progress-desktop |

### S04 Evidence Flow hub

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| FG 04-F | "not published" while loading | OPEN / DONE | DONE ("reading…" / "not read") | EvidenceFlow.tsx:222-286 | – |
| Net return tile | `net_oos_return` | OPEN / DONE | DONE: tile "NET OOS RETURN +1.66% · engine-direct" | br | top-04-evidence-wfo-desktop |
| FE-invented codes | `P13_PUBLISHES_NO_*`, `UI_RETAINED_LANE_HAS_NO_*` | OPEN | PARTIAL: `UI_RETAINED_LANE_HAS_NO_FIELD/SERIES` still FE-made (EvidenceFlow.tsx:259-260,3215-3216,3342) | code | – |
| D-AN-01 copy | "behavior — engine-published" | OPEN | DONE: tile blocks say "portal-derived · OOS" | br | 04-evidence-wfo-desktop.txt |
| AN-16/17 | strategy vs benchmark | OPEN ✓ / DONE | DONE but title is "Strategy vs benchmark — **OOS**", ledger/F4 say "all time" (analyticsV2.tsx:165,194). WRONG_IN_LEDGER (naming only; scope = whole stitched OOS) | br | 04-evidence-wfo-desktop |
| AN-18 | drop rolling-20 | OPEN | DONE (no rolling chart) | grep 0 | – |
| 04-L | 5 hero tiles | OPEN | DONE (Final equity / Net OOS return / OOS Sharpe / Max DD / Trade count) | br | top-04-evidence-wfo-desktop |
| AN-02…15 | Behavior block | OPEN | DONE on v2 seal (Sortino, CAGR, PF, vol, hit rates…) with origin label; on QUEUED, 15 "pending source" tiles (N-05) | br | q-queued-evidence-desktop |
| AN-29 | old seals typed absence | OPEN | not exercised (all test runs are v2); R-WFO-017-type seals not in my run list | – | – |
| 04-H | tab subtitles | OPEN | LEDGER_STALE. DONE: "DONE · 9 folds", "DONE · fold 1", "claim NOT_ISSUED" | br | top-04-evidence-wfo-desktop |
| 04-G | 660 claim note column | OPEN | DONE at 390 (stacks single column) | br | top-04-evidence-wfo-mobile |
| 04-K | window switcher | OPEN | PARTIAL: IS/OOS/Holdout switch write `?window=`; Compare did not respond (not verified); headline note "headline = OOS only" | nav2-log.txt | n12-s04-window-* |
| 04-S | monthly grid blank | OPEN | not re-measured; panel present ("MONTHLY RETURNS — OOS") | br | – |
| 04-AA | a11y table ISO-ms + 17-digit floats | OPEN ✓ | OPEN, confirmed: `2026-07-01T12:00:00.000Z 99.90930626982323` in DOM text (~1,100 lines) | 04-evidence-wfo-desktop.txt:1231 | – |
| 04-AB | nested `<main>` on 404 | OPEN ✓ | OPEN, confirmed: 2 `<main>` on not-found | EvidenceFlow.tsx:4594; br | n18-s04-notfound-desktop |
| (new) h1 | S04 has no h1/h2 | not in ledger | NEW (A11Y P2) — first heading is `<h3>`; S03/S05/S06 have h1 | br headings dump | nav2-log.txt |
| 04-C / 04-D / 04-W / 04-E | dataset drawer, claims, window disclosure, cert caps | BIND | PARTIAL: claim strip has 8 methodology fields + issuer line; window disclosure/cert caps not re-read here; cert "not published" | br | top-04-evidence-wfo-desktop |
| HT-1…6 | embedded stage bodies | OPEN (records) | HT-3 accepted (F4). Hub tab bodies are deep-dive layouts (Search tab 7,386 px, Execute 5,798 px) — not re-measured vs HiFi; HT-1 footers not seen | nav2-log.txt | n11-s04-tab-* |
| tab Back | tabs use replace, not push | not a row | By design: 7 tab clicks then Back skips the tab states and goes to the previous screen (progress) — matches the "tab replace vs push" B1 row; cursor survives forward/back across screens. Judge: acceptable, but browser Back never reverses a tab click | nav2-log.txt | – |
| 404 | not-found | n/a | OK: "Run not available" neutral + exit to Run Library; crumb prints raw `rrun_00000000` (unavoidable) | br | n18-s04-notfound-desktop |
| QUEUED | hub for unsealed run | n/a | OK honest: "This run is QUEUED and has not sealed its evidence yet · WATCH PROGRESS →" | br | q-queued-evidence-desktop |

### S05 Split

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| X3/05-07/08 | θ* lane raw 0/1 | OPEN ✓ | DONE (fold_01…fold_09 via `foldLabel`) | SplitDetail.tsx:943 | top-05-split-wfo-desktop |
| 05-06 | fold dates hidden at 660 | OPEN ✓ | PARTIAL: at 390 the fold table is `min-w-[760px]` inside a scroller (page does not scroll) | br ovf probe | ovf… |
| 05-14 | purge/embargo integrity rows | OPEN ✓ | DONE: "purge between train and test 0 bars", "embargo after each test 0 bars" | 05-split-wfo-desktop.txt:228-247 | 05-split-wfo-desktop |
| 05-15 | ✓ train∩test asserted by FE | OPEN ✓ / DONE (bind) | DONE: reads `guards.train_test_disjoint`; printed "✓ disjoint at every retained fold" | SplitDetail.tsx:2174 area; br | 05-split-wfo-desktop |
| 05-17 | gap scan `?? 0` | OPEN ✓ | DONE ("8 of 8 fold boundaries · no gap at any of 8") | br | – |
| 05-09 | IS bar `search · N trials · IS only` | OPEN | DONE ("search · 400 trials") | br | top-05-split-wfo-desktop |
| X7/05-03,13 | raw enums on P04 lane | OPEN ✓ | PARTIAL: raw `QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION`, `QUANTBT_WARMUP_POLICY_IS_NONE` printed as codes beside "n/a" (typed absence with served code = acceptable); enums `THREE_WINDOW_CURRENT` etc. still in code (SplitDetail.tsx:1719,2185,2367,2577) | br | top-05-split-wfo-desktop |
| X5 | IMPORTED_* | OPEN ✓ | DONE (unit; SplitDetail.tsx:2356) | code | – |
| 05-05 / gap_scan.boundaries / X-08 | latent binds | OPEN | X-08 DONE (code beside n/a); others OPEN | br | – |
| VD-FG-01-06 | ❖ freeze marker | DECISION | DECISION_PENDING | – | – |
| FAILED/QUEUED | | n/a | OK: S05 for FAILED and QUEUED render typed "pending/terminal absence" screens with exit link (text only checked) | q-queued-split-*.txt | top-05-split-failed-desktop |
| back/forward links | | n/a | Crumb "Evidence Flow" keeps `#stage=split&fold=1`; "next: S2 Search →"; lineage link. No link back to Progress/Library/Report (N-10) | nav2-log.txt | – |

### S06 Search & Selection

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| G8 F-1 | `selection input` vs `retrospective` | DECISION | DONE: one word "retrospective" (chip + strip) | br | top-06-search-wfo-desktop |
| X4 | `imported_alpha` | OPEN ✓ | DONE (unit only) | SearchDetail.tsx:2071 | – |
| 2_wiring | `fold` param to ledger | OPEN ✓ | PARTIAL: `ledger.fold_filter` rendered (SearchDetail.tsx:1979,2576); on WFO global the cursor `fold=4` view looked identical to default (not conclusive) | br | n17-s06-cursor-desktop |
| 8_sweep #4 | placeholder for search cinema | OPEN | DONE: "Sampler trace: not published" | br | top-06-search-wfo-desktop |
| FG 06-10/11 | `?? "—"` placeholders | OPEN | OPEN: still `?? "—"` at SearchStageB.tsx:493, SearchDetail.tsx:1041,1172,1440 (violates null≠—) | grep | – |
| FG 06-14 / X-09 | footer sentence / scrollIntoView | OPEN | X-09: `scrollIntoView` no longer found in SearchDetail (grep 0) -> LEDGER_STALE; 06-14 not checked | grep | – |
| S06 binds | selector_confidence, levels, grid, frozen_at, params_digest | BLOCKED B3 | PARTIAL: `pool.frozen_at` bound (shows "not published QUANTBT_…_POOL_FREEZE_CLOCK" typed); params_digest bound (F2). Others unverified | SearchStageB.tsx:159-176; br | top-06-search-wfo-desktop |
| G7 axe | heading-order | OPEN ? | OK on structure here (h1 → h2 → h3 sequence); axe not run | br | – |
| (new) raw enum prose | `WALK_FORWARD_OOS`, `NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION`, "oos_use USED — With the release-default candidate_selection_metric robust_decay. The engine records NOT_USED for plateau/…" | not in ledger | TEXT P2 (rubric 2/9): raw snake_case tokens + 30-word server sentence in header | br | top-06-search-wfo-desktop |
| causal / P04 / FAILED | | n/a | Render distinct honest states; heading sequence OK; causal run shows study picker (text only checked) | 06-search-causal-desktop.txt | top-06-search-failed-desktop |

### Cross-cutting

| row | what | ledger says | actually | evidence | shot |
|---|---|---|---|---|---|
| X-07 `<title>` | per screen | OPEN ✓ | LEDGER_STALE. DONE: "QuantBT — Journey Map", "QuantBT — Run Library", "QuantBT Evidence Flow — R-WFO-023", "QuantBT Stage 1 — Split & Windows — R-WFO-023", … | documentTitle.ts:51; br titles all 7 | summary.json |
| X-2 gutter | 272 vs 280 | OPEN ✓ | DONE (S00/S02 at x=272) | researchScreen.css:23 | 00-journey-desktop |
| minus | U+2212 | OPEN ✓ | DONE for UI-formatted numbers (S01 62, S06 105 uses); server-exact strings keep "-" by design (a11y table, console) | br counts | – |
| sidebar grey | stops ~1100px | OPEN ? | WRONG-ish: full-page capture artifact (F1c); in my full-page shots the rail ends ~900px — viewport shots fine | 00-journey-desktop | 00-journey-desktop |
| D9 topbar flash | `rrun_…` flash | OPEN ? | NOT VERIFIED (needs frame capture; crumb shows R-WFO label by 2.5 s) | – | – |
| VD-FG-01-01 prose | server prose in refusal | OPEN | DONE except S04 passport & S14 details (F5 ledger) | researchRefusal.ts | – |
| D-B1 / F9 `--ink-faint` | contrast | OPEN / DECISION | LEDGER_STALE. Research-scoped faint ink #5c6780 (≥4.75) and approved F7 values; Execution token untouched | tokens.css:650-700 | – |
| VD-FG-01-17 crumb depth | | OPEN | DECISION_PENDING | – | – |
| LEGACY-EXPORT FE | unguarded `/api/runs/:id/export` | OPEN | OPEN: `<a href=/api/runs/${id}/export>` still in QuantBTModule.tsx:339 (legacy tab) | code | – |
| F3/F4 lane, G6 visual | | OPEN | LEDGER_STALE for visual: `research-loop.visual.spec.ts` S00–S14 exists, 360 passed (F5 visual); S03/S12 have no baseline | e2e/ | – |
| G7 axe | not run on tree | OPEN | F5 axe note 90/90 clean on `fedfac44`; not re-run after F7/F7e. Keyboard ring probe now: 25 tab stops x 7 screens = 0 without visible ring | a11y-log.txt | – |
| mobile page scroll | | n/a | OK at 390 on all 7; **360: S03 overflows 3px (363>360)** — unbreakable chronology chip token (N-01) | ovf probe | ovf-S03-360 |
| tap targets | | n/a | FAIL: at 390 the median control is 12–19 px tall: breadcrumbs 12–15 px, filter chips 19 px, S01 303 of 354 controls <24 px, S06 432 of 533. WCAG 2.5.8 floor is 24 px | a11y-log.txt | – |
| ISO-ms display | S01/S11 | OPEN | S01 now prints "2026-10-02 17:02Z" (ms only in `title`) -> DONE for S01; S11 out of scope | RunLibrary.tsx:2081-2083 | top-01-library-desktop |

## 3. Ledger corrections

LEDGER_STALE (done, ledger still OPEN): 00-1a-d, 00-2, 00-8…10, 01-1, 01-10, S01 `relationship`, S01 `rc_availability`, 02-5/5b, 02-7, 02-10a, 02-16, 02-18, 03-I/J (completed runs), 03-O, S03 best_objective/cancel marker, 04-H, 04-G, 04-L, D-AN-01 copy, X-07 titles, X-2 gutter, minus, F9 faint ink, G6 visual (baseline S00–S14 exist), S06 G8 F-1 word, S06 X-09 scrollIntoView, S06 8_sweep #4.

WRONG_IN_LEDGER (ledger says done, code/UI differs): (a) F1 table row CG-P02-02 "static sentence 'create does not admit it yet'" — string not in code; replaced by admission-driven control gating. (b) F4 "Strategy vs benchmark — all time" — UI title is "— OOS" (analyticsV2.tsx:194). (c) F1 "S00 Alpha version card DONE" — lands on a banner that says "Pick a run to open Attempt Lineage"; the S00 card wording "pick an alpha" does not match. (d) F2/F5 say `?? "—"` removed on S08; S06 still has four (SearchStageB.tsx:493, SearchDetail.tsx:1041,1172,1440). (e) F1b says S03 R-WFO-017 text ≈8 words; claim passport now carries raw enum tokens (see N-03).

BLOCKED/DECISION still true: 00-6, VD-FG-01-06, VD-FG-01-17, D4-interior, CG-FG-S02 bar counts, DR-05.

## 4. New gaps (in no row)

| id | sev | class | gap | where | shot |
|---|---|---|---|---|---|
| N-01 | P2 | BUG | S03 claim chip with unbreakable token `not_causal_multi_fold_global_calibration` sticks out of the passport card at 390 and overflows the page by 3 px at 360 (horizontal page scroll) | RunProgress.tsx claim chips (≈:1697-1781) | top-03-progress-wfo-mobile, ovf-S03-360 |
| N-02 | P2 | UX/TEXT | S00 "13 · Alpha version … pick an alpha →" lands on Library banner "Pick a run to open Attempt Lineage" (and no alpha picker). Card and destination disagree | RunLibrary.tsx:1696,1720 | n02-s00-click-alphaversion-desktop |
| N-03 | P1 | DATA/HONESTY | Same trial, two numbers: S03 hand-off and S04 cursor say "trial 351 / #351", S05 θ* flow and S06 "θ* #350 / source trial 350" say 350 (S03 console log prints "global trial 350" and "351" as different trials). Likely 0- vs 1-based ordinal, neither labelled (rubric 1) | 03/04 vs 05/06 text dumps | 03-progress-wfo-desktop.txt:97, 05-split-wfo-desktop.txt, 06-search-wfo-desktop.txt:244 |
| N-04 | P2 | A11Y | S04 hub has no h1/h2 (first heading `<h3>`); also 2 `<main>` on S04 not-found | EvidenceFlow.tsx:4594 | nav2-log.txt |
| N-05 | P2 | TEXT | QUEUED S04 draws 15 "pending source" tiles + a full equity panel shell where D-AN-01 says 5 hero tiles; 15 repeated "pending source/origin not published" lines | EvidenceFlow tile grid | q-queued-evidence-desktop |
| N-06 | P2 | UX | QUEUED R-WFO-025 (stuck since 16:31, 0 worker attempts) shows only "QUEUED — WAITING FOR A WORKER"; no queue age, no overdue statement, no next step/cancel visible, S03 is an empty page below one card | RunProgress queued branch | q-queued-progress-desktop |
| N-07 | P3 | TEXT | "rc — not published" on 43 of 49 Library cards: absent-by-design, not information (QA inventory itself says LEGIT and wording should be "no release candidate") | RunLibrary.tsx:2052 | top-01-library-desktop |
| N-08 | P3 | UX | Back from S04 to Library resets scroll to 0 (49 cards) and filter state is only in URL; user loses place | nav-log.txt | – |
| N-09 | P3 | TEXT | S02 Review step prints the summary twice (main table + right-rail table) | NewRun.tsx rail | s02-step-Reviewrun-desktop |
| N-10 | P2 | UX | S05/S06 have forward/back stage links and Evidence Flow, but no link to Progress, Library or Report; S05/S06 crumb is "Evidence Flow / R-WFO-023 / Stage n" only — rubric 4 asks Library ↔ Progress ↔ stages | nav2-log.txt | top-05-split-wfo-desktop |
| N-11 | P2 | A11Y | Tap targets: 12–19 px tall breadcrumbs, chips, "next:" links on every S00–S06 screen at 390/360 (see cross-cutting) | a11y-log.txt | – |
| N-12 | P3 | A11Y | S02 step pills are not found by role/name at 390 (labels hidden); keyboard/screen-reader name unknown | s02-log.txt | – |
| N-13 | P3 | TEXT | S06 header: raw enums + 30-word server sentence ("oos_use USED — With the release-default…") | top-06-search-wfo-desktop | |
| N-14 | P3 | UX | S04 window "Compare" button does not react when clicked (no URL change, no tooltip) | nav2-log.txt ("click fail Compare") | – |
| N-15 | P3 | DATA | S02 Alpha select still offers `s14-ui-receipt`/`s14-api-receipt` ("cannot create runs") | s02-log.txt | – |

## 5. Rubric judgement (Bobby's 9 points)

| screen | 1 rõ nguồn | 2 đẹp/HiFi/ít chữ | 3 next step | 4 gắn kết/back/cursor | 5 life cycle | 6 raw+all-time | 7 charts | 8 mobile/kbd | 9 hard-coded text |
|---|---|---|---|---|---|---|---|---|---|
| S00 | OK | good, LESS TEXT | OK (pick a run/alpha) | link to Library; Alpha version wrong target (N-02) | n/a | n/a | n/a | OK, taps small | "SOON" doubled |
| S01 | OK, `rc — not published` ×43 | dense but clear | OK ("open evidence") | strong (S1–S5 chips, rc link) | queued/failed/cancelled all drawn | LAST 30D tiles + ALL TIME spark on one card | spark only | no scroll; 303 tiny taps | OK |
| S02 | typed absences everywhere | good | stepper is the guide | back to Library, import, lineage links | draft only (no preflight run) | n/a | window bars | pills unnamed at 390 | review table duplicated |
| S03 | N-03 trial number; raw enums in claims | clean | "next: Evidence Flow →" | good, cursor kept | queued/failed/completed/404 distinct | n/a | gantt ok | 360 overflow (N-01) | chips raw snake_case |
| S04 | origin labels on every tile; exact table raw | heavy (63k chars) but structured | tabs + cursor | strong; tabs replace history | queued/failed/404 distinct | "— OOS" labels | draw-in not observed (static shots) | h1 missing, nested main on 404 | OK |
| S05 | typed n/a with served codes | good | next S2 | Evidence Flow crumb only (N-10) | failed/queued ok | all folds | fold bars ok | table scroller at 390 | raw codes beside n/a |
| S06 | typed absences; `?? "—"` x4 | good | next S3 | Evidence Flow crumb only | failed/queued ok | 400 trials kept | not exercised | 432 tiny taps | raw enum prose (N-13) |

## 6. Counts

Rows decided: S00 7, S01 11, S02 25, S03 11, S04 22, S05 12, S06 10, cross 14 = 112 judged rows (B1 rows for S07–S14 and §4 LANE rows are outside this group). Result tally: DONE 62, LEDGER_STALE (included in DONE) 28, PARTIAL 17, OPEN 13, DECISION_PENDING 4, BLOCKED_BY_BACKEND 3, WRONG_IN_LEDGER 5, NOT VERIFIED 8. New gaps 15 (P1 1, P2 7, P3 7).

Honest limits: LEDGER_STALE/DONE calls on sub-fields of S04 tabs, S06 ledger folding, S02 preflight and S01 legacy rows rest on code or unit-test evidence, not a live click.
