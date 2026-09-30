# G8 · Screen 06 per-fold glyph strip, "what this mode reads" (Claude, 2026-09-30)

Unified plan §13.4.1 section G, item **G8** (anchor `rl-open-ledger`). It closes **E5-O4** of `E5_S06_STAGE_B_CLAUDE_2026-09-26.md` ("6.4 per-fold glyph strip is not built. FE-M, Claude, later") and HiFi audit row **6.4**.
Branch `feat/g8-s06-fold-glyph-strip`, cut from `origin/docs/research-loop-plan` at `d3d99f26`. Not pushed. The change is staged and **uncommitted** by the coordinator's owner directive of 2026-09-30 (one batched commit and one hook run for all agents); no pre-commit hook was run for it. `UNIFIED_IMPLEMENTATION_PLAN.md` is not edited: the G8 ledger line is for whoever next edits section G.

## The constraint that decided the design

The HiFi draws, per fold, a train cell and a test cell and colours the test cell by how the mode lets OOS in. Its demo tape decides that with a client-side matrix (`CLAIMMX`, keyed `mode|schedule`) and a per-mode fold count (`folds: 5` for modes 1 and 4, `0` for modes 2, 3, 5). Neither may exist in the browser here. So each glyph has exactly one served owner, and the strip's source contains no mode id, no schedule id and no colour literal (a test asserts it):

| Glyph | Served fact | Read |
|---|---|---|
| which folds exist, their order, the `fold_01` label | `fold_plan.folds[].fold_id` | `researchCurrentSourceSplitGetV1` (S05's read) |
| train cell (the fold's train window) | `train_start_utc_ms`, `train_end_utc_ms`, `anatomy.train_bars` | same |
| test cell's existence and window | `test_start_utc_ms`, `test_end_utc_ms`, `anatomy.test_bars` | same |
| test cell's state (gold pulse / hatched / light / none) | `modes[mode_id].facts.schedules[schedule].oos_use_state` (and `oos_use`, `oos_use_condition`) | `researchEngineAtlasGetV1`: the engine's own mode descriptor |
| which mode × schedule this run is | `search_contract.optimization_mode`, `optimization_schedule` | `researchCurrentSourceSearchGetV1` |
| "what it reads" tokens | `modes[].facts.reads.selection_inputs`, `retention` | Atlas |
| the note under the strip | keyed by `oos_use_state`, HiFi copy verbatim where it survives | (copy, not data) |

The Atlas descriptor is per mode × schedule, so the test cell has one state for the whole strip. Only the windows differ fold to fold. That is a property of what the engine publishes, and the strip does not pretend otherwise.

## Sources read

| Source | Revision |
|---|---|
| HiFi `release-v1.1/QuantBT 06 S2 Search and Selection.dc.html`, block "what this mode reads" (markup lines 76–88) and the script that builds it (`diagram`, `diagramNote`, `MODES`, `CLAIMMX`, lines 483–558 and 768–782) | `d3d99f26` |
| `evidence/HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`, row 6.4 | `d3d99f26` |
| `evidence/P15/E5_S06_STAGE_B_CLAUDE_2026-09-26.md`, "Left open" E5-O4 | `d3d99f26` |
| `SearchDetail.tsx`, `SearchRoute.tsx`, `SearchSurface.tsx`, `SearchStageB.tsx`, `useSearch.ts`, `retainedLane.ts`, `splitClient.ts`, `foundationClient.ts`, `atlas.ts`, `EngineAtlas.tsx` (S12's `oos_use_state` labels), `researchFormat.ts`, `researchRefusal.ts`, `researchScreen.css` (`data-motion`), `styles/tokens.css` | `d3d99f26` |
| `packages/contracts/generated/research-foundation.d.ts` (`AtlasModeFacts`, `AtlasScheduleFact`, `AtlasReadsFact`, `AtlasResponse`), `research-current-source.d.ts` (`Split.fold_plan`, `Fold`, `FoldAnatomy`, `Search.search_contract`, `Provenance`), `research-search.d.ts` (`ClaimRow`, `SourceProfile`) | `d3d99f26` |
| Fixtures: `research-foundation.atlas-current.valid.json`, `research-foundation.historical-identity.valid.json`, `research-current-source.split.valid.json`, `research-current-source.search-surface.valid.json` | `d3d99f26` |
| Preview `:8095` reads (GET only, image `d3d99f26`): WFO `rrun_17f762128acf8c998ac7cc44d13f663f`, P04 `rrun_464bf9c3dd8979af87e44388ea6910ef` | 2026-09-30 |

## HiFi block → component → field → state → test

HiFi measurements come from the markup and were re-measured in Chromium on both sides (below). Component paths are under `apps/portal/frontend/src/research/`.

| Audit | HiFi block | Component | Field | States shown | Test (`searchFoldStrip.g8.test.tsx` unless noted) |
|---|---|---|---|---|---|
| 6.4 | Row: flex wrap, gap 14, padding 8/14, sunken paper, radius 0 0 6 6, 1 px line-soft top | `SearchDetail.tsx` `SearchScreen` (`data-mode-reads`, now `role="group"` labelled by its own label) | none | all three lanes keep the frame | "the row is a labelled group…"; browser numbers |
| 6.4 | Label "what this mode reads" (10 px, 500, caps, .07em, ink-faint) | same | none | retained / reference / shell | same |
| 6.4 | Fold column: train 34×12 + test 14×12, 1 px gap, label mono 8.5, gap 2, pitch 63 | `SearchFoldStrip.tsx` `FoldGlyph` | `fold_plan.folds[]` (`fold_id`, both windows, `anatomy.*_bars`) | 2 folds on the real seal; 32; 48 + "+N more folds" | "draws the served folds…"; "32 folds…"; "60 folds…" |
| 6.4 | Train cell `#a8c6ce` | `FoldGlyph` | `train_start_utc_ms`, `train_end_utc_ms` | published (`--viz-train`) / not published (dashed, no fill) | "a window the fold plan does not publish is a dashed cell…"; `stripFoldOf` half-window case |
| 6.4 | Test cell: gold + pulse, gold + pulse, hatched, light, none | `testCellStyle` | Atlas `schedules[].oos_use_state` | `SELECTION_INPUT`, `RETROSPECTIVE` (gold, pulse `rs-pulse` 2.2 s, delay .4 s), `WITHHELD_UNTIL_S4` (hatched), `REPORT_ONLY` (light), `NOT_APPLICABLE` (no cell), not stated (dashed) | "the OOS cell has the HiFi's five looks"; eight per-descriptor cells; "engine that states no OOS use…" |
| 6.4 | Note, 10.5 px, lh 1.5, `flex:1`, min 260 | `OOS_READING_NOTE` | keyed by `oos_use_state` | five sentences + one for "not stated" | per-descriptor cells assert the note |
| 6.4 | (not in the HiFi) what the mode reads | `SearchDetail.tsx` `RetainedModeReads` detail line | `facts.reads.selection_inputs`, `retention`, `oos_use_condition`, release id | published / `reads` NOT_PUBLISHED with its reason in the title | "prints the Atlas's own words…"; "a reads fact the Atlas withholds…" |
| 6.4 | Typed absences (none in the HiFi: it never lacks a field) | `FoldStripAbsence`, `hubModeReadsAbsence`, `modeReadsView` | the reason each read gave (table below) | `NOT_APPLICABLE` upright, `NOT_PUBLISHED` italic; loading and "not read" are separate states | section 3 and section 5 of the test file |
| a11y | (not in the HiFi) | `FoldStrip` | none | accessible name, decorative glyphs `aria-hidden`, `sr-only` list: one summary line then one line per fold | "the row is a labelled group…"; scale test asserts all 60 lines exist while 48 glyphs are drawn |
| E1 | fold labels, UTC | `foldLabel`, `formatUtc`, `groupDecimalString` | `fold_id`, windows, bars | `fold_01`, `2026-06-01 00:00 UTC`, `720` | "fold ids count from 1…"; window titles |

Existing S06 tests (`searchDetail.test.tsx`, `searchStageB.e5.test.tsx`, `searchSurface.x2.test.tsx`) are unchanged and still pass 91 / 91: the P04 `reference` row keeps its Atlas link, its "release metadata · not run evidence" chip and its sentence, and the `shell` row still says "not published".

## Which modes are drawn from which served fact

All eight mode × schedule descriptors in the published Atlas (`research-foundation.atlas-current.valid.json`, release `er_quantbt_111`) draw a strip. The test file loops over the fixture's own modes, so a ninth descriptor would fail the "eight descriptors" guard rather than pass unseen.

| Mode | Schedule | `oos_use_state` (served) | `oos_use` | Test cell | `selection_inputs` (served) | On the preview |
|---|---|---|---|---|---|---|
| `mode_1_decay` | `global` | `RETROSPECTIVE` | USED, condition: robust_decay | gold, pulses | is_metrics, oos_metrics, decay_components | **real run** |
| `mode_1_decay` | `per_fold_decay` | `SELECTION_INPUT` | USED | gold, pulses | same | FIXTURE variant |
| `mode_1_decay` | `per_fold_causal` | `WITHHELD_UNTIL_S4` | NOT_USED | hatched | same | FIXTURE variant |
| `mode_2_sbb` | `global` | `REPORT_ONLY` | NOT_USED | light | is_return_path, bootstrap_indices, replicate_statistics | FIXTURE variant |
| `mode_3_flat_minima` | `global` | `RETROSPECTIVE` | USED, condition: robust_decay | gold, pulses | is_metrics, parameter_coordinates, plateau_neighborhood | FIXTURE variant |
| `mode_4_is_only_robust` | `global` | `REPORT_ONLY` | NOT_USED | light | is_metrics, is_subperiod_metrics, plateau_neighborhood | not shot (same look as mode_2) |
| `mode_4_is_only_robust` | `per_fold_causal` | `WITHHELD_UNTIL_S4` | NOT_USED | hatched | same | FIXTURE variant |
| `mode_5_full_robust` | `global` | `NOT_APPLICABLE` | NOT_USED | none (train cell only) | full_is_metrics, full_sample_plateau, temporal_components | FIXTURE variant |

No mode's read pattern is unpublished in this release, so no mode is a typed absence *as a mode*. Typed absences arise from a lane or from a read that did not answer:

| Case | State | Code shown (title and `data-absence-code`) | Where |
|---|---|---|---|
| **P04 fixed profile** (no search ran) | `NOT_APPLICABLE` | hub `source_profile.reason_code` (`P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY`), else `source_profile.state` | `hubModeReadsAbsence`; the P04 run asks for neither the fold plan nor the Atlas |
| hub source not reported / legacy / not published | `NOT_PUBLISHED` | `source_profile.reason_code` or state | `hubModeReadsAbsence` |
| read names no declared mode | `NOT_PUBLISHED` | `claim_row.basis` | `shell` row |
| search contract names no mode or schedule | `NOT_PUBLISHED` | `UI_SEARCH_CONTRACT_NAMES_NO_MODE_OR_SCHEDULE` | `modeReadsView` |
| fold plan refused | `NOT_PUBLISHED` | the refusal's own code (`HTTP_n` if none); a 409 uses the lane state's sentence | `useModeReads` |
| fold plan: lane says not applicable | `NOT_APPLICABLE` | the lane's `reason_code` | `useModeReads` |
| fold plan lists no fold | `NOT_PUBLISHED` | `UI_FOLD_PLAN_LISTS_NO_FOLDS` | `modeReadsView` |
| Atlas refused | `NOT_PUBLISHED` | the refusal's own code | `useModeReads` |
| Atlas answered a retained historical identity | `NOT_PUBLISHED` | `UI_ATLAS_DESCRIBES_NO_CURRENT_RELEASE` | `useModeReads` |
| Atlas has no entry for the run's mode | `NOT_PUBLISHED` | `UI_ATLAS_HAS_NO_ENTRY_FOR_THIS_MODE` | `modeReadsView` |
| Atlas mode has no `facts` (older manifest) | `NOT_PUBLISHED` | `UI_ATLAS_MANIFEST_PUBLISHES_NO_ENGINE_FACTS` | `modeReadsView` |
| Atlas facts are for another engine release than the run's `provenance.engine_version` | `NOT_PUBLISHED` | `UI_ATLAS_RELEASE_DIFFERS_FROM_THE_RUNS_ENGINE`, both versions named | `modeReadsView` |
| Atlas has no fact for the run's schedule | `NOT_PUBLISHED` | `UI_ATLAS_HAS_NO_FACT_FOR_THIS_SCHEDULE` | `modeReadsView` |

`UI_*` codes are the screen saying so itself; a server code is never renamed into one. Two things stay drawn rather than absent, because the strip's other facts still stand: an engine that states no `oos_use_state` (dashed test cell, sentence says "unstated"), and a fold whose window ends are not both published (dashed cell, "window not published" in its title and text line, never a date or a `0`).

**P04.** The strip cannot be drawn honestly there: the source ran a fixed profile and created no optimizer study, and P04 has no fold plan (the retained lane answers a typed not-applicable). Drawing the declared `mode_1_decay · global` from the Atlas would put release metadata in the place of run evidence, which the claim row already refuses (`DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE`). It is `NOT_APPLICABLE` with the hub's own reason; the Atlas link and its tag stay.

**Release check.** The retained contract types `provenance.engine_version` as the constant `"1.1.1"`, and the Atlas's current release is 1.1.1, so the check passes on every retained run today. It is there for the day the Atlas moves to another release while sealed runs stay on 1.1.1: the strip then goes absent instead of describing the wrong release. A test forces it.

## Measured geometry (Chromium, 1440)

| | HiFi | Built |
|---|---|---|
| row padding / gap / background / radius / top border | 8px 14px / 14px / `#f4f2ec` / 0 0 6 6 / 1 px `#efede4` | same |
| label | 10 px, letter-spacing 0.7 px, 138 px wide | same |
| fold column | 49 × 26, pitch 63 | 49 × 26, pitch 63 |
| train cell | 34 × 12, `rgb(168,198,206)` | same (`--viz-train`) |
| test cell | 14 × 12, 1 px border, gold `rgb(154,106,31)` with accent border (retrospective) | same (`--accent-2`, `--accent`) |
| fold label | mono 8.5 px `rgb(147,157,176)` | same |
| note | 10.5 px, lh 15.75, `rgb(78,90,110)`, min 260 | same |

## Deviations from the HiFi (recorded, not gaps)

- **Folds come from the fold plan for every mode.** The HiFi draws one "train / test" block for modes 2 and 3 and one "full sample" block for mode 5 because its demo tape gives them no folds. The served fold plan has folds whatever the mode, so all modes draw the served folds. Mode 5 draws train cells only, with the Atlas's own word (`NOT_APPLICABLE`) in the note instead of the HiFi's "train and test at once", which no served fact says.
- **The train cell does not pulse.** The HiFi's "the sampler pulses on IS" is a claim about what the search read; nothing in the fold plan or the Atlas says what any window was read by, and mapping a token such as `is_metrics` to a window would be a browser rule. Its first note sentence is dropped for the same reason. The test cell pulses exactly where the HiFi's does (`SELECTION_INPUT`, `RETROSPECTIVE`), through the existing `data-motion="pulse"` vocabulary, so `prefers-reduced-motion` turns it off.
- **Windows are in titles and the text alternative, not on screen.** The cells have fixed widths as in the HiFi; the exact UTC windows and bar counts ride in each fold's `title` and in the `sr-only` list.
- **A second line under the strip** holds the Atlas link, the Atlas's `selection_inputs`, `retention`, release id and `oos_use` condition, and the search contract's `top_is_fraction`, `decay_lambda`, `decay_gamma`, plus the Stage A / B sentence. The four contract tokens the claim row directly above already prints (`validation_claim`, `chronological_claim`, `oos_used_for_selection`, `candidate_selection_metric`) are no longer repeated: the strip replaces the token stand-in E5 left there. Nothing was removed that is not on screen elsewhere.
- **Cap at 48 folds.** Past 48 the strip draws the first 48 and prints "+N more folds"; the text alternative lists all of them. 32 folds wrap to two lines at 1440 and five at 660.
- **Fold labels are 1-based** (`fold_01`), through E1 `foldLabel`, matching the HiFi and the rest of the screen.

## Findings

- **F-1 · Two words for the OOS state on one card (not changed).** On the real WFO run the claim row's "OOS COLUMN STATE" chip reads `selection input` while the new strip says retrospective. Both are true (`oos_used_for_selection` is `true`, and the Atlas says the schedule `global` uses OOS retrospectively), but the HiFi's claim row prints `retrospective` for `mode_1_decay · global`. The chip is the W3b rule in `RetainedOosColumn` (`oos_used_for_selection === true` → `SELECTION_INPUT`), a browser-side mapping now that S06 holds the Atlas's `oos_use_state`. I did not change an accepted W3b claim-row rule inside a strip task, and the chip would flip after the Atlas answers. Left open (below).
- **F-2 · No canonical P04 hub fixture.** `packages/contracts/fixtures` has no `research-search.*` body. The P04 tests use `g8RealP04.fixture.json`, a real preview capture (GET only) of the P04 hub read and the retained lane's two typed not-applicable answers, in the manner of `w3bRealWfo.fixture.json`.
- **F-3 · `tokens.test.ts` fails at the base commit.** `src/styles/tokens.test.ts` "keeps every raw color literal inside the declared token files" reports 6 offenders, all in `src/research/AlphaImport.tsx` (E6, S14: hex in a comment block and two `rgba(28,37,50,.05)` strings). Not from this change and outside S06; the hook does not run the portal frontend vitest (it runs `contracts-test.sh` and `control-api-test.sh`), so it does not block the commit.

## Tests (exact)

| Gate | Result |
|---|---|
| `searchFoldStrip.g8.test.tsx` (new) | **41 / 41**, three runs in a row |
| S06 files before the change (`searchDetail` + `searchStageB.e5` + `searchSurface.x2`) | 91 / 91; the same 91 after |
| Frontend research vitest (`src/research`, all files) | **46 files, 1471 / 1471** (1430 before this change, +41) |
| Whole frontend vitest, one run while the browser checks and other agents' hooks were loading the machine | 198 files, 3883 passed, 3 skipped, 4 failed. `PortalShell.test.tsx` (1) and `adminCli.test.tsx` (2) timed out under that load and pass in isolation (47 / 47). The fourth is F-3, `tokens.test.ts`, which fails at the base commit |
| `tsc --noEmit -p .` (apps/portal/frontend) | clean, exit 0 |

The 41 cells: 6 on the retained run (folds and cell geometry; RETROSPECTIVE and the HiFi note; the two reads asked once each and both GET; windows in UTC in titles and text lines; labelled group and text alternative; the Atlas's words), 12 on the Atlas descriptors (an "eight descriptors" guard, one cell per descriptor, the five looks, "follows the served state, not the mode's name", "no mode, schedule or colour rule in the strip's source"), 15 on typed absences, 2 on scale, 3 on the P04 lane and 3 on the derivation and E1 helpers. No response is hand-built: Atlas, historical Atlas, split and search are the canonical fixtures; progress, requested spec and the WFO hub read are the W3b real bodies; the P04 bodies are the real capture. The error bodies for the refusal cases (503, 409 with `details.lane_state`) are Problem bodies of the published shape.

## Browser

Vite on `:5235` (`scratchpad/g8/vite.g8.config.mts`) proxying to the `:8095` preview, reads only (the session login is the only POST). HiFi opened from disk. Frames were taken with reduced motion (the pulse off) so they compare; a separate check with motion on measured the two test cells as `rs-pulse` 2.2 s / 0.4 s delay and the train cells as `none`. Files are in `scratchpad/g8/shots/` and are not committed.

REAL = the preview exactly as it serves. FIXTURE = the real WFO run with one served fact changed in the browser (route interception; nothing written).

| Shot | Kind | Overflow px | sha256 (first 16) |
|---|---|---|---|
| `final-s06-1440` HiFi full page | HiFi | 0 | `735acdfb45966ecd` |
| `final-s06-1440-strip` HiFi strip crop, per_fold_causal | HiFi | — | `bf7770352d673e8f` |
| `final-s06-660` HiFi full page (no 660 layout) | HiFi | 182 (its own) | `f8c385c6fd731205` |
| `final-s06-660-strip` HiFi strip crop | HiFi | — | `8a819884284079c3` |
| `hifi-strip-m1-decay-1440` | HiFi | — | `2a3950f9feb2daa2` |
| `hifi-strip-m1-global-1440` | HiFi | — | `45b5bd783951879e` |
| `hifi-strip-m2-global-1440` | HiFi | — | `dae45378752c5d6c` |
| `hifi-strip-m4-causal-1440` | HiFi | — | `e9d5a6d49762a661` |
| `hifi-strip-m5-global-1440` | HiFi | — | `a7055490d56315f3` |
| `final-wfo-1440` full page | REAL | 0 | `3fe30f0efa1777e9` |
| `final-wfo-1440-strip` | REAL | — | `94b28e453677b82e` |
| `final-wfo-660` full page | REAL | 0 | `a9653bca1f795488` |
| `final-wfo-660-strip` | REAL | — | `259acfa007cb0efe` |
| `final-p04-1440` full page | REAL | 0 | `b4a49f742da01097` |
| `final-p04-1440-strip` | REAL | — | `580e8b938a1ef3b4` |
| `final-p04-660` full page | REAL | 0 | `7aeac05c41671084` |
| `final-p04-660-strip` | REAL | — | `63c62766e97886b6` |
| `before-wfo-1440` (before this change) | REAL | 0 | `62b42ad45e62c863` |
| `var-m1-causal` 1440 / 660 | FIXTURE | 0 / 0 | `e37bcc97411256a9` / `fc8f1a6b5eb78031` |
| `var-m1-decay` 1440 / 660 | FIXTURE | 0 / 0 | `e4f6c13508822560` / `c4a24505055e3ac0` |
| `var-m2-global` 1440 / 660 | FIXTURE | 0 / 0 | `5abca6f61209923c` / `7a1e73d272c634f6` |
| `var-m3-global` 1440 / 660 | FIXTURE | 0 / 0 | `f6e23fd695e37408` / `87cc1cf4582f794c` |
| `var-m4-causal` 1440 / 660 | FIXTURE | 0 / 0 | `6ddb616f30c0318b` / `96e7bb0d9e165924` |
| `var-m5-global` 1440 / 660 | FIXTURE | 0 / 0 | `e9446b383d403805` / `a09ef561dbc3afd9` |
| `var-folds-32` 1440 / 660 | FIXTURE | 0 / 0 | `97bbd68a2eeefa21` / `2233bea3a77ce2e2` |
| `var-folds-60` (48 drawn, "+12 more folds") 1440 / 660 | FIXTURE | 0 / 0 | `02fb5cfe0827abcb` / `df85c56d15cd13bc` |
| `var-window-null` 1440 / 660 | FIXTURE | 0 / 0 | `a0e733af5e8e095a` / `14ccc7c6d861dae6` |
| `var-atlas-503` 1440 / 660 | FIXTURE | 0 / 0 | `627e1038086e7502` / `caae63f1c4de542b` |
| `var-split-409` 1440 / 660 | FIXTURE | 0 / 0 | `db73e06080c5ef10` / `93fdf5fcb0ba3425` |

No page errors and no 4xx/5xx on any real shot. (The HiFi's own console line about fetching itself over `file://` is the HiFi's, as in E5.)

**What I looked at.** Every HiFi / REAL pair at 1440 and 660 for both runs, in context and as strip crops. The WFO strip has the HiFi's first line exactly (label, folds, note) with two folds instead of five, because the run has two; at 660 the note stays beside the folds. P04 draws no glyph, says "not applicable" with the hub's reason and keeps the Atlas link and its tag. The fixture variants cover the five OOS looks, mode 5 without a test cell, 32 folds wrapping at both widths, the 48 cap, a dashed unpublished window, and both refusal absences.

**Axe** (wcag2a/aa, scoped to `[data-screen='search-detail']`): the only rule hit is `color-contrast`, all of it the shared D-B1 `--ink-faint` token (`#939db0` at 2.43:1 on the sunken paper; 2.73:1 on P04's "not applicable"). Whole screen: WFO 165 nodes at 1440, 161 at 660; P04 104 at both. Inside the strip row: WFO 9, P04 3, all the same token (the row label, the two 8.5 px fold labels, the Atlas token keys). E5 had 166 on the fixture-lane 1440 shot, so the row adds no new rule and no new colour pair. `aria-hidden-focus`, `aria-allowed-role`, `scrollable-region-focusable` and the rest are clean.

## Left open

| # | Item | Owner / kind |
|---|---|---|
| G8-O1 | **F-1: the claim row's OOS COLUMN STATE chip on a retained run.** Take the Atlas's `oos_use_state` (`retrospective` for `mode_1_decay · global`, as the HiFi prints) instead of mapping `oos_used_for_selection === true` to `selection input`. Needs a decision on what the chip shows before the Atlas answers, and it changes W3b tests that assert `SELECTION_INPUT`. | Claude, with Bobby's word on the interim state |
| G8-O2 | A canonical `research-search.p04-fixed-profile.valid.json` (and the retained lane's not-applicable bodies) in `packages/contracts/fixtures`, so P04 tests need no preview capture. | Codex (contracts) |
| G8-O3 | Real-run receipt for modes other than `mode_1_decay · global`. The preview holds only that run; the other seven descriptors are drawn from the published Atlas in tests and from FIXTURE variants in the browser. A `per_fold_causal` or `per_fold_decay` sealed run would give the first real receipt of a hatched or selection-input strip. | Part of G10 (writable stack and new runs) |
| G8-O4 | `tokens.test.ts` fails at `d3d99f26` on `AlphaImport.tsx` (F-3). | Claude (S14) or whoever owns E6 |
| G8-O5 | D6 stays as decided: no search cinema; this strip needs no trace data and asks for none. | — |

## Rollback

Revert the commit that carries this change (or drop the six files). Nothing outside S06 changes: `SearchRoute.tsx` gains one hook call and one prop, `SearchDetail.tsx` swaps the "what this mode reads" body, `SearchFoldStrip.tsx` and its test and fixture are new. No contract, backend, token or shared component is touched, and no request is added on a lane the retained search does not hold (P04 asks for neither the fold plan nor the Atlas).
