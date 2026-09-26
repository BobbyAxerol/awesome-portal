# E5 · Screen 06 Stage B to HiFi (Claude, 2026-09-26)

Unified plan §13.4.1 package **E5**, and the S06 part of **E14**.
Branch `feat/e5-s06-stage-b`, cut from `origin/docs/research-loop-plan` at `ae62e12f` (E1). Not pushed.

## Sources read

| Source | Revision |
|---|---|
| HiFi `release-v1.1/QuantBT 06 S2 Search and Selection.dc.html` | `ae62e12f` |
| `evidence/HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`, rows 6.1–6.15 and "Most important gaps" item 8 | `ae62e12f` |
| `evidence/P16/X2_P15_P18_GAPS_CLAUDE_2026-09-26.md` (A1–A4, region heatmap, θ* journey already built) | `ae62e12f` |
| E1 helpers `researchFormat.ts`, `ShortId.tsx`, `researchRefusal.ts` | `ae62e12f` |
| quantbt-engine 1.1.1 and 1.0.8 `walkforward.py` (`_candidate_count`, `_select_is_candidate_records`, `WalkForwardTrialRecord`, `optuna.create_study`) | installed wheels in `portal-research/.venv` and `portal/.venv` |

Not redone, as decided: 6.5 search cinema (D6). The X2 panels A1–A4, the region heatmap and the θ* journey are unchanged.

## Commits

| Commit | Scope |
|---|---|
| `b953611e` | Backend: P15 retained search contract `pool`, `candidates[].max_drawdown`, the constraints correction, OpenAPI 1.8.0, regenerated `.d.ts`, canonical fixture, snapshot |
| `1e9952e7` | Frontend: Stage B to HiFi, 6.6, and E1 helpers on S06 |
| this record | Docs |

## HiFi block → component → field → state → test

HiFi measurements are taken from the markup. B1 rows: mono 10.5, gap 8, 158 px Inter label, 9 px bar at ≤ 42 %, 40 px count, 9 px note. Callout: mono 10.5, lh 1.6, padding 5/10, accent-2 on accent-2-soft. B2 sub-panels: gap 14, captions 9.5, decay rows mono 9.5 (52 px fold / 10 px track with centre rule / 44 px value), plot 118 px. B3 cards: padding 10/12, gap 4, mono 10.5 rows, 8.5 px bold tag.

| Audit | HiFi block | Component (`src/research/…`) | Field | States shown | Test |
|---|---|---|---|---|---|
| 6.7 | Freeze line `POOL FROZEN · K = ⌈512 × 0.10⌉ = 52` | `SearchDetail.tsx` `FreezeLine` + `SearchStageB.tsx` `freezeLineLabel` | `pool.rule`, `pool.top_is_k` | served → `POOL FROZEN · K = ⌈3 × 0.1⌉ = 1`; withheld → `POOL FROZEN · K NOT PUBLISHED` + reason in title; older server → previous `POOL FREEZE · FROZEN` | e5 FE "the freeze line reads…", "a K the server withholds…" |
| 6.7/6.8 | B1 K callout | `PoolFunnel` | `pool.rule` (expression, n, fraction, configured K, k) | CEIL / CONFIGURED expressions; absent → dashed "K is not shown: ‹reason›. No K is worked out here in its place." | e5 FE "the callout prints…", helper `kExpression` |
| 6.8 | B1 trials evaluated | `PoolFunnel` `FunnelRow` | `pool.trials_evaluated`, `pool.scored_unpruned` | AVAILABLE count; scored note or reason | e5 FE funnel |
| 6.8 | B1 feasible (constraint ≤ 0) | `FunnelRow` | `pool.feasible` | NOT_APPLICABLE → `n/a`, no bar, "does not arise — QuantBT's walk-forward study declares no constraints" | e5 FE funnel; BE e5 "real seal" |
| 6.8 | B1 top-IS pool → FROZEN | `FunnelRow` | `pool.top_is_k` | AVAILABLE `1`; NOT_PUBLISHED → "not published", no bar, never 0 | e5 FE funnel + withheld |
| 6.8 | B1 candidates re-evaluated | `FunnelRow` | `pool.reevaluated`, `reevaluation_scope`, `search_contract.oos_used_for_selection` | "on every outer fold — the OOS column enters the ranking" | e5 FE funnel |
| 6.8 | B1 selected by policy | `FunnelRow` | `pool.selected`, `candidate_selection_metric` | AVAILABLE `1`; older server with no selection → "not published" (was `0`) | e5 FE "older server without pool" |
| 6.9 | B2 typeset formula | `TypesetFormula` (shared `Formula`, KaTeX) | selected candidate `facts.objective_components.terms`, `diagnostics.probe.decay_lambda/gamma` | typeset; mono fallback while KaTeX loads; components absent → previous "not published" line | e5 FE "typesets J…", helper `formulaFromTerms` |
| 6.10 | B2 per-fold decay of θ* | `FoldDecayBars` | `pool.per_fold_decay` (QuantBT selected-trial fold metrics, verbatim) | AVAILABLE rows (sign-toned, scaled to max \|d\|); NOT_PUBLISHED → reason sentence, no rows; older server → "this server does not publish the pool yet" | e5 FE "draws θ*'s per-fold decay…", "withholds" |
| 6.10 | B2 pool on S_IS × S̄_OOS plane | `PoolPlane` | `candidates.rows[].facts.metrics.mean_is_sharpe/mean_oos_sharpe` | every member with both means placed; θ* gold 9 px; members without both means counted in the caption | e5 FE "places every pool member…" |
| 6.11 | B3 best ≠ selected: S_IS, S̄_OOS, d̄ decay, max_dd | `BestVsSelectedCards` / `RoleCard` | `selection.roles`, the pool member with the same `source_trial_id`, `candidates[].max_drawdown` | four rows; max_dd AVAILABLE `−0.67%` with source title; NOT_PUBLISHED → "not published" + reason; older server → previous one-number cards | e5 FE "each card lists…", "not published…never 0", "older server" |
| 6.6 | A1 range-position column (P04) | `ParameterTable` `kindWidth` | `fixed_profile.parameters[].kind` | NUMERIC-only → 64 px kind cell; note no longer clipped at 1440 | browser (axe `scrollable-region-focusable` gone on P04 1440) |
| 6.3 / X7 | Claim row tokens | `RetainedToken`, `ClaimToken`, `ScoringBackendFact`, metric | E1 `claimToken`; states via `stateWords` | capitals / YES·NO; exact value in `data-claim-value`; states in words, token in title | searchDetail.test (3 updated), e5 FE "claim tokens…" |
| E1 | Breadcrumb run id | `ShortId` | route `runId` | short, full id in title / copy / `data-full-id` | e5 FE "run id…" |
| E1 | grid_size | `groupDecimalString` | `declared_space.grid_size` | `21,379,147,776` exact | searchSurface.x2 (unchanged, passes) |

E1 `formatUtc`: S06's only timestamp is the shared `AsOf`, which already uses it. `REFUSAL_COPY.denied`: S06's 403/404 goes through the shared `RunNotFound` and `refusalState`, which already print it.

## Backend changes (`b953611e`)

- New `apps/control-api/src/research/current-source-pool.ts` (`research.current-source-search-pool.v1`), wired into `ResearchCurrentSourceService.search`.
- **K (`top_is_k`).** The value is the retained candidate rows, published only when both of these hold:
  - The ledger is exactly the pool. That means `mode_1_decay`, no pick-prepending selector (`is_only_robust`, `is_plateau_robust`), every row is `oos_candidate_selection`, and each row has a distinct completed source trial.
  - QuantBT's own `_candidate_count` on published inputs gives the same K. It is evaluated in float64 as the engine does it: `⌈n × fraction⌉` or the configured K, capped to `[1, n]`.

  In every other case K is a typed absence with a reason code. `search_contract.top_is_k` now carries that K. It is `1` on the real WFO seal; the configured value in the seal stays `null`.
- **Feasible.** `NOT_APPLICABLE`, reason `QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS`. In both engine versions, `walkforward.py` calls `optuna.create_study(direction, sampler, pruner)` with no constraints function, and the word "constraint" does not occur in the file.
  - **Correction:** the per-trial `constraints`/`feasible` facts said `QUANTBT_COMPACT_TRIAL_LEDGER_DROPS_PER_FOLD_CONSTRAINT_ROWS` (W3). That was wrong. They now carry the same NOT_APPLICABLE.
  - `w3RealWfo.fixture.json` keeps the old code as the historical W3 body.
- **Per-fold decay.** `pool.per_fold_decay` gives the rows verbatim from `fold_facts.oos_score` (basis `QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1`). If any fold lacks a score, the whole series is a typed absence.
- **`candidates[].max_drawdown`:**
  - The selected candidate under the `global` schedule gets the stitched OOS path drawdown (`summary.metrics.max_drawdown_fraction`, source `RETAINED_STITCHED_OOS_PATH`).
  - Any other candidate gets `QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN`.
  - Another schedule gets `STITCHED_OOS_PATH_IS_NOT_ONE_CANDIDATE_UNDER_THIS_SCHEDULE`.
- **Contracts and fixtures.**
  - OpenAPI `research-current-source` 1.8.0 (additive: `SearchPool`, `PoolCount`, `PoolRule`, `FoldDecay`, `CandidateDrawdown`).
  - `generated/research-current-source.d.ts` regenerated with openapi-typescript 7.13.0 (`npm run generate:research-current-source`), not hand-edited.
  - Canonical `research-current-source.search-surface.valid.json` rewritten through the service from the real W5b seal (`X2_WRITE_FIXTURES=1`).
  - `contracts-snapshot.json` refreshed; `snapshot.py --check` matches 215 files.
- No migration was needed; 064–069 are unused.

## Tests (exact)

| Gate | Result |
|---|---|
| Backend `research-e5-search-pool.spec.ts` (new) | 13 / 13 |
| Backend touched specs together (e5 13 + w3 facts 16 + x2 surface 18 + current-source service 6) | 53 / 53 |
| Backend related current-source specs (15 files) | 130 passed, 4 skipped. `research-rs03-current-source-acceptance` needs Postgres on :5432 (ECONNREFUSED): environment, not code |
| control-api `tsc -p tsconfig.build.json` | clean. The full `tsc --noEmit` has 103 pre-existing errors in test files I did not touch |
| Pre-commit hook (`verify-workspace.sh`) on `b953611e` | passed (exit 0) |
| Frontend `searchStageB.e5.test.tsx` (new) | 15 / 15 |
| Frontend S06 files (e5 15 + searchDetail + searchSurface.x2) | 91 / 91 |
| Frontend research vitest (all 43 files) | 1307 / 1307 |
| Frontend `tsc --noEmit -p .` | clean (exit 0) |
| Pre-commit hook on `1e9952e7` | passed (exit 0) on the second run. The first run was cut off in `verify-generated` by a concurrent hook in another worktree (the known fixed-`/tmp` collision) |

## Browser

Vite ran on :5201 (`scratchpad/e5/vite.e5.config.mts`) and proxied to the **:8095 preview**.

- **REAL** shots are the preview exactly as it serves. It is an **old image that predates X2 and E5**, so its search read carries no `pool`, `max_drawdown`, `declared_space` or `surface`. The real WFO shots therefore show the older-server fallbacks, including the new "this server does not publish the pool" line.
- **FIXTURE** shots use the preview's real reads, with one exception: `current-source/search` is replaced by the published canonical fixture, which is the real W5b seal through the E5 service. A P04 run keeps its real `LaneNotApplicable`, so the P04 shots are REAL.

Runs: WFO `rrun_e1fa9e5cae3bcef8f8e38311905a17d5`, P04 `rrun_8c9c9991bdd0cfe72100da64ebee1150`. The HiFi is opened from disk. The files are in `scratchpad/e5/shots/` and are not committed.

| Shot | Kind | Overflow px | sha256 |
|---|---|---|---|
| `hifi-hifi06-1440.png` | HiFi | 0 | `4d1463d70903cf7794747398d4385c4495ea39bbfc5b14505dd5b07e42dddfda` |
| `hifi-hifi06-660.png` | HiFi (no 660 layout, overflows 182) | 182 | `5a6e6d78eed9f138a29df438b05a8c37d295cf091745bd3f139876305e1f84cd` |
| `real-wfo-1440.png` | REAL, old preview | 0 | `5bb32c127812ba5f01e3305381e6fb9745c1fcb2b9d40e729f2e848948c7da47` |
| `real-wfo-660.png` | REAL, old preview | 0 | `51448da7b50c4dd3331c676bcd11c3f2f54594be0ca80a5eaa9ad7e4bc1aa1d2` |
| `real-wfo-1440-stageB.png` | REAL crop | — | `3c67d823f67c1eb614dfd623f22c57d803058051784f823b7d6b18f43898d688` |
| `real-p04-1440.png` | REAL | 0 | `45e3058676ff1ec3bd97caa77ec999c0e3d33da1ab26c5e5af1334875b850793` |
| `real-p04-660.png` | REAL | 0 | `a1d5c5d72bb5443567701edce0e6667077e7d61d0ec681418be999013aa7304b` |
| `fixture-wfo-1440.png` | FIXTURE | 0 | `67a46426cb8bedf40fdfb12c12a9827577c17c308e17a64afb342977af954836` |
| `fixture-wfo-660.png` | FIXTURE | 0 | `de2a17e731d2052ede17bafb54098c27e1d03a5865cb57c4cf2d18871196e2cd` |
| `fixture-wfo-1440-stageB.png` | FIXTURE crop | — | `508f48643c08972e50b97eb40c2e3496112dc569c1c332d8acf52a32e552081d` |
| `fixture-wfo-660-stageB.png` | FIXTURE crop | — | `a41e821d193bc9e9017026b3615145fef8465324569385f4191fc4791b11f9fd` |

No page errors, no 4xx/5xx and no horizontal overflow on any real or fixture shot.

**Axe** (wcag2a/aa, scoped to `[data-screen='search-detail']`): the only rule hit is `color-contrast`.

- `#939db0` accounts for 157/166 nodes (fixture 1440) and 124/132 (real WFO 1440). That is the approved D-B1 shared token.
- The rest:
  - `#9a6a1f` on `#f4ecdb`, 4.01. The schedule pill plus the new K callout, both HiFi-exact accent-2 on accent-2-soft. The same amber pair is covered by D-W6B-10.
  - `#9a6a1f` on `#faf9f5`, 4.47. Stage B heading and freeze label.
  - The animated `◀ OOS` freeze-arrow frame, whose colour varies by frame.
  - `#1e7b4f` on `#f4ecdb`, 4.46. COMPLETE on the gold selected ledger row.
  - One `#7a8699` node.

  All of these were present before E5 except the callout.
- P04 1440 had `scrollable-region-focusable` on A1. It is gone after the 6.6 fix.

What I looked at: the B1 funnel and callout, the typeset J, the decay bars and plane, and the four-row cards at 1440 and 660 (fixture). The fallback panels on the real WFO. P04 A1 is no longer clipped, and P04 states are in words.

## Deviations from the HiFi (recorded, not gaps)

- The freeze-line and B1 `pool_frozen_at` timestamps are not shown. QuantBT publishes no freeze clock (X2 F5, DEC).
- Decay tone is by sign only (gold for positive, green for negative). The HiFi's red above +0.3 is a threshold the server does not publish.
- The B3 decay values are not toned red or green: that would be a comparative judgement.
- The B1 note for "trials evaluated" reads "N scored, not pruned" instead of "actual < declared: early stop". The early-stop fact is not published.
- The plane has one point on the real seal (K = 1). Axis domains come from the served values; the diagonal is S_IS = S̄_OOS.

## Left open

| # | Item | Owner / kind |
|---|---|---|
| E5-O1 | **Engine request: per-candidate OOS max drawdown.** `WalkForwardTrialRecord.fold_metrics` carries Sharpe, decay, turnover and trade counts, and no drawdown. Only the selected candidate under `global` has one (from the stitched path). Minimal ask: add `oos_max_drawdown` (per fold plus the candidate aggregate) to candidate records in the QuantBT walk-forward ledger. Until then, non-selected candidates show `QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN`. | QuantBT engine request (not ≤P21) |
| E5-O2 | **Engine request: record K and the realised pool.** QuantBT records neither `top_is_k` as used nor the pool membership for modes that prepend a robust pick (mode_3/4/5, `is_plateau_robust`, `is_only_robust`). K is a typed absence there. Ask: `walk_forward.top_is_k_effective` plus `candidate_pool_trial_ids` in the source contract. | QuantBT engine request |
| E5-O3 | Real-data receipt of the new panels needs the preview rebuilt (OL-23). The :8095 image predates X2 and E5. | Ops / OL-23 |
| E5-O4 | 6.4 per-fold glyph strip ("what this mode reads") is not built. It is FE-M, outside the Stage B scope. | Claude, later |
| E5-O5 | The fold labels are 0-based (`fold 0`, `fold 1`) in the decay bars, as on S05. The cross-screen X3 numbering is still open. | Claude (X3) |
| E5-O6 | The amber pair `#9a6a1f` on `#f4ecdb` (4.01) on the K callout is HiFi-exact. Carry it under the D-W6B-10 decision, or ask Bobby for a token. | Bobby |
