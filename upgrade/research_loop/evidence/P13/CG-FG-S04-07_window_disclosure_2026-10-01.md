# B3 #13–14 — S02/S04 window counts and Portal admission

Status (2026-10-01): S04 window disclosure backend accepted at `3d3a7950`; BR-D4-1 catalog-edge portion remains `BLOCKED_BY_HMD_INDEX`, not falsely closed. BR-D4-3 was already delivered by LW-07 (`d88121e6`).

## Authority and result

- The existing P08 `ResearchPreflightResponse.topology.folds[].train.bars`, `outer_oos.bars` and `sealed_holdout.bars` already publish exact *admitted* per-window counts after preflight. The earlier S02 audit saying no per-window bars is stale for that state. Claude can bind those typed fields without recomputing bars in the browser.
- New `EvidenceHub.core.window_disclosure?: WindowDisclosure` joins the run to its immutable P08 topology inside the existing workspace-scoped repeatable-read Hub transaction. It publishes each fold's IS/OOS count and explicit fold-window sums. The scope says sums may overlap (expanding IS); they are **not** unique bars or an OOS result. A P04 sealed holdout is `DENIED` with `value:null`; advanced WFO has `NOT_APPLICABLE`. Older digest-only manifests return `NOT_PUBLISHED/P08_TOPOLOGY_BAR_COUNTS_NOT_RETAINED`. Malformed retained full topology fails 503.
- BR-D4-1 before-preflight exact `first_bar_start_utc`, `last_closed_bar_end_utc` and version-specific `earliest_first_window_start_utc` are **not** derivable from month partition names. The current approved HMD catalog only lists partitions, and no exact resampled-bar/closed-bar/warmup index is published. Parquet footer min/max on the 1m base file cannot prove the last closed 1h bar or nth warmup bar when gaps/partial hours exist. This portion remains typed absent; do not turn an envelope into an admitted boundary. A bounded HMD metadata index or explicit source read contract is required.
- BR-D4-3 is already present in `Atlas.portal_admission.profiles[]`: WFO `max_span_days=92`, `fold_bounds={min:2,max:16}`, `timeframe=1h`, `frequency=weekly`, `window_mode=expanding`. This is Portal admission, separate from immutable QuantBT source `current_release.submission_constraints`; do not duplicate/overwrite the latter.

## Verification and FE handoff

- Control API focused Evidence window + Hub tests: 15/15; TypeScript build pass.
- Contract suite: 204/204 and regenerated `research-evidence.d.ts`.
- Disposable P13 PostgreSQL: 5/5, including historic digest-only topology read compatibility. The first run caught this old-manifest shape; the reader was corrected to return typed absence.
- Exact-head isolated preview Control API image `sha256:66474a988348d0ac15dbcaa20f34c3b819173001b5fbaff4563f3511b55ed912` passed authenticated read-only GET on both real runs. P04 `rrun_464bf9c3dd8979af87e44388ea6910ef`: HTTP 200, one fold, IS 1464 bars/OOS 744 bars, sealed holdout `DENIED` and `value:null`. WFO `rrun_3258a4c450816129d2d285f25b801061`: HTTP 200, nine folds, fold-window sums IS 12744/OOS 1440, holdout `NOT_APPLICABLE`; per-fold OOS count 168 except last fold 96. These counts come from retained P08 topology, not a new HMD scan.
- The Hub's overall source-evidence availability can remain `NOT_PUBLISHED` while its retained P08 `window_disclosure` is `AVAILABLE`; these are separate authorities. No business row or price was copied to this receipt.
- Claude: bind S04 to `window_disclosure`; keep original layout. S02 can use existing P08 `topology` after preflight. Before preflight preserve the explicit month-envelope caption and refusal path. Use `Atlas.portal_admission` for WFO constraints.
- No frontend, source/Execution Edge, production runtime, HMD files, or sealed evidence were changed. No migration was added.
