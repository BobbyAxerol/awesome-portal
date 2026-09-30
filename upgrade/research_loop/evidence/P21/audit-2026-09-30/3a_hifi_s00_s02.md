# HiFi audit S00–S02 — frontend union as of 2026-09-30 (read-only)

**Lines evaluated (union as if consolidated):**
- **CL** = Claude line `/home/bobby/portal-research-w1-build` HEAD `d7db1cb3` + uncommitted edits (TopBar.tsx run-crumb collapse, AlphaImport.tsx, shell.css — none reach S00/S01/S02; the run crumb class only applies on run-scoped screens).
- **CX** = Codex line `/home/bobby/portal-research` HEAD `c2ec1443`. The shared base is `d3d99f26`. The Codex FE deltas for these screens are FG-05 (`alphaVersionPublication.ts`, S01 rc chip, S02 "last published rc") and FG-08 `a1d7bf3f` (S02 refusal/catalog client copy), plus `ad404196` (chip face per VD-FG-05-06/-07).
- **G2** = worktree `/home/bobby/portal/.claude/worktrees/agent-aa93eebaab7e9637b`, commit `ed33db0d` (D4 prefill). It sits on `d3d99f26`. It is **not** in CL or CX.
- `JourneyMap.tsx` and `screenRoutes.ts` are identical on CL and CX since `d3d99f26`. For `RunLibrary.tsx`, CL = base, and CX adds 185 lines around the rc chip only. `NewRun.tsx` has +13 lines on CL (`6a4cb383`), +112 on CX, and +204 on G2.

HiFi sources: `upgrade/research_loop/release-v1.1/QuantBT 0{0,1,2} *.dc.html` (H00/H01/H02 = raw line numbers). Starting rows are the prior audit `HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md` rows 00-x/01-x/02-x (tree `0b6b7fb8`) and FG-01 matrix rows (Codex, `8783461e`). FG-01 cites Claude-line lines, and they are unchanged at `d7db1cb3`.

Status legend: YES · PARTIAL · NO · DEV-OK (a deviation approved by a cited id) · DEV-UNAPPR (a deviation with no recorded approval). VD-FG-* rows are **proposals**, except VD-FG-05-02/-06/-07, which FG-owner-decisions §3 marks `RESOLVED_BY_OWNER` (option B).

---

## S00 Journey Map (`/research/quantbt/journey`)

HiFi blocks: H00:30 mono kicker · H00:31 title · H00:32 subtitle · H00:34–37 2-swatch legend · H00:40–60 phase rows (P#, name Inter 13/600, note; cards with tag and arrow) · 8 phases / 27 cards, including a "Paper Trading — SOON" card and 4 execution cards · H00:62–72 mapping block (caps header, 6 rows with both columns as links, footnote).

| # | HiFi block | Status | Where (file:line · line) | Note |
|---|---|---|---|---|
| 00-1a | Kicker "Quant Ecosystem Portal · Research Light" (H00:30) | NO | `JourneyMap.tsx:338–360` · CL=CX | No kicker is rendered. |
| 00-1b | Title "Journey Map — shipped portal × redesigned evidence flow", Newsreader 27/400 (H00:31) | DEV-UNAPPR | `JourneyMap.tsx:339–344` · CL=CX | Still "QuantBT Backtest — journey map" at 22px/300. DQ-02 says HiFi copy wins, so this is a gap. |
| 00-1c | Subtitle "Every card opens the real screen…" (H00:32) | DEV-UNAPPR | `JourneyMap.tsx:345–350` | Different sentence ("A reading map of the domain…"). |
| 00-1d | 2-swatch legend on the right (shipped hi-fi / redesigned) (H00:34–37) | PARTIAL | `JourneyMap.tsx:84–108` | Renders 3 tag chips (shipped/redesign/execution) under the subtitle, not swatches on the right. The extra `descriptor revision N` line (`:355–359`) is an honest addition. |
| 00-2 | Phase label Inter 13/600; P# mono teal; note (H00:42–45) | PARTIAL | `JourneyMap.tsx:214–224` | P#, name and note are all present. The `<h2>` picks up `font-family: var(--font-display)` (Newsreader) from `styles/base.css:14`, so it is serif, not Inter. The card box is 180–300px flex, exactly the HiFi's. The P6 wrap difference comes from the shell width (DQ-01). |
| 00-3 | Every redesign card opens its screen (S08/S09/S10/S11/S13 no longer SOON) | YES | `packages/contracts/fixtures/research-foundation.journey-v2.valid.json` (descriptor rev 3), `foundation.test.tsx` "declares no PLANNED card" | Closed by E12 (descriptor v3, migration 067). Confirmed on preview `c81e8dc2` (Unified §13.4.1 E12). |
| 00-4 | Run-scoped cards are not dead ends | YES (D2) | `JourneyMap.tsx:150–176` `pickRunHref` → `/runs?to=<key>`; `screenRoutes.ts:139–149` | D2 decision. The badge reads "PICK A RUN" and the card shows "pick a run →". |
| 00-5 | "13 · Alpha version" is a live card | YES | `screenRoutes.ts:89,103–107` `ALPHA_VERSION_SCREEN_KEYS`; `foundation.test.tsx:448–462` | Now a run picker that resolves `alphas/:id/:av` from the chosen row. Downstream defect on S01: the picker label is missing (row 01-14). |
| 00-6 | Paper Trading "SOON" card + 4 Execution-side cards (H00:121,125–128 are live `<a>`) | DEV-OK (DQ-03) | `JourneyMap.tsx:77–82`; descriptor `DEPENDENCY_REQUIRED` | Rendered greyed with a **BLOCKED** badge, because availability comes from the server (DQ-03). Cosmetic issue: the paper card's title already says "— SOON", and the badge says BLOCKED next to it. |
| 00-7 | Phase arrows between cards; last card has none | YES | `JourneyMap.tsx:229–245` | Arrows stay at 660 (RF-04 README l.15). |
| 00-8 | Mapping header, mono caps "where the redesign plugs into the shipped run view — tab by tab" (H00:63) | DEV-UNAPPR | `JourneyMap.tsx:384` | Reads "What the redesign adds" in 13px semibold (serif h2). |
| 00-9 | Mapping rows: both columns are **links** (shipped mono, redesign gold mono) (H00:66–68) | NO | `JourneyMap.tsx:386–393` | Plain `<span>`s; the redesign column is bold ink. `mine_target_key`/`shipped_target_key` are in the descriptor, so `resolveJourneyCardRoute`/`pickRunHref` could make them links. |
| 00-10 | Mapping footnote "The shipped tabs stay the run view's skeleton…" (H00:72) | NO | — | Absent. FG 00-6 agrees (`mappingLinks: 0`, no footnote). |
| 00-S | States (loading/denied/404/503-stale/401/422) | YES | `foundationRoutes.tsx` | FG-01 00-S/00-A/00-H give MATCH at 3 widths. Two FG-slice2 notes: `partial` is never emitted (`foundationRoutes.tsx:83`), and a 503 renders as STALE bundled rather than `unavailable` (`:134–141`). Both follow DQ-03's intent. |

**Verdict S00:** Functionally complete. Every card either opens its screen, picks a run (D2), or says why it is blocked (DQ-03). What remains is HiFi copy and typography: the header block and the mapping block, both FE-only.

**Remaining gaps S00**
| Gap | Size | Owner |
|---|---|---|
| Header: add the kicker, the HiFi title (27/400) and the HiFi subtitle; 2-swatch legend on the right (00-1a…d) | S | FE-Claude |
| Phase label in Inter (override the base `h2` display font) (00-2) | S | FE-Claude |
| Mapping block: caps header copy, both columns as links via the descriptor target keys, footnote (00-8…10) | S | FE-Claude |
| Paper card: "— SOON" title next to a BLOCKED badge (00-6). Descriptor copy (drop "— SOON") or leave as is | S | BE (descriptor) / Bobby |

---

## S01 Run Library (`/research/quantbt/runs`)

HiFi blocks: H01:34 breadcrumb · H01:36–37 title and subtitle · H01:39 header links (attempt lineage, journey map ↗, + new run) · H01:45–54 filter bar (search, status, mode, alpha + "scratch only", group by alpha, "N of M runs") · H01:58 ledger bar + caption "7 runs · 5 completed · 1 running · 1 failed" · H01:64–65 group header · H01:71–80 card head (compare check, id, status pill, mode, av/scratch chip, instrument, rc chip, cert, created, open evidence/progress) · H01:84–87 S1–S5 trail with tips · H01:92 sparkline + label · H01:100–101 3 stats (running: progress/trials/elapsed; failed: failed at/reason/runtime) · H01:105 claim quote · H01:109–110 superseded line · H01:118–121 sticky compare bar · H01:126–127 rules footer.

| # | HiFi block | Status | Where (file:line · line) | Note |
|---|---|---|---|---|
| 01-a | Breadcrumb "QuantBT Research / Runs"; title; subtitle | YES | `RunLibrary.tsx:1804–1818` · CL (CX +160 offset) | Copy matches. Title is 22/300 (same family of size delta as 00-1; not flagged in prior audits). |
| 01-1 | Header "attempt lineage" **link** (H01:39) | NO | `RunLibrary.tsx:1821–1826` | Still the hint "lineage ↗ select an alpha group below". The per-group link exists at `:2087–2096`. With one catalogued alpha, the header could link straight to it. |
| 01-b | "journey map ↗", "+ new run · preflight first" | YES | `RunLibrary.tsx:1827–1853` | |
| 01-c | Filter bar: search, status/mode/alpha chips, scratch only, group by alpha, counter | YES | `RunLibrary.tsx:1889–2014` | Chips come from the server `filter_catalog`. The counter is "N of M runs". Paging is 50 per page with ← newer / older → (`:2132–2157`). |
| 01-10 | Status deep link is case-tolerant | NO | `useRunLibrary.ts:72,94` `filter(isStatus)` | `?status=running` is silently dropped (FG 01-10 FE_GAP P3). |
| 01-11 | Summary "7 runs · 5 completed · 1 running · 1 failed" (H01:261) | YES (D3) | `RunLibrary.tsx:2023–2032` `statusCaption` `:1539`; BE `run-library.service.ts:446` `status_counts` | D3: status counts come first and the claim ledger moves to row 2 (`:2035–2052`). VD-FG-01-04 (proposal) is the same question, already answered by D3. |
| 01-d | Ledger **bar** segmented by status (H01:192–194) | DEV-OK (D3) | `RunLibrary.tsx:1546–1585` | The coloured bar is drawn over the claim-ledger buckets. The status line is text only. Consistent with D3 ("keep both, HiFi first"). |
| 01-e | Group header "alpha · av_" + sub; lineage per group | YES | `RunLibrary.tsx:2078–2099`, `groupRuns` `:1606–1646` | Legacy rows get their own group (FE-S01-14). |
| 01-f | Card head: check, id, status, mode, av chip / dashed scratch, instrument, cert, created, open link | YES | `RunLibrary.tsx:1147–1261` | The id is the D1 `display_label` (`R-P04-017`) via `useRunLabel` (`:1039,1077`). RUNNING/QUEUED rows get "watch progress →" (`:1016–1018`). |
| 01-3 | Status pill agrees with the run's real state | YES | BE `run-library.service.ts` `effective_status`; `RunLibrary.tsx:316–342` | The library follows `effective_status` and `status_basis` (E10 `7c522e2b`). The stuck-FINISHING data issue is outside the FE. |
| 01-2 | Running card stats: `fold 3/5` · `341 / 600` · `42m` | PARTIAL | BE `run-library.service.ts:1143–1148`; FE `statDisplay` `:670–683` | E4 closed the "available" leak (`:281`). The server now sends `progress = "{pct}%"` and `elapsed = "{s} s"`, and the FE prints them as sent. HiFi wants the fold position and a humanised duration. |
| 01-4 | Failed card: FAILED AT `fold 2 · S2` | YES | BE `run-library.service.ts:1151–1160` `failedAtLabel`; FE `:680–681` | E10 (BE) plus E1 (no ISO-ms). |
| 01-5 | Failed trail: the failing stage is red | YES | BE `run-library.service.ts:1057–1069` `state:"blocked"` + derived tip; FE `STAGE_TONE.blocked` `:190` | E10. |
| 01-6 | Claim note sits in the right column on every card | NO | `RunLibrary.tsx:1269–1274` (flex-wrap row) | On failed cards the claim still wraps below the trail (FG 01-6 FE_GAP P3). |
| 01-7 | Completed WFO card: sparkline + OOS Sharpe, Δ decay, trades | YES | BE E11 (retained lane); FE `Sparkline`/`Stats` `:560–800` | Confirmed on preview `c81e8dc2`. Two-decimal ratios follow DQ-08. VD-FG-01-02 (proposal) would re-open the rounding rule. |
| 01-g | Sparkline label ("stitched OOS equity" / "equity — building" / "equity — none") | DEV-OK (H1) | `RunLibrary.tsx:429–431` | H1: the label is kept on single-window runs. |
| 01-8 | rc chip `rc_2026_08_c · APPROVED` / `rc_ (draft) · DRAFT` | PARTIAL (CX only) · BE | CL `RunLibrary.tsx:886–954` (P21 `item.rc` only); **CX** `RunLibrary.tsx:977` `LOOKUP_FACE`, `:1012` `rcChipFace`, `:1070` `RcChip`, `:1954` `useAlphaVersionPublications(rcLookupVersions)` | CX renders the P22 lookup: raw status + `· effective X` when it differs, ink by effective status, `reading…` / `publication not readable` / `unavailable` (VD-FG-05-06/-07, **Bobby-approved**, verified in fixture lane 27/27). On real data every row still has `P21_NO_PERSISTED_RELEASE_CANDIDATE`, which is typed absence (OL-13, BE22+). Not on CL until consolidated. |
| 01-h | Superseded line (H01:109–110) | YES | `RunLibrary.tsx:1276–1304` | Server `superseded_note`. |
| 01-i | Claim quote (gold, state prefix) | YES | `RunLibrary.tsx:817–874` | `ISSUED — …`, `NOT ISSUED`; pending/failed/cancelled sentences. |
| 01-j | Sticky compare bar with key guard | YES | `RunLibrary.tsx:1344–1400`, `:2159` | A real compare replaces the HiFi's "deferred". |
| 01-k | "rules of this screen" footer | YES | `RunLibrary.tsx:2161–2168` | |
| 01-9 | Page guard (HiFi shows 7 cards) | YES (scale) | `useRunLibrary` `limit=50`, paging `:2132–2157` | OL-21 closed. Up to 50 cards on one page is a scale choice, not a HiFi gap. |
| 01-13 | D2 picker: a legacy row with an alpha-scoped `?to=` | NO | `RunLibrary.tsx:1001–1007` runs before the legacy branch `:1009–1014` | A legacy/unbound row links to `/evidence`, which a legacy run does not have (FG 01-13 FE_GAP **P2**, still open on both lines). |
| 01-14 | Picker notice names the screen | NO | `RunLibrary.tsx:962–974` has no `alpha_version_legacy`; `:1875` | The notice and link print the raw `alpha_version_legacy`. This is a direct consequence of the 00-5 fix. |
| 01-S | States (403=404, 503, 400, 401, loading, empty) | PARTIAL | `useRunLibrary.ts`; `researchRefusal.ts:231` → `ResearchPanel.tsx:102–110` | FG gives MATCH on visible text. Still, VD-FG-01-01 (open; Bobby has not decided) leaves server prose in the closed `<details>` `textContent` for S01 denied/unavailable/terminal. Stale is unreachable because the list read publishes no 409. |

**Verdict S01:** Close to HiFi and complete in data (D1, D3, E4, E10, E11 all landed). The rc chip P22 path exists only on CX. There are four small FE defects (01-1, 01-6, 01-10, 01-14) and one P2 link bug (01-13).

**Remaining gaps S01**
| Gap | Size | Owner |
|---|---|---|
| 01-13 legacy/unbound row + alpha-scoped `?to=`: must not link to Evidence Flow; use the legacy-branch order or a "cannot open here" title | S | FE-Claude |
| 01-14 add `alpha_version_legacy: "Alpha version"` to `PICK_TARGET_LABEL` | S | FE-Claude |
| 01-1 header "attempt lineage" as a link (single catalogued alpha → `lineageHref`, else keep the hint) | S | FE-Claude |
| 01-6 claim note stays in the right column on failed cards | S | FE-Claude |
| 01-10 normalise `?status=` case | S | FE-Claude |
| 01-2 running stats: fold position (`fold 3/5`) instead of `%`, humanised elapsed. Server `stats` or FE duration format (E1) | S | BE (P12 stat value) + FE-Claude (duration) |
| 01-8 consolidate CX FG-05 into CL; real APPROVED chips need a P22 publication/approval writer (OL-13) | S (merge) / M (BE) | FE-Codex→merge; BE22+ (Codex) |
| VD-FG-01-01 server prose in the collapsed refusal detail | S | Bobby decision |
| VD-FG-01-02 (DQ-08 rounding) — proposal only | — | Bobby decision |

---

## S02 New Run (`/research/quantbt/runs/new`, 8 steps)

HiFi blocks: H02:34 breadcrumb "Runs / New Run" · H02:36 title + binding chip · H02:37 subtitle · H02:39 installed-release line under the subtitle · H02:45–48 stepper (8 pills on one row, caption = state "valid" / "needs attention" / "preflight pending", `:622–626`) · **Context** H02:60–95 (alpha/version selects, bound/scratch toggle, passport = artifact digest, import state (U14), entrypoint, supersedes, **last published rc** `:793–798`; links "lineage → · runs of this av_ → · import new version →" H02:85–87; `avStateNote` H02:90; scratch NOT_PUBLISHABLE banner H02:94–95) · **Route** H02:104–180 ("Execution route — how orders come to exist", "full route atlas →", 14-card grid with admission badge, selected-route panel, per-route param forms) · **Strategy & protocol** H02:187–203 (strategy cards, pinned note, 2 protocols) · **Market data** H02:210–236 (declaration box: required columns / declared timeframes / warmup / seed + note; dataset list; symbol; timeframe chips) · **Walk-forward** H02:243–285 (window rows, "Half-open: end-exclusive…" note H02:253, fold plan preview formula + "≈ N outer folds" H02:266–273, mode/schedule) · **Parameters** H02:293–314 (table header PARAM/DECLARED/DIM/LOW/HIGH/STEP/STATUS, sweep/pin) · **Optimization** H02:321–371 (trials/early stop/seed, "pinned by protocol" 4 facts, config surface accordion, defaults footer) · **Review & run** H02:379–402 (summary table in main, server preflight checklist, run button + note) · rail: window timeline with bar counts H02:410–415; gold **claim forecast** card H02:422–433 (payload sha256, mode × schedule, source, claim, cert ceiling + note, italic augmentation note) · H02:439–440 rules footer.

| # | HiFi block | Status | Where (file:line · line) | Note |
|---|---|---|---|---|
| 02-1 | Breadcrumb "Runs / New Run" | DEV-OK (DQ-01) | `NewRun.tsx:1735–1739` · CL=CX | A link row (Run Library · Import a version · Full route atlas). DQ-01 covers the shell/breadcrumb. |
| 02-2 | Geometry/typography: title x/y like 01/03/04, subtitle 13.5, release line under the subtitle, panel titles Inter 12/600 caps | NO | `NewRun.tsx:1729–1772` (`px-4 py-4` frame; release line `ml-auto` right of the title `:1761`; subtitle `text-[13px]` `:1767`); `Card` h3 `:182` inherits Newsreader from `base.css:14` | Unchanged since the 09-26 audit. |
| 02-3 | Binding chip `PUBLISHABLE · av_…` | YES | `NewRun.tsx:78–107`, `:1747–1760` | E4: `NO VERSION CHOSEN` / `PUBLISHABLE · {version_label}` / `NOT_PUBLISHABLE · scratch`. |
| 02-4 | First view: no false "not reported" before a choice; single ACTIVE entry could preselect | NO | `NewRun.tsx:317–343` (6 × "not reported" when `bound` and nothing chosen), `:1855–1865` ("Not read for this declaration…") | FG 02-4 FE_GAP P3, open on both lines. Prefill happens only via `?alpha=&av=` (`NewRunRoute.tsx`). |
| 02-5 | Context passport: import state (U14), supersedes, digest, entrypoint | PARTIAL | `NewRun.tsx:323–330` | Has alpha, version, lifecycle (≈ import state), source digest, entrypoint and timeframes. No `supersedes` (registry sends `supersedes_state=HISTORICAL_NOT_RECORDED`, which could be shown as typed absence). |
| 02-5b | Context links "lineage → · runs of this av_ → · import new version →" + `avStateNote` (RC-composition sentence) | NO | ContextStep `NewRun.tsx:264–363` | Absent. "attempt lineage →" appears only in the clone/fork banners (`:1792–1831`). |
| 02-6 | Context "last published rc" | PARTIAL (CX only) · BE | **CX** `NewRun.tsx:351` + `LastPublishedRc` `:383–426` | FG-05, verified in fixture lane 24/24. Shows typed absence until P22 writes publications (OL-13). The publish time uses `toISOString()` (ISO with ms), which breaks the E1 timestamp rule. Not on CL. |
| 02-g | Scratch NOT_PUBLISHABLE banner | YES | `NewRun.tsx:344–360`, `SCRATCH_BANNER :64` | HiFi copy, verbatim. |
| 02-7 | Stepper: one row; caption = live state | NO | `NewRun.tsx:192–260`; captions from `runDraft.ts:172–180` `STEPS.sub` (static) | Wraps to 2 rows at 1280/1440 and 3 at 660. Captions are static descriptions, e.g. "14 routes · per-route params" even when the Atlas is denied. |
| 02-8a | No red errors before a step is visited | YES | `NewRun.tsx:1695–1725` | E4. |
| 02-8b | Unvisited invalid steps must not show a green ✓ "valid" | NO | `NewRun.tsx:217,226,244` | Unvisited steps get `data-step-state="valid"` and ✓ (FG 02-8b FE_GAP **P2**). Needs a neutral "not visited" state. |
| 02-h | Strategy cards (H02:187–197) | DEV-OK (DQ-07) | `NewRun.tsx:365–423` | `strategy_id` is pinned to the alpha; two protocol buttons; the "certifies (2)" sentence is HiFi copy. |
| 02-11 | Route grid: title "Execution route — how orders come to exist", in-card "full route atlas →", badge = admission | PARTIAL | `NewRun.tsx:438–516` inside `ResearchPanel "engine routes"` `:1877` | There are two headings ("ENGINE ROUTES" + "Route"). The atlas link sits in the header row. Blocked cards show the engine `status_word` (e.g. SUPPORTED) next to the refusal. That badge question is **VD-FG-01-05, a proposal** (not decided). |
| 02-i | Per-route param forms (level_mode, same_bar_policy …) | DEV-OK (DQ-11) | `RoutePanel` `NewRun.tsx:533–598` | The forms are shown disabled because 12 routes are NOT_ADMITTED (DQ-11). |
| 02-12 | Data declaration box (required columns, timeframes, warmup, seed) + note | YES | `NewRun.tsx:723–750`, note `:109–110,626–628` | E4. The card title is "Data", not "Market data" (copy). |
| 02-j | Dataset list / symbol / timeframe | YES | `NewRun.tsx:629–722` | From the P10 catalog; symbol coverage caption. |
| 02-D | Dataset catalog failure copy (no server prose) | PARTIAL (CX only) | CL `NewRun.tsx:659–662` + `datasetClient.ts:49,62` `reason: error.message` (prints server prose); **CX** `datasetClient.ts:48` `CATALOG_FAILURE_COPY`, `NewRun.tsx:681,721–733` | FE-A1-01 (P1) is fixed only on CX (`a1d7bf3f`). CL still prints the server message. |
| 02-13 | Data and walk-forward prefilled | PARTIAL (G2 only) · DEV-OK (D4) | **G2** `ed33db0d` `NewRun.tsx:607–646,792–796,931–937`, `runDraft.ts` (+307) | D4 says: prefill from the chosen dataset's coverage, editable, blank without a dataset. G2 fills only the 4 outer bounds. Interior bounds stay empty, because no served fact defines them (BR-D4-1..3). No dataset/symbol default. Not merged into CL or CX. |
| 02-k | Walk-forward: "Half-open: end-exclusive · an empty Holdout Live runs to the dataset's last bar" (H02:253) | NO | WindowsStep `NewRun.tsx:~840–1085` | Fields are labelled "end exclusive", but the note sentence is missing. |
| 02-l | Fold plan preview: formula + "≈ N outer folds" before preflight (H02:266–273; spec `02_SCREEN_SPECS.md:27`, `screens/02_new_run.md:153`) | DEV-UNAPPR | `NewRun.tsx:993–997` ("server derives the authoritative fold plan at preflight"); the server plan is in `PreflightPanel.tsx:271–310` | A deliberate FE choice ("no second number") with no DQ/D id. The fold plan does appear after preflight. Needs a Bobby ruling or an estimate labelled "≈ … server decides". |
| 02-m | optimization_mode / schedule selects, invalid schedules with reason, inner folds | YES | `NewRun.tsx:1000–1079` | |
| 02-14 | Parameter table header incl. STEP; declared-bounds status | YES | `NewRun.tsx:1125–1236` | E4 / FG 02-14 MATCH. |
| 02-15 | Trials / early stop / seed are read-only when the profile forbids overrides ("pinned by protocol") | NO | `NewRun.tsx:1357–1390` (no `disabled`/`readOnly`); profile shown in `SubmissionConstraints` `:1316–1338` | FG 02-15 FE_GAP P3, open. |
| 02-n | "pinned by protocol" facts + config-surface accordion + defaults footer | DEV-OK (RF-04 README l.38) | `NewRun.tsx:1260–1313`, `:1393–1425`, `DEFAULTS_FOOTER :112` | Folded into the "Optimizer defaults · N fields · pinned by protocol" accordion, from the Atlas. |
| 02-16 | Review: summary table + primary RUN PREFLIGHT in the main panel | PARTIAL | `NewRun.tsx:1906–2060`; summary rows in `ReviewRail` `:1525–1584` | E4 made "Run preflight" the primary button at the top and folded the six empty panels (`:1981–1996`). The summary table still lives in the rail, not the main panel. No "Account · execution" row (DQ-12). |
| 02-PR | Preflight refusal shown for every refusal, client copy, no server prose | PARTIAL (split across lines) | CL `NewRun.tsx:1688,1947–1974` (`6a4cb383`: field-less refusal shown; only 403/404 get client copy, others print `preflightRefusal.message`); **CX** `NewRun.tsx:2019–2048,2068` + `preflightClient.ts:164–166` (20 fixed sentences, request id, preview opened, summary "preflight refused this request") | FE-A1-03/-04 are fully fixed only on CX (`a1d7bf3f`, B G3 40/40). CL duplicates half of it, and the two will **conflict** in the same block on merge. Copy wording = VD-FG-08-01 (proposal). |
| 02-o | Create run → lands on progress; unknown-outcome re-check | YES | `NewRun.tsx:1998–2058`; `NewRunRoute.tsx:357` | FG 02-CR MATCH. G10 real receipt: R-P04-019 created. Run-create copy = CX `runCreateClient.ts:134–154` (FG-08). |
| 02-9 | Gold "CLAIM FORECAST — THE ADDITION" card: payload sha, mode×schedule, source, claim, italic augmentation note | PARTIAL | `ReviewRail` `NewRun.tsx:1503–1524` | Content is present: claim via `claimToken` (E1, no raw enum), OOS state, mode×schedule. Missing: gold card styling, the `payload sha256`, the "source" row, and the augmentation sentence. |
| 02-10 | Cert ceiling **C** + "Want B?" hint; window timeline bar counts | PARTIAL · BE | `NewRun.tsx:1514` "cert ceiling not published"; timeline `:1481–1502` text only | FE shows typed absence. **BE: CG-FG-S02-01** (cert ceiling per mode×schedule) and **CG-FG-S02-02** (bars per window). |
| 02-17 | "RULES OF THIS SCREEN" footer (H02:439–440) | NO | — (no match in `NewRun.tsx`) | FG 02-17, open. |
| 02-18 | Step written to URL (`?step=`) | NO | `NewRunRoute.tsx:376` reads it; `NewRun.tsx:1842–1845` never writes it | Reading `?step` works (FG 02-Q MATCH). Writing does not. |
| 02-S | Context/atlas/registry refusal states | YES | `NewRunRoute.tsx`, `NewRun.tsx:446–451` | FG 02-C / 02-RA MATCH. The FG-slice2 note says partial/stale are unreachable (reads happen once). |

**Verdict S02:** Functionally usable and verified end to end (preflight → create on real data), but it is the furthest from the HiFi of the three screens. About 11 FE gaps remain open. Three delivered pieces (D4 prefill, FG-05 last-published-rc, FG-08 refusal copy) sit on three different lines, and none of them is in both. The fold-plan-preview omission has no recorded decision.

**Remaining gaps S02**
| Gap | Size | Owner |
|---|---|---|
| Consolidate CX FG-08 (`a1d7bf3f`) with CL `6a4cb383` (same refusal block, conflict) and CL `datasetClient.ts` prose. Take CX's version | S | FE-Claude (merge) |
| Merge G2 `ed33db0d` (D4) and re-run its 33 tests after the FG-08 merge (DataStep overlaps `:600–760`) | S | FE-Claude |
| Merge CX FG-05 `LastPublishedRc`; format its publish time with the shared UTC formatter (E1) | S | FE-Claude / FE-Codex |
| 02-8b neutral "not visited" pill state; 02-7 live captions (valid / needs attention / preflight pending) and one-row stepper | S | FE-Claude |
| 02-4 no "not reported" before a choice; preselect the single ACTIVE registry entry | S | FE-Claude |
| 02-5/5b context: supersedes (typed absence), links lineage / runs of this av_ (`/runs?alpha=`) / import new version, `avStateNote` | S | FE-Claude |
| 02-15 disable trials / early stop / seed with the profile reason when FORBIDDEN / MUST_BE_NULL | S | FE-Claude |
| 02-16 move the review summary table into the main Review panel (the rail can keep a compact copy) | M | FE-Claude |
| 02-9 claim-forecast card: gold styling, payload sha (from preflight `config_hash`/digest when present), source row, augmentation note | S | FE-Claude |
| 02-17 rules footer; 02-k half-open note; 02-2 frame / subtitle / release-line position, and Inter panel titles; 02-11 single heading + "Execution route — …" title; Data → "Market data" | S | FE-Claude |
| 02-18 write `?step=` on pill change (replace, not push) | S | FE-Claude |
| 02-l fold plan preview before preflight: build an "≈ N (server decides)" estimate or record a deviation | S | Bobby decision → FE-Claude |
| 02-10 cert ceiling per mode×schedule (CG-FG-S02-01); bar counts per window (CG-FG-S02-02); D4 interior bounds / warmup (BR-D4-1..3) | M | BE (Codex) |
| 02-11 route badge for blocked routes (VD-FG-01-05); refusal copy wording (VD-FG-08-01); VD-FG-08-02..05 | — | Bobby decision |

---

### Cross-line notes
- **Nothing on S00 is line-specific.** On S01, only the rc chip P22 path is CX-only.
- **S02 is split three ways:** FG-05 and FG-08 are on CX, D4 is on G2, and the field-less refusal fix is on CL. The CL and CX refusal blocks overlap (`NewRun.tsx` ~1947 vs ~2019), and G2's DataStep overlaps CX's catalog note. Expect conflicts. The CX FG-08 version is the superset.
- The prior audit's backend-caused rows 00-3, 01-2 ("available" text), 01-3, 01-4, 01-5 and 01-7 are **closed** by E12, E4, E10 and E11.
