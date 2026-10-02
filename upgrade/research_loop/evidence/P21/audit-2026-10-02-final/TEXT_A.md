# TEXT_A — fewer-words copy audit, S00–S04 (base 9a2571db, preview :8095, 2026-10-02)

Verdict codes: KEEP / SHORTEN / REMOVE / MOVE-TO-TOOLTIP. Format: where · current · verdict · proposed · words saved.
Method: Playwright, visible text of `<main>` only (sr-only tables, SVG `<title>`, console log lines and the portal shell excluded; shell adds ~95 words desktop / ~26 mobile on every screen). Mobile text is identical to desktop (nothing is hidden at 390) except S02, where the compact stepper drops ~24 words. Full unique-string inventory with best-match source location: `TEXT_A_inventory.tsv` (2,272 strings; `~` = generated phrase matched on its longest static fragment; `DATA?` = server-supplied). Screenshots: `/home/bobby/portal-research-qa-2026-10-02/audit-final/TEXT_A/`. Runs: R-WFO-023, R-WFO-027, R-P04-022, FAILED R-P04-020, QUEUED R-WFO-025 (`rrun_5e1185f8…`). Paths below are under `apps/portal/frontend/src/research/` unless stated.

## 1. Word counts, now vs proposed (desktop = mobile; estimates for "proposed" are the sum of the listed cuts)

| Screen / state | Now | Proposed | Saved |
|---|---|---|---|
| S00 Journey | 768 | ~190 | ~580 |
| S01 Library (49 cards, ~67 words/card) | 3,306 | ~1,550 | ~1,750 |
| S02 New Run, avg of 8 steps: three-window / WFO global / WFO causal | 273 / 271 / 287 | ~175 | ~100 per step |
| S03 Progress R-WFO-023 (+3,170 words of console log) | 389 (3,560) | ~190 (~230 with a 10-line console) | ~200 (3,300 with log) |
| S03 R-WFO-027 / R-P04-022 / FAILED R-P04-020 / QUEUED R-WFO-025 | 333 / 332 / 215 / 56 | 170 / 170 / 110 / 35 | 163 / 162 / 105 / 21 |
| S04 R-WFO-023, all 7 tabs (summary 734, split 900, search 4,103, freeze 911, execute 1,936, claim 384, atlas 1,240 true) | 10,208 | ~1,465 | ~8,700 |
| S04 R-WFO-027 | 5,883 | ~1,400 | ~4,500 |
| S04 R-P04-022 | 4,791 | ~1,465 | ~3,300 |
| S04 FAILED R-P04-020 | 4,171 | ~700 | ~3,500 |
| S04 QUEUED R-WFO-025 | 4,062 | ~120 (one waiting panel + link to Progress) | ~3,900 |

(Atlas tab counts 1,240 real words; the DOM roughly doubles it through the formula renderer. Proposed S04 budget = hub shell 55 + body: summary 300, split/search/freeze 150 each, execute 200, claim 120, atlas link 10.)

## 2. Top-10 most repeated strings (visible, per audited set)

1. `not published` — 801 across audited states (S04 532 over 29 tab-states; S01 137 incl. `rc — not published` 48 and `all time — not published` 31; WFO-023 Search tab alone 109). Emitters are not shared: 872 literal occurrences in src.
2. `NOT ISSUED — The … did not issue a release claim.` — 25 on S01 + once on every S04 tab (16 words each; 650 words on S01) (`RunLibrary.tsx:1377`, text is server data `claim.text`).
3. `rc — not published` — 48 on S01 (`RunLibrary.tsx:2048`, `Withheld what="rc"`).
4. `not served for this lane` — 97 across 24 hub states (`EvidenceFlow.tsx:309`).
5. `Delta-RSI Polynomial Alpha · av_1_0_0` — 49 cards + 24 S02 states; `BTCUSDT · 1h` 49 (`RunLibrary.tsx:2007`, `:2030`).
6. `not visited` — 147 on S02, 6 per step (`NewRun.tsx:295,330`).
7. `pending source` — 54 on QUEUED hub (15 per summary tab alone) and 6 on S01 (`RunLibrary.tsx:307`).
8. `evidence trail` — 49 (S01 `RunLibrary.tsx:406`); `stage 5 claim … 8 absent fields` — 34 hub screens.
9. `RELEASE_DEFAULT` + `LOCKED` — 84 each over 3 S02 states (28 rows per Optimization step) (`NewRun.tsx:2087`, `FreezeDetail.tsx:12` constant reused).
10. `SOON` / `Approval Gate · Paper` / `PROMOTION` — 39 hub states (`EvidenceFlow.tsx:1241`), plus `Send to Approval Gate SOON`, `Register for Paper Trading SOON` on the Claim tab (`EvidenceFlow.tsx:4482,4489`). Also `isolated_v1` ×80, `· certified` ×80, `anti-leakage in-sample search` ×72 on the two WFO Execute tabs (`ExecuteCandleReplay.tsx:1735`, `childAuditCompanionClient.ts:29`, `LineageLink.tsx:10`).

## 3. Chips / lines that repeat a fact already in the heading or filter

- S01: alpha chip + `av_1_0_0` on every card while the filter already says one alpha and "group by alpha" exists (245 w); `BTCUSDT · 1h` (147 w); `mode_1_decay` in filter and all 49 cards (98 w); `ALL TIME` label over `all time — not published` (98 w); `claim ledger 49 runs · 0 issued · 25 not issued…` restates the status line directly above it; `49 of 49 runs` a third time.
- S01 card: `last 30D return/sharpe` equal to all-time value on partial series (−0.29% / −1.00 printed 3 times: return, last-30D, OOS sharpe) (`RunLibrary.tsx:525-526`).
- S02: `PUBLISHABLE · av_1_0_0` four times on Context (header chip, version select, details table, rail `alpha binding`); profile id `p10.delta-signal-notional-wfo.v1` five times on Optimization.
- S03: run id three times (crumb, h1 `Run completed — R-WFO-023`, meta strip `run R-WFO-023`), status twice (h1 word + `COMPLETED` pill); `failed at S4 Execute` twice and the failure message twice on FAILED; `HAND-OFF CURSOR fold 9 · trial 351 · prm_a74872` = `EVIDENCE CURSOR fold 9 · trial #351 · params prm_a74872` = the label of `next: Evidence Flow →` tooltip.
- S04: cursor `schedule global` repeats meta `mode_1_decay · global`; `window OOS` repeats the `OOS` toggle and every card caption `portal-derived · OOS` / `oos · percent · engine-direct` (×11 on Summary); `certification not published` in the header passport and again on the Claim tab; `S1 split S2 search S3 freeze S4 replay` link row duplicates the tab strip.

## 4. Rails / cards that restate the main content

- S02 right rail on every step (320 px, taller than the main card): `ReviewRows` (alpha binding, route, strategy_id, dataset·symbol·tf, protocol, parameter_space, mode×schedule, trials·stop·seed, optimization_config = ~55 w) repeats the step the user is editing; on Review the same rows are the main table (`NewRun.tsx:3012-3014`, `ReviewRows` 2860-2985). The rail's Claim forecast card (`NewRun.tsx:2790-2850`) says `payload sha256 · after preflight`, `Pick a mode and schedule.`
- S03: claim passport + stage pills + progress card + evidence-cursor card say the same "completed, folds sealed, cursor fold 9 trial 351" four times; Gantt prints the identical `global best J₁ −0.537 · trial 351 · prm_a74872` on all 9 fold rows (`RunProgress.tsx:581` family).
- S04 hub shell (175 words, every tab): meta (29) + STAGE 5 CLAIM block (54–68, eight `not published` snake_case fields) + tab sub-labels (42) + cursor bar (39–53). The Claim tab then restates stage 5 claim, certification, per-stage caps, artifact manifest — the same 5–7 file/sha rows as S03's ARTIFACTS card.
- S04 tabs Split/Search/Freeze/Execute/Atlas embed the full S05–S08 and S12 bodies (WFO-023 Search = 4,103 words incl. 100-row trial ledger; Atlas = 1,240). Hub-vs-deep-dive decision is Bobby's; word-wise "tab = summary + link" is the saving above.
- S04 Freeze (WFO-023): per-fold rows ×9 identical (`IS ends before OOS · not causal · global selection · OOS child = frozen θ* · candidate 00b18de5ca92`, `FreezeDetail.tsx:1325-1331`) and F4 ✓ rows ×18 identical (`Stage4Binding.tsx:44`).
- S04 Summary: Sortino shown twice, Sharpe three times, max DD and final equity twice (retained passport block), `Engine trades: 33` beside tile `Trade count 45` (two numbers for one label — honesty issue, DATA/UX).
- S04 P04 Execute: each absence printed 3–4 times (trade anatomy panels, route-aware facts, `15 source absences` list, then a full sentence + `(P04_SOURCE_DID_NOT_PUBLISH_…)` per capability) (`ExecuteDetail.tsx:1273-1310,1860-1900,1950-1975`; sentences `researchRefusal.ts:453-463`).

## 5. Findings per screen

### S00 Journey (copy is server data: `apps/control-api/src/research/journey.descriptor.v3.ts:69-126`, immutable → a text change needs descriptor revision 5 + migration; or render in FE as tooltip)
| Where | Current | Verdict | Proposed | Saved |
|---|---|---|---|---|
| card description `JourneyMap.tsx:143` (28 cards, desc v3:70-111) | e.g. `shipped 6-step form: strategy, data, windows, params, optimization, review` | MOVE-TO-TOOLTIP | title only visible | 301 |
| phase description `JourneyMap.tsx:~397` (v3 phase 2nd string) | `redesign adds the evidence trail to every card` | REMOVE | phase title only | 66 |
| mapping section `JourneyMap.tsx:~500-531` (v3:120-126) | `Shipped tab → new screen` 6 rows | REMOVE (restates the P3–P6 cards) | none | 134 |
| tag on each card `JourneyMap.tsx:139-141` | `SHIPPED/REDESIGN/EXECUTION/SOON/BLOCKED` ×28 | SHORTEN | colour/border + legend only; SOON/BLOCKED stay | 28 |
| `pick a run →` ×13 `:~215` | | MOVE-TO-TOOLTIP, one header hint `choose a run` if no run in context | | 36 |
| kicker `Quant Ecosystem Portal · Research`, `descriptor revision 4` `:455,475` | | REMOVE / tooltip | | 9 |
| `P6 … 5 stages` vs hub `7 tabs` (v3:91 "one hub, one cursor, five stages") | factual conflict | fix text | | 0 |
| card titles with numbering `01 · Login`, `12 · Alpha imports` (v3) | legacy numbers | SHORTEN (drop leading number) | | ~25 |

### S01 Run Library (`RunLibrary.tsx`)
| Where | Current | Verdict | Proposed | Saved |
|---|---|---|---|---|
| claim row `:1377,2371` + server `claim.text` | `NOT ISSUED — The Delta walk-forward study sealed its artifacts but did not issue a release claim.` (25), `… The run failed before Stage 5 issued a claim.` (21) | REMOVE on card (sentence → tooltip); chip only when a claim IS issued; ledger line carries counts | | 650 |
| rc absence `:2048` | `rc — not published` ×48 | REMOVE; RC chip only when one exists | | 188 |
| `evidence trail` label `:406` | | REMOVE (aria-label stays) | | 98 |
| alpha chip `:2007` | `Delta-RSI Polynomial Alpha · av_1_0_0` | MOVE up: shown on card only if list has >1 alpha/version | | 245 |
| instrument chip `:2030` | `BTCUSDT · 1h` | hoist when identical across list | | 147 |
| mode chip `:1985` | `mode_1_decay · global` | SHORTEN to schedule (`global`/`per fold causal`), mode in filter | | 98 |
| `last 30D return/sharpe` `:525-526,1258` | duplicates all-time on partial series | REMOVE (30D lives on Hub) | | 96 |
| `all time` label `:977` + absent `:1108` | `all time — not published`, `EQUITY — NONE` | label REMOVE; absence = shared phrase `no series` | | 160 |
| FAILED block `:1175-1210` | `FAILED AT S4 REASON engine error RUNTIME 7s` | SHORTEN `failed at S4 · engine error · 7 s` | | 42 |
| header lines `:2931-2963` | status counts + `claim ledger` + `49 of 49 runs` | SHORTEN to one line | | 25 |
| `rc_…·NOT_APPROVED` raw enum | | humanise via shared formatter | | 0 |
| Δ decay / OOS fold trades `not published` ×29 | | keep label, absence shared phrase | | 0 |

### S02 New Run (`NewRun.tsx`; step list `runDraft.ts:185-196`)
| Where | Current | Verdict | Proposed | Saved |
|---|---|---|---|---|
| stepper captions `NewRun.tsx:295,330` | `not visited` ×6 | REMOVE (show only error/current/valid mark) | | 12 |
| step subtitles `runDraft.ts:185-194` | `alpha · av_ binding`, `sweep / pin · ceiling 8` … | MOVE-TO-TOOLTIP | | (tooltip-only, not rendered today when compact) |
| rail ReviewRows `:2860-2985,3012` | whole binding table on steps 1–7 | REMOVE (stay on Review) | | 55 |
| claim forecast `:2790-2850` | `payload sha256 · after preflight`, `Pick a mode and schedule.`, `cert ceiling NOT PUBLISHED`, `OOS: retrospective`, raw `NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION` | SHORTEN to one line on Review; humanise token | | 25 |
| estimate error in WindowTimeline (`EstimateStatus.tsx:15`) | `estimate — request refused · 403 · RESEARCH_PREFLIGHT_INVALID Retry` | SHORTEN `estimate unavailable · retry`, code in tooltip | | 6 |
| header `NewRun.tsx:3315` | `COPIED FROM R-WFO-023 new intent · fresh preflight attempt lineage →` ; `engine quantbt-engine==1.1.1 · er_quantbt_111` | SHORTEN `copied from R-WFO-023`; engine to tooltip | | 9 |
| Context details table (alpha/version/lifecycle/source repeat the selects above) | | REMOVE alpha+version cells | | 8 |
| snake_case labels `strategy_id`, `parameter_space`, `optimization_config`, `OPTIMIZATION_MODE`, `OPTIMIZATION_SCHEDULE`, values `three_window_decay`, `per_fold_causal`, `mode_1_decay` (rule f) | | humanise: Strategy, Parameters, Optimizer settings, Mode, Schedule | | 0 |
| Optimization table `:2087` + `FreezeDetail.tsx:12` | `RELEASE_DEFAULT · LOCKED` ×28 rows + 12 one-line explanations | SHORTEN to `28 optimizer defaults, locked by profile` (expand on demand) | | ~150 (only on that step) |
| profile id repeated ×5 on Optimization | | keep once | | 12 |
| Walk-forward `single: not admitted by p10…. yearly: … semi_yearly: …` (~30 w) | repeats `single — not admitted` per option | REMOVE sentence; option disabled + tooltip | | 30 (windows step) |
| causal step regex `pattern ^[1-9][0-9]{0,4}(D|h)$`, `Inner folds: preflight only for now.` | | REMOVE / tooltip | | 14 (causal windows) |
| Market data `1min · 5min · 15min · 30min — not declared by av_1_0_0`, `4h · 1d — no admitted profile covers it · p10…, p10…, p10… pins 1h` | | SHORTEN `4h, 1d, 1min… not available for this version` | | 25 (data step) |
| Review: `RUN PREFLIGHT preflight checks · 6 panels · not read`, `Run preflight first.` | | SHORTEN `Preflight not run` | | 6 |

### S03 Progress (`RunProgress.tsx`)
| Where | Current | Verdict | Proposed | Saved |
|---|---|---|---|---|
| transport line `:70,75` | `SSE streaming · poll floor 5s underneath` / `stream closed at terminal frame` | REMOVE (implementation detail; dot + tooltip) | | 5–7 |
| header `:2541,2547` + RunMetaStrip | h1 `Run completed — R-WFO-023`, crumb id, `run R-WFO-023 COMPLETED` | SHORTEN: drop id+status from meta strip | | 6 |
| queue/attempt strip `QueuePanel.tsx:227` | `queue HEAVY · queued … · 1 worker attempt` + P04 attempt table (claimed/started/ended) | MOVE-TO-TOOLTIP / details | | 25 |
| claim passport `:1814-1990` | `claims validation walk_forward_oos chronology not_causal_multi_fold_global_calibration causality retrospective_global_calibration OOS selection USED`, `seal mandatory SEALED · optional NOT_APPLICABLE`, `hand-off cursor` | SHORTEN `claim · sealed` + link; raw tokens humanised | | 40 |
| progress card | `eta none — run final`, `global study · trial 400/400 · best IS Sharpe 6.101 · pruned 13/400` (restates 400/400) | REMOVE on terminal runs | | 15 |
| Gantt rows `:581-600` | identical `global best J₁ −0.537 · trial 351 · prm_a74872` ×9 | MOVE: one line when study is global | | 85 |
| EVIDENCE CURSOR card `:1199-1223` | duplicate of hand-off | REMOVE (merge into the next-step button) | | 8 |
| artifacts `ArtifactPanel.tsx`, `RunProgress.tsx:1415-1440` | `· sha256:` ×7, `coverage not reported`, `export — not published` | sha → tooltip; drop two absence lines | | 21 |
| `DENIED_HOLDOUT_NOTE` `:171` | `sealed — unlock is a one-time audited workflow this release does not install` (+`336 bars · denied`) | MOVE-TO-TOOLTIP, show `holdout sealed` | | 12 |
| completion banner `:1986` + stage links | `✓ RUN COMPLETE — ARTIFACTS SEALED S1 split S2 search …` | REMOVE (stage pills already link) | | 12 |
| Live console on a finished run | 400 lines (≈3,170 words) rendered | SHORTEN: last ~10 lines + "show all" | | 3,100 |
| FAILED: `failed at S4 Execute — P10 isolated Delta qualification failed | details | ENGINE_ERROR — P10 isolated…` | | SHORTEN: one line, code in tooltip | | 14 |
| QUEUED (56 w) | `waiting for the source`, `queued — waiting for a worker`, `pending source` | KEEP, already minimal | | 0 |

### S04 Evidence Hub (`EvidenceFlow.tsx` + tab bodies)
Shell (every tab):
| Where | Current | Verdict | Proposed | Saved/tab |
|---|---|---|---|---|
| ClaimPassport `:463,556-700` | `STAGE 5 CLAIM NOT_ISSUED — sentence`; `validation_claim / chronological_claim / oos_used_for_selection / holdout_state / causality_claim / execution_contract / runtime authority / certification` all `not published` | REMOVE the grid when absent: one chip `claim not issued` (fields in tooltip); raw `NOT_ISSUED` token → humanise | | ~52 |
| passport note `:690-700` | `issued by quantbt-engine 1.1.1 research.metric-registry.v2 · v3 readiness COMPLETE` | MOVE-TO-TOOLTIP | | 11 |
| run meta | `route signal_notional engine quantbt-engine 1.1.1 · p04.delta-rsi.v1 · created …` | MOVE-TO-TOOLTIP | | 17 |
| tab sub-labels `:125-137,1213` | `DONE · fold 1`, `modes × routes`, `claim NOT_ISSUED` | REMOVE (keep status mark) | | 25 |
| promotion hook `:1241` | `→ PROMOTION SOON Approval Gate · Paper` | REMOVE until it exists | | 6 |
| cursor bar `:1532` | `trial/params/seq — not served for this lane` (P04), `schedule global`, link row `S1 split … journey ↗`, `reset to θ*`, `COPY EVIDENCE LINK` | hide unserved fields (`FeLocalAbsent :309`), drop duplicate links/schedule, icon buttons with aria | | ~30 |
Tabs:
- Summary (`EvidenceFlow.tsx:3533`): tile captions `oos · percent · engine-direct` ×5 and `portal-derived · OOS` ×4 → tooltip (−47); retained source passport (initial/final equity, account return, max DD, observations ×2) −40; Sortino/Sharpe duplicates −10; drawdown episodes 10 → 3 rows −55; raw `SOURCE_DID_NOT_PUBLISH_MARKET_REGIME` inline −5; per-fold `rule v1` line −12. ≈ −170/−200 (WFO).
- Split/Search/Freeze/Execute: summary + deep-dive link, target ≤150–200 words (see §1); Freeze: collapse ×9/×18 identical rows (−220); 4× 64-hex provenance → tooltip (−10).
- Execute P04 (`ExecuteDetail.tsx:1273-1310,1950`, `researchRefusal.ts:453-463`): print each missing capability once as `Not published by this adapter: orders, fills, trades, positions, events, candle windows, funding …` (code in tooltip); inline `(P04_SOURCE_DID_NOT_PUBLISH_…)` REMOVE. 775 → ~200.
- Claim (`EvidenceFlow.tsx:4255-4500`): duplicated stage-5 header, `reader route — not published`, `declared source absences`, whole artifact manifest (same as S03) → REMOVE; `next — report and later gates` + `Send to Approval Gate SOON requires a methodology certificate · currently NOT_PUBLISHED` + `Register for Paper Trading SOON` → REMOVE (hard-coded roadmap, `:4460-4490`). 384 → ~120.
- Atlas tab (`hubStageAtlas.tsx`) = full S12 body: REPLACE by link (−1,230).
- QUEUED / CANCELLED / FAILED hubs: every tab shows `pending source` / `not published` cells for a run that has nothing sealed (QUEUED 4,062 w, FAILED 4,171 w): one panel `Waiting for worker — open progress` / `Failed at S4 — open progress`, tabs disabled except the stages that ran.
- Raw tokens visible (rule f): `NOT_ISSUED`, `VALIDATION_CLAIM`, `WALK_FORWARD_OOS`, `NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION`, `THREE_WINDOW_CURRENT`, `FIXED_PROFILE_NO_SEARCH`, `P14_THREE_WINDOW_PROTOCOL_HAS_NO_INNER_FOLDS`, `P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_PLAN`, `RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION`, `READINESS PARTIAL/COMPLETE`.
- Mobile: tab strip freeze tab not clickable via `[role=tab]` at 390 (script click landed on Search); reachable by `#stage=freeze` (confirms W3 item 15 overlap).

## 6. Ranked change list (largest word saving first)

1. S03 console: render last ~10 lines + "show all" on terminal runs — ~3,100 w (R-WFO-023).
2. S04 Search tab (WFO-023): tab = summary + link to S06, no trial ledger/provenance hashes — ~3,900 w.
3. S04 Execute tab (WFO), P04 absence list printed once — ~1,700 w WFO-023 / ~570 P04.
4. S04 Atlas tab → link — ~1,230 w per hub visit.
5. QUEUED/FAILED/CANCELLED hub: one status panel instead of 7 tabs of absences — ~3,900 / ~3,500 w per run.
6. S01: drop per-card claim sentence (650), `rc — not published` (188), `evidence trail` (98), hoist alpha/instrument/mode (490), 30D pair (96), all-time label (160), misc (70) — ~1,750 w.
7. S04 Freeze/Split/Summary hubs: collapse identical per-fold rows (Freeze −220), summary duplicates (−170/−200), tab = summary budget — ~900 w WFO-023 across them.
8. S04 hub shell: claim grid → one chip, sub-labels, meta, cursor clean-up — ~120 w × 7 tabs = ~840 w per run.
9. S00: description/mapping/phase text out of view — ~580 w (descriptor v5 or FE tooltip).
10. S04 Claim tab: manifest, source absences, SOON hooks — ~260 w.
11. S02: rail ReviewRows only on Review (55/step), Optimization defaults collapse (150), misc — ~100 w per step avg.
12. S03 passport/Gantt/cursor/artifacts/banner clean-up — ~200 w per screen.

## 7. Shared-phrase table (one canonical phrase, one component; code only in tooltip + `data-reason-code`)

Proposed single renderer: `<Absence kind=… reason=… what=…/>` in `researchFormat.ts`/a new `Absence.tsx`, replacing the 14 local `Absent`/`Pending`/`NotPublished`/`Withheld` variants (RunMetaStrip.tsx:33, RunProgress.tsx:309, EvidenceFlow.tsx:309/498, SplitDetail.tsx:163/2771, SearchStageB.tsx:83, SearchDetail.tsx:786, EngineAtlas.tsx:506, ExecuteDetail.tsx:268, CompareDetail.tsx:613, LineageDetail.tsx:598, ReleaseCandidateDetail.tsx:542, ReportDetail.tsx:386, ReportAllTime.tsx:135) and the sentence map `researchRefusal.ts`/`RunLibrary.tsx:115-193`.

| Situation (server state) | Canonical visible phrase | Tooltip | Replaces |
|---|---|---|---|
| NOT_PUBLISHED, reason known | `not published` (suffix omitted) | server reason sentence + code | `not published`, `not in read`, `not reported`, `no field`, `—`, `not served for this lane`, `rc — not published`, `all time — not published` |
| NOT_PUBLISHED, many in a panel | one line `Not published: a, b, c` | per item sentence | per-row repeats, `15 source absences` |
| NOT_APPLICABLE | `n/a here` | reason sentence (e.g. three-window has no folds) | `not applicable`, `n/a · three-window …`, `retained lane not applicable…` |
| PENDING / source not yet reported (QUEUED, RUNNING) | `pending` | `Waiting for the source to report` | `pending source`, `waiting for the source`, `reading…` |
| NOT_READ (hub not loaded) | `not loaded` + Retry | `The evidence read failed` | `not read`, `reading…` |
| Not declared in a form | `not set` | `Not declared in this draft` | `not declared`, `not visited`, `no version chosen` |
| Claim absent | `no claim` | server claim.text | `NOT ISSUED — …sentence`, `NOT_ISSUED` |
| Run failed/cancelled before the stage | `failed at S4` / `cancelled` | message + code | `EQUITY — NONE`, `FAILED AT … REASON … RUNTIME` |
| SOON/PLANNED | `soon` (only where a link would otherwise be) | roadmap sentence | `PROMOTION SOON`, `Send to Approval Gate SOON …` |
| Status words (`COMPLETED`, `NOT_APPROVED`, `per_fold_causal`, `three_window_decay`, `mode_1_decay`) | one humanising function: `completed`, `not approved`, `per-fold causal`, `three-window`, `mode 1 decay` | raw enum | all raw tokens in §5 |
| Timestamp | `YYYY-MM-DD HH:mm UTC` | ISO ms | 5 current formats (`2026-10-02 16:31Z`, `… UTC`, `2026-07-01T00:00`, `2026-06-01 00:00Z`, ISO table cells) |

## 8. Caveats
- "Proposed" counts are sums of the cuts listed; S04 tab budgets are targets, not measured. Server-supplied copy (S00 descriptor, claim sentences, Atlas texts) needs a backend text change or FE tooltip routing; FE-only paths are given where they exist.
- Preflight estimate 403 on S02 is the auditor-origin CSRF artifact (see FRONTEND_AUDIT §1); the raw-code display is still a copy finding.
- Hub tab vs deep-dive duplication remains Bobby's decision; word savings assume "tab = summary".
- No server mutation; clone reads (`?from=`) are GET-only.
