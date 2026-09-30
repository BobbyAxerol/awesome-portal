# HiFi vs FE audit — S05 Split · S06 Search & Selection · S07 Freeze (2026-09-30, read-only)

**Code lines evaluated as a union** (all paths are under `apps/portal/frontend/src/research/` unless stated otherwise):

- **W1** = Claude `portal-research-w1-build` at HEAD `d7db1cb3` plus uncommitted work. The uncommitted part touches only TopBar/shell.css (G14 crumb collapse), AlphaImport and docs.
- **CX** = Codex `portal-research` at HEAD `c2ec1443`.
- **G8** = worktree `agent-a935…`, staged, not committed.
- **G3** = worktree `agent-ab5c…`, uncommitted.

**Base facts, checked:**
- W1 and CX both descend from `d3d99f26`.
- Neither line changed `SplitDetail.tsx`, `SearchDetail.tsx`, `SearchStageB.tsx`, `FreezeDetail.tsx` or `WhatIfCard.tsx` after `d3d99f26`. So line numbers below hold for both lines.
- The only CX change in this area is `DigestChain.tsx` / `Stage4Binding.tsx`: engine_pin, plus the imported-source rule words.
- Codex's FG-01 audit tree `8783461e` has **byte-identical** S05/S06/S07 files to `d3d99f26` (checked with `git diff --shortstat`; only DigestChain differs). So its FE_GAP rows are still current unless marked otherwise below.

**Owner decisions:**
- VD-FG-* rows are **proposals** (FG-owner-decisions.md). VD-FG-01-01 is explicitly OPEN.
- DEC rows cite the 26/9 audit (`HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`) or the ledger (§13.4.1).

## Cross-screen (S05–S07)

| # | HiFi block | Status | Where | Note |
|---|---|---|---|---|
| X1 | Topbar `Research / QuantBT Backtest / R-WFO-118 / Stage N · …` | YES | `app/researchRunCrumb.ts:34-43` (`split/search/freeze` → "Stage 1 · Split" …) · base (D1), both lines | W1 uncommitted G14 (`TopBar.tsx`, `shell.css`): below 1440 px the `QuantBT Backtest` segment is dropped; below 1366 px the screen name is dropped too. At 1440 it matches the HiFi exactly. Bobby chose A. |
| X2 | Short run label `R-WFO-118` in page and topbar crumb | PARTIAL | Page crumb `<ShortId id={runId}>` at `SplitDetail.tsx:1453`, `FreezeDetail.tsx:1593` · D1 base. **Cold deep link on S05–S07: G3 only.** G3 adds `research/useRunLabelRead.ts`, `app/researchRunCrumb.ts` `RUN_LABEL_READ_SEGMENTS = {split, search, freeze, execute}` and a `TopBar.tsx` call, and is uncommitted. | Warm arrival, or a retained WFO run whose identity read fires, already gets the label on base. A cold link to a P04 run prints `rrun_…` until G3 merges. **CX `08fa8ee0`/`8ad39e83` cover only S09/S11/S13** (report/RC/compare reads) and do nothing for S05–S07. Merge note (FE gaps §8.3): take only G3's S05–S08 + crumb part. Its RC/report half conflicts with CX (it reads `run.display_label`, while CX puts the label at top level). |
| X3 | One fold numbering `fold_01…` | PARTIAL | Fixed via `foldLabel` in the S05 gantt (`SplitDetail.tsx:817`) and S05 table (`:2540`), S06 decay (`SearchStageB.tsx:272`) and S07 F1 (`FreezeDetail.tsx:1390`) · base (E2a) | **Still raw on S05's θ\* flow:** `ThetaLane id={fold.fold_id}` at `SplitDetail.tsx:2263` prints `0`/`1` next to `fold_01`/`fold_02` (CX FG 05-07, P2). Row aria/title use the raw id (`:824`, `:839`, `:1892`; FG 05-08). S07 banner says "folds 1–2" (`FreezeDetail.tsx:1200`, `foldSpan` at `:932`). The meaning is the same but the spelling differs. |
| X4 | One page frame (272 px margin, subtitle style) | YES | `SCREEN_FRAME` in S05/S06, and in S07 via `FreezeDetail.tsx:1583` · base (E2a/E2b) | The nested FREEZE card is removed (E2b). |
| X5 | Page crumb: sans, ink, `Stage N · …` · `next:` | PARTIAL | `FreezeDetail.tsx:1584-1620` | Same style as S05 now. S07 still adds `← S2 Search` and `attempt lineage →`, which the HiFi does not have (additive). The back-to-hub link echoes the incoming hash, not `stage=freeze` (FG 07-17, P3). |
| X6 | Timestamps `2026-08-12 04:18Z` | PARTIAL | S05/S06 `AsOf` → `formatUtc`/`asOfUtc` (`SplitDetail.tsx:345`); S07 local `iso()` at `FreezeDetail.tsx:156` | No raw ISO-ms remains. S07 mixes two formats: `…HH:MMZ` from `iso()` and `… UTC` from `formatUtc` in the retained strip (FG 07-14, P3). |
| X7 | Tokens as lowercase words | PARTIAL | S06 has a words helper (`SearchDetail.tsx:1161`); S07 strip lower-cases (`FreezeDetail.tsx:1664-1672`) | **S05 P04 lane still prints raw enums:** `{kind}` → `THREE_WINDOW_CURRENT` (`SplitDetail.tsx:1517`), `selection.state` → `FIXED_PROFILE_NO_SEARCH` (`:1545`), `holdout_state` → `P08_METADATA_BOUND` (`:1632`), `child_input_state` → `NOT_EXPOSED_TO_CHILD_TAPE` (`:1850`) (FG 05-03, P3). |
| X8 | One denied/missing state | YES | S05/S06 `RunNotFound`; S07 `StageDenied` (E2a) | FG X-03: 403 and 404 give identical copy on all 9 pairs. |
| X-01/02 (CX) | Server prose never rendered in a refusal | DEVIATION-unapproved (OPEN) | `ResearchPanel.tsx:242-251` (`RefusalNote` `data-refusal-detail`), `:103` `<details>`; `researchRefusal.ts:231` | Server `message` shows inline on S05/S06 lane refusals and inside `details` on S05–S07. **VD-FG-01-01 is OPEN (Bobby)** and blocks 15 FG-07 cells. |
| X-07 (CX) | `<title>` per screen ("QuantBT Stage 1 — Split & Windows") | NO | No `document.title` anywhere in `src/` (W1 or CX) | FE S |
| X-09 (CX) | No `scrollIntoView` | NO | `SearchDetail.tsx:806` | P2 debt |
| a11y | heading-order | PARTIAL | S06 flagged by the G7 axe probe (FE gaps §7) | Also D-B1: `--ink-faint` contrast, Bobby |

## S05 Split

| # | HiFi block | Status | Where | Note |
|---|---|---|---|---|
| 5.1 | Crumb, title, subtitle, source · as-of, COPY EVIDENCE LINK | YES | `SplitDetail.tsx:1436-1488`, `SPLIT_TITLE` `:81`, `CopyEvidenceLink` `:365` · base | Label caveat in X2 |
| 5.2 | protocol / window_mode demo switcher | DEVIATION-approved | One read-only pill `:1512-1523` | DEC 5.2 (P15/P16 composition: demo lanes); FG 05-02 MATCH |
| 5.3 | Facts grid (span, outer, inner, purge, embargo, holdout) | YES (+additive) | `:1557-1660` | P04 raw enums → X7. Bare `n/a` with the reason only in `title` for inner folds (FG X-08, P3). |
| 5.4 | Fold construction rows + per-fold date ranges | PARTIAL | `:800-864` | Ranges are `hidden … lg:block` (`:858`, also `:562`, `:951`), so they **disappear at 660**; the HiFi keeps them (FG 05-06, P2). Purge/embargo hatch spans are not bound to `anatomy.purge/embargo`; latent, since the fixture has 0 bars (FG 05-05, P3). |
| 5.5 | 5/32 folds scale toggle | DEVIATION-approved | — | DEC 5.5 |
| 5.6 | Holdout `SEALED · LOCKED` + cert-cap sentence | DEVIATION-approved | WFO `:1294-1357`; P04 `:874-1006` | DEC 5.6 (P14 deviations; W6A-D03). P04 raw chip text → X7. |
| 5.7 | θ\* flow IS bar `search · 512 trials · IS only` | PARTIAL | `isLabel="IS"` at `:2267` | Trial count not shown, although `search_contract.n_studies` and `ledger.source_trial_count` are already fetched (FG 05-09, P3). Lane ids raw → X3. |
| 5.8 | ❖ freeze marker + `frozen {UTC}` | DEVIATION-approved (re-opened) | Comment at `:2108-2113` | DEC 5.8 (X2 F5). Now that `fold.anatomy.cutoff_utc_ms` exists, **VD-FG-01-06** (proposal) asks whether it may be drawn. Bobby, after Codex confirms what the field means. |
| 5.9 | Fold table IS / OOS / Δ decay | PARTIAL | `ScoreCell` `:2560-2562`; P04 `AbsentCell reason=metricReason` `:2586-2588`, `:2487` | WFO YES. P04 prints "not in read" with a generic reason instead of the source code `P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE` (FG 05-13, P3). Rounding policy is VD-FG-01-02 (proposal A = keep DQ-08). |
| 5.10 | Boundary integrity: purge applied / embargo applied rows | NO | `:1796-1876`: WFO shows holdout, gap scan and train∩test only | Guards are served (`guards.purge_bars` / `embargo_bars`, shown in the facts grid) but not repeated as integrity rows (FG 05-14, P2). |
| 5.10b | `train ∩ test = ∅` ✓ | PARTIAL · BE: CG-FG-S05-01 | `:1873-1875` | FE draws ✓ whenever a fold plan exists, which asserts a verdict no field publishes (FG 05-15). Needs `SplitGuards.train_test_disjoint` (CG-FG-S05-01). |
| 5.11 | Gap scan | YES | `GapScanValue` `:1169-1202` · base (E14; confirmed on real data 30/9) | `?? 0` on null counts (`:1174`, `:1176`) (FG 05-17, P2) |
| 5.12 | Stitched OOS provenance + stitch digest | YES | `:1878-1908`, `StitchDigest` `:1209-1254` · base (E14, real 30/9) | FG 05-18 MATCH |
| 5.13 | Feeds forward + cert cap | DEVIATION-approved | `:1910-1947` | DEC 5.13 (W6A-D03); cap typed-absent |
| 5.14 | Rules footer | DEVIATION-approved | `:1968-1976` | DEC 5.14; VD-FG-01-09 recommends keeping it |
| 5.15 | Links (Evidence Flow, next, S4, Lineage) carry `#stage&fold` | YES | crumb `:1436-1467` | FG 05-20 MATCH |
| 5.16 | Cold deep link label | PARTIAL | G3 worktree only | See X2 |

**Verdict S05:** complete in structure, and every E14 field is live. The remaining gaps are small FE polish: fold-id spelling on the θ\* flow, ranges at 660, purge/embargo integrity rows, P04 enums and reason, and the trial count. There is one BE verdict field.

**Remaining gaps S05:**

| Gap | Size | Owner |
|---|---|---|
| θ\* lane id `foldLabel` (`:2263`) plus row titles | S | FE-Claude |
| Keep the per-fold ranges at 660 | S | FE-Claude |
| Purge/embargo integrity rows | S | FE-Claude |
| Trial count on the IS bar | S | FE-Claude |
| P04 raw enums → words (X7) and P04 metric reason code | S | FE-Claude |
| `null→0` in GapScanValue; bind anatomy purge/embargo hatches | S | FE-Claude |
| `train_test_disjoint` verdict (CG-FG-S05-01); until then show "not published" instead of ✓ | S | BE-Claude≤P21 (P14), then FE |
| ❖ from `cutoff_utc_ms` (VD-FG-01-06) | S | Bobby decision |
| Server prose (VD-FG-01-01) | — | Bobby decision |

## S06 Search & Selection

| # | HiFi block | Status | Where | Note |
|---|---|---|---|---|
| 6.1 | Header + COPY EVIDENCE LINK | YES | `SearchDetail.tsx:1873` (`searchEvidenceLink`) · base | — |
| 6.2 | optimization_mode ×5 / schedule demo switcher, "demo tape" line | DEVIATION-approved | Read-only chips | DEC 6.2 (P15 composition); FG 06-01 MATCH |
| 6.3 | Claim row (validation, chrono, oos_used, OOS column state, backend, metric + tag) | PARTIAL | `:1984` `Claim k="OOS column state"`, `RetainedOosColumn` `:410` | (a) **G8 F-1:** the chip reads `selection input` while the HiFi and the G8 strip say `retrospective` for `mode_1_decay · global`. Pending Bobby (FE gaps §7, §8.4a; G8-O1). (b) CONFIRMED/INFERRED tag not served: BE CG-FG-S06-01. |
| 6.4 | "what this mode reads" per-fold glyph strip | YES on G8 (staged) · NO on W1/CX | G8: new `SearchFoldStrip.tsx` (572 lines); `SearchDetail.tsx` swaps the body (`data-mode-reads`, W1 `:1536-1590`, `:2097-2145`); `SearchRoute.tsx` +4; 41 tests | Draws folds from `fold_plan` and the test-cell state from Atlas `oos_use_state`, with no FE mode matrix. Geometry matches the HiFi (49×26, pitch 63). P04 = typed NOT_APPLICABLE. Supersedes the proposal VD-FG-01-11 (B = keep the Atlas link), because the ledger G8 item is Claude's. Recorded deviations: no train-cell pulse, a second detail line, a 48-fold cap. Clean merge per FE gaps §8.3. |
| 6.5 | Search cinema | DEVIATION-approved | — | **D6** (ledger §13.4.1: not built until the engine publishes a sampler trace); VD-FG-01-10 = B |
| 6.6 | A1 search space (kind, range, step, levels, θ\* position) | PARTIAL · BE: CG-FG-S06-02 | `:2167-2199`; kind-width fix `:2179` · base | The 6.6 clipping is fixed. P04 levels read "not published" (`Parameter.levels` is absent on P14, CG-FG-S06-02). WFO levels are shown. |
| 6.7 | Freeze line `POOL FROZEN · K=[512×0.10]=52 · <ts>` | PARTIAL · BE: CG-FG-S06-05 | `freezeLineLabel` `SearchStageB.tsx:140-145` via `SearchDetail.tsx:1667-1683` · base (E5) | K comes from the served pool rule. The timestamp is DEC (X2 F5) but also requested as `pool.frozen_at_utc_ms` (CG-FG-S06-05). K for modes 3/4/5 needs engine **E5-O2**. |
| 6.8 | B1 funnel (trials, feasible, top-IS, inner re-eval, selected) + K callout | YES | `SearchStageB.tsx:160-200` · base (E5) | feasible = NOT_APPLICABLE with the reason (the study declares no constraints) |
| 6.9 | B2 formula typeset + term table | YES | `TypesetFormula` via `Formula.tsx` (KaTeX), `SearchDetail.tsx:1046-1060` · base (E5) | — |
| 6.10 | B2 per-fold decay + pool S_IS×S̄_OOS plane | YES | `SearchStageB.tsx:252-375` · base (E5); real data seen in OL-23 | Uses fold labels via `foldLabel` (E5-O5 closed) |
| 6.10b | B2 mode-specific sub-panels (mode 2 bootstrap distribution, mode 3 cluster table, mode 4 shard matrix + B/C terms, mode 5 full-sample note) | NO (latent) · BE-Codex/engine | No `bootstrap`/`cluster`/`shard` code in S06 | Not in the 26/9 audit. Only mode_1 runs exist and the source publishes no SelectionTraceV1 fields for the other modes. It falls under the DEC 6.2 demo rule until a mode 2–5 run exists. |
| 6.11 | B3 best ≠ selected cards: S_IS, S̄_OOS, d̄, max_dd | PARTIAL · BE: E5-O1 | `SearchStageB.tsx:395-460`, `SearchDetail.tsx:1119-1128` · base (E5) | max_dd only for the selected θ\* under global. Other candidates are typed absence `QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN` (engine E5-O1). |
| 6.12 | Trial ledger seed + digest | DEVIATION-approved · BE: CG-FG-S06-06 | `SearchDetail.tsx:860`, `:884` | DEC 6.12 (W3b); Codex packet CG-FG-S06-06 is open |
| 6.13 | Ledger row → pick | YES | cursor `pick` | `scrollIntoView` debt → X-09 |
| 6.14 | A5 importance · A6 interactions + window×entry_z cell heatmap | DEVIATION-approved / PARTIAL · BE: CG-FG-S06-03/-04 | A6 `EmptyPanel` with the source reason, `SearchDetail.tsx:2227-2229`; A5 inside A4 when the surface is served | DEC 6.14 (X2-D03, A6 not published). The 2-D cell heatmap has no grid field (CG-FG-S06-03). |
| 6.15 | Rules footer | DEVIATION-approved | `:2380` | DEC 6.15. The PRUNED/`duplicate_policy` sentence is missing (FG 06-14, P3). |
| A2–A4 | Trial surface, progression, sampled regions; B4 θ\* journey | YES (served) / fallback | `SearchSurface.tsx` (`SurfaceScatter` `:114`, `SurfaceProgression` `:246`, `SurfaceDistributions` `:378`, top-decile `:498-522`); W3b text frames `SearchDetail.tsx:1442-1534` when `surface` is absent | These were "verify after rebuild" items. OL-23 (preview `9f0a9066`) passed S06 and saw B4 on real data. The real run has 3 trials, so the charts are thin but honest. |
| num | Rounded numbers without an exact value | PARTIAL | `ratio2`/`signed2` in `SearchStageB.tsx:60-80`, `SearchDetail.tsx:911-916` | Only one `data-exact` on the whole S06 page (FG 06-10, P2). Placeholders `?? "—"` (FG 06-11, P2). |

**Verdict S06:**
- On W1/CX today, Stage A/B is complete per the E5/X2 decisions. The one HiFi block not built (6.4) is closed by **G8**, which is staged and not yet merged.
- The open items are the Bobby wording call F-1, BE/engine fields (K timestamp, levels, seed/digest, cell grid, per-candidate max_dd, selector tag), and P2 exact-value polish.

**Remaining gaps S06:**

| Gap | Size | Owner |
|---|---|---|
| Merge G8 | S | FE-Claude |
| F-1 OOS chip wording | S | Bobby decision, then FE-Claude |
| Exact value on rounded numbers, bare placeholders, PRUNED sentence, `scrollIntoView` | S–M | FE-Claude |
| heading-order a11y | S | FE-Claude |
| `pool.frozen_at` (CG-FG-S06-05) | S | BE-Codex/engine |
| P04 `levels` (CG-FG-S06-02) | S | BE-Claude≤P21 (P15) |
| `selector_confidence` (CG-FG-S06-01) | S | BE-Claude≤P21 |
| Trial seed/digest (CG-FG-S06-06) | M | BE-Codex/engine |
| Cell grid (CG-FG-S06-03) and interactions (CG-FG-S06-04) | M | BE-Codex/engine |
| E5-O1 max_dd, E5-O2 K for modes 3/4/5 | M | BE-Codex/engine |
| Mode 2–5 B2 panels | L | FE + engine, only once such a run exists |

## S07 Freeze

| # | HiFi block | Status | Where | Note |
|---|---|---|---|---|
| 7.1 | Title "Freeze — what was sealed, and when" + subtitle | DEVIATION-approved | `FreezeDetail.tsx:1640-1644`, `FREEZE_SUBTITLE` `:86` | DEC 7.1 (P16 re-audit: spec title; subtitle withheld, ordering NOT_ASSERTED) |
| 7.2 | Header meta + COPY EVIDENCE LINK | YES (meta PARTIAL) | `CopyEvidenceLink` `:1648` · base (E2a) | No `parameter_set.json · bundle manifest · as-of` line. As-of sits in the strip (`:1678`), in the other timestamp format (X6). |
| 7.3 | Ordering scenario / binding demo switchers | DEVIATION-approved | — | DEC 7.3; FG 07-01 |
| 7.4 | ORDER VERIFIED badge / claim / cert B | DEVIATION-approved | `:1351-1352` `⚠ NOT CAUSAL · GLOBAL SELECTION` | DEC 7.4 (W6A-D03); VD-FG-01-13 = B keeps it |
| 7.4b | "digest drift → Certification BLOCKED" banner | PARTIAL | `BlockedBanner` `:419` is raised only for a byte MISMATCH/MISSING (`:1636`) | An integrity `BLOCKED` or a Stage4 `DRIFT` binding does not raise the banner; `ServedStage4Binding` only shows its badge (FG 07-08, P2). |
| 7.5 | F1 data-time rows per fold with θ\* | YES | `:1374-1420` · base | `candidate_id.slice(0,8)` (`:1415`) vs 12 hex in the chain (FG 07-10, P3) |
| 7.6 | F1 wall clock (3 events) | DEVIATION-approved | `TypedAbsence` `:1427-1429`, `:1485`, `:1742` | DEC 7.6 (X2 F5); FG 07-16 CURRENT_SOURCE_ABSENT |
| 7.7 | F2 fold selector `‹ fold_03 · prm_ ›` | DEVIATION-approved (proposal open) | Shared-params banner `:1195-1205` | DEC 7.7 (P16 "one frozen set"). **VD-FG-01-14 proposes A (build a hash-only control)**, pending Bobby. The banner derives "global" from progress folds (`:1134-1139`) instead of binding the served `selection_scope` (FG 07-11, P2). |
| 7.7b | F2 declared range · range position · reading | YES (served) / typed absence | `:586-640` (hub), `:1143`, `:1290-1292` (retained, X2 `declared_space`) | 26/9 "verify after rebuild" item; OL-23 saw the retained θ\* table on real data |
| 7.8 | PROPOSE NEW ATTEMPT → | YES | `:1649-1656` (`runs/new?from=`) · base (E2a) | Independent of the what-if flag |
| 7.9 | F3 digest chain (7 links) + VERIFY DIGEST | YES (W1) / YES+engine pin (CX) | `DigestChain.tsx`, `:1517`, `:1807`; verify `:208-221` · base (E2c) | P04 `ENGINE_PIN` link: W1 = typed absence. **CX = the value from `engine_pin`** (CX `DigestChain.tsx` diff plus backend contract `research-freeze.d.ts`, which W1 lacks). That is E16-R2, closed on CX. CX also adds the `SOURCE_CODE_SHA256` rule words for imported alphas. |
| 7.10 | Byte verification | YES (FE) | `bytes` `:1574-1581` | Ops: OL-02 byte verify is done per CX (FE gaps §8.2). The preview flag state is not re-checked here. |
| 7.11 | What-if sandbox | YES / PARTIAL | `WhatIfCard.tsx:106-110` (`rvol`/`slpercent`), evaluate `:374-386` · base (E2a) | Labels fixed, reason no longer printed twice. After a 202 ADMITTED no outcome line is shown (FG 07-04, P2). Evaluate 409 copy (FG 07-05, P2). Sibling URL is the server template (VD-FG-01-12 = B). |
| 7.12 | Copy θ\* digest | YES | `CopyThetaDigest` (`Stage4Binding.tsx`) | X2-D07 |
| 7.13 | Rules footer | DEVIATION-approved (text open) | `FREEZE_RULES_FOOTER` `:89`, `:1867-1870` | DEC 7.13. VD-FG-01-09 asks Bobby to settle one S07 text. |
| F4 | Binding down to Stage 4 (BOUND/DRIFT) | YES | `ServedStage4Binding` `:1520`, `:1810`; fallback `:1812` | CX adds the IMPORTED lane note. A null fold renders `—` (FG 07-12, P3). |
| label | Cold deep link run label | PARTIAL | G3 only | See X2 |

**Verdict S07:** every HiFi block that has a source is built: F1–F4, the chain, copy link, propose, what-if. The chain's engine pin is full only on CX. What remains is FE P2 polish (drift banner, selection_scope binding, evaluate outcome, timestamp unification) plus Bobby's fold-selector and footer calls.

**Remaining gaps S07:**

| Gap | Size | Owner |
|---|---|---|
| Merge CX engine_pin (E16-R2) into the union | S | FE-Codex, done; merge step |
| BLOCKED/DRIFT banner from integrity + binding | S | FE-Claude |
| Bind `selection_scope`; "folds 1–2" → `fold_01–02` | S | FE-Claude |
| Evaluate outcome line + 409 copy | S | FE-Claude |
| One timestamp helper; 12-hex candidate id; back-link stage | S | FE-Claude |
| Fold selector control (VD-FG-01-14) | S | Bobby decision, then FE-Claude |
| Footer text (VD-FG-01-09) | S | Bobby decision |
| Wall-clock events (`bundle_frozen_at`, `outer_oos_first_read_at`, `runtime_bundle_digest`) | M | BE-Codex/engine (DEC X2 F5 until then) |
