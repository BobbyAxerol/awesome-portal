# Kho "NOT PUBLISHED" — rà soát trình duyệt toàn bộ Research Loop (Claude, 2026-10-02)
Nguồn: tám auditor chạy trình duyệt thật trên preview (bundle `9ABHdOEh`), mọi run thật của claude-preview. Báo cáo đầy đủ từng nhóm (mọi nút đã bấm, ảnh theo từng trạng thái, lỗi UX, chữ cứng) ở `evidence/P21/qa-2026-10-02/<NHÓM>.md`; ảnh (hơn 1.000 tệp) ở `/home/bobby/portal-research-qa-2026-10-02/<NHÓM>/` ngoài git. Tài liệu này gom **mục 5 của từng nhóm**: mọi ô/biểu đồ đang hiện "not published / not applicable / —" kèm phân loại (LEGIT · OLD-SEAL · BACKEND-GAP · FE-GAP · HIFI-ONLY) và các **yêu cầu backend** đã viết sẵn theo mẫu chuẩn. Codex làm theo `CODEX_BACKEND_GAPS_2026-09-30.md` §16 (trỏ về đây).

---

## Nhóm S00_S01_S12

Counts come from the live `GET /api/v1/quantbt/runs?limit=50` (44 items) walked recursively and from `GET /api/v1/research/quantbt/atlas` (current and `?release_id=er_quantbt_108`).

| screen | element | run(s) | state shown | reason code (verbatim) | class | what the user needs | backend request |
|---|---|---|---|---|---|---|---|
| S01 | card pill "rc — not published" | 43 of 44 (all except R-WFO-023) | `rc — not published` | `P21_NO_PERSISTED_RELEASE_CANDIDATE` | LEGIT | none composed; the wording should say "no release candidate", not "not published" | none (FE wording, see section 2) |
| S01 | card pill "cert —" | 44 of 44 (certificate item appears 80 times, i.e. 40 for completed/failed with source plus 4+4 other reasons) | `cert —` | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` (40 runs), `CANCELLED_BEFORE_SOURCE` (2), `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED` (2) | LEGIT | the engine certifies routes, not methodology (atlas says so); pill never carries a value | none; FE should hide it |
| S01 | tile "LAST 30D RETURN / SHARPE" | 34 completed runs incl. R-P04-019, R-P04-018, R-WFO-017, 010, 009, 006 | `LAST 30D not published` | `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL` | OLD-SEAL | last-30D figures on old seals | **REQ-A** below |
| S01 | tile "LAST 30D …" | R-WFO-018, R-WFO-019 (cancelled), R-P04-001, R-P04-002 (failed) | same | `CANCELLED_BEFORE_SOURCE`, `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED` | LEGIT | no sealed equity | none |
| S01 | tile "OOS SHARPE" and "Δ DECAY" | R-P04-021 | `not published` x2 | `P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS` | BACKEND-GAP | R-P04-021 is the newest P04 fixed-profile seal (new seal, 2026-10-01) and still has no OOS figures while R-P04-019/018 do | **REQ-B** |
| S01 | tile "Δ DECAY" | R-P04-019, R-P04-018 | `not measured` | `P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT` | OLD-SEAL | decay needs the IS boundary the child receipt lacks | **REQ-C** |
| S01 | tiles "OOS SHARPE", "Δ DECAY" | R-P04-006 | `not recorded` | `P13_SOURCE_PREDATES_OOS_ANALYTICS` | OLD-SEAL | predates OOS analytics | covered by **REQ-C** |
| S01 | tiles "OOS SHARPE", "Δ DECAY", "OOS FOLD TRADES" | R-WFO-010, R-WFO-009 | `not published` x3 | `QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS`, `QUANTBT_DID_NOT_RETAIN_EVERY_FOLD_OOS_TRADE_COUNT` | LEGIT | older engine run did not retain the folds; cannot be recomputed | none |
| S01 | tile "SHARPE" (all-time) | R-P04-018 | `not published` | `P04_RETAINED_SAMPLED_EQUITY_HAS_NO_COMPLETE_ANALYTICS_INPUT` | OLD-SEAL | the sampled tape has no complete input | covered by **REQ-A** (companion recompute from the retained 744-point tape) |
| S01 | chart "EQUITY — NONE" (striped placeholder) | 19 failed runs (R-P04-020, R-WFO-021, R-P04-012, 011, R-WFO-008, 007 …) | empty striped bars | `P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES` | LEGIT | a failed run has no equity | none |
| S01 | tile "FAILED AT / RUNTIME" | R-P04-001, R-P04-002 | `not published` x2, REASON raw `P06_RETRY_NOT_DISPATCHED` | `P11_FAILED_STAGE_NOT_PUBLISHED`, `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED` | OLD-SEAL | which stage failed and how long | **REQ-D** |
| S01 | tiles "PROGRESS / TRIALS / ELAPSED" | R-WFO-018, R-WFO-019 (cancelled) | `not reported` x3; stage chips all neutral | `CANCELLED_BEFORE_SOURCE` | BACKEND-GAP | at least elapsed time and last stage reached, which the lifecycle record knows | **REQ-E** |
| S01 | "LAST 30D" window dates | every run with last 30D | not displayed | none (data present) | FE-GAP | `item.last_30d.data.window_start_utc_ms` / `window_end_utc_ms` (R-WFO-023: 1785625200000 to 1788217200000 = 2026-08-01 to 2026-08-31) are served but the card shows only "LAST 30D" | none (FE) |
| S01 | stage chips S1..S5 on cancelled/early-failed runs | same 4 runs | all grey | `CANCELLED_BEFORE_SOURCE`, `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED` | LEGIT | no stage state recorded | none |
| S01 | RUNNING/QUEUED progress tiles | none exist | could not be exercised | n/a | n/a | not testable: no running run | none |
| S12 | per-mode chip "cert cap not published" | 5 modes x every schedule | `cert cap not published` | `cert_cap.state = NOT_PUBLISHED`, reason "QuantBT 1.1.1 certifies an execution route and its result metadata, not an optimization mode or schedule; no per-mode certification cap exists in the pinned source." | LEGIT | the cap does not exist; UI should say so | none (FE wording) |
| S12 | footer "AVOID WHEN — NOT PUBLISHED" | 5 modes | `avoid_when.state = NOT_PUBLISHED` | "QuantBT 1.1.1 publishes no avoid-when guidance for this mode; the Portal does not write one of its own." | LEGIT | none | none (hide the line) |
| S12 | Execution routes "Portal" column cell (no declare) | 12 of 14 routes | free text "Portal has not admitted …" | n/a (admission) | LEGIT | route not admitted in P04 | none |
| S12 | Claims tab "certify_result_metadata — no branch" | `reactive`, `native_portfolio` | `—` | `result_metadata_level = null` | LEGIT | engine has no branch | none |
| S12 | historical release body | `er_quantbt_108` | "route, mode and claim facts — NOT_PUBLISHED" | `facts_state = NOT_PUBLISHED`, "Only the historical release identity is retained…" | BACKEND-GAP | users with 1.0.8 runs cannot see the modes/routes/claims their run was bound to | **REQ-F** |
| S00 | any block | n/a | no empty cell: the map is a static descriptor; "PICK A RUN" / "BLOCKED" are by design | n/a | n/a | none | none |

### Backend requests (standard form)

**REQ-A. Recompute last-30D and all-time analytics for old seals (companion backfill)**
- Endpoint/field needed: `GET /api/v1/quantbt/runs` items `last_30d` (availability AVAILABLE + `data`), and `analytics_all_time.sharpe`; same for the run report equivalents.
- UI reason: Run Library tile "LAST 30D RETURN / SHARPE" and all-time "SHARPE".
- Current impact: 34 of 44 runs print `LAST 30D not published` (`PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL`), R-P04-018 prints all-time `SHARPE not published` (`P04_RETAINED_SAMPLED_EQUITY_HAS_NO_COMPLETE_ANALYTICS_INPUT`).
- Smallest proposal: run the analytics v2 job over the retained equity tape of every COMPLETED run whose seal predates it and write a companion record (do not touch the immutable seal); the list reads the companion. For R-P04-018, compute Sharpe from the retained 744-point tape with `coverage: SAMPLED_RETAINED_EQUITY` and `origin: PORTAL_DERIVED`.
- UI today: renders `not published` with the code in the tooltip.

**REQ-B. OOS Sharpe and decay for the newest P04 fixed-profile seal**
- Endpoint/field needed: `items[].stats[]` entries `oos_sharpe` and `decay` (state AVAILABLE, `value` string).
- UI reason: tiles "OOS SHARPE" and "Δ DECAY" on R-P04-021.
- Current impact: both read `not published` (`P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS`) although R-P04-019 and 018 (older) show OOS Sharpe 0.74.
- Smallest proposal: pass the engine result to the analytics step for the P10 fixed-profile seal as it already does for 019/018; if the single-trial profile has no OOS split, return state `NOT_APPLICABLE` with reason `P10_SINGLE_TRIAL_NO_OOS_SPLIT` instead of `NOT_PUBLISHED`.
- UI today: `not published`.

**REQ-C. IS boundary in the child receipt (decay) and OOS for pre-analytics seals**
- Endpoint/field needed: `items[].stats[]` key `decay` and `oos_sharpe`.
- UI reason: Δ DECAY tile.
- Current impact: R-P04-019, R-P04-018 print `not measured` (`P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT`, 14 occurrences in the list); R-P04-006 prints `not recorded` (`P13_SOURCE_PREDATES_OOS_ANALYTICS`).
- Smallest proposal: derive the IS boundary from the frozen split (S1) of the same run and write it into the companion record; recompute decay = IS Sharpe - OOS Sharpe there.
- UI today: `not measured` / `not recorded`.

**REQ-D. Failed stage and runtime for the two earliest failed runs**
- Endpoint/field needed: failure block of R-P04-001/002 in the list (`failed_at_stage`, `runtime_ms`, human `reason_label`).
- UI reason: "FAILED AT", "RUNTIME", "REASON" tiles.
- Current impact: `not published` for stage and runtime and a raw reason `P06_RETRY_NOT_DISPATCHED` (`P11_FAILED_STAGE_NOT_PUBLISHED`).
- Smallest proposal: backfill from the job lifecycle table (stage = last stage with a start event, runtime = finished - started). Additionally return a `reason_label` string for every failure code (`ENGINE_ERROR`, `ARTIFACT_COMMIT_FAILED`, `P06_RETRY_NOT_DISPATCHED`) so the UI stops printing tokens.
- UI today: prints the raw token in red.

**REQ-E. Elapsed and last stage for cancelled runs**
- Endpoint/field needed: items for CANCELLED rows: `cancelled_at_utc_ms`, `elapsed_ms`, `last_stage`.
- UI reason: tiles "PROGRESS / TRIALS / ELAPSED".
- Current impact: R-WFO-018 and 019 print `not reported` x3 and five grey stage chips.
- Smallest proposal: derive from the lifecycle record (created -> cancelled) even when the source published nothing.
- UI today: `not reported`.

**REQ-F. Retain route/mode/claim facts for `er_quantbt_108`**
- Endpoint/field needed: `GET /api/v1/research/quantbt/atlas?release_id=er_quantbt_108` -> `atlas` (currently `null`) with `routes`, `modes`, `claims` of the 1.0.8 manifest, `historical_identity.facts_state = PARTIAL`.
- UI reason: the historical atlas body.
- Current impact: the screen is one sentence; users with 1.0.8 runs cannot read which modes/routes their run used.
- Smallest proposal: publish the pinned 1.0.8 manifest facts that exist; mark missing groups individually `NOT_PUBLISHED` with a reason.
- UI today: one line "route, mode and claim facts — NOT_PUBLISHED".

Inventory row count by class: LEGIT 11, OLD-SEAL 5, BACKEND-GAP 3, FE-GAP 1, HIFI-ONLY 0 (plus 2 "n/a" rows: no running run, S00 has none). Total listed rows 22.

---------------------------------------------------------------------------

---

## Nhóm S02

Columns: screen · element · run(s) · state shown · reason code shown (verbatim) · class · what the user needs · backend request. `BTCUSDT 1h` unless stated.

| # | screen | element | run(s) | state shown | reason code (verbatim) | class | what the user needs | backend request |
|---|---|---|---|---|---|---|---|---|
| N01 | S02 step 5 + rail | IS / Holdout `bars` and `warmup` (Window timeline) | fresh form, BTCUSDT 1h/4h/1d after default prefill | `bars — not published`, `warmup — not published` | `WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE` (only in the response; the UI prints "not published") | FE-GAP (+ small BE ask B-01) | exact bars and warmup for the declared windows | FE: the endpoint already answers 200 AVAILABLE for valid windows (`2020-03-01→2024-01-01` = 33,624 bars, `warmup_bars_available_before_start=300`); the failure comes from the prefilled bounds. Field path `datasets[0].symbols.items[BTCUSDT].coverage_by_timeframe[tf].first_bar_utc_ms / indexed_end_exclusive_utc_ms` is served and unused for prefill. BE ask in B-01 |
| N02 | S02 rail | `outer folds` (three-window, mode_1_decay × global) | clone R-P04-021/018, bound 1h | `outer folds — not published · profile publishes no fold bounds` | (UI text) `fold_bounds:null` on p04 | LEGIT (three_window_decay has no outer folds) | say "no outer folds" instead of "not published" | none; FE text change |
| N03 | S02 rail | `outer folds` (mode_2..5, any protocol) | bound | `outer folds — not published · no admitted profile publishes it` | (UI text) | LEGIT (no admitted profile for that combination) | nothing | none |
| N04 | S02 step 5/rail | fold count for the advanced protocol before preflight | R-WFO-0xx copies, advanced | only the range `folds 2-16` from the profile; exact count only after a persisted preflight | n/a | BACKEND-GAP | the real fold count and bounds for the declared span, frequency and window mode, before persisting anything | B-02 |
| N05 | S02 step 4 popup | `instrument terms — not published` (tick size, lot size, multiplier, listing/expiry) | every symbol incl. BTCUSDT_210326 | header `instrument terms — not published`; line `instrument — not published` | `HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED` (`symbols.items[i].instrument.state=NOT_PUBLISHED`, all fields null) | BACKEND-GAP | contract kind, tick/lot, multiplier, listing and expiry; especially the expiry of the 24 dated contracts | B-03 |
| N06 | S02 step 4 | symbol-level `quality` | every symbol | not shown as such (UI reads per-timeframe `0 gaps`) | `HMD_QUALITY_IS_TIMEFRAME_SPECIFIC` | LEGIT (quality is per timeframe and the UI already reads `coverage_by_timeframe`) | nothing | none |
| N07 | S02 rail, Forecast | `cert ceiling` | all mode × schedule | `NOT PUBLISHED` + 28-word sentence | (served text) "QuantBT 1.1.1 certifies an execution route and its result metadata, not an optimization mode or schedule; no per-mode certification cap exists in the pinned source." | LEGIT (engine certifies per route) | nothing; shorten text | none |
| N08 | S02 rail, Forecast | `payload sha256` | all | "after preflight" | n/a | LEGIT (digest exists only after preflight) | nothing | none |
| N09 | S02 step 1 | `LAST PUBLISHED RC` | delta av_1_0_0, s14-ui-receipt av_0_1_0 | `not published · P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED` | verbatim | LEGIT (no release candidate has been published for these versions; typed absence from the P22 lookup) | show "No release candidate yet", keep the code in a tooltip | none |
| N10 | S02 step 1 | `SUPERSEDES` | delta av_1_0_0 | `not recorded · HISTORICAL_NOT_RECORDED` (s14 shows `none · first version`) | `HISTORICAL_NOT_RECORDED` | OLD-SEAL (registry row registered before supersession was recorded; `supersedes_state` in `GET /alphas`) | whether this is a first version | B-04 |
| N11 | S02 step 4 | timeframe chips 4h and 1d (profile coverage) | delta, advanced and three-window | enabled, nothing said | n/a (profiles carry `timeframe:"1h"`) | FE-GAP | knowing before preflight that no admitted profile exists for 4h/1d | none for BE: `portal_admission.profiles[].timeframe` is already served |
| N12 | S02 step 1 | `run_admission` of the bound version | `s14-ui-receipt`, `s14-api-receipt` | bound as "valid / PUBLISHABLE" | `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` (`alphas.entries[i].run_admission.may_create_run=false`) | FE-GAP | a visible "cannot create runs: ..." on Context | none for BE: field already served |
| N13 | S02 step 3 | 12 not-admitted route chips (intrabar_bracket, dca_ladder, reactive, event_driven, native_event_lifecycle, orders, fill_replay, basket, arbitrage, portfolio, nautilus_dca_grid, options) | all | dashed, reason only in aria-label/title | e.g. "Engine constructor is public; Portal has not admitted typed stop/take-profit intent fields in P04." | LEGIT (not admitted in this release) | reason visible on focus | none; FE presentation (U08) |
| N14 | S02 step 5 | schedules `per_fold_decay`, `per_fold_causal` for mode_2, 3, 5 (and per_fold_decay for mode_4) | bound | `· not admitted` disabled | e.g. "QuantBT 1.1.1 permits per_fold_decay only for mode_1_decay with robust_decay; this mode is rejected by the pinned engine." | LEGIT (engine rule) | nothing | none |
| N15 | S02 step 4 | timeframes 1min, 5min, 15min, 30min | delta version | disabled | `not declared by av_1_0_0` (UI) | LEGIT (version declares 1h, 4h, 1d) | reason visible | none |
| N16 | S02 step 8 | 6 preflight panels | all | `not read` until a real preflight | n/a | LEGIT (a real preflight was not pressed by the auditor; success rendering NOT exercised) | run once on a disposable draft | none |
| N17 | S02 step 7 | seed / trials / folds facts when timeframe is not 1h | advanced + 4h | p10 card shown for a timeframe it does not cover | n/a | FE-GAP (same as N11) | profile fit per timeframe | none |

### Backend requests (BACKEND-GAP and OLD-SEAL rows)

**B-01 (N01, optional hardening) `bar-metadata` should say why and what would work.**
- Endpoint/field needed: `GET /api/v1/research/datasets/{id}/bar-metadata` — on `availability: "NOT_PUBLISHED"` with `reason_code: "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"` add `verified_range: {first_bar_utc_ms: int, last_bar_exclusive_utc_ms: int}` and `earliest_start_with_warmup_utc_ms: int | null` (earliest start that still leaves `warmup_bars` of history).
- UI reason: Screen 02 prefills windows and must pick bounds that are inside the index and leave warmup; today it guesses and the user sees "not published".
- Current impact: BTCUSDT 1h/4h/1d, default prefill `2020-01-01 → 2026-11-01`, IS and Holdout show `bars — not published`, `warmup — not published`. The same IS from `2020-03-01` returns 33,624 bars with `warmup_bars_available_before_start: 300`.
- Smallest proposal: add the three nullable fields to the existing response (additive; `research.dataset-bar-metadata.v1` stays compatible). Example: `{"reason_code":"WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE","verified_range":{"first_bar_utc_ms":1577836800000,"last_bar_exclusive_utc_ms":1790812800000},"earliest_start_with_warmup_utc_ms":1578916800000}`.
- What the UI does today: prints "not published" without a reason; prefill uses month bounds. (The prefill change in flight moves to the per-timeframe bounds already in catalog-v2; B-01 only makes the remaining cases explainable.)

**B-02 (N04) Fold plan before persisting a preflight.**
- Endpoint/field needed: `POST /api/v1/research/preflights:plan` (or `?dry_run=true` on the existing route) returning `{outer_fold_count: int, folds: [{index, train_start_utc_ms, oos_start_utc_ms, oos_end_exclusive_utc_ms}], bars_per_window, warmup}` with no stored token and no row.
- UI reason: Walk-forward step shows only the profile range `folds 2-16`; the reader cannot tell whether their span, frequency and window mode give 3 or 15 folds until a preflight is created.
- Current impact: advanced runs (R-WFO-017/020/023 copies): rail `folds 2–16 · server profile · p10...`; the exact count needs a persisted preflight (a write).
- Smallest proposal: same body as `POST /preflights`; response is the existing `effective_spec.topology` + `resource_estimate.outer_fold_count` subset; idempotent, side-effect free, rate-limited.
- What the UI does today: range from `portal_admission.profiles[].fold_bounds`, never a computed count.

**B-03 (N05) Publish instrument terms.**
- Endpoint/field needed: `GET /api/v1/research/datasets/catalog-v2` and `/datasets/{id}/symbols` — fill `symbols.items[i].instrument` (today `state:"NOT_PUBLISHED", reason_code:"HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED"`, every field null): `contract_kind`, `display_name`, `base`, `quote`, `settle_currency`, `tick_size` (decimal string), `lot_size`, `contract_multiplier`, `listing_utc_ms`, `expiry_utc_ms`.
- UI reason: the symbol popup lists 24 dated `BTCUSDT_YYMMDD` contracts next to the perpetual and cannot say which expired when; prefill for a dated contract ends a month after its expiry (BTCUSDT_210326 → holdout end 2021-04-01).
- Current impact: popup header "instrument terms — not published" on every symbol; line `instrument — not published` after a pick.
- Smallest proposal: serve `expiry_utc_ms` and `listing_utc_ms` first (derivable from the symbol name and first/last bar), then tick/lot/multiplier. Example: `{"symbol":"BTCUSDT_210326","instrument":{"state":"PUBLISHED","contract_kind":"QUARTERLY","expiry_utc_ms":1616745600000,"listing_utc_ms":1612137600000,"tick_size":"0.1","lot_size":"0.001","contract_multiplier":"1","settle_currency":"USDT"}}`.
- What the UI does today: shows the typed absence and ignores it; prefill uses the coverage months.

**B-04 (N10, OLD-SEAL companion backfill) Supersession of the first registered version.**
- Endpoint/field needed: `GET /api/v1/research/alphas`, entry `av_delta_rsi_polynomial_alpha_1_0_0`: `supersedes_state` is `HISTORICAL_NOT_RECORDED`, `supersedes: null`.
- UI reason: Context card prints "not recorded · HISTORICAL_NOT_RECORDED" under SUPERSEDES.
- Current impact: the registry row used by every real run reads as unknown lineage; the s14-* rows read "none · first version".
- Smallest proposal: a one-off registry companion update setting `supersedes_state: "RECORDED"` (`supersedes: null`) for rows registered before supersession recording where the alpha has exactly one version; keep typed `HISTORICAL_NOT_RECORDED` only where history is truly unknown.
- What the UI does today: prints the typed absence with the raw code.

---

## Nhóm S03_S05

Classes: LEGIT, OLD-SEAL, BACKEND-GAP, FE-GAP, HIFI-ONLY. API field paths verified by `fetch` from the page.

| # | screen | element | run(s) | state shown | reason code (verbatim) | class | user needs | backend request |
|---|---|---|---|---|---|---|---|---|
| 1 | S03 | Claim passport CERTIFICATION | 017/020/023, P04 | "not published" | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` | BACKEND-GAP | methodology grade | R1 |
| 2 | S03 | Fold Gantt per-fold bars | 017/020/023, P04 | placeholder bars, `data-fold-timeline="NOT_PUBLISHED"` | `SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS` | BACKEND-GAP | per-fold IS/OOS segment timing | R2 |
| 3 | S03 | Header "rate" | 017, 020, P04 | "rate not published" | (none shown) | OLD-SEAL (older journals lack rate) / LEGIT for fixed profile | trials/s | R3 |
| 4 | S03 | Artifact "reader route" | all | "reader route — not published" | `reader_href = null` | LEGIT (no reader route is installed) | open artifact | none |
| 5 | S03 | Artifact "export" | all | "export — not published" | — | LEGIT | download | none |
| 6 | S03 | Retained table COVERAGE | all complete | "not reported" | — | BACKEND-GAP | row coverage | R4 |
| 7 | S03 | Retained table SEALED AT / ROWS on failed run | 021 | "not reported", 0, "0 B" | state ABORTED | LEGIT | — | none |
| 8 | S03 | Evidence cursor on failed run | 021 | "fold none yet · trial not published · params not published" | — | LEGIT | — | none |
| 9 | S03 | Fold Gantt on failed run | 021 | "0 of 9 folds reported" although S1-S3 DONE and 400/400 trials | — | BACKEND-GAP | folds scored before the S4 failure | R5 |
| 10 | S03 | Console on failed run | 021 | 400 lines, no error line for the failure | — | BACKEND-GAP | the engine error in the stream | R6 |
| 11 | S03 | Sealed claims | 020/023 | S03 says "NOT ISSUED" | `progress.claims[]` has 4 `ISSUED` rows (`VALIDATION walk_forward_oos`, `CHRONOLOGY not_causal_multi_fold_global_calibration`, `CAUSALITY retrospective_global_calibration`, `OOS_SELECTION USED`, source `SEALED_QUANTBT_CLAIM`) | FE-GAP | the facts the run sealed | UI reads `read.claims` |
| 12 | S03 | Failure message | 021 | generic sentence | `current.terminal_reason.message`, `failed_at.stage=S4`, `failure.code=ENGINE_ERROR` | FE-GAP | cause + stage in the headline | UI |
| 13 | S03 | Sealed holdout row | P04 | "DENIED … unlock is a one-time audited workflow this release does not install" | `P08_SEALED_HOLDOUT_UNLOCK_NOT_INSTALLED` | LEGIT | — | none |
| 14 | S03 | Cancelled / queued run: no progress block at all | 018, 019 | only a card | `availability=CANCELLED_BEFORE_SOURCE` | LEGIT | — | none |
| 15 | S03 | Console lines `limit=5` returns `lines: []` while UI shows 400 (UI uses `limit=500`) | 023 | n/a | — | note only | — | none |
| 16 | S05 | Methodology certificate / "what this stage feeds forward" | 017/020/023 | "methodology certificate — not published" | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` | BACKEND-GAP (same as #1) | cert cap | R1 |
| 17 | S05 | "Portal digest · QuantBT: not published" | 017/020/023 | text | — | BACKEND-GAP | source-side stitch digest to compare with the Portal digest | R7 |
| 18 | S05 | Inner folds | all WFO | "n/a" | `QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION` | LEGIT | — | none |
| 19 | S05 | Warmup window | all WFO | "n/a" | `QUANTBT_WARMUP_POLICY_IS_NONE` | LEGIT | — | none |
| 20 | S05 | Holdout | all WFO | "n/a" | `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT` | LEGIT (profile has none) | — | none |
| 21 | S05 | Fold table "OOS trades" | all WFO | column absent | `fold_plan.folds[i].score.oos_trades` served ("5","6","3"…) | FE-GAP | trade count behind each OOS Sharpe | UI |
| 22 | S05 | Gap scan detail / account policy | all WFO | aggregate only | `gap_scan.boundaries[]`, `anatomy.account_policy="carry_position"`, `max_gap_bars` served | FE-GAP | which boundary, policy | UI |
| 23 | S05 | Stitch boundary check | all WFO | "verified" | `stitch.boundary_check="MATCH"` | OK | — | none |
| 24 | S05 | P04: fold plan | P04 021/018 | "fold plan not published" | `P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_PLAN` | LEGIT (one IS/OOS pair) | — | none |
| 25 | S05 | P04: retained lane | P04 | "not applicable" | `RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION` | LEGIT | — | none |
| 26 | S05 | P04: Θ* per fold | P04 | "not published" | `P04_FIXED_PROFILE_DOES_NOT_PUBLISH_THETA_PER_FOLD` | LEGIT (no search) | — | none |
| 27 | S05 | P04: IS Sharpe, OOS S_FULL, Δ decay | P04 | "not in read" x3 | (none) | BACKEND-GAP (the three-window run executed both windows) | the 3 headline metrics for the only fold | R8 |
| 28 | S05 | P04: gap scan, train∩test, physical row-group I/O | P04 | "not published" / "not attested" | `RS02_RETAINED_LANE_NOT_APPLICABLE…` | LEGIT / BACKEND-GAP for train∩test (derivable from the 3 windows) | disjointness verdict | R9 |
| 29 | S05 | P04: stitch digest, cert cap | P04 | "not in the split read" / "not published" | — | LEGIT (one window, no stitching) / BACKEND-GAP for cert cap | cert cap | R1 |
| 30 | S05 | P04: holdout seal / bars / unlock record | P04 | "not published", " · bars not counted" | `P08_METADATA_BOUND`, `NOT_EVALUATED`, `NOT_EXPOSED` | LEGIT for unlock; BACKEND-GAP for seal digest and bar count (progress read already says 744 bars) | R10 |
| 31 | S05 | whole page for FAILED/CANCELLED | 021, 018, 019 | PARTIAL, every field "not published" | `P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED`, `RESEARCH_CURRENT_SOURCE_CONFLICT` | BACKEND-GAP | planned windows are known (progress read has `planned_folds`, requested spec has the span) | R11 |
| 32 | S05 | `/quantbt/runs/:id/split` for completed WFO | 017/020/023 | NOT_PUBLISHED, `readiness NOT_READY` (page falls back to current-source) | `P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED` | OLD-SEAL | one canonical split read | R12 |
| 33 | S05 | S1 bar `timeline` on failed | 021 | "timeline — not published" | same | same as #31 | | R11 |

### Backend requests (standard form)

**R1 methodology certificate** — Endpoint/field: `GET /api/v1/research/runs/{id}/progress` -> `progress.claim.methodology_certificate` and `GET /api/v1/quantbt/runs/{id}/current-source/split` -> new `certificate`. UI reason: Claim passport CERTIFICATION and S05 "feeds forward" card show "not published". Current impact: both blocks are permanent placeholders on every run (3 screens). Smallest proposal: `{state:"AVAILABLE", grade:"A"|"B"|"C"|"NONE", cap:"<string>", issued_at_utc_ms:1790862291775, reason_code:null}`; if the engine truly issues none, return `state:"NOT_APPLICABLE"` with `reason_code:"NO_METHODOLOGY_CERTIFICATE_FOR_PROFILE_P10"` so the UI deletes the block. UI today: prints "not published" + raw code.

**R2 per-fold timeline** — Endpoint/field: `progress.folds[i].fold_timeline.segments[]`. UI reason: Gantt rows are empty placeholder bars. Impact: user cannot see when each fold's IS/OOS segment was computed. Proposal: `segments:[{kind:"IS"|"OOS",start_utc_ms,end_utc_ms,bars:720}]` taken from the already retained fold plan (`current-source/split.fold_plan.folds[i].train_*/test_*`, no new engine data). UI: renders placeholder bar and `NOT_PUBLISHED`.

**R3 trial rate** — Endpoint/field: `progress.overall.rate_trials_per_s` for runs 017, 020 and fixed profiles. UI reason: "rate not published". Impact: low. Proposal: backfill from `trials_done / elapsed_s` (string, 2 decimals) for sealed journals, or `null` + `reason_code:"FIXED_PROFILE_NO_RATE"`. UI: prints "rate not published".

**R4 retained-table coverage** — Endpoint/field: `retained_artifacts[i].coverage` `{state, rows_expected, rows_present}`. UI reason: "COVERAGE not reported" on every sealed table. Impact: user cannot tell if the 2,657 rows are complete. Proposal: `{"state":"AVAILABLE","rows_expected":"2657","rows_present":"2657"}`. UI: "not reported".

**R5 folds on a failed run** — Endpoint/field: `progress.folds[]` for terminal FAILED runs, plus `progress.overall.pct`. UI reason: R-WFO-021 shows "0 of 9 folds reported" while 400/400 trials and S1-S3 are DONE, and 80% with 400/400. Impact: the failure looks like it happened at the start. Proposal: return the folds journalled before the failure (state DONE/FAILED/PENDING per fold) and `overall.pct_basis:"STAGES"|"TRIALS"`. UI: shows empty Gantt.

**R6 failure line in the console** — Endpoint/field: `GET /api/v1/research/runs/{id}/console` -> final line `{level:"E", text:"ENGINE_ERROR S4: The current-source summary exceeds the sealed local read-model budget."}`. UI reason: the "errors" filter is empty on a FAILED run. Impact: the filter that exists for failures shows nothing. UI: no line.

**R7 source stitch digest** — Endpoint/field: `current-source/split.stitch.source_digest` `{state, digest, basis}`. UI reason: "Portal digest · QuantBT: not published" — only the Portal-side digest is shown. Impact: no cross-check. Proposal: `"source_digest":{"state":"NOT_PUBLISHED","reason_code":"SOURCE_DID_NOT_PUBLISH_STITCH_DIGEST"}` at minimum so the UI prints one line. UI: free text.

**R8 P04 fixed-profile metrics** — Endpoint/field: `GET /api/v1/quantbt/runs/{id}/split` (P04) `fold_plan.folds[0].score.{is_sharpe,oos_sharpe,decay,oos_trades}` for run_profile P04_FIXED_QUALIFICATION. UI reason: "IS SHARPE / OOS · S_FULL / Δ DECAY — not in read". Impact: the table has one row and all three metrics are blank. Proposal: same shape as the WFO `score` object from the sealed P04 evidence source (`current-source/evidence` of that run). UI: "not in read".

**R9 P04 train∩test verdict** — Endpoint/field: `guards.train_test_disjoint {verdict:"PASS", basis:"THREE_WINDOW_UTC_BOUNDS"}` for P04 splits. UI reason: "train ∩ test = ∅ — not published". Impact: the guard is derivable from the three published windows. UI: "not published".

**R10 P04 holdout seal** — Endpoint/field: `windows.holdout.{seal_digest, bars}`; progress read already has `denied_artifacts[0].rows="744"`. UI reason: "NEVER READ seal not published · bars not counted". Proposal: copy `rows` and the seal digest into the split read. UI: dangling text.

**R11 split for terminal-without-artifact runs** — Endpoint/field: `GET /api/v1/quantbt/runs/{id}/split` for FAILED/CANCELLED runs: fill `windows.*`, `protocol.fold_plan` from `progress.run.planned_folds` and the requested spec; replace the 409 on `current-source/*` with 200 `availability.state="NOT_RETAINED_TERMINAL"`. UI reason: S05 shows a PARTIAL wall of "not published" and the browser logs three 409 errors per page. UI: PARTIAL banner.

**R12 canonical split read for completed WFO** — Endpoint/field: `GET /api/v1/quantbt/runs/{id}/split` returns `availability.NOT_PUBLISHED` / `readiness NOT_READY` for sealed WFO 017/020/023 (the page works only through `current-source/split`). Proposal: backfill the P14 split receipt from the retained current-source split (companion backfill; the seal stays immutable). UI: ignores this endpoint's emptiness for WFO.

---

## Nhóm S04

Reason codes verbatim from API/UI. "Request" is in the standard form: endpoint/field · UI reason · impact · proposal · UI today.

| # | screen · element | run(s) | state shown | reason code shown | class | what the user needs | backend request |
|---|---|---|---|---|---|---|---|
| I1 | Summary · IS window panel | all | `IS window metrics — not published` | none shown; API `windows.is.reason_code=RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD` | FE-GAP (reason); LEGIT for WFO (`QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT`) | the reason on screen | FE prints `enriched_analysis.windows.is.reason_code` |
| I2 | Summary · IS metrics (P04) | P21, P18 | same | `RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD`, yet EChart 1 draws a dashed IS equity (20 of 720 obs) | BACKEND-GAP | IS Sharpe/return/DD for the fixed profile | Endpoint `GET /api/v1/quantbt/runs/{id}/evidence` field `enriched_analysis.windows.is` · UI: IS switch shows nothing though IS equity exists · impact: no IS vs OOS read for fixed profile · proposal: `windows.is.state=AVAILABLE` + `facts.metrics_is.{sharpe,return_fraction,max_drawdown_fraction}` from the retained IS sample · UI today: "not published" |
| I3 | Summary · Holdout window | W | `Holdout window metrics — not published` | API `windows.holdout=NOT_PUBLISHED / RETAINED_NO_HOLDOUT_ACCOUNT_PAYLOAD` vs `claim.holdout=NOT_APPLICABLE / P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT` | BACKEND-GAP | "n/a: no holdout in this profile" | Field `enriched_analysis.windows.holdout.{state,reason_code}` · two sources disagree · UI shows the weaker one · proposal `state=NOT_APPLICABLE`, `reason_code=P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT` for WFO · UI today "not published" |
| I4 | Summary/S5/header · Holdout (P04) | P21, P18 | window "not published"; S5 `Holdout — not applicable`; header `HOLDOUT_STATE not published` | `P04_HOLDOUT_SEAL_NOT_IN_EVIDENCE_HUB`, `P13_SEALED_HOLDOUT_BAR_COUNT_DENIED` | LEGIT (sealed on purpose) + wording | "sealed, not read" | Backend: `claims[kind=HOLDOUT_STATE].state` for P04 should be `DENIED`/`SEALED` not NOT_PUBLISHED; FE wording |
| I5 | Summary · Compare window | all | button disabled | title only | HIFI-ONLY / BACKEND-GAP | IS vs OOS compare | Field `enriched_analysis.windows.compare` (IS/OOS metric pairs + decay) · proposal emit when `windows.is` AVAILABLE (P04 first) · UI today disabled |
| I6 | Summary · Rebased 100 | W | disabled | "a rebased series is not published" | FE-GAP | rebased EChart 1 | API already serves `enriched_analysis.curves.strategy_rebased_100` (31 pts) and `benchmark_rebased_100` (32 pts); FE to wire or remove |
| I7 | Header · CERTIFICATION | all | `not published` | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` | LEGIT | none (claim NOT_ISSUED by design) | — |
| I8 | Header · validation / chronological / oos_used / execution_contract / causality | P21, P18 | `not published` x5 | `claims[]` carries `state=FORECAST` text from `ATLAS_MODE_SCHEDULE` (walk_forward_oos, close_target_v2…) | FE-GAP (design choice) | forecast shown as "declared" | FE reads `evidence.claims[].text` |
| I9 | Header · RUNTIME AUTHORITY | P21, P18 | `not published` | `RUNTIME_AUTHORITY_NOT_PUBLISHED_FOR_RUN` | BACKEND-GAP | which engine path ran | Field `claims[kind=RUNTIME_AUTHORITY]` · proposal fill from the engine receipt (`NATIVE_VECTORIZED · numba_units_v2` as on WFO) · UI today "not published" |
| I10 | Summary · hub-level read | W17/20/23 | `/evidence` says `availability=NOT_PUBLISHED P13_SOURCE_EVIDENCE_NOT_PUBLISHED`, `readiness=NOT_READY`, all `metrics[]`, `oos_performance`, `series[]` NOT_PUBLISHED; UI recomposes from current-source | `P13_SOURCE_EVIDENCE_NOT_PUBLISHED` | BACKEND-GAP | one authoritative hub read | Endpoint `GET /quantbt/runs/{id}/evidence` (research.evidence-hub.v1) · the hub read contradicts data shown from `/current-source/evidence` · impact: when current-source fails the UI says "not published" (U4) · proposal: when a READY retained seal exists set `availability=AVAILABLE`, `readiness=READY`, point `series[].href` at current-source · UI today works around it |
| I11 | Summary · 10 of 15 headline tiles empty | W | `5 of 15 metrics` | `P13_SOURCE_EVIDENCE_NOT_PUBLISHED` per metric | OLD-SEAL / BACKEND-GAP | initial equity, bars processed, benchmark return, funding | Fields `evidence.metrics[INITIAL_EQUITY,BARS_PROCESSED,BENCHMARK_RETURN_FRACTION,FUNDING_TOTAL]` · fill from current-source `passport.artifact_table_rows` (`initial_equity=20000`, `observations=2208`) and `enriched_analysis.facts.metrics.benchmark_return_fraction` · UI today counts only |
| I12 | EChart 1 · IS equity | W | `IS equity — not published` | `QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT` | LEGIT | engine keeps no selected-candidate IS account | — |
| I13 | EChart 1 provenance row | P21 | `SEGMENT / UNITS / DIGEST not served for this lane` | FE text | BACKEND-GAP | segment, units, digest | `/evidence/series?kind=EQUITY_OOS` add `segment`, `units`, `input_digest` as on the retained lane · UI today "not served for this lane" |
| I14 | EChart 2 · `fold starts — not published` | P21 | note | FE text | LEGIT | single fold | FE wording `n/a — single window` |
| I15 | Per-fold verdict table | P21, P18 | empty table + `per-fold metrics · not published` + `per-fold metrics — not applicable` | `P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS` | LEGIT | one wording | FE |
| I16 | EChart 3 · benchmark curve | P21, P18 | `benchmark curve — not published` | `P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK`; yet P21 `benchmark_return_fraction=+7.36%`, beta 0.01, corr 0.26 AVAILABLE | BACKEND-GAP | benchmark line | Field `enriched_analysis.curves.benchmark_rebased_100` (0 pts for P04) · return/beta/corr derive from market close so a curve is derivable · proposal emit the rebased benchmark on the strategy grid · UI today hides the line |
| I17 | EChart 3 · beta/corr/benchmark return | P18 | tiles `not published` | `AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED` | OLD-SEAL | benchmark stats on the older P04 run | companion backfill for `rrun_464bf9c3…` (P21 has them) · UI today "not published" |
| I18 | EChart 4 · return distribution | P21, P18 | empty frame `not published` | `P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER` | BACKEND-GAP | daily-return histogram | Field `enriched_analysis.return_distribution` for P04 · compute from the full 744-bar close (31 UTC days) before sampling to 25 points · also make `evidence.series[RETURN_DISTRIBUTION].availability` match the series endpoint · UI today empty frame |
| I19 | Monthly returns | P21 | 1 hatched cell `7/26 −0.15%` | `/evidence.series[MONTHLY_RETURNS]=NOT_APPLICABLE P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE` vs series endpoint AVAILABLE | BACKEND-GAP (consistency) | one answer | align `series[]` availability with the series endpoint |
| I20 | Behavior · Sharpe decay | W17/20/23 | `not applicable` | `PORTAL_ANALYTICS_IS_OR_OOS_SHARPE_UNAVAILABLE` | BACKEND-GAP | run-level decay (verdict header already says `decay +1.74`) | Field `enriched_analysis.facts.metrics.sharpe_decay` · per-fold `fold_verdicts[].decay` exists · proposal `value=mean(fold_verdicts.decay)`, `origin=PORTAL_DERIVED` · UI today "not applicable" |
| I21 | Behavior · long hit rate | W17 | `not applicable` | `P13_OOS_HAS_NO_LONG_EXPOSURE_BARS` | LEGIT | — | — |
| I22 | Behavior · win rate, payoff, avg hold, max consec. losses | W shown as derived; P18 absent | derived values under "episodes — not audited trades"; audited form absent | `QUANTBT_ROUTE_PUBLISHES_NO_AUDITED_TRADE_LEDGER`; P18 `P04_RETAINED_SAMPLED_EQUITY_HAS_NO_COMPLETE_ANALYTICS_INPUT` | LEGIT (audited) / OLD-SEAL (P18) | wording | P18: companion backfill of the enriched behavior block |
| I23 | Behavior · turnover | W20 (v2 level) | absent at v2 | `PORTAL_ANALYTICS_TURNOVER_NOT_PUBLISHED` | OLD-SEAL | turnover on the older seal | companion backfill (W23 enriched has `64,235.58`) |
| I24 | Passport · route ledger / audited fills | W | `route ledger — not published`, `audited fills — not published` | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_ROUTE_LEDGER`, `…_AUDITED_FILLS` | LEGIT (S4 shows 32 target transitions) | — | — |
| I25 | Rolling Sharpe / rolling returns (no UI slot) | W23/20, W17, P21 | no panel | W23/20 `P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW`; W17 `RS02_SOURCE_PREDATES_RETAINED_ANALYTICS`; P21 `ROLLING_RETURNS_20` AVAILABLE (15 pts), `ROLLING_SHARPE_63` `P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS` | LEGIT (W23/20) / OLD-SEAL (W17) / FE-GAP (P21) | rolling-returns chart for P04 | FE: panel for `series?kind=ROLLING_RETURNS_20` |
| I26 | Header · engine/seal line when current-source fails | any | `engine — not published` | — | FE-GAP (error vs absent) | see U4 | — |
| I27 | P04 · funding | P21, P18 | `No funding series published`; warning ACTIVE | `P04_SOURCE_DID_NOT_PUBLISH_FUNDING` | BACKEND-GAP | funding cost | Fields `evidence.series[kind=FUNDING]`, `metrics[FUNDING_TOTAL]` · publish actual or zero funding for P04 perp runs · UI today "not published" |
| I28 | P04 · headline tiles | P18 | `not published` x5 | `P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT`, `P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS` | OLD-SEAL | summary of the older fixed-profile run | companion backfill for `rrun_464bf9c3…` (P21 shows all) |
| I29 | S1 · inner folds / holdout / portal digest | W | `n/a QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION`, `n/a · no holdout segment`, `Portal digest · QuantBT: not published` | verbatim | LEGIT (first two); BACKEND-GAP low (digest) | split digest | Field `split.provenance.portal_digest` (low) |
| I30 | S1 · fold plan, boundary cells (P04) | P21 | `fold plan — not published`, `not in read` x3, `this stage's cert cap — not published` | `RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION` | LEGIT | wording | FE |
| I31 | S2 · search cinema | W | `search cinema — sampler trace not published` | `QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_TRACE` | BACKEND-GAP | sampler trajectory | Endpoint `/current-source/search` add `sampler_trace[]` (trial, params, value); needs engine support, until then LEGIT |
| I32 | S2 · trial ledger SEED column (100 rows) | W23/20 | `not published` x100 | none shown | BACKEND-GAP | per-trial seed | Field `/current-source/search … trials[].seed` (int) · UI today a column of "not published" |
| I33 | S2 · A6 parameter interactions | W | `not published` | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS` | BACKEND-GAP (low) | interaction view | engine publishes pairwise interaction table |
| I34 | S2 · constraints, centroid, objective kind | W | `n/a — no constraints declared`, `Centroid — not applicable`, W20: `stage not published · objective = objective kind not published` | verbatim | LEGIT / wording | embedded "not published" in a sentence | FE |
| I35 | S2/S3 · P04 | P21 | `levels not published`, `Fold 1 requested. Not applicable — no optimizer fold.` | `P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY` | LEGIT | — | — |
| I36 | S3 · code-fixed values | all | `Code-fixed values not published · code digest 34dc1847… · adapter contract 9ade757b…` | none | BACKEND-GAP (low) | frozen constants | Field `/freeze?fold=N` `code_fixed_values{}` |
| I37 | S4 · orders / fills / trades / SL-TP / OCO / legs | W | `not published QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS`, `…_NO_FILL_RECORDS`, `…_NO_TRADE_RECORDS`; `not applicable QUANTBT_EXECUTION_ALLOW_PARTIAL_FILL_FALSE`, `…INTRABAR_EXIT_MODEL_NONE`, `…CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS`, `…SINGLE_SYMBOL_NETTING_ACCOUNT_HAS_NO_LEGS` | verbatim | LEGIT (route emits target transitions only) | — | — |
| I38 | S4 · cost timeline | W | `fee not published` (window), `FUNDING not applicable QUANTBT_RUN_CONFIG_USE_FUNDING_FALSE` | verbatim | LEGIT / BACKEND-GAP (low) | per-window fees | window fee total derivable from `replay.transitions[].fee` |
| I39 | S4 · P04 | P21 | price overview, execution state, events, blotter, MAE/MFE, orders, fills, positions, child audit `not published`; `FOLD CAPITAL not published` | `P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET` + `P04_SOURCE_DID_NOT_PUBLISH_*` (12) | BACKEND-GAP (candle overview) + LEGIT (retrospective sample) | candle context | Field `core.market_overview` for P04: emit a downsampled overview within budget instead of NOT_PUBLISHED |
| I40 | S5 · certification caps / binding / window card counts / compare / reader route | all | `per-stage caps — not published`, `binding — not published`, `read permission, card count — not published`, `compare scope, state — not published`, `reader route — not published` | none shown | BACKEND-GAP | certification table | Fields `evidence.claim.certification{stage_caps[],binding}`, `core.window_disclosure.{is,oos,holdout}.{read_permission,card_count}` · UI today 5 rows "not published". `holdout_bars` W is `NOT_APPLICABLE / P13_PROTOCOL_HAS_NO_SEALED_HOLDOUT` (LEGIT) |
| I41 | S5 · benchmark source absence | W17 | lower-case `available` / absent | `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL` | OLD-SEAL | benchmark on W17 | companion backfill |
| I42 | Atlas · `cert cap not published` x5 modes, `AVOID WHEN — NOT PUBLISHED` | all | verbatim | none | BACKEND-GAP | per-mode certification cap and avoid-when | Endpoint `GET /api/v1/research/quantbt/atlas` add `modes[].cert_cap` (enum) and `avoid_when` (string[]) · UI today "not published" |
| I43 | Header · route contract | all | not rendered | `P13_ROUTE_CONTRACT_NOT_PUBLISHED` | BACKEND-GAP (low) | route contract digest | `core.run_identity.route.contract` |
| I44 | Seed (P04) | P21, P18 | NOT_APPLICABLE | `P02_RANDOM_SEED_NOT_SELECTED` | LEGIT | — | — |

Inventory totals: 44 rows. Primary class counts: BACKEND-GAP 19 (I2, I3, I5*, I9, I10, I13, I16, I18, I19, I20, I27, I29b, I31, I32, I33, I36, I39, I40, I42, I43 — I5 is HIFI-ONLY primary, I29 LEGIT primary) · LEGIT 14 (I4, I7, I12, I14, I15, I21, I22a, I24, I29a, I30, I34, I35, I37, I44, I38) · OLD-SEAL 5 (I11, I17, I23, I28, I41) · FE-GAP 4 (I1, I6, I8, I26, I25-P21) · HIFI-ONLY 1 (I5). (Rows with two classes are counted under the class of the actionable half.)

---

## Nhóm S06_S07

Columns: screen · element · run(s) · state shown · reason code (verbatim) · class · what the user needs · backend request. LEGIT rows give the reason; requests are written for the BACKEND-GAP / OLD-SEAL / FE-GAP rows below the table (R-nn).

| # | screen · element | run(s) | state shown | reason code | class | what the user needs | request |
|---|---|---|---|---|---|---|---|
| N01 | S06 · search-cinema strip | WFO23/20/17 | dashed line "search cinema — sampler trace not published" | QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_TRACE | LEGIT / HIFI-ONLY | nothing (HiFi shows an animated replay the engine cannot feed) | — |
| N02 | S06 · A1 SAMPLER TRACE | WFO23/20/17 | italic "not published" | QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_TRACE | LEGIT | — | — |
| N03 | S06 · A1 WARM START | WFO23/20/17 | "not published" | QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_WARM_START_OR_BASELINE_TRIALS | LEGIT (engine) | — | — |
| N04 | S06 · A1 DEDUPE | WFO23/20/17 | "not published" | QUANTBT_DUPLICATE_PRUNER_DOES_NOT_PUBLISH_A_DEDUPE_REASON | LEGIT (engine) | — | — |
| N05 | S06 · A3 PRUNE REASONS | WFO23/20 (13 / 11 pruned) | card "not published" | QUANTBT_PUBLISHES_A_PRUNED_FLAG_WITHOUT_A_REASON | LEGIT (engine publishes flag, no reason) | — | — |
| N06 | S06 · A3 PRUNE REASONS | WFO17 | "not applicable" | NO_TRIAL_WAS_PRUNED | LEGIT | — | — |
| N07 | S06 · A5 importance | WFO17 | "not applicable — 3 trials, needs ≥ 8" | (FE threshold, no code) | LEGIT | — | — |
| N08 | S06 · A5 engine importance | WFO23/20 | portal Spearman proxy shown instead | `diagnostics.importance` = QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_IMPORTANCE | LEGIT (proxy labelled) | — | — |
| N09 | S06 · A6 PARAMETER INTERACTIONS | WFO23/20/17 | card "not published" | QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS | LEGIT (engine) | — | — |
| N10 | S06 · B3 best_trial `max_dd` | WFO23/20 (WFO17 best = selected, shows −0.67%) | "not published" | QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN | BACKEND-GAP | drawdown of the best-IS trial next to the selected one | R-S06-1 |
| N11 | S06 · candidate replays (39 rows) drawdown | WFO23/20/17 | no column | same code (`candidates.rows[].max_drawdown`) | BACKEND-GAP | same | R-S06-1 |
| N12 | S06 · ledger SEED column x100 | WFO23/20/17 | "not published" per row | (title "seed is not published per trial") | LEGIT (Optuna has one study seed, shown in A1: 42) | remove the column | FE only |
| N13 | S06 · ledger S_OOS x100 | WFO23/20/17 | "not evaluated · IS stage" | QUANTBT_IS_SEARCH_STAGE_DOES_NOT_EVALUATE_OOS | LEGIT (OOS only for the 39 candidates, shown in candidate replays) | — | — |
| N14 | S06 · ledger rows 100-399 | WFO23/20 | not drawn; A2/A3 tooltips "window not published · rvol not published" for 300 points incl. θ* #350, best IS #311 | `ledger.page.has_more=true, next_cursor` served | FE-GAP (+ BACKEND-GAP for tooltip values) | all 400 trials and parameter values in tooltips | R-S06-2 |
| N15 | S06 · B1 `feasible` | WFO23/20/17 | "n/a — no constraints declared" | QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS | LEGIT | — | — |
| N16 | S06 · B3 centroid | WFO23/20/17 | "Centroid — not applicable" | QUANTBT_SELECTOR_HAS_NO_CENTROID | LEGIT | delete sentence | FE only |
| N17 | S06 · A2 pruned dots (13 / 11) and 4 of 36 grid cells | WFO23/20 | hollow / empty | objective null by design (pruned, unsampled) | LEGIT | — | — |
| N18 | S06 · A1 LEVELS column (P04, 8 cells + footer) | P04 21/18 | "levels not published" | LEVELS_REASON "the search read publishes no level count per parameter" (SearchDetail.tsx:503) | BACKEND-GAP (trivial; range+step are published) | levels count per parameter | R-S06-4 |
| N19 | S06 · header validation / chronological claim / scoring backend | P04 21/18 | "not applicable" | P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_VALIDATION_CLAIM / …_NO_CHRONOLOGICAL_CLAIM / …_NO_SCORING_BACKEND | LEGIT | — | — |
| N20 | S06 · header OOS_USED_FOR_SELECTION, STRICT OUTER OOS | P04 | "not asserted" | P04_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS | LEGIT | — | — |
| N21 | S06 · header CANDIDATE_SELECTION_METRIC | P04 | "not published" | P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC | LEGIT | — | — |
| N22 | S06 · WHAT THIS MODE READS | P04 | "not applicable — no fold strip — fixed profile" | (FE, SearchFoldStrip.tsx:277) | LEGIT | — | — |
| N23 | S06 · A2, A3, A3-prune, A4, A5, A6 (6 cards) | P04 | "not applicable" | P04_FIXED_PROFILE_DOES_NOT_PUBLISH_SEARCH_DIAGNOSTICS | LEGIT | — | — |
| N24 | S06 · B1 candidate pool, B2 objective components, trial ledger, trial jump | P04 | "not applicable" | P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY (ledger lane: RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION) | LEGIT | — | — |
| N25 | S06 · B3 selection trace | P04 | "not applicable" | P04_FIXED_PROFILE_HAS_NO_ENGINE_SELECTION_TRACE | LEGIT | — | — |
| N26 | S06 · B4 parameter frequency, fold inspection | P04 | "not applicable" | P04_FIXED_PROFILE_DOES_NOT_PUBLISH_SEARCH_DIAGNOSTICS | LEGIT | — | — |
| N27 | S06 · whole screen on lane failure | any (mock 500) | PARTIAL "not published" everywhere | P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED | FE bug (D8), not a data gap | retry | FE only |
| N28 | S07 · WALL CLOCK ORDERING | WFO23/20/17 | "not published" | QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS | BACKEND-GAP (engine does not; the portal holds P11 stage events) | params_frozen_at / first OOS read times (HiFi F1 timeline) | R-S07-1 |
| N29 | S07 · F4 "Code-fixed values not published" | WFO23/20/17, P04 | italic "not published" | P04_DELTA_KERNEL_PUBLISHES_NO_CODE_FIXED_VALUE_LIST (`parameter_authority.code_fixed`) | BACKEND-GAP | the values fixed in code (outside the params digest, inside the bundle digest) | R-S07-2 |
| N30 | S07 · ARTIFACT BYTES | WFO23/20/17, P04 | "not verified yet" | P16_ARTIFACT_BYTES_NOT_VERIFIED_YET (`byte_verification`); `source_artifact_bytes` P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES | LEGIT (on demand via POST verify; not exercised) | one-click verify, receipt id and time after | — |
| N31 | S07 · what-if grid cells (76 of 81 empty) | WFO23/20 | blank squares, "evaluate grid · 44 missing" | cell state MISSING | LEGIT (on-demand diagnostic job; not triggered) | — | — |
| N32 | S07 · F4 whole card | WFO20 (old seal) | pill "not compared"; params digest used by replay "not published", per-fold "—", sealed bundle digest "not published", runtime bundle digest "not published" | QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD; row 2 QUANTBT_CHILD_AUDIT_HAS_NO_SELECTION_STAGE_RECORD_FOR_THE_FROZEN_CANDIDATE | OLD-SEAL | binding check on the older run | R-S07-3 |
| N33 | S07 · F3 bundle digest | WFO20 | "not published" | (`stage4_binding.rows[2]`, same family) | OLD-SEAL | bundle digest | R-S07-3 |
| N34 | S07 · F1 per-fold "OOS child" tail x9 | WFO20 | "no OOS generation child" | QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD | OLD-SEAL | per-fold candidate id | R-S07-3 |
| N35 | S07 · ORDERING, WALL CLOCK ORDERING | P04 21/18 | "not asserted" | P04_FIXED_PROFILE_DOES_NOT_PUBLISH_WALL_CLOCK_ORDERING_FACTS | LEGIT | — | — |
| N36 | S07 · selection artifact · trial · sequence; STRICT OUTER OOS; candidate pool; selection artifact | P04 | "none published" / "not asserted" / "not applicable" | P04_FIXED_PROFILE_DOES_NOT_PUBLISH_SELECTION_ARTIFACT; …_STRICT_OUTER_OOS_SELECTION_FACTS | LEGIT | — | — |
| N37 | S07 · HOLDOUT "not evaluated" (`ordering.data_time.holdout.bars` null) | P04 | "not exposed to child tape · not evaluated" | (null `holdout.bars`, `is.evaluation_state`) | LEGIT | — | — |
| N38 | S07 · SOURCE ARTIFACT BYTES | P04 | "not attested" | P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED | LEGIT | — | — |
| N39 | S07 · what-if sandbox (sliders, grid, both buttons) | P04 | "not applicable", disabled | P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EVALUATED_WHAT_IF_GRID; …_DOES_NOT_ACCEPT_DIAGNOSTIC_PARAMETER_OVERRIDES; …_DOES_NOT_ACCEPT_SIBLING_PARAMETER_DRAFTS | LEGIT | hide card (D12) | FE only |
| N40 | S07 · fold inspection | P04 | "fold 1 requested · not applicable" | P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_SELECTIONS | LEGIT | — | — |
| N41 | S07 · retained custody check, diagnostic admission, sibling draft | P04 | "not applicable — P04 run, not retained · nothing pending" | (FE text; sibling draft = …_SIBLING_PARAMETER_DRAFTS) | LEGIT | — | — |
| N42 | S07 · "readiness partial", "retained binding check partial" | P04 | partial although 3/3 comparisons match | `integrity.state=PARTIAL` (source bytes NOT_ATTESTED) | LEGIT (partial because bytes not attested) | explain why partial | FE only |
| N43 | S06+S07 · "frozen at" | WFO23/20/17 | a time that is not the freeze time | `pool.frozen_at_source=P11_STAGE_COMPLETED_S4_EVENT` | BACKEND-GAP (mislabelled data, D2) | the real pool-freeze time | R-S07-1 |

Counts: 43 rows → LEGIT 32 (of which HIFI-ONLY 1; N12 is LEGIT with an FE-side removal), BACKEND-GAP 6 (N10, N11, N18, N28, N29, N43), OLD-SEAL 3 (N32, N33, N34), FE-GAP 1 (N14, with a BACKEND-GAP tooltip half in R-S06-2), FE bug 1 (N27, not a data gap).

### Backend requests (standard form)

**R-S06-1 — candidate drawdown (N10, N11)**
- Endpoint/field needed: `GET /api/v1/quantbt/runs/{run_id}/current-source/search` → `candidates.rows[].max_drawdown` as `{state:"AVAILABLE", value:"-0.0047", source:"CANDIDATE_REPLAY_FOLD_ROWS"}` for all 39 replayed candidates; and `selection.roles.raw_best_is.max_drawdown` (same shape).
- UI reason: B3 compares best-IS trial with the selected one; `max_dd` for the best trial reads "not published" while the selected shows −0.47% (source RETAINED_STITCHED_OOS_PATH).
- Current impact: one cell per run in B3 and one column in candidate replays missing; the "selector did not take the IS best" comparison is one-sided.
- Smallest proposal: if the child audit retains per-candidate fold OOS equity/drawdown, compute `max(per-fold max_drawdown)` (state it in `source`); if it does not retain it, keep NOT_PUBLISHED and say so in the code (then class becomes LEGIT).
- UI today: prints "not published" with tooltip `QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN`.

**R-S06-2 — trial parameter values for every drawn point (N14)**
- Endpoint/field needed: `current-source/search` → `surface.points[].parameters: {rvol:"2.4", rsi_l:"15", …}` (strings, already rounded to declared step precision, see R-S06-3); keep `positions`.
- UI reason: A2/A3 tooltips and aria-labels need values for all 400 points; only the first 100 ledger rows carry `parameters`, so 300 points (incl. θ* #350 and best IS #311) read "window not published · rvol not published".
- Current impact: wrong "not published" text on 75% of points; screen-reader users cannot hear the parameters.
- Smallest proposal: add the field to `surface.points` (400 x 8 short strings ≈ +25 KB). FE-side alternative that needs no backend: page the ledger with `ledger.page.next_cursor` (`has_more=true`) — the UI does not do this today (FE-GAP, to be fixed first).
- UI today: shows "not published" for trials 100-399.

**R-S06-3 — float noise in parameter strings**
- Endpoint/field needed: `current-source/search` → `ledger.trials[].parameters.*`, `candidates.rows[].parameters.*`, `declared_space`-aligned: `"2.4000000000000004" → "2.4"`, `"0.8999999999999999" → "0.9"`.
- UI reason: ledger NOTE shows 30 such strings on R-WFO-023.
- Current impact: ugly and non-comparable (`1.9000000000000001` vs `1.9`); also leaks into aria-labels (`rvol 2.4000000000`).
- Smallest proposal: serialize with `round(value, decimals(step))` where `declared_space.parameters[].step` is the grid step; keep `params_digest` computed on the original value (do not change digests).
- UI today: prints the raw string (SearchDetail.tsx:884).

**R-S06-4 — levels for fixed profile (N18)**
- Endpoint/field needed: `GET /api/v1/quantbt/runs/{run_id}/search?fold=1` → `fixed_profile.parameters[].levels: "31"` (number of grid values `floor((high-low)/step)+1`; null for non-numeric).
- UI reason: A1 LEVELS column reads "levels not published" for all 8 parameters of every P04 run.
- Current impact: 8 cells + 1 footer line per P04 run show an absence for a derivable number.
- Smallest proposal: add `levels` next to `step`; the portal already knows low/high/step.
- UI today: "levels not published" (LEVELS_REASON).

**R-S07-1 — real freeze/OOS clocks and honest "frozen at" (N28, N43)**
- Endpoint/field needed: `GET /api/v1/quantbt/runs/{run_id}/current-source/freeze` → `fold_ordering.wall_clock: {state:"AVAILABLE", source:"P11_STAGE_EVENTS", search_completed_utc_ms, pool_frozen_utc_ms|null, first_oos_read_utc_ms|null, s4_completed_utc_ms}`; and `current-source/search` → `pool.frozen_at_utc_ms` renamed/split so that `frozen_at_source=P11_STAGE_COMPLETED_S4_EVENT` is exposed as `s4_completed_utc_ms`.
- UI reason: S07 WALL CLOCK says "not published"; HiFi F1 shows three timestamps; S06 B1 prints "frozen at 2026-10-01 13:44 UTC" which is the S4 completion event (after OOS), next to "pool closes before OOS".
- Current impact: the one timing claim the screen makes is mislabelled; the ordering proof (data-time vs wall-clock) cannot be drawn.
- Smallest proposal: expose the P11 stage-event times the portal already stores (search completed, S4 started/completed) with `source` names; if the engine's real freeze time stays unknown leave `pool_frozen_utc_ms:null` + reason, and let the UI relabel the existing value as "stage 4 completed".
- UI today: "frozen at <S4 time>" with the source only in a tooltip; wall clock "not published".

**R-S07-2 — code-fixed values (N29)**
- Endpoint/field needed: `current-source/freeze` → `parameter_authority.code_fixed: {state:"AVAILABLE", values:[{name:"issl", value:"true", digest_scope:"BUNDLE_ONLY"}]}`.
- UI reason: F4 footer "Code-fixed values not published · code digest 34dc1847… · adapter contract 9ade757b…"; HiFi note says fixed params stay outside the params digest but inside the bundle digest.
- Current impact: a reader cannot see what the bundle digest covers beyond the 8 declared parameters.
- Smallest proposal: list name/value pairs from the adapter contract (`delta_rsi` kernel constants), mark the digest scope.
- UI today: italic "not published" with `P04_DELTA_KERNEL_PUBLISHES_NO_CODE_FIXED_VALUE_LIST`.

**R-S07-3 — old-seal child-audit companion (N32-N34) + labels for the binding rows (D3)**
- Endpoint/field needed: `current-source/freeze` → `stage4_binding.rows[1..2]` and `fold_ordering.folds[].oos_generation_child` for R-WFO-020 (and any seal made before the child audit recorded OOS generation): `state:"MATCH", value:"2944fed1ec99…", audit_ordinal:n` plus `rows[2]` sealed/runtime bundle digest.
- UI reason: F4 reads "not compared" with `fold_01 —` x9 and F3 "bundle digest not published"; fold rows read "no OOS generation child".
- Current impact: the one binding check that proves Execute runs the frozen θ* is absent on R-WFO-020.
- Smallest proposal: companion backfill job reading the retained child audit (RS02_RETAINED_CHILD_AUDIT lane) for the old seal; if the audit truly lacks the record, keep the code and add `reason_words`. Also send `rows[].label` = "frozen candidate id (engine)" for `identity_rule QUANTBT_WALKFORWARD_STRATEGY_CANDIDATE_ID_V1` so the UI stops calling it "params digest" (D3).
- UI today: pills "not compared"/"not published" and the raw code in brackets.

---------------------------------------------------------------------------

---

## Nhóm S08

Rows: screen · element · run(s) · state shown · reason code (verbatim) · class · what the user needs · backend request.

| id | screen · element | run(s) | state | reason code | class | user needs | request |
|---|---|---|---|---|---|---|---|
| I-01 | S08 chip `orders` and tile `ORDERS` | R-WFO-017/020/023 | not published | `QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS` | LEGIT (close_target_v2 emits target transitions, no order objects) | to know no order existed | none; fix wording FE-side (T-01) |
| I-02 | chip `fills` | same | not published | `QUANTBT_ROUTE_EMITTED_NO_FILL_RECORDS` | BACKEND-GAP (derivable) | the fill at each transition (bar, close, qty, fee) | **R-A** below |
| I-03 | chip `trades`, panel TRADE BLOTTER, header count `0 trades` | same | not published | `QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS` | BACKEND-GAP (derivable) | round trips (entry/exit pair, pnl, bars held) | **R-B** |
| I-04 | panel MAE x MFE | same | not published | `QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS` | BACKEND-GAP (derivable from I-03 + served bars) | adverse/favourable excursion per trade | **R-B** |
| I-05 | ledger header `EVENTS` | same | not published | `QUANTBT_CLOSE_TARGET_ROUTE_PUBLISHES_TRANSITIONS_NOT_AN_EVENT_TAPE` | LEGIT (route has transitions, not an event tape) | nothing; the transitions table is the substitute | none |
| I-06 | chip `partial` | same | not applicable | `QUANTBT_EXECUTION_ALLOW_PARTIAL_FILL_FALSE` | LEGIT (config) | none | none |
| I-07 | chip `SL/TP` | same | not applicable | `QUANTBT_INTRABAR_EXIT_MODEL_NONE` | LEGIT | none | none |
| I-08 | chip `OCO` | same | not applicable | `QUANTBT_CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS` | LEGIT | none | none |
| I-09 | chip `multi-leg` | same | not applicable | `QUANTBT_SINGLE_SYMBOL_NETTING_ACCOUNT_HAS_NO_LEGS` | LEGIT | none | none |
| I-10 | panel COST TIMELINE `FUNDING` | same | not applicable | `QUANTBT_RUN_CONFIG_USE_FUNDING_FALSE` | LEGIT | none | none |
| I-11 | HOLDOUT window, overview legend `HOLDOUT not applicable` | same | not applicable | `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT` | LEGIT (profile has no holdout) | a sentence not a code | FE wording (UX-08) |
| I-12 | `child:` row in TRADE ANATOMY | R-WFO-020 (also with child-audit 409) | `reading this fold's child audit...` forever | (none, no code shown) | FE-GAP (bug; child-audit served) | resolved link or `not in loaded records` | none; `ExecuteCandleReplay.tsx:1567` |
| I-13 | COST TIMELINE `this window: N charged bars · fee not published` | all WFO runs | not published | (none: FE literal) | FE-GAP: `current-source/replay` -> `replay.rows[i].fee` (decimal string, e.g. `"fee": "0"`) is served per bar | window fee sum | none; sum the loaded rows. Optional smaller change: add `window_fee` to the replay page envelope if client sums are disallowed |
| I-14 | CHILD AUDIT table | all WFO | 64 of 466 (R-WFO-023 fold_01) records, `truncated: true`, rows sampled every 9th audit ordinal | (none) | BACKEND-GAP (no cursor) | the rest of the records, or filters (context, OOS only) | **R-C** |
| I-15 | child audit footer `run total 2,000 · dropped by QuantBT 2,212` | R-WFO-020 | dropped > total | (none) | BACKEND-GAP (counts need definition) | consistent counts | **R-D** |
| I-16 | position and equity pane value axes (one tick) | all WFO | partial axis | (none) | FE-GAP (min/max served in rows) | scale for position and equity | none |
| I-17 | per-fold score (`is_sharpe`, `oos_sharpe`, `oos_trades`) on fold chips | all WFO | not shown | (none) | FE-GAP: `current-source/split` -> `fold_plan.folds[i].score.{is_sharpe,oos_sharpe,decay,oos_trades}` is served (AVAILABLE) | OOS quality next to each fold chip | none |
| I-18 | P04 lane: price overview `PRICE OVERVIEW not published` | R-P04-021, R-P04-018 | not published | `P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET` | BACKEND-GAP | price context behind equity | **R-E** |
| I-19 | P04 lane: `CANDLE WINDOWS`, orders, fills, trades, execution events, positions, MAE/MFE, trade PnL distribution, funding, SL/TP ambiguity, OCO tree, multi-leg, child audit provenance (all `not published`), fold capital in contract | R-P04-021/018 | not published | `P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS`, `..._EXECUTION_ORDER_LEDGER`, `..._AUDITED_FILLS`, `..._POSITION_STATE_SNAPSHOTS`, `..._EXECUTION_EVENT_STREAM`, `..._EXECUTION_TRADE_LEDGER`, `..._MAE_MFE_INPUTS`, `..._FUNDING`, `..._INTRABAR_SL_TP_AMBIGUITY`, `..._OCO_PARENT_CHILD_RELATIONSHIPS`, `..._MULTI_LEG_EXECUTION_FACTS`, `..._CHILD_AUDIT_REPLAY_PROVENANCE`, `..._FOLD_CAPITAL_CONVENTION` (all prefixed `P04_SOURCE_DID_NOT_PUBLISH`) | BACKEND-GAP (P04 retained lane missing) | the same Execute screen the WFO runs get | **R-E** |
| I-20 | P04: `current-source/replay`, `/split`, `/evidence` | R-P04-021 | `NOT_APPLICABLE` | `RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION` (verified by fetch) | BACKEND-GAP (root cause of I-18/I-19) | retained lane for fixed profile | **R-E** |
| I-21 | P04: contract chip `FOLD CAPITAL not published` | R-P04-021/018 | not published | `P04_SOURCE_DID_NOT_PUBLISH_FOLD_CAPITAL_CONVENTION` | LEGIT (fixed profile has no folds) | hide the chip | FE hides it |
| I-22 | legacy `execute/replay?limit=100` for WFO runs | R-WFO-023 | NOT_PUBLISHED | `P13_SOURCE_EVIDENCE_NOT_PUBLISHED` | LEGIT (not used; wasted call) | none | FE stops calling it for WFO runs |
| I-23 | OLD-SEAL check | R-WFO-017/020 vs 023 | the Execute screen rendered identical facts on old and new seals (same chips, same panels, same retained lane) | n/a | no OLD-SEAL gap found on S08 | none | none |

Requests (standard form).

**R-A · derived fills.** Endpoint/field: `GET /api/v1/quantbt/runs/{id}/current-source/replay/transitions` add per row `fill: {state:"DERIVED", price: "59063.3", quantity_delta: "0.03386197520287556", side: "BUY", fee: "1.00", at_utc_ms, basis:"same_close_target_transition"}` (fields already in the row: close, position before/after, fee). UI reason: chip `fills` and TRADE ANATOMY `fill` row say `not_applicable`; users cannot see fill price/qty. Current impact: every WFO Execute view shows 0 fills. Smallest proposal: derive from the transition (state `DERIVED`, never `PUBLISHED`), reason code `QUANTBT_DERIVED_FROM_CLOSE_TARGET_TRANSITION`. UI today: prints `not_applicable - settles at the close · 0 fill records`.

**R-B · derived trades + MAE/MFE.** Endpoint/field: new `GET .../current-source/replay/trades?fold=` returning `[{trade_ordinal, side, entry_at_utc_ms, entry_price, exit_at_utc_ms, exit_price, quantity, gross_pnl, fees, bars_held, mae, mfe, entry_transition_number, exit_transition_number, fold_id}]`, state `DERIVED`, MAE/MFE from the served bar highs/lows between entry and exit. UI reason: TRADE BLOTTER and MAE x MFE panels are empty. Current impact: R-WFO-023 has 32 transitions = about 16 round trips, none listed. Smallest proposal: pair consecutive entry/exit transitions (flip = exit + entry). UI today: `TRADES · 0 not published ...`.

**R-C · child-audit paging.** Endpoint/field: `GET .../replay/child-audit?fold=0` add `page: {limit, next_cursor, has_more}` and query `context=`, `limit=` (<= 500); today `truncated:true`, `source_record_count: 466`, 64 returned. UI reason: footer `capped at 64`. Impact: 402 of 466 records unreachable; the anatomy `child` link can fall outside the 64 (I-12). Proposal: cursor paging plus a `by_audit_ordinal=` lookup used by the anatomy row. UI today: shows 64 sampled rows.

**R-D · child-audit counts.** Endpoint/field: same response, define `records_dropped_by_source` vs `source_record_count` and add `run_record_count`; R-WFO-020 shows `run total 2,000 · dropped 2,212`. Impact: user sees dropped > total. Proposal: return `{run_total, retained, dropped}` with the invariant `retained + dropped = run_total`. UI today: prints them as given.

**R-E · retained lane for P04 fixed qualification.** Endpoint/field: `GET .../current-source/replay|split|evidence` currently `NOT_APPLICABLE / RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION` (`lane.retainable_profile_id: rs02.delta-wfo-global.v1`). UI reason: P04 hub lane falls to equity samples only (25 samples, no candles, no transitions, 13 `not published` facts, price overview `P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET`). Impact: R-P04-021/018 and every fixed-profile run have a different, poorer Execute screen. Smallest proposal: companion backfill that re-runs the fixed profile through the `close_target_v2` retained exporter (new `retainable_profile_id`, e.g. `rs02.delta-fixed-qualification.v1`) so the same `current-source/*` endpoints answer; start with a bounded price overview (<= 400 buckets) for the byte-budget case. UI today: renders the equity-sample lane and a reason per fact.

---

## Nhóm S09_S13

Reason code verbatim. Class: LEGIT / OLD-SEAL / BACKEND-GAP / FE-GAP / HIFI-ONLY.

| # | screen | element | run(s) | state shown | reason code | class | what the user needs | backend request |
|---|---|---|---|---|---|---|---|---|
| 1 | S09 | header Certification box | all | "not published" | `P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE` | LEGIT | none until a certification source exists | - |
| 2 | S09 | Passport HOLDOUT_STATE | w17 w20 w23 w09 w10 | "not applicable" | `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT` | LEGIT | WFO profile has no holdout segment | - |
| 3 | S09 | Passport: VALIDATION_CLAIM, CHRONOLOGICAL_CLAIM, OOS_USED_FOR_SELECTION, SCORING_BACKEND, MODE x SCHEDULE | w09, w10 | "not published" | `RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1`, `QUANTBT_SCORING_BACKEND_NOT_PUBLISHED`, `QUANTBT_SEARCH_CONTRACT_NOT_PUBLISHED` | OLD-SEAL | claim facts on old runs | B-6 |
| 4 | S09 | Identity: Protocol, Runtime, Optimization | w09, w10 | "not published" | `QUANTBT_VALIDATION_CLAIM_NOT_PUBLISHED`, `RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1` | OLD-SEAL | run settings | B-6 |
| 5 | S09 | Headline FUNDING | all | "not published" | `RS02_SUMMARY_PUBLISHES_NO_FUNDING_TOTAL`, `P04_SOURCE_DID_NOT_PUBLISH_FUNDING` | LEGIT | engine returns no funding total; Execute does not model funding | - |
| 6 | S09 | Headline WIN RATE | w17, w20 | "not published" | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS` | LEGIT (audited), OLD-SEAL (episode win rate) | new seals show "episode win rate not audited" (62.50% on w23); old seals could | B-6 |
| 7 | S09 | Headline tiles OOS SHARPE (all-time), episode win rate; metrics rows Sortino ... turnover (22 v2 rows) | w17, w20 | tiles show fold-mean Sharpe; metrics table has 7 rows, no v2 rows | (no reason shown; rows absent) | OLD-SEAL | the analytics v2 rows that w23 has | B-6 |
| 8 | S09 | Headline OOS SHARPE, DECAY MEAN, WIN RATE | p18 | "not published" | `P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE`, `P04_SOURCE_DID_NOT_PUBLISH_DECAY_MEAN`, `P04_SOURCE_DID_NOT_PUBLISH_WIN_RATE` | OLD-SEAL | p21 (new seal) publishes 0.744, -1.082, 44.44% | B-6 |
| 9 | S09 | Metrics: Mean OOS Sharpe, Mean decay, OOS trades | w09, w10 | "not published" | `QUANTBT_SELECTED_CANDIDATE_OOS_SHARPE_NOT_PUBLISHED`, `QUANTBT_SELECTED_CANDIDATE_DECAY_NOT_PUBLISHED`, `QUANTBT_FOLD_OOS_TRADES_NOT_PUBLISHED` | OLD-SEAL | per-run numbers | B-6 |
| 10 | S09 | Metrics: "IS minus OOS Sharpe" | w23, w17? (w23 shown) | "not applicable" | `PORTAL_ANALYTICS_IS_OR_OOS_SHARPE_UNAVAILABLE` | LEGIT | no all-time IS account; row duplicates "Mean decay 1.741" | hide the row (FE) |
| 11 | S09 | Metrics: "Benchmark return" | p21 | value cell reads "available AVAILABLE", unit fraction, scope/origin "not published" | state AVAILABLE with `value: null` (no reason) | BACKEND-GAP | a value or an explicit absence; same sheet has v2 "OOS benchmark return +7.36%" | B-3 |
| 12 | S09 | Equity: "IS account" legend, IS segment | p21, p18 | "IS account - P04_SOURCE_DID_NOT_PUBLISH_IS_EQUITY_SERIES" | `P04_SOURCE_DID_NOT_PUBLISH_IS_EQUITY_SERIES` | BACKEND-GAP | the IS-window account path of a P04 run (the run executes warmup + IS + OOS) | B-7 |
| 13 | S09 | Equity subtitle "emitted N of source observations not published" | w20, w23 | broken sentence | `equity.source_observation_count = null` (IS and OOS) while `enriched_analysis.curves.sampling.source_observation_count = 1488` (w23) | FE-GAP (OOS part), BACKEND-GAP (IS part) | "598 of 1488 points" | FE: read `enriched_analysis.curves.sampling`; B-8 for the IS count |
| 14 | S09 | Equity: "fold boundaries" | p21 | "not applicable" | `P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS` | LEGIT | single window | - |
| 15 | S09 | Equity: "fold boundaries" | p18 | "not published" | `P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS` | OLD-SEAL | p21 says "not applicable" for the same fact | B-6 |
| 16 | S09 | Per-fold verdict table, "verdict rule not published" | p21 | NOT_APPLICABLE, empty table | `P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS` | LEGIT | - | FE: do not draw an empty table (UX) |
| 17 | S09 | Per-fold verdict | p18, w09, w10 | NOT_PUBLISHED, empty table | `P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS`, `RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1` | OLD-SEAL | fold rows | B-6 |
| 18 | S09 | Certification chain S1, S2, S4, S5 chips | p21, p18 | "not published" | `P04_SOURCE_PUBLISHES_NO_STAGE_CHECK` | LEGIT | P04 source publishes no stage checks | - |
| 19 | S09 | "certification cap" | all | "not published" | (no code) | LEGIT | none | - |
| 20 | S09 | Artifacts: run_spec | all | "not published" | `P18_REQUESTED_SPEC_BYTES_NOT_PUBLISHED` | FE-GAP | Provenance already lists `requested spec digest` (c990a312... on w23, c35406dc... on p21) and `effective spec digest`; show them in this row | FE: `provenance.requested_spec_digest` |
| 21 | S09 | Artifacts: bundle | p21, p18 | "not published" | `P18_MANIFEST_BYTES_NOT_PUBLISHED` | FE-GAP | Provenance lists `manifest digest e202497b...` on p21 | FE: `provenance.manifest_digest` |
| 22 | S09 | Artifacts: search_trace, observations | w20, w23 | "sealed - ..." no digest | `P18_MULTI_PART_TABLE_HAS_NO_SINGLE_PART_DIGEST` | LEGIT | multi-part tables | FE text only |
| 23 | S09 | Artifacts: fill_ledger | w*, p* | "not published" | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS`, `P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS` | LEGIT | engine has no audited fills | - |
| 24 | S09 | Artifacts: metrics_summary, claim | w17 w20 w23 | "not published" | `P05_ARTIFACT_DOCUMENT_DIGEST_IS_NOT_RETAINED` | OLD-SEAL | document digests for the two files | B-6 |
| 25 | S09 | Artifacts: selection_trace, fold_plan, metrics_summary, claim | p21, p18 | "not published" | `P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE`, `P04_SOURCE_DID_NOT_PUBLISH_FOLD_PLAN`, `P13_EVIDENCE_PROJECTION_IS_NOT_ARTIFACT_FILE`, `P13_CLAIM_IS_NOT_AN_ARTIFACT_DIGEST` | LEGIT | fixed profile has none | - |
| 26 | S09 | Artifacts download line | all | "download - not available" | `P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES` | LEGIT | private bytes policy | - |
| 27 | S09 | Exports: Parquet | all | button disabled, "not available" | `P18_CONTROL_API_HAS_NO_PINNED_PARQUET_WRITER` | BACKEND-GAP | a Parquet export | B-9 |
| 28 | S09 | Exports: Archive | all | button disabled, "not available" | `P18_ARCHIVE_WOULD_EXPOSE_PRIVATE_P05_BYTES_AND_RAW_MARKET_ROWS` | LEGIT | policy | hide button |
| 29 | S09 | Approval annotation panel | all | "not published" | `P18_APPROVAL_ANNOTATION_NOT_PUBLISHED` | LEGIT | S11 owns approval | - |
| 30 | S09 | Promotion state | all | "promotion - not published" | `RS02_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL`, `P04_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL` | LEGIT | promotion is not in the source | - |
| 31 | S09 | Source absences: benchmark | w23 | "not published" | `RS02_SOURCE_FACT_NOT_PUBLISHED` | BACKEND-GAP (label) | the sheet draws a portal benchmark; the absence line must say "source benchmark" | B-3 |
| 32 | S09 | Source absences: benchmark | w17 / w20 | "not published" | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES` / `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL` | LEGIT / OLD-SEAL | w20: v2 analytics were never computed for the seal | B-6 |
| 33 | S09 | Source absences: benchmark, all-time chart "benchmark not published" | p21, p18 | "not published" | `P18_SOURCE_FACT_NOT_PUBLISHED`, `P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK`; `enriched_analysis.curves.benchmark_rebased_100 = []` while `OOS_BETA 0.012`, `OOS_CORRELATION 0.262`, `OOS_BENCHMARK_RETURN +7.36%` are published | BACKEND-GAP | one answer: either a benchmark exists (publish the curve) or the three metrics must not exist | B-3 |
| 34 | S09 | Source absences: route ledger | w* | "not published" | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_ROUTE_LEDGER` | LEGIT | engine | - |
| 35 | S09 | Source absences: rolling sharpe | w23, w20 / w17 | "not published" | `P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW` / `RS02_RETAINED_LANE_HAS_NO_DAILY_RETURN_SERIES` | LEGIT / OLD-SEAL | w17 has an all-time analytics block, so daily returns exist | B-6 |
| 36 | S09 | Source absences: in sample account | w* | "not published" | `QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT` | LEGIT | retained lane has no IS account (WFO) | - |
| 37 | S09 | Source absences: per fold rows / metrics, replay execution state | p21, p18 | "not applicable" / "not published" | `P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS`, `P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_METRICS`, `P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS` | LEGIT / OLD-SEAL | - | B-6 for p18 |
| 38 | S09 | Identity: Runtime | p21, p18 | "not published" | `P04_SOURCE_DID_NOT_PUBLISH_RUNTIME_AUTHORITY` | BACKEND-GAP | which runtime executed the P04 run | B-10 |
| 39 | S09 | Identity: Selected parameters | p21, p18 | "not applicable" | `P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE` | BACKEND-GAP | a fixed-profile run still ran with parameters; the reader must see them | B-10 |
| 40 | S09 | Identity: Seed | p21, p20f | "not applicable" / "not published" | `P02_RANDOM_SEED_NOT_SELECTED` | LEGIT | no seed used | - |
| 41 | S09 | All-time: monthly returns for 1 month, benchmark line | p21, p18 | one hatched bar; "benchmark not published" | see 33 | BACKEND-GAP | see 33 | B-3 |
| 42 | S09 | All-time: return distribution (histogram) | w23, w20, w17, p21 | frame absent | none: `enriched_analysis.return_distribution.state = AVAILABLE`, `buckets[12]` (w23); p21 `buckets: []` | FE-GAP | a histogram of daily returns | FE: read `enriched_analysis.return_distribution.buckets[].{lower_inclusive,upper,count}` |
| 43 | S09 | Warnings block | w09 | "The report carries no warning definitions." | (text) | OLD-SEAL | the two OOS warnings | B-6 |
| 44 | S09 | Failed sheet: equity | w21f, p20f | "series unavailable - numbers unaffected" | `P18_FAILED_RUN_HAS_NO_EQUITY_TO_REPORT` | LEGIT | failed run | - |
| 45 | S09 | Failed sheet: artifacts "the run wrote no artifact", S5 "not applicable" | w21f, p20f | - | `P18_RUN_ENDED_BEFORE_THIS_STAGE` | LEGIT | - | - |
| 46 | S09 | Failed sheet cause | w21f | "ENGINE_ERROR - The current-source summary exceeds the sealed local read-model budget." | (terminal reason) | BACKEND-GAP | the run could not be sealed because of a size budget | B-5 |
| 47 | S09 | Report of a cancelled run | w18c | "No sealed report is available for this run." | HTTP 404 | LEGIT | none was sealed | FE: avoid a console 404 |
| 48 | S13 | Ladder card OOS Sharpe | R-P04-006, R-P04-021 | "OOS sharpe - not published" | `P20_P13_OOS_SHARPE_NOT_AVAILABLE` | BACKEND-GAP | R-P04-021 report shows all-time Sharpe 0.744; R-P04-013..019 cards show 0.744 | B-4 |
| 49 | S13 | Ladder card certification | 19 attempts | "cert not published" | `P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE` | LEGIT | none | - |
| 50 | S13 | Header: claim family | alpha-level (25 attempts) | "claim family not published" | `P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED` | LEGIT for FAILED/CANCELLED; OLD-SEAL for READY R-WFO-009, R-WFO-010 | claim family of the two READY off-ladder runs | B-6 |
| 51 | S13 | Header: full-resolution returns | attempts, markets | "not applicable" | `P20_FULL_RESOLUTION_RETURNS_APPLY_TO_PAIR_MODE_ONLY` | LEGIT | none | FE: hide outside pair mode |
| 52 | S13 | Fold chart + disclosure: 9 P04 attempts | R-P04-006, 013..019, 021 | "no per-fold rows" | `P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE` | LEGIT | single window; use the single-window Sharpe | - |
| 53 | S13 | Fold chart disclosure: 23 attempts | FAILED/CANCELLED + R-P04-001..012 | "no per-fold rows" | `P20_RUN_HAS_NO_RETAINED_FOLD_FACTS` | LEGIT | no sealed result | - |
| 54 | S13 | Markets card OOS Sharpe | R-P04-021 | "OOS sharpe - not published" | `P20_P13_OOS_SHARPE_NOT_AVAILABLE` | BACKEND-GAP | same as 48 | B-4 |
| 55 | S13 | Pair: OOS Sharpe row, mean of folds, delta | w17 x w20, w17 x w23 | "Delta - not published, none for this scope" | (text) | LEGIT | mean-of-folds is not comparable across fold counts; common-window row follows | - |
| 56 | S13 | Pair: win rate A/B/Delta | w17 x w20, w17 x w23, p18 x p21 | "not applicable" | `P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS_FOR_WIN_RATE` | BACKEND-GAP | new seals have an episode win rate (62.50%, not audited); show it labelled "episode win rate" | B-11 |
| 57 | S13 | Pair: trades delta | all pairs | "not applicable" | `P20_COMMON_WINDOW_DOES_NOT_DEFINE_TRADE_COUNT` | LEGIT | - | - |
| 58 | S13 | Pair p18 x p21: overlay, net return, max drawdown, correlation, common window | R-P04-018 x R-P04-021 | "not published" | `P20_CURRENT_SOURCE_SEAL_DOES_NOT_MATCH_P14_AND_RUN_BINDINGS` | OLD-SEAL | overlay of two P04 runs, which both have a 25-point OOS equity path | B-12 |
| 59 | S13 | Pair p18 x p21: OOS Sharpe B and delta | R-P04-021 | "B - not published", "Delta - not published" | `P20_P13_OOS_SHARPE_NOT_AVAILABLE`, `PORTAL_ANALYTICS_COMMON_WINDOW_NOT_AVAILABLE` | BACKEND-GAP | see 48 | B-4 |
| 60 | S13 | Pair w20 x w23 (all panels) | R-WFO-020 x R-WFO-023 | UNAVAILABLE, 5 empty frames | HTTP 503 `RESEARCH_COMPARE_UNAVAILABLE` | BACKEND-GAP | the pair itself | B-2 |
| 61 | S13 | Pair w23 x p21 | R-WFO-023 x R-P04-021 | REFUSED | `P20_CONTRACT_KEY_MISMATCH` | LEGIT | different protocol (advanced vs three_window_decay) | - |
| 62 | S13 | Pair, no runs chosen | - | EMPTY, 5 empty frames | (idle) | LEGIT | pick two runs | S13-1 |
| 63 | S13 | "Intentional specification differences" | w17 x w20 / w17 x w23 | "no intentional specification difference published" | (none) | LEGIT | - | - |

Row count: 63 rows. By primary class: LEGIT 33, OLD-SEAL 12, BACKEND-GAP 14, FE-GAP 4, HIFI-ONLY 0 (not compared against the `.dc.html` files in this batch). Rows with a mixed reason (6, 13, 32, 35, 50) are counted under the class that needs action first.

### Backend requests (standard form)

**B-1 Reconcile two net returns on P04 sheets**
- Endpoint/field: `GET /api/v1/quantbt/runs/:id/report` -> `frozen_core.metrics[]` keys `NET_RETURN_FRACTION` (label "OOS net return", -0.001540447, source derived from equity 20,055.23 -> 20,024.34) and `NET_OOS_RETURN_FRACTION` (label "Net OOS return", +0.0012168, engine direct), plus `frozen_core.headline[key=NET_RETURN].value = 0.0012168`.
- UI reason: p21 shows +0.12% in the headline and -0.15% in the metrics table and all-time block (same scope "oos").
- Current impact: reader cannot tell which return is true; Compare uses a third figure.
- Smallest proposal: publish a single `NET_OOS_RETURN_FRACTION` per seal with a scope note; if both are real (engine `total_return_pct` over a different base than the sampled equity path), give them different keys and scopes (`OOS_ENGINE_TOTAL_RETURN` vs `OOS_EQUITY_PATH_RETURN`) and state the base in `definition_id`.
- UI today: prints both rows as published.

**B-2 Pair compare 503 for the two newest 400-trial runs**
- Endpoint: `GET /api/v1/research/alphas/delta-rsi-polynomial-alpha/compare?mode=pair&runs=rrun_3258a4c450816129d2d285f25b801061,rrun_3d5633d2adb712722fe4ba108102aa5d` (either order) -> 503 `RESEARCH_COMPARE_UNAVAILABLE`, about 1.6 s, request ids 459b8d0b..., 7c680188..., 0452678577...
- UI reason: pair overlay, deltas, correlation all unavailable. Pairs with R-WFO-017 work (0.9 s).
- Current impact: the natural comparison of the two 9-fold runs is impossible.
- Smallest proposal: find the exception for runs with 400 trials / `PORTAL_ANALYTICS_V2` seals (probably common-window or full-resolution return alignment of 1488 vs 1488 points) and return a typed `PARTIAL` with the failing section named instead of a blanket 503.
- UI today: shows UNAVAILABLE + `read again`, and sends the request twice.

**B-3 Benchmark: one truth per run**
- Endpoint/field: report `frozen_core.source_absences.benchmark` (w23 `RS02_SOURCE_FACT_NOT_PUBLISHED`), `enriched_analysis.curves.benchmark_rebased_100` (w23: 32 points; p21: `[]`), metrics `BENCHMARK_RETURN_FRACTION` (p21: `value: null`, `availability.state: AVAILABLE`), v2 rows `OOS_BETA`, `OOS_CORRELATION`, `OOS_BENCHMARK_RETURN`.
- UI reason: the sheet says "benchmark not published" and also shows beta/correlation/benchmark return and a dashed line.
- Smallest proposal: (a) name the portal benchmark: `enriched_analysis.scope.benchmark = {kind: "PORTAL_CANDLE_CLOSE_BUY_AND_HOLD", state}`; (b) for p21 either publish `benchmark_rebased_100` or drop the three dependent metrics; (c) never emit `AVAILABLE` with `value: null`.
- UI today: prints "available AVAILABLE" in the value cell (UX-18).

**B-4 OOS Sharpe on Compare for P04 seals**
- Endpoint/field: `.../compare?mode=attempts|markets|pair` -> `attempts[].original_metrics[key=OOS_SHARPE]` for R-P04-006 and R-P04-021 (`P20_P13_OOS_SHARPE_NOT_AVAILABLE`), pair B side (R-P04-021).
- UI reason: ladder/market cards and pair row say "not published" while R-P04-021's report publishes all-time OOS Sharpe 0.744 (`metrics[key=ALL_TIME_OOS_SHARPE]`, origin ENGINE_DIRECT).
- Smallest proposal: fill `OOS_SHARPE` from the same portal-analytics value (scope `OOS_ALL_TIME`), keyed distinct from the fold-mean scope; the P04-013..019 attempts already show 0.744.
- UI today: renders the absence verbatim.

**B-5 R-WFO-021 failed on a read-model budget**
- Endpoint: `rrun_53793d9336d9e42d62da1979eb317d94`, report `source profile P11_TERMINAL_FAILURE`, `ENGINE_ERROR: The current-source summary exceeds the sealed local read-model budget.`
- UI reason: a 400-trial run produced results but could not be sealed; the failure is a portal limit, not the strategy.
- Smallest proposal: raise or stream the summary budget, or seal with the sampled summary and a `PARTIAL` flag; give the failure a code (`PORTAL_READ_MODEL_BUDGET_EXCEEDED`) so the sheet can say "portal limit - retry after upgrade".
- UI today: prints the raw engine message.

**B-6 Companion backfill for old seals (OLD-SEAL)**
- Scope: R-WFO-009, R-WFO-010 (seal predates W3 facts), R-WFO-017, R-WFO-020 (no v2 analytics rows; benchmark `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL`), R-P04-018 (headline Sharpe/decay/win rate, per-fold absence code differs from p21), and `metrics_summary`/`claim` document digests (`P05_ARTIFACT_DOCUMENT_DIGEST_IS_NOT_RETAINED`).
- Endpoint: `GET /api/v1/quantbt/runs/:id/report` -> `frozen_core.passport[]`, `identity[]` (Protocol, Runtime, Optimization), `metrics[]` (v2 rows), `headline[]`, `source_absences.rolling_sharpe`, `warnings[]`.
- Smallest proposal: write an immutable companion record per old seal with the missing facts (validation_claim, chronological_claim, oos_used_for_selection, scoring backend, search contract, v2 metrics, warnings) and let `/report` merge it with `origin: "COMPANION_BACKFILL"`.
- UI today: shows each fact as "not published" with the seal-predates code.

**B-7 IS equity for P04 fixed-profile runs**
- Endpoint/field: report `frozen_core.equity_is.points` (empty) for R-P04-021/018, reason `P04_SOURCE_DID_NOT_PUBLISH_IS_EQUITY_SERIES`.
- UI reason: chart legend says "IS account - P04_SOURCE_DID_NOT_PUBLISH_IS_EQUITY_SERIES"; the run executes warmup + IS + OOS.
- Smallest proposal: publish a sampled IS account path (<= 600 points) from the child tape with `sampling` metadata.
- UI today: only the OOS segment is drawn.

**B-8 Source observation count for the IS segment**
- Endpoint/field: `frozen_core.equity_is.source_observation_count` is null on w20/w23 (and `equity.source_observation_count` null although `enriched_analysis.curves.sampling.source_observation_count = 1488`).
- Smallest proposal: fill both fields (IS 261 of N, OOS 598 of 1488).
- UI today: prints "emitted 261 of source observations not published".

**B-9 Parquet export**
- Endpoint: `report.exports.unavailable_formats[parquet]` (`P18_CONTROL_API_HAS_NO_PINNED_PARQUET_WRITER`).
- Smallest proposal: pin a Parquet writer for the report tables (metrics, folds, equity), or drop `parquet` from `exports.formats`/`unavailable_formats`.
- UI today: a disabled button with a tooltip.

**B-10 Parameters and runtime for P04 fixed-profile runs**
- Endpoint/field: report `frozen_core.identity[key=selected_parameters]` ("not applicable", `P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE`) and `identity[key=runtime]` (`P04_SOURCE_DID_NOT_PUBLISH_RUNTIME_AUTHORITY`).
- UI reason: reader of a fixed-profile run sees no parameters at all, though the run used a fixed set; "Optimization mode_1_decay x global - declared, not executed" is shown instead.
- Smallest proposal: publish `selected_parameters` from the fixed profile (`origin: FIXED_PROFILE`) and the runtime string used for the child tape.
- UI today: prints "not applicable".

**B-11 Win rate in Compare pair**
- Endpoint/field: `.../compare?mode=pair` -> `result.deltas[key=WIN_RATE]` (`P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS_FOR_WIN_RATE`).
- UI reason: new seals carry `portal_oos_episode_win_rate` (62.50% on w23, not audited); the row is empty on every pair.
- Smallest proposal: add `EPISODE_WIN_RATE` (scope OOS, origin PORTAL_DERIVED) as its own row, labelled "not audited".
- UI today: "not applicable" x 3.

**B-12 Pair p18 x p21 (seal mismatch)**
- Endpoint: `.../compare?mode=pair&runs=rrun_464bf9c3...,rrun_ece579eb...` -> `PARTIAL`, `P20_CURRENT_SOURCE_SEAL_DOES_NOT_MATCH_P14_AND_RUN_BINDINGS` for overlay, net return, max drawdown, correlation.
- Smallest proposal: when two P04 runs share a contract key, compute the overlay from each run's own sealed OOS equity (25 points each) and mark `sampling: EXTREMA_BUCKET_V1`; skip only the correlation.
- UI today: five "not published" frames.

---

---

## Nhóm S10_S14_S11

Counts from the real lineage (44 attempts) and the three S11 compositions.

| screen · element | run(s) | state shown | reason code (verbatim) | class | needs | backend request |
|---|---|---|---|---|---|---|
| S10 · claim | R-P04-001 and other FAILED/CANCELLED | not published | `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED` (also `CANCELLED_BEFORE_SOURCE` x2) | LEGIT | failed/cancelled run has no claim | none |
| S10 · "cert" on every card | all 44 | `cert not published` | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` / `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED` | LEGIT | certificate never issued for WFO/P04 (claim NOT_ISSUED) | none; UI should print one chip instead of 44 |
| S10 · OOS sharpe, non-READY | 23 FAILED/CANCELLED | not published | `P19_RUN_LIBRARY_PUBLISHES_NO_PERFORMANCE_CELL_FOR_STATUS` | LEGIT | no result | none |
| S10 · OOS sharpe | 1 READY P04 probe | not published | `P13_SOURCE_PREDATES_OOS_ANALYTICS` | OLD-SEAL | OOS from older seal | R-1 |
| S10 · OOS sharpe | 2 READY WFO | not published | `P13_SOURCE_EVIDENCE_NOT_PUBLISHED` | OLD-SEAL | same | R-1 |
| S10 · OOS sharpe | 1 READY P04 | not published | `P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS` | BACKEND-GAP | engine result exists but analytics cannot read it | R-1 |
| S10 · decay | all P04 READY (e.g. R-P04-019 OOS 0.744, decay not published) | not published | (same availability family) | BACKEND-GAP | decay for fixed-profile runs | R-2 |
| S10 · exposure line | all 44 | `exposure — not published` | `P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT` | BACKEND-GAP | exposure fact per attempt | R-3 |
| S10 · promotion pick (version row + band) | alpha | no promotion pick published | `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK` (owner P22, NOT_CONNECTED) | LEGIT | governed approval, not available | none |
| S10 · promotion state | 33 READY | awaiting a published pick | `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK` | LEGIT | same | none |
| S10 · space signature | all | not published | (null) | BACKEND-GAP | compare search spaces | R-4 |
| S10 · release candidate | 43 attempts | none shown | `P21_NO_PERSISTED_RELEASE_CANDIDATE` | LEGIT | none sealed | none |
| S10 · claim family | R-P04-001 | NOT_PUBLISHED | `P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED` | LEGIT | failed run | none |
| S10 · header "rc & publish" | alpha | dead link | tooltip "No published promotion pick names a run…" | FE-GAP | `attempts[2].release_candidate.run_id` already served for ratt_3d5633d2 | none |
| S10 · child runs | all real | "child runs — none returned" | `child_runs: []` | LEGIT | no children exist (only one CLONE in real data) | none |
| S14 · mirror strategy_id, display_name | any parse | "at register" NOT_APPLICABLE | - | LEGIT | assigned at registration | none |
| S14 · mirror default_timeframe, structural_contract, supported_endpoint_ids, execution_contracts, output_contract | any parse | "not in v1" | DQ-05 | LEGIT | v1 file contract | none |
| S14 · receipt entrypoint | after register | "not read yet — registry row not returned" | - | FE-GAP | `GET /api/v1/research/alphas` rows carry `entrypoint` | none |
| S14 · signed publication | after register | signature / SBOM not published | `RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED`, `RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED` | LEGIT | v1 import does not sign | none |
| S14 · capability registration | after register | "not recorded at import — preflight decides routes" | - | LEGIT | by design | none |
| S14 · run admission | after register | "run admission not read yet" | - | BACKEND-GAP | would New Run accept this version | R-5 |
| S11 · release_candidate_id in record preview | W23 | `null # P21_ASSIGNED_ON_LOCAL_SEAL` | `P21_ASSIGNED_ON_LOCAL_SEAL` | FE-GAP | id is in `local_seal.release_candidate_id` of the same response | none |
| S11 · seal button on sealed RC | W23 | active | `actions.seal_blocked_reason = null` | BACKEND-GAP | server should block | R-6 |
| S11 · claim ceiling, engine cert | all 3 | not published | `P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED`, `P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED` | LEGIT | no certificate issued | none |
| S11 · param_set_id | all 3 | not published | `P21_PARAM_SET_ID_NOT_PUBLISHED` | BACKEND-GAP | stable id of parameter set | R-7 |
| S11 · evidence rows 4, 5, 6 | P04-021 | MISSING | `P21_METHODOLOGY_CLAIM_NOT_PUBLISHED`, `P21_SELECTION_PARAMETER_BUNDLE_NOT_PUBLISHED`, `P21_FINAL_AUDIT_RUN_NOT_PUBLISHED` (+ `P21_SELECTED_TRIAL_ORDINAL_NOT_PUBLISHED`) | LEGIT | fixed-profile run has no search / final audit | none |
| S11 · rows 4, 9 DEGRADED | W17, W23, P21 | DEGRADED | `P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED`, `P21_SOURCE_DEGRADED_EVIDENCE` | LEGIT | no stability/regime certificate | none |
| S11 · last published RC, taxonomy | all 3 | UNSET | `P22_NO_PUBLISHED_PREDECESSOR` | LEGIT | no RC ever published | none |
| S11 · target venue/account/capital | all 3 | UNSET | `P21_EXECUTION_DEPLOYMENT_OUT_OF_SCOPE` | LEGIT | Execution side | none |
| S11 · approval mirror (status, pool, conditions, SLA) | all 3 | "not published" | `P22_NOT_PUBLISHED` | LEGIT | P22 not connected | none |
| S11 · publication facts (actor, attempts) | W23 | "actor not published" | publication state `NOT_PUBLISHED` | LEGIT | nothing published yet | none |
| S11 · pack source links `pack[0,9,11].source.href` | W23 | no link on rows 1, 10, 12 | (null) | BACKEND-GAP | link target for Alpha passport and declarations | R-8 |

Class totals (rows above): LEGIT 21, OLD-SEAL 2, BACKEND-GAP 8, FE-GAP 3, HIFI-ONLY 0 (34 rows).

### Backend requests

- **R-1 OOS for READY attempts that read "not published"**
  - Endpoint/field needed: `GET /api/v1/research/alphas/{id}/lineage` -> `attempts[].run_facts.oos_sharpe` (`value`, `scope`, `source`) for READY attempts whose reason is `P13_SOURCE_PREDATES_OOS_ANALYTICS`, `P13_SOURCE_EVIDENCE_NOT_PUBLISHED`, `P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS`.
  - UI reason: the card shows "OOS not published" next to a READY run, so attempts cannot be compared.
  - Current impact: 4 READY attempts of delta-rsi-polynomial-alpha (1 old-seal P04, 2 WFO, 1 P04 engine-result).
  - Smallest proposal: companion backfill that writes the OOS fact for old seals with the same rule as `RS02_RETAINED_SELECTED_TRIAL`, and fixes the engine-result read for the one P04 run; shape unchanged, `availability.state` becomes AVAILABLE.
  - UI today: prints `OOS not published`.
- **R-2 decay for fixed-profile P04 runs**
  - Endpoint/field needed: `run_facts.decay.value` for `execution_profile_id = p04.fixed-qualification.v1` (R-P04-019 shows OOS 0.744, decay not published).
  - UI reason: second number of the card is empty for every P04 run.
  - Current impact: all P04 READY attempts.
  - Smallest proposal: publish decay with `scope: "FIXED_PROFILE"`, or a typed NOT_APPLICABLE with reason `P04_PROFILE_HAS_NO_DECAY` if it does not exist (then the UI drops the cell).
  - UI today: `decay not published`.
- **R-3 exposure fact per attempt**
  - Endpoint/field needed: `attempts[].exposure` (`state`, `count`, `roles[]`, `latest_source_as_of_utc_ms`), currently NOT_PUBLISHED for all 44 with `P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT`.
  - UI reason: exposure is the multiple-testing disclosure; today it is blank on every attempt.
  - Current impact: line `exposure — not published` x44.
  - Smallest proposal: one exposure record per run that read an OOS/holdout window (role e.g. OOS_SELECTION), `count` = reads; if none, return `state: NONE`.
  - UI today: prints the absence and the code.
- **R-4 space signature**
  - Endpoint/field needed: `attempts[].space_signature` (string, null for all attempts).
  - UI reason: details row "space signature — not published"; needed to say two attempts searched the same space.
  - Current impact: 44 attempts.
  - Smallest proposal: sha256 of the canonical sweep declaration at declare time.
  - UI today: "not published".
- **R-5 run admission for an imported version**
  - Endpoint/field needed: `RegistrationResponse.run_admission {state: "ADMITTED|BLOCKED", reason_code}` (or a GET per version).
  - UI reason: after register the card says "run admission not read yet" and the "new run with this av_" button is dashed.
  - Current impact: every new import.
  - Smallest proposal: evaluate with the same preflight New Run uses.
  - UI today: dashed button + "not read yet".
- **R-6 seal block reason for an already sealed candidate**
  - Endpoint/field needed: `GET /api/v1/quantbt/runs/{run}/release-candidate` -> `actions.seal_blocked_reason = "P21_ALREADY_SEALED"` and `actions.declarations_editable = false` when `local_seal` exists.
  - UI reason: seal button and declaration editors are enabled on a sealed RC.
  - Current impact: WFO-023 `rc_06GFFDG3SA17Y5WPBN58NFM5B2` (`seal_blocked_reason` is null).
  - Smallest proposal: as above.
  - UI today: relies on the field, so the button stays active (FE should also hide it when `local_seal` is present).
- **R-7 param_set_id**
  - Endpoint/field needed: `selected_params.param_set_id` (null, `P21_PARAM_SET_ID_NOT_PUBLISHED`).
  - UI reason: "SELECTED PARAMS" cell shows only an 8-char digest; approvers need a stable id.
  - Current impact: all three RCs.
  - Smallest proposal: `ps_<first 12 of parameter_bundle_digest>` assigned at seal.
  - UI today: shows the digest.
- **R-8 source links for evidence rows 1, 10, 12**
  - Endpoint/field needed: `pack[].source.href` (null for Alpha passport and the two declarations).
  - UI reason: SOURCE column is plain text instead of a link.
  - Current impact: 3 of 12 rows per RC.
  - Smallest proposal: href to `/alphas/{id}/lineage?av=` and to the declaration editor anchor.
  - UI today: plain text.
