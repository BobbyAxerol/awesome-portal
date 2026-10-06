# FULL-02 immutable product qualification

Verdict: **EXACT_PROFILE_PRODUCT_RUN_QUALIFIED**. Measured 2026-10-06 UTC.
Scope: ordinary P08 → P10 → confined child → P05 → named server-side reads;
not a browser/visual, production, all-timeframe or signed-release verdict.
This file is the immutable byte-hashed qualification reference; subsequent
activation/commit/cleanup records belong in the separate implementation ledger.

Baseline `1b7e804c88e1cde312072986363bcf6d593430f4`, dirty qualification candidate.
Final read source diff SHA-256 `fc530373be4d825b1b0d26ad800825903f4dfdb3d1e4b6e37f9eff5dc017c697`;
source-additions inventory SHA-256 `399ec94562a5bd4b0f291944b16c8b0441ec0f45e1fee925d1a385c62b77091f`.
Source-to-commit locator: the delivery commit introducing this file, not a
claim that these qualification images were built from an already-clean commit.

## Product runs and exact policies

| Fact | Per-fold decay | Optimized Three Window |
| --- | --- | --- |
| Run | `rrun_05b84bb90e07e7a040062460ef12457f` | `rrun_f3fadab0bf9f450f4c7e0024a9ccb620` |
| Profile | `p10.delta-signal-notional-per-fold-decay.v1` | `p10.delta-signal-notional-three-window-optimized.v1` |
| Profile SHA-256 | `60ae004f65b0eba83ce12089b0224ab467b30a9acc4161ad0787108344cd134e` | `0e210afa7c891cfb93e78126a4ca86fb6c1a25d3bcb4d8d81a5534accb5ee3c9` |
| Recipe SHA-256 | `7a208ce129e15bd1fdb6f4d411b2061ae8a1e54ab6a421a19b6e09e5e7e79716` | `b1c678862ac808ad159dfe552d4b4c7c200aeb0016efca03b33765042f93b993` |
| Actual study/trials | 2 outer studies, 3 real optimizer trials each, 6 total | 1 calibration study, 3 real optimizer trials |
| Terminal state | `COMPLETED / READY` | `COMPLETED / READY` |
| Snapshot SHA-256 | `ddf9b01decf4f9c03340649832545845ee8fe3746467fda6f29ab9289665ebde` | `f8fbcd67f9b03f7a0ccc5d6b7698f442a837f4f7ac550b5a8b6cf2687ecc9a04` |
| Retained manifest SHA-256 | `7d406efd1180401dd5cab9ce936aa3681b427b94a1805df31785afeab756e948` | `55d6b997d3c19e8e3bb6c2ab97879bb6e6e48a991792e83efaf798935cb5ac2d` |
| Selected params SHA-256 | `71272c0fefb23ce13e59ab734551ca9d825a0170e45524a715407aa6690698ac` | `46b02b5a907c52b2e82ab9dba7f4d573ac053a4e1de6bbcbd960efe9ff2f4831` |
| Private receipt SHA-256 | `c13b361b9b6aa164a3d1fbb758392c6ca03caec12f277b5d42705fdd857d9276` | `9fb97b468dd94d9cc03e2ad57297e5ddb2648426d828bcc724993e877c74b0c4` |

Both use the installed QuantBT **1.1.1**, built-in immutable Delta AV,
`signal_notional`, seed42, `crypto-binance-1m` / BTCUSDT / 1h, reader
`primus-historical-market-data 0.1.0rc3` on its approved read-only store.
Source manifest SHA-256 `f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47`.
No market-data bytes, credential, JWT or mTLS input is included here.

Decay: 2026-06-01T00:00Z–2026-07-15T00:00Z, first OOS2026-07-01T00:00Z,
weekly/rolling14D; label horizon1, purge2, embargo3 bars. Limits are exactly
3 trials/study, 2–16 folds, ≤48 total trials, ≤92 days, no parameter override.
Each study has its own selection; the last-fold deployment is not a global θ/K.
Progress's completion cursor retains `STUDY_LOCAL`, study1/source trial2,
ordinal3 vs run progress ordinal6, with the selected digest above.

Three Window: A2026-06-01, B2026-06-22, C2026-06-29, D2026-07-06, all00:00Z
and half-open; IS504 / OOS168 / Holdout168 hourly bars. Numeric declared
PIN `rvol=1.6`; native `train_test_split` optimizes **IS+OOS only**, freezes θ,
then evaluates the independent Holdout. `holdout_used_for_selection=false`,
`freeze_before_holdout=true`; each public series stays inside its own window.
Full private P05 replay bytes remain retained separately from bounded public
series; no Holdout rows are relabelled as calibration OOS.

## Read and integrity proof

For each run, GET `/api/v1/quantbt/runs/<run>/` + `evidence`,
`current-source/{evidence,split,search,freeze,replay}`, `report`,
`release-candidate`: **8 HTTP200**, all five current-source reads `AVAILABLE`,
≤1MiB, retained integrity `MATCH`, Stage4 params/bundle `MATCH`.
RC pack: complete8, degraded2, input2, **missing0**. Degraded/input facts remain
typed, not fabricated receipt or user-authored RC metadata.

GET `final-audit`: HTTP409 `RESEARCH_FINAL_AUDIT_NOT_APPLICABLE`; the legacy
Advanced/global audit intake cannot represent either new method. Frozen Report
instead carries `REUSED_ORIGINAL`: each fold's actual generation/selection
binding for decay, and frozen-selection independent Holdout proof for Three.
`final_audit_applicable=false` for per-fold targets, true for Three's single
parameter target; this does **not** authorize a new Advanced linked audit.

Search/Replay invalid opaque cursor: HTTP400 `RESEARCH_CURRENT_SOURCE_INVALID`.
Another disposable principal reading the actual owner workspace: HTTP404,
no rows disclosed. Native/contract tests also cover seed, trials, timeframe,
schedule/topology, source/digest tamper, trial-study cursor binding and fencing.
Three classification is explicitly Portal-derived from retained protocol,
not a replacement of immutable native engine claim tokens.

## Isolated image and custody

Project `portal-research-p23-ol12`, loopback8096 only; fresh namespaced FULL02
Postgres/artifact/NATS/roadmap volumes. Shared8095 and production untouched.
Confined worker AppArmor `portal-research-child`, approved reader read-only.
Child/API image `sha256:1dcb8a9d89a7adf96afb12b2adb23378c1807bb25113bdf1533ff390d823beea`;
final named-read Control API image `sha256:9ab3b22036a99e98760eb2740096d991109e63d9b79515a6ff7b874ae82c6ee4`.
Private exact request/responses/identity files remain0600 under
`/home/bobby/.local/state/portal-research-p23/20261006/full02/`:
`qualification-wfo-per-fold-decay-2.json`,
`qualification-three-window-optimized-2.json`.

First decay intake encountered a missing worker-local environment and was
cancelled before a child/source artifact; first Three child completed native/P05
but a WFO-only companion guard refused commit. Their failure records are kept,
not counted as PASS or repaired in place. Completed Three attempt2 then exposed
the historical ≥2fold Split reader assumption; correcting only that reader and
classification allowed rereading the **same** completed run, no engine rerun.

Qualification does not widen CPU120/wall240,4GiB,128MiB scratch,512MiB IO,
16MiB file,FD128 or100k planner/warmup bounds; the old global preview exception
is not inherited. Fixed P04/global/causal old descriptors and sealed bytes remain
unchanged. Other FULL stages/modes/timeframes/imported execution remain separate.
