# W3b: Screens 04–08 read the retained lane on a real WFO run (Claude, 2026-09-24/25)

**Branch:** `feat/research-w3b-wfo-lane-screens`, in worktree `.claude/worktrees/agent-aa85d282272c4f14e`.
**Base:** `881eea44` on `docs/research-loop-plan`. **Merged in:** `9e60f0c1`, the real-API WFO block.
**Status:** not pushed.

**Run under test:** `rrun_c860aac790d71981d49fb76b9287138b`.
- Delta signal-notional WFO, QuantBT 1.1.1, BTCUSDT 1h, protocol advanced.
- `mode_1_decay` with a `global` schedule, 2 folds, 3 trials.

**Where it was verified.** The preview stack on `:8095` runs the images of `2d186397` and was used read-only. That stack serves the frontend bundle built from `2d186397`, not this branch. So this branch's frontend was checked with Vite on `localhost:5199`, proxied to the preview's real API with Origin `https://research-portal.primusspark.com`.

## The rule

For a WFO run, the P04 hub reads (P13–P17, `PORTAL_PERSISTED_RESEARCH`) answer NOT_PUBLISHED with their own codes:
- `P13_SOURCE_EVIDENCE_NOT_PUBLISHED`
- `P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED`
- `P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED`
- `P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE`
- `P04_SOURCE_DID_NOT_PUBLISH_*`

Those codes describe the hub lane, not the run.

Once the retained current-source lane (`PORTAL_RETAINED_CURRENT_SOURCE`) answers AVAILABLE, the screens follow these rules:
- **The retained lane is the authority** for every panel it covers.
- **Run identity** comes from the P11 progress read and the admitted requested spec (`retainedLane.ts`, `useRunIdentity`).
- **An absence carries the retained lane's own reason code.** Where the lane has no field at all, the UI names that itself with `UI_RETAINED_LANE_HAS_NO_FIELD` or `UI_RETAINED_LANE_HAS_NO_SERIES`. It never uses a hub code.
- **Readiness is READY** only when the progress read says `terminal_materialization = READY` and the mandatory bundle is `SEALED`.
- **P04 fixed-profile runs are unchanged.** Their retained lane answers `research.current-source-not-applicable.v1`.

**No backend or contract change was needed.** `current-source/evidence/series?kind=` already serves MONTHLY_RETURNS, RETURN_DISTRIBUTION (`FULL_RETURN_HISTOGRAM_V2`, 12 buckets) and ROLLING_RETURNS_20. The request without `kind` answers 400 `RESEARCH_CURRENT_SOURCE_INVALID`, which is by design.

## Commits

| Commit | Subject | Shortstat |
|---|---|---|
| `f66e11c2` | feat(research): S04-S08 read the retained lane on a WFO run, not the P04 hub | 25 files, +4225 / −218 |
| `9b56f79c` | test(research): e2e split/search hub fixtures match CG-P14-05/CG-P15-05 | 3 files, +174 / −41 |
| `4a633b13` | merge(research): docs/research-loop-plan (9e60f0c1, the real-API WFO block) into W3b | 1 file, +71 / −1 |
| `c160d05d` | test(research): the real-API WFO block checks what W3b fixed, and reads S08 | 1 file, +44 |

Every commit went through the pre-commit hook; none bypassed it. The first amend of the merge commit failed inside the hook while it was generating contracts into `/tmp`. The retry passed.

## Defects: fix and browser check

Each screen below was checked in the browser on the real API at 1440 and 660 wide. Every check found no horizontal overflow and a clean console.

### S04 Evidence Flow

| # | Defect | Fix | Status |
|---|---|---|---|
| 1 | All 15 tiles showed "not published" | 7 tiles now show values: final equity 19,926.51, initial equity 20,000.00, net −0.37% and max DD −0.67% (retained stitched account, source-derived), bars 1,056, and OOS Sharpe −5.35 and decay 3.91 (labelled *fold mean*). The other 8 keep a typed absence. | `f66e11c2`: e2e checks each tile's exact value against the passport |
| 2 | P13 banner "evidence projection is not published" | The banner no longer shows once the retained seal is READY. The header's engine (1.1.1), adapter and readiness now come from the lane. | `f66e11c2`: e2e |
| 3 | EChart 4 and Monthly returns showed "no sealed evidence" | Both read the lane's derived series: 12 buckets, and 1 month (7/26, −0.37%). EChart 5 (rolling 20) is drawn too. A body of another kind is refused, never drawn. | `f66e11c2`: e2e |
| 4 | Rolling Sharpe/beta and behaviour tiles carried P13 reasons | They now carry retained reasons. The cursor shows `trial #1 · global` and the global params digest. | `f66e11c2`: e2e (no hub code in the DOM) |

### S05 Split

| # | Defect | Fix | Status |
|---|---|---|---|
| 5 | Header said PARTIAL, readiness NOT_READY | Not partial any more; readiness READY comes from the seal. | `f66e11c2`: e2e |
| 6 | Protocol, span and timeline read "not published" | Protocol reads `advanced walk-forward · weekly · expanding`. Span is `[2026-06-01, 2026-07-15)`, end exclusive. The timeline, IS window and OOS window come from the fold plan. | `f66e11c2`: e2e |
| 7 | θ* per fold showed a P14 code | Selection is GLOBAL. Each fold shows `GLOBAL · trial 0` with the params from current-source search, under a shared-params note. | `f66e11c2`: e2e |
| 8 | Stale copy said "S4 not built (P17)" and "Screen 10 (P19) not built" | Replaced by real links to Execute and to Attempt Lineage. Holdout shows n/a with `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT`. | `f66e11c2`: e2e |

### S06 Search

| # | Defect | Fix | Status |
|---|---|---|---|
| 9 | Header said PARTIAL; mode, schedule, profile and selection read "not published" | Mode `mode_1_decay` and schedule `global` come from `search_contract`. Profile is `rs02.delta-signal-notional-wfo.v1`. Selection is AVAILABLE (trial 0, J −9.81), readiness READY, and strict outer OOS reads "no · OOS used for selection". | `f66e11c2`: e2e |
| 10 | "What this mode reads" and A1 read "not published" | The mode tokens are shown verbatim, with `top_is_fraction` and the decay λ/γ. A1 shows the declared space, seed 42 and 3 trials. | `f66e11c2`: unit test |
| 11 | A2/A3/A4/A6/B4 carried the P15 code | They now read retained fields, or carry the retained reasons listed below. Ledger, B2 and B3 are kept as they were. | `f66e11c2`: e2e |

### S07 Freeze

| # | Defect | Fix | Status |
|---|---|---|---|
| 12 | Page showed only "not published" and EMPTY | The page now shows:<ul><li>**Digest chain:** manifest and retained import digests both MATCH, 1,063 rows.</li><li>**Frozen θ*:** one 8-row table for every fold, with a shared-params banner and the params digest.</li><li>**What-if:** disabled, with `RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET`.</li><li>**Source bytes:** absent, with the P05 reason.</li><li>**Rules footer:** kept.</li></ul> | `f66e11c2`: e2e checks θ* rows equal the params count |

### S08 Execute/Replay

| # | Defect | Fix | Status |
|---|---|---|---|
| 13 | Page showed P04 codes everywhere | The page now reads the retained replay:<ul><li>**Per observation:** model position, equity, return and drawdown, windowed by the lane's own cursors.</li><li>**Route and readiness:** route `signal_notional`, readiness ready.</li><li>**Orders, fills and candles:** absent, each with its `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_*` reason.</li><li>**Numbers:** formatted, with the exact value in the title.</li></ul> | `f66e11c2`: e2e |

### e2e fixtures

| # | Defect | Fix | Status |
|---|---|---|---|
| 14 | The split and search fixtures in `research-foundation` predate CG-P14-05/CG-P15-05 | They now validate against the OpenAPI with 0 errors (checked with jsonschema). The probe drops its in-test patches. | `9b56f79c`: probe 2/2 |

## "Not published" still on the WFO run, and why

Every entry below is a typed absence with the reason the page carries.

### S04

| Where | Reason |
|---|---|
| Certification | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` |
| Tiles: trade count, Sortino, CAGR, profit factor, the two hit rates, funding | `UI_RETAINED_LANE_HAS_NO_FIELD`. Per-fold OOS trades are in the verdict table. |
| Benchmark tile, rolling beta, and the two benchmark behaviour tiles | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES` |
| Rolling 63-day Sharpe | `UI_RETAINED_LANE_HAS_NO_SERIES` |
| The other 6 behaviour tiles | `UI_RETAINED_LANE_HAS_NO_FIELD` |
| Passport | `…_ROUTE_LEDGER`, `…_AUDITED_FILLS`, `…_BENCHMARK_SERIES` |

### S05

| Where | Reason |
|---|---|
| Warmup window n/a | `QUANTBT_WARMUP_POLICY_IS_NONE` |
| Inner folds n/a | `QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION` |
| Holdout n/a | `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT` |
| Gap scan | No field in the retained lane |
| Stitch digest | Not in the split read |
| Methodology certificate | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` |

### S06

| Where | Reason |
|---|---|
| A1 levels | The read publishes no level count. |
| Sampler trace | `QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_TRACE` |
| Warm start | `…_WARM_START_OR_BASELINE_TRIALS` |
| Dedupe | `QUANTBT_DUPLICATE_PRUNER_DOES_NOT_PUBLISH_A_DEDUPE_REASON` |
| A2 and A6 | `UI_RETAINED_LANE_HAS_NO_FIELD` |
| A3 prune reasons | n/a, `NO_TRIAL_WAS_PRUNED` |
| A5 importance | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_IMPORTANCE` |
| Ledger: per-trial seed and digest | The retained rows carry neither. This section was kept as it was. |

### S07

| Where | Reason |
|---|---|
| Wall-clock ordering | `UI_RETAINED_LANE_HAS_NO_FIELD` |
| Per-fold segments | `SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS` |
| Declared range | `UI_RETAINED_LANE_HAS_NO_FIELD` |
| Source bytes | `P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES` |
| What-if | `RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET` (A10c is not built) |

### S08

| Where | Reason |
|---|---|
| Candles | `…_REPLAY_CANDLES` |
| Orders | `…_EXECUTION_ORDER_LEDGER` |
| Fills | `…_AUDITED_FILLS` |
| Fold capital, execution state, events, child audit, trades, MAE × MFE, funding, SL/TP, OCO, multi-leg | The retained lane has no field for any of these, and the page says so ("the retained WFO lane publishes no …"). |

## Gates

| Gate | Result |
|---|---|
| `npx vitest run src/research` | 34 files, 1111/1111 pass. Of these, +37 are new W3b tests: S04 5, S05 6, S06 5, S07 5, S08 5, `retainedLane` 11. |
| `npx tsc --noEmit -p .` | Clean |
| `npm run build` | Green |
| `_probe-research-w3-wfo` | 2/2 |
| Real-API lane, run with `RESEARCH_PREVIEW_BASE_URL=http://localhost:5199` (proxied to `:8095`) | 28/28: 16 P04 + 12 WFO covering S03–S08 × 2 viewports |

**If the lane is run against `:8095` itself,** the new assertions fail, because that preview still serves the `2d186397` bundle.

**Use `localhost`, not `127.0.0.1`, for the proxied run.** The session cookie is Secure. Playwright sends it to `localhost` over http but not to `127.0.0.1`.

## Left open

- **The preview bundle is not rebuilt.** That was out of scope.
- **S08 equity chart axis.** On a window where equity is flat, the axis spans 10,000–30,000. The data is honest, but the chart reads poorly. This comes from Thanhvuong's existing `SampleChart` scale and was not changed.
