# Delta RSI 2020–2026 — real owner-review runs

Status: **OWNER_REVIEW_RUNS_COMPLETED · OVERVIEW_WINDOW_MAPPING_GAP_CONFIRMED**.
Scope: Bobby's 2026-10-07 request, existing isolated Research preview, real S02
browser → preflight → admission → confined QuantBT child → P05 retention →
named screen/API reads. Not a product/release GO or a completed mapping repair.

## 1. Review now

| Lane | Product link | Result |
|---|---|---|
| Optimized Three Window | [Three Window Overview](https://research-portal.primusspark.com/research/quantbt/runs/rrun_338193efca9bf958fe9126f495bb37be/evidence) | COMPLETED, materialization READY,1/1 fold,3 real trials |
| Advanced Mode1/global | [WFO Overview](https://research-portal.primusspark.com/research/quantbt/runs/rrun_a0314cb849a692712035fcca836eb233/evidence) | COMPLETED, materialization READY,15/15 folds,0 failed,3 global trials |

Both runs remain retained for Bobby's review. Screens S03–S11 were opened;
IS/OOS/Holdout selectors and replay IS/Holdout states were inspected separately.
No new review identity, production deployment, or Trading System access.

## 2. Exact accepted input and meaning of defaults

- Existing built-in Alpha `delta-rsi-polynomial-alpha`, immutable version
  `av_delta_rsi_polynomial_alpha_1_0_1`, QuantBT **1.1.1**.
- Dataset `crypto-binance-1m`, **BTCUSDT/1h**, route `signal_notional`.
- Mode `mode_1_decay`, schedule `global`, **3 trials**, seed **42**,
  `parameter_space_overrides: []`, `optimization_config: {}`,
  `early_stopping: null`.
- These are the published **Portal recipe defaults**, not a claim that every
  optimizer default in the wider engine catalogue is3. The declared parameter
  search is unchanged; selected trial params are engine results, not a manually
  pinned default vector or owner overrides. No profiles/budgets were enlarged.
- Snapshot `dss_2e614ca21c55e610f9c8f7539b95565f`: **59,148 rows**, including
  **300 predecessor warmup bars**,0 gaps,0 duplicates,0 missing bars.
- Logical range **2020-01-14T00:00:00Z →2026-10-01T00:00:00Z**, start-inclusive,
  end-exclusive. Snapshot starts2020-01-01T12:00Z for real warmup. Earliest
  indexed start with300 predecessor bars is2020-01-13T12:00Z; next full day
  was selected. No invented January1 warmup or full-calendar2026 coverage.
- Metadata index observed2026-10-01T23:04:54.892Z, verified end23:00Z that
  day. The earlier Jan1→Oct7 probe returned
  `WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE`; actual runs stop at a completed,
  verified day rather than silently widening the source.

| Setting | Three Window | Advanced WFO |
|---|---|---|
| Admission profile | `p10.delta-three-window-optimized-1h.v2` | `p10.delta-wfo-temporal-1h.v2` |
| Requested spec | v1 | v2 |
| IS / initial training | Jan14,2020 →Oct1,2024 | Jan14,2020 →Jan1,2023, then expanding |
| OOS | Oct1,2024 →Jan1,2026 | Jan1,2023 →Oct1,2026, quarterly |
| Independent Holdout | Jan1,2026 →Oct1,2026 | **Not declared / NOT_APPLICABLE** |
| Temporal guards | Existing recipe defaults | label horizon / purge / embargo0; explicit accepted defaults |
| Engine plan |1 fold |15 engine-produced folds, not a browser-invented calendar |

Mode1/global WFO uses OOS in selection: **retrospective global calibration**,
not causal outer-OOS certification. This run tests the requested default
workflow, not a claim of trading quality or best/optimal research windows.

## 3. New Run and downstream debugging

All eight S02 steps were exercised: Context, Strategy, Route, Data, Windows,
Parameters, Optimization, Review; fresh preflight **201**, create **202** for
both. Actual accepted specs confirmed the above defaults and boundary binding.
Observed RUNNING→COMPLETED/READY was36.376s (Three) and78.625s (WFO), measured
by6-second polling; these are not precise child CPU durations.

Progress, Hub, retained Evidence, Split, Search, Freeze and Replay were read
from their named operations, **14 successful200 reads** across the two runs.
No browser `pageerror` was recorded in either journey or the inspection.
This is not an assertion of every visual/console/viewport/scenario gate.

Initial downstream reads included Three Report503, WFO Report503 and one WFO
retained series503. Do **not** erase them or describe the original journeys as
all200. Targeted post-materialization retakes showed:

- Both Reports200 and browser-rendered; Portal retry records SEALED,
  failure_code null, attempt_count2. No engine rerun or receipt/seal rewrite.
- All six named retained series on each run200/**AVAILABLE**: EQUITY, RETURNS,
  POSITIONS, MONTHLY_RETURNS, ROLLING_RETURNS_20, RETURN_DISTRIBUTION.
- Linked Final Audit remains409 `RESEARCH_FINAL_AUDIT_NOT_APPLICABLE` on both;
  UI renders that typed applicability. Not an authentication failure, successful
  linked audit, or reason to create a new audit merely to make the GET green.

An initial harness preflight403 occurred because Chromium did not permit an
Origin override through `route.continue`. No job was created by that attempt.
The loopback test was corrected to forward the configured public Origin using
`route.fetch`, preserving the **actual server response**. No fixture response,
application CSRF bypass, disabled security flag or source edit was used.

## 4. Why IS/Holdout look locked

### Three Window — real integration gap, not Bobby's permission

The completed source already publishes `protocol_disclosure.windows` and
`window_series` for **IS, OOS and Holdout**, with explicit source/emitted counts
and `MULTI_SERIES_EXTREMA_V1` sampling. IS41328 bars /17 emitted points;
OOS10968 /15; Holdout6552 /14. Holdout has
`holdout_used_for_selection:false` and `freeze_before_holdout:true`.
P05 retains full `three_window_replay` rows with the window roles.

However, generic enrichment still reports `RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD`
and `RETAINED_NO_HOLDOUT_ACCOUNT_PAYLOAD`. Overview reads `by_window.is` for IS
and a generic absence for Holdout instead of the already-published protocol
curves. Generic Hub also emits `P13_SEALED_HOLDOUT_BAR_COUNT_DENIED` although
the completed source protocol publishes6552. This is a stale projection/policy
and consumer mapping, **not actual denial of Bobby's session**.

Source locators:

- `apps/portal/frontend/src/research/EvidenceFlow.tsx`: `WindowSwitcher`,
  `windowBody`, and enrichment selection (~2917,3568,3690).
- `apps/portal/backend/src/portal_api/services/current_source_artifacts.py`:
  `_three_window_disclosure`, `_three_window_replay_rows`, and the generic
  enrichment call (~943,972,1824,1863).
- `apps/portal/backend/src/portal_api/services/research_enrich_analysis.py`:
  default absence and `enrich_retained` (~321,370,390).
- `apps/portal/backend/src/portal_api/services/three_window_runner.py`:
  selected params frozen before separate IS/OOS/Holdout replays (~235–261).

### WFO — preserve real fold semantics

Its15 expanding IS windows overlap:619752 summed training bars are **not**
619752 unique source bars. Retained OOS tape has32856 evaluated OOS bars;
the58848 observation rows include the idle pre-OOS prefix. Do not rename that
prefix IS performance or concatenate overlapping IS windows into a fake return.
Separate IS account payload is not published by this run. Fold bounds/facts
are available in current-source Split and should be the truthful IS starting
point. Advanced declares **no independent Holdout**; UI N/A is correct there.

Generic replay reports `REPLAY_SEAL_PREDATES_WINDOW_METADATA` for IS despite
current-source fold metadata being present. This is a navigation alignment
gap, not proof the real engine lacks all IS boundaries. Holdout's generic
`REPLAY_HOLDOUT_NOT_EXPOSED` should not be mistaken for an unlockable WFO window.

### Exact Claude / backend follow-up, not done in this run slice

1. Preserve accepted layout, tabs, colours and baselines. For Three, consume
   existing typed protocol bounds/curves with sampling disclosure after freeze;
   never compute complete Sharpe/DD/analytics from17/15/14 sampled points.
2. Backend can derive complete per-window account/analytics from verified retained
   `three_window_replay`, then supply existing typed enrichment where appropriate.
   Do not modify seals or require a QuantBT upgrade/rerun just to use stored facts.
3. WFO IS is fold-aware; show available fold facts and retain typed absence for
   unpublished account metrics. Keep independent Holdout N/A, not “locked”.
4. Align generic Hub/replay/preflight wording with stage-specific truth. P08
   pre-execution seal/no-reader is not authorization to expose holdout before
   freeze, nor a permanent denial after the approved recipe has evaluated it.

**These mappings remain open**, explicitly recorded as LR-01…03 in queue§42.
No frontend source or backend application code was changed by this receipt.

## 5. Evidence custody, resource hygiene and commit scope

Private root: `/home/bobby/.local/state/portal-research-p23/long-range-delta-20261007/`.
Raw preflight/create payloads contain opaque inputs and stay private0600;
directories0700. Market bytes, raw API payloads, screenshots and credentials
are not committed. SHA-256 receipt anchors:

| Relative path | SHA-256 |
|---|---|
| `three-02/journey.json` | `68805968fee807e0b1f5da77b5a1f84fbbb92e3ba2699517c3f266afca7c388c` |
| `wfo-01/journey.json` | `dbaf29e595400eeac3bad590719277cefd7241a10aefd677a664da8b3b280344` |
| `inspect/receipt.json` | `e4d93b92bb1f46b546645e566422bfe92d6bd54450b35cc8bf3e21d8c5f03da8` |
| `report-browser/browser-closeout.json` | `aad09d57054efcb9242c0dedd1c0b54891d068611649da559af5269fc65b9fa3` |
| `series-readback/receipt.json` | `95235dd78be042aea364645c93fc7e65d48fb1e0867ad4a2ad63b5f04ab15fd1` |

Three source manifest SHA-256:
`f3dc8fa7c35e7866fc3e76b472ad8a27176bf4e7d8e7f0d7a764c505e75077bb`.
WFO source manifest SHA-256:
`4b08e3b59ef5b1751e265554f8fcac6ec2174dc5e5d7a68f7e91ef24d4e224d9`.
Shared snapshot content SHA-256:
`de2445ee6ef7d02ceb34af585461541052ba0e09ddf14b24be1318563da5266f`.

Existing preview images, **not rebuilt or changed this turn**:

- portal-api/worker `sha256:94cb3637cec343de5f50fd90f145c9c028196a80b924b030ec842afb918123ee`
- Control API `sha256:0e1380d6e36c65429a4c731f10cafc5c8cb50beba62727fed964ac00b61f9ea6`
- Web `sha256:75d6aee2f59c56ed425342c75fb1323f2d4fdf814686b1cb9e13f36819062ce7`

Grouped documentation + `scripts/research-preview/long-range-delta.mjs` only;
static JS/diff checks and one required normal commit hook. No duplicated full
suite, rebuild, replayed engine job, or CI dispatch for these unchanged apps.
Browser processes close in `finally`; both confined child jobs are terminal.
No new stack, volume, image or account was created. Keep the owner-review
business data/artifacts and existing review identity, not “cleanup” them away.
Post-run root free108146229248 /665811062784 bytes (<20%); no disk-intensive
build was started. **NO_ACTION_NEEDED** for this slice's temporary resources;
existing quiet-window C4 capacity maintenance remains separate. No broad prune.

Shared source base `afb4007e`. Local grouped commit/clean FF only, no remote
push, dev/main, production flags, migration or release acceptance change.
