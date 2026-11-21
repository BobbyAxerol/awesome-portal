# W5b · P17 Execute/Replay completion — Screen 08 on the signal-notional route (Claude, 2026-09-25)

**Branch:** `worktree-agent-a424bd5180d46bb47` (worktree `.claude/worktrees/agent-a424bd5180d46bb47`).
**Base:** `85c1b113` on `docs/research-loop-plan`. **Not pushed.**
**Scope:** Astra A09 (P17 row) / A12 P17 gate IDs, Unified §13.5 P17, CG-P17-01…03, `P17-FE-DG-02` (Reveal), Screen 08 per HiFi.

## 1. What QuantBT really produces on this route

Measured, not assumed. QuantBT 1.1.1 walk-forward, `target_mode=signal_notional`, BTCUSDT 1h 2026-06-01..07-15 through the approved read-only HMD reader (`HistoricalMarketDataProvider`, duckdb), 2 folds, 3 trials, seed 42:

| Fact | Value | Source |
|---|---|---|
| Final account result | `BacktestResultV2`, backend `native_vectorized` | `endpoint.result` |
| Execution contract | `close_target_v2`, signal `bar_close`, fill `same_close`, `market_fill_policy=close`, `accounting_certified=true` | `result.metadata.execution_contract` |
| `orders` / `fills` / `trades` tuples | **0 / 0 / 0**; `orders_count=0`, `fills_count=0`; order/fill/position reports empty | `result.*`, `metadata` |
| Per-bar series | `fees` (8 non-zero bars, sum 8.0327), `funding` (all 0, `use_funding=false`), `diagnostics.turnover`, `rejected_orders`, `reject_code`, `margin` | `result.fees/funding/diagnostics/margin` |
| Target | `target_intent_kind=units`; accepted position changes on exactly the 8 fee bars | `positions` |
| Execution config | `allow_partial_fill=false`, `same_bar_policy=conservative`, `oms_mode=netting`, `intrabar_exit_model=none`, `slippage_bps=0`, fee 0.0005 one way | `metadata.run_config` |
| Fold capital | `fold_account_policy=carry_position`, `account_execution=single_stitched_run`, boundary event 0→1 `carry_position`, gap 0 bars | `wf.account_execution_plan` |
| Candles | the analysed HMD bars are already in `series/stitched.parquet` (OHLCV) | runner `_stitched_series` |
| Child audit | `strategy_lifecycle_table` 12 rows (candidate × fold isolation records) | `wf` — not retained (see §6) |

So on `signal_notional` there is **no order, fill or trade record to retain**: that is the source's answer, not a portal gap. What exists is the target transition settled at the close, with the account's own fee and turnover. That is what the ledger retains and what Screen 08 draws.

## 2. Decisions (Bobby delegated: decide per HiFi/spec, record each)

| # | Decision | Why | Where |
|---|---|---|---|
| D1 | Candles are retained **at seal time** from the run's own analysed bars (`stitched.parquet` OHLCV = the HMD reader's frame the engine consumed), not re-read from HMD at GET | The candle is then provably the engine's input; a GET never opens HMD or QuantBT (A08/A09 rule); bounded like every retained row | exporter `_attach_bar_ledger` |
| D2 | One bar block per observation (observation schema **v2**, `bar_json`), not a new table kind | Same dense ordinals, one keyset relation, no table-kind migration; a pre-W5b tree keeps schema v1 and its digest | exporter, payload |
| D3 | The "fill" ledger of this route is the **target transition ledger** (`TARGET_TRANSITION_SETTLED_AT_CLOSE_NOT_A_FILL`), with ENTRY/EXIT/FLIP/RESIZE from the sign change | HiFi 08 close_target: "Markers are target transitions, not audited fills"; spec §2.5 close_target kinds | new route `…/replay/transitions` |
| D4 | orders/fills/trades → `NOT_PUBLISHED` with `QUANTBT_ROUTE_EMITTED_NO_{ORDER,FILL,TRADE}_RECORDS` when QuantBT counted 0; `RS02_*_NOT_RETAINED` if a future route counts >0 | The reason must be the source's count, not a guess | service `replayCapabilities` |
| D5 | partial fills / OCO / multi-leg / SL-TP / funding → `NOT_APPLICABLE` with the run's own config reason (`allow_partial_fill=false`, `close_target_v2`, `netting`, `intrabar_exit_model=none`, `use_funding=false`) | They cannot exist on this run; "not published" would suggest a gap | same |
| D6 | Fold capital = QuantBT's `fold_account_policy` verbatim + `equity_continuity` (CONTINUOUS for carry_position/close_at_boundary, RESET_PER_FOLD for reset_flat, else NOT_ASSERTED) | The HiFi says "position FLAT … account re-based"; this run **carries** — the screen says what the source did | `execution.fold_capital` |
| D7 | Checkpoints are running sums stored per bar (fee, turnover, funding, transition count, rejects) | Far seek = one row read, equal to the sequential sum by construction; P17-T04 asserts the equality | bar `checkpoint` |
| D8 | Whole-run candle overview ≤160 OHLC buckets in the seal summary, high/low = true bucket extrema, caption states bucket size | Downsample must not hide extrema (§8 invariant); precomputed once, no per-GET scan | `candle_overview` |
| D9 | A hole in a window's dense ordinals → `503 RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP`; a transition count that disagrees with the seal → same | P17-T04 gap refusal; never play through or invent a row | service `assertDenseWindow` |
| D10 | **Reveal** = HiFi 04/08 "causal reveal": presentation only. Cuts candles/markers/ledger (times included) at the cursor, hides full-run totals and fold outcomes at/after the active fold; sends no request, changes no revision/digest, grants no certificate | Guide §13.6 (causal reveal is presentation-only), HiFi 08 `reveal` state, P13-T12 / P17-T13 | `ExecuteCandleReplay.tsx` |
| D11 | Arrival opens the hashed fold (`#fold=N`, default 1) with **one** extra `at` read; the first retained window is in-sample flat bars and is not a useful first view | Spec 08 opens on a fold; bounded arrival (2 reads) | `useReplay` |
| D12 | S08 title stays "S4 · Execute Replay — what this source can replay" (not "how orders came to exist") | This route has no orders; `P17-FE-DG-02` title part | unchanged |
| D13 | LENS personas, COPY EVIDENCE LINK, Validation (nautilus) tab: **not built** | No field for lens-specific data; no parity artifact (spec: hide the tab when absent); copy link is out of this slice | recorded deviation |
| D14 | Trade blotter, MAE×MFE, PnL distribution stay absent with `QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS` | Pairing transitions into trades would be the screen's guess (HiFi says "derived by the engine"; the engine derived none) | S08 |

## 3. Commits

| Commit | Subject | Shortstat |
|---|---|---|
| `088acd27` | feat(research): P17 retained replay ledger for the signal-notional route (W5b) | 24 files, +2394 / −41 |
| `68d6ce03` | feat(research): Screen 08 replays the run's candles and target transitions (W5b) | 7 files, +1593 / −16 |
| `897fb48d` | docs(research): W5b P17 replay evidence, A12 P17 gap closure, CG-P17 answers | 2 files, +161 / −3 |
| `8775be46` | feat(research): P17-T14 child audit - QuantBT strategy isolation per fold (W5b) | 28 files, +817 / −32 |

All through the pre-commit hook (`verify-workspace.sh`); none bypassed. The first attempt of `088acd27` was refused by the hook: the P01 live route inventory lacked the new route; `node scripts/research-loop-v11/p01-baseline.mjs --write-live-routes` fixed it (233 routes).

## 4. Deliverable status

| # | Item | Status |
|---|---|---|
| 1 | Route-discriminated retained ledgers: positions/equity per bar (existing), **fees/turnover/funding/rejects per bar**, **transitions ledger**, fold capital + segments + seek cursors, checkpoints/state-at-cursor, **candles** (seal-time from the HMD-read frame), overview downsample with caption; original ids (`source_index_utc`, original bar ordinal) distinct from playback index; seek parity, ties, gaps, typed refusal; typed NOT_PUBLISHED/NOT_APPLICABLE with source reasons; exporter additive/versioned; W1 seal fixture still valid | **DONE** |
| 2 | A12 P17 gaps closed with assertions or decisions (§5); test count reconciled (§5.1); CG-P17-01…03 answered (§6) | **DONE** (T09 is an inventory, see §5) |
| 3 | Reveal (P17-FE-DG-02 / P13-T12) decided and implemented as presentation-only | **DONE** (D10) |
| 4 | Screen 08 per HiFi: candles + markers, transport, fold capital strip, links 04/07/09 (breadcrumb, ← S3 Freeze, next: Run Report), flat-axis fix, honest states, English | **DONE** |
| 5 | Real data: opt-in real-HMD tests (two paths); browser against the preview API via Vite proxy at 1440/660, screenshots looked at | **DONE**, with the lane split in §7 |

## 5. A12 P17 gate IDs

| ID | Before | Now | Evidence |
|---|---|---|---|
| P17-T01 | COVERED | COVERED + extended | CA `research-w5b-replay.spec.ts` "counts the engine's own…"; FE `executeCandleReplay.test.tsx` "draws the fold's candles…" |
| P17-T02 | GAP | **COVERED** | Py `test_current_source_w5b_replay.py::test_signal_notional_replay_ledger_is_the_engine_account_bar_by_bar` (0/0/0 tuples on the real engine = SOURCE_UNSUPPORTED_CONFIRMED; fee ≠ 0 exactly on transitions); CA partial fills/OCO/multi-leg/funding NOT_APPLICABLE reasons; opt-in real HMD both paths |
| P17-T03 | GAP | **COVERED** | Py segments: fold k start equity = fold k-1 end equity, carry_position/single_stitched_run; CA "one stitched carry-position account" (19931.280844135865 carried); CA reset_flat → RESET_PER_FOLD, missing → NOT_ASSERTED |
| P17-T04 | GAP (partial) | **COVERED** | CA "sequential pages, random seeks and a far seek read the same state" (1056 bars); "a window with a hole … is refused"; DB "refuses to seal an ordinal gap {0, 1, 3}" |
| P17-T05 | COVERED | COVERED + | DB: a transition-ledger cursor is refused by the replay relation (400) |
| P17-T06 | GAP (partial) | **COVERED** | CA 200-row cap, <1 MiB with bars, overview ≤160; FE step through 168 bars adds <20 nodes; browser probe plays a fold at 64×: DOM 2334→2334 nodes, heap delta 0 at both viewports |
| P17-T07 | COVERED | COVERED + | CA fold switch reads only `sealForRead`/`rows`; FE transport + reveal send no request |
| P17-T08 | GAP | **COVERED** | CA: response and schema have no certificate key; FE: no `[data-certificate]`, QuantBT's `accounting_certified` quoted as the engine's |
| P17-T09 | GAP | **INVENTORY** | §5.2 below: S08 T01–T22 each mapped to a test, a route decision, or not-applicable |
| P17-T10 | GAP | **COVERED** | CA synthetic `{10, 12, 90}`: next/prev land on 10→12→90, back to 12, never 11; missing bar ordinal still detected; DB real sparse ordinals 727…1023 paged both ways |
| P17-T11 | GAP (partial) | **COVERED** | CA two bars with one timestamp: table order kept, `cross_stream_order = NOT_ASSERTED`, ledger order kept |
| P17-T12 | COVERED | COVERED + | FE `#fold=2` arrival → fold-1 window via its start cursor; fold switch |
| P17-T13 | GAP | **COVERED** | FE reveal test: future transitions (time too), markers, candles after the cursor, full-run fees/transitions and fold outcomes hidden; revision text and request count unchanged |
| P17-T14 | GAP (partial) | **COVERED** (capital + original ids + child audit) | CA fold switch keeps `source_index_utc` and fold id; child audit §10: Py (golden + opt-in real HMD, both paths) every retained record equals QuantBT's `strategy_lifecycle_table` row, all 12 audit ordinals present once, exactly one `out-of-sample generation` child per fold starting on the fold's first replayed bar; CA sub-read returns them verbatim in QuantBT's order, 404 for an unknown fold, typed absence on an older seal; DB route + ETag; FE card + anatomy link, one read per fold |
| P13-T12 | GAP | **COVERED** by the same reveal (S08 is where reveal is built; S04's HiFi toggle is the same presentation mode) | FE reveal test |
| V11-P17-DR | GAP | **PARTIAL→DONE for this route** | Real HMD numbers: 1056 bars, 8 transitions, fees 8.0327295941789174, fold 0 20000→19931.280844135865, fold 1 →19926.50808204798; every bar field equals the engine value exactly (Py assertions) |
| V11-P17-BR | GAP | **DONE (two labelled lanes)** | §7 |
| V11-P17-GX | GAP | **DONE** | §5.1 reconciliation; hook runs; no protected file touched (`strategy/main.py` untouched, verified by the hook) |

### 5.1 The 24-vs-25 test count

The P17 gate command mixes the three P17 files (2 + 2 + 8 = **12** tests) with the shared `test/config.spec.ts`, which later phases (P18 report, P20 compare, P21 release candidate) keep extending. 24 (phase-report) and 25 (test-results.json) were two runs of the same command days apart; today it is **31** (12 + 19). The honest P17 count is the P17-owned files: **12** original + **22** W5b Control API (18 in-memory + 4 PostgreSQL) + **3** contracts, and on the frontend 32 (`executeReplay.test.tsx`) + 12 (`executeCandleReplay.test.tsx`).

### 5.2 S08 T01–T22 inventory (P17-T09)

| S08 | On this route | Evidence |
|---|---|---|
| T01 close_target fixture: banner, na tiles, not_applicable card, ledger kinds | Tested | FE P17-T01 tests |
| T02 play 16×: seq moves, ledger slides, no autoscale jump | Tested (transport store) + browser 64× | `executeReplay.test.tsx` S08-U01; probe |
| T03 FILL → causal chain, copy chain | Chain tested; copy chain not built (D13) | FE anatomy test |
| T04 intrabar SL/TP, ambiguous | N/A: `intrabar_exit_model=none` | CA `sl_tp` NOT_APPLICABLE |
| T05 lifecycle OCO tree | N/A: close_target_v2 | CA `oco` NOT_APPLICABLE |
| T06/T07 reactive wake trace | N/A: route is not reactive | no field |
| T08 dca ladder | N/A | no field |
| T09/T10 validation tab | No parity artifact → tab hidden (spec says hide) | not rendered |
| T11 blotter server sort | N/A: 0 trades | CA `trades` |
| T12 blotter row → seek | Replaced by transition row → seek | FE anatomy/seek |
| T13 scatter click | N/A: no trades | CA `mae_mfe` |
| T14 stitched handoff chip title | Tested (policy wording) | FE fold switch test |
| T15 fold ‹ › : transport stops, seq0 | Tested (fold reads start cursor; `load` stops play) | FE fold tests |
| T16 far seek no lock | Window kept, `inFlight` inline | FE/useReplay |
| T17 32-fold strip | Tested on a synthetic 32-fold run (§11): scrolling snap strip, ‹ › and click, one window + one child-audit read per fold, no overflow at 1440/660, DOM bounded | FE T17 test; browser probe |
| T18 hidden tab pause | Tested | `executeReplay.test.tsx` |
| T19 keys | Tested | `executeReplay.test.tsx` |
| T20 660px | Browser probe, no overflow | §7 |
| T21 axe | Run in the fixture lane at 1440/660 (§10) | 0 blocking; only `color-contrast` on `#939db0` (the approved D-B1 shared-token exception, as in the RF-04 probe) |
| T22 reduced motion | No pulse animation used | by construction |

## 6. CG-P17 answers and what stays open

| Request | Answer |
|---|---|
| **CG-P17-01** canonical fixtures | **ANSWERED.** `packages/contracts/fixtures/research-current-source.replay.fold0.valid.json`, `…replay-transitions.valid.json`, `…replay.legacy-seal.valid.json`, generated from the real-HMD seal by `research-w5b-replay.spec.ts` (`W5B_WRITE_FIXTURES=1`), validated against Zod and OpenAPI on every run, tracked by `snapshot.py`, loaded by `executeCandleReplay.test.tsx` and the browser probe. The hub (`research.replay.v1`) fixtures were not added: the hub lane is the P04 sample lane and its contract spec bodies remain the reference. |
| **CG-P17-02** lane fact + codes in the contract | **ANSWERED.** (a) RF-05 already answers the lane state (200 `LaneNotApplicable` for P04; 409 with `details.lane_state`). (b) OpenAPI 1.4.0 publishes `ProblemCode` (7 codes incl. the new `RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP`). |
| **CG-P17-03** two counts | **ANSWERED for the retained lane:** `source_observation_count` is the number of sealed bars; there is no bucketing in the replay relation (every bar, a window at a time). The only downsample is `execution.candle_overview` and it carries `source_bar_count`, `emitted_bucket_count`, `bucket_bars`. The hub's `emitted_point_count` semantics are unchanged (hub lane). |
| Child-audit provenance (P17-T14 half) | **Retained and served** (§10). |
| HiFi LENS / COPY link / Validation tab | Not built (D13). |

## 7. Real data and browser (lanes kept apart)

| Lane | What | Result |
|---|---|---|
| `delta-real-data` (Python, opt-in) | `PORTAL_RUN_HMD_REAL_SMOKE=1 HISTORICAL_MARKET_DATA_ROOT=/srv/primus/historical-market-data/storage`: `test_current_source_w5b_replay.py::test_real_hmd_signal_notional_replay_ledger` and `test_research_wfo_real_hmd.py` (child path, exports the fixture with `PORTAL_W5B_REPLAY_EXPORT_DIR`) | both PASS; child CPU 4.72 s / cap 120, wall 4.99 s, RSS 309 MB; largest batch body 160,382 B |
| `persistence-vs-api` | `research-w5b-replay-db.spec.ts` in the disposable PostgreSQL cell (with RS-02 migration + RS-03 acceptance) | 16/16 |
| `browser-real` (preview :8095, read-only, not rebuilt) | Vite on `localhost:5217` proxied to the preview, `Origin https://research-portal.primusspark.com`, run `rrun_f5e0918626531f90d256ead921011cb2`. The preview image is `4626448d` (pre-W5b server), so the run answers the pre-W5b retained body | 1440 + 660 PASS: legacy retained body, flat window now on a 19,990–20,010 axis (was 10,000–30,000), no overflow, clean console |
| `visual-fixture` (same page, real everything except the two retained replay reads, answered by the CG-P17-01 real-HMD fixtures) | candles + 4 transition markers on fold 0, ledger of 8, reveal, 64× play | 1440 + 660 PASS; DOM 2334→2334 nodes, heap unchanged; no overflow; console clean |

Screenshots (not committed, SHA-256): `ledger-1440` 59f54609…, `ledger-660` 60bf11cd…, `ledger-reveal-1440` fab7316a…, `ledger-reveal-660` 64e7d0a8…, `preview-1440` 2f734fb4…, `preview-660` e9540bfd….

**Not claimed:** a W5b run on a deployed stack. That needs the new images and a new WFO run (the preview's seals predate the ledger and would keep answering `NOT_RETAINED_LEGACY` even on the new server — by design, no history is rewritten).

## 8. Gates

| Gate | Result |
|---|---|
| Control API `npx vitest run test/research` (no DB) | 326+ pass; the only failures are the DB-bound specs without PostgreSQL |
| Control API DB cell (`scripts/control-api-test.sh` harness, subset) | `research-w5b-replay-db` 4/4, `research-rs02-migration` 9/9, `research-rs03-current-source-acceptance` 3/3 |
| Control API `tsc -p tsconfig.build.json` | clean |
| W5b Control API in-memory spec | 18/18 |
| Contracts `vitest` / `verify-generated.sh` / `snapshot.py --check` | 184/184 · all generated types match · 207 files |
| R2 ledger `src/execution/r2Ledger.test.ts` | 22/22 (route_count 184) |
| P01 live route inventory | rewritten, 233 routes (hook check) |
| Frontend `vitest src/research` | 36 files, 1140/1140 |
| Frontend `tsc` / `npm run build` | clean / green |
| Python full suite (scratch venv with the pinned QuantBT 1.1.1 wheel) | 649 passed, 7 skipped (opt-in), 1 failed: `test_rf02_nats_consume_loop_survives_an_idle_queue` — `nats` is not installed in the scratch venv (environment, unrelated to W5b) |
| `test_m0_freeze` | green after re-pinning `advanced_walkforward_runner` |
| W1 real seal fixture | `research-w1-preview-seal.spec.ts` still passes (optional `replay` summary block) |

## 10. Follow-up · P17-T14 child audit and S08 axe (2026-09-25, coordinator request)

**Source fact.** QuantBT's `strategy_lifecycle_table` on the real run has 12 rows, policy `isolated_v1`, 0 records dropped by the source. Per fold: three in-sample-search children (one per candidate), one in-sample scoring child, one out-of-sample scoring child and one **out-of-sample generation** child, which produced the replayed bars. Each row carries candidate id, fold id, seed, cutoff, train/test window, lifecycle kind, `certified_isolation`, and the strategy and market fingerprints. There is no record id column, so the original child-audit id is the row's position in QuantBT's table (`audit_ordinal`), kept together with candidate id, fold id and seed.

| Decision | Why |
|---|---|
| D15 · Retain the table verbatim per fold, inside the FOLD row payload (`child_audit`, schema `research.current-source-fold-child-audit.v1`, at most 64 records, `truncated` when QuantBT published more), with run-level facts in `summary.replay.child_audit` | No new table kind, **no migration**; a FOLD row stays well under 64 KiB (5.9 KB on the real run); older seals and the W1 seal fixture are untouched (optional blocks) |
| D16 · Serve it as a bounded sub-read `GET …/current-source/replay/child-audit?fold=<fold_id>` (one indexed row via the unique `source_id` key, ETag), not inside every replay window | A replay window must stay small; 256 folds × 64 records would not fit in the response |
| D17 · Screen 08 shows the fold window's child audit as a card (generating child marked) and as a `child` link in the close-target trade anatomy | The HiFi's audit lens puts ids on each row; the anatomy is where a transition is traced to its source |

**Files.** Runner `wfo/strategy_lifecycle.v1.parquet` + `wfo/strategy_lifecycle_contract.v1.json`; exporter `_attach_child_audit`; Control API payload/contract/service/repository (`rowBySourceId`)/controller; OpenAPI 1.5.0; fixture `research-current-source.replay-child-audit.fold0.valid.json`; R2 inventory route_count 185; P01 live routes 234; M0 freeze re-pinned; S08 `ChildAuditCard`.

**Tests.**
- Python: W5b + current-source + retention + M0 freeze pass. With `PORTAL_RUN_HMD_REAL_SMOKE=1`, `test_research_wfo_real_hmd.py` (P06 child path; it re-exported the real fixture) and `test_current_source_w5b_replay.py` give 14/14.
- Control API: W5b in-memory spec 20/20. The related current-source/replay specs give 153 passed and 1 skipped.
- PostgreSQL cell: `research-w5b-replay-db` (now with the child-audit route), rs02 migration and rs03 acceptance give 17/17.
- Contracts: 184/184. Generated types verified, snapshot updated.
- Frontend: `src/research` plus `r2Ledger` give 1163/1163. `tsc` is clean and the build passes.

**Axe (S08 T21), fixture lane.** Real preview API; only the retained replay, transitions and child-audit reads are answered by the CG-P17-01 real-HMD fixtures.
- 1440: `serious:color-contrast` ×79, every node `#939db0` (the approved D-B1 shared-token exception). No other violation.
- 660: the same, after two fixes. The child-audit table's scroll container is now focusable, and card headings are `h2` under the page `h1`. Before the fixes, axe reported `scrollable-region-focusable` and a moderate `heading-order`.
- DOM stayed at 2396 nodes while playing a fold at 64×.
- Screenshots are not committed. SHA-256: `ledger-1440` 65638f35…, `ledger-660` ad8fda6e…, `ledger-reveal-1440` 8ffddd10…, `ledger-reveal-660` de4ea8eb….

## 11. Follow-up · S08 T17 at 32 folds (2026-09-25, coordinator request)

**Fixture.** `apps/portal/frontend/src/research/w5bFoldScale.fixture.ts` builds a 32-fold run from the published real-HMD fixture. It keeps the same schema and is used by tests and the probe only.
- The real fold-0 window (168 bars) is kept as it is.
- `execution.fold_capital` becomes 32 weekly folds of 168 bars each, after the same 720-bar in-sample span, for 6,096 bars in all.
- There are 31 carry-position boundaries. Equity is chained from the real fold 0 and fold 1 numbers.
- The overview is rescaled to 6,096 bars.
- Each fold gets its own opaque start cursor. A fold read returns the real bars relabelled with that fold id, and a child-audit read returns the real fold-0 audit relabelled.
- It claims nothing about a real run. On screen, the window caption still shows the real bars' ordinals (721–888) beside the synthetic fold's range, which is expected.

**Change (D18).** With more than 12 folds, the fold strip becomes a single horizontally scrolling, snapping row on its own full-width line (spec 08 §2.2). Keyboard users can focus and scroll it (`role=region`), and it keeps the active fold scrolled into view. With 12 folds or fewer the strip wraps as before.

The first browser pass caught a real defect at 660: the scroller shrank to a sliver beside its caption. It now sits on its own row, and the probe asserts its width: more than 500 px at 660 and more than 900 px at 1440.

**Assertions.**

*Unit test (`executeCandleReplay.test.tsx`, "S08 T17"):*
- The strip is in scroll mode, with 32 fold buttons and 31 boundaries.
- Arrival reads the child audit of fold 0 only.
- Three steps of "next fold" and one click on fold 20 read the child audit for exactly folds 0, 1, 2, 3 and 20, in that order.
- 40 transport steps send no request and add fewer than 20 DOM nodes.
- The overview caption reads 6,096 bars.

*Browser probe, fixture lane, 1440 and 660:*
- Walking through all 31 folds with ‹ › and then clicking fold 5 reads 33 child audits: one per fold visit (32) plus the return to fold 5.
- Fold 31 and then fold 5 are scrolled into view.
- No horizontal overflow.
- Playing a fold at 64× sends no request. DOM stays at 2547 → 2547 nodes at both widths.
- Axe finds no blocking violations; the only finding is the approved D-B1 `#939db0` contrast exception.
- The console stays clean.

**Gates.**
- Frontend `src/research` plus `r2Ledger`: 1164/1164. `tsc` is clean and the build passes.
- S08 browser probe: 6/6. That is the preview lane, the ledger lane and the T17 lane, each at 1440 and 660.

Screenshots are not committed. SHA-256: `folds32-1440` 6fe42068…, `folds32-660` edae1649….

## 9. Rollback

Revert the three commits in reverse order. The migration 065 only adds a partial index (`DROP INDEX research.current_source_rows_v1_transition_idx` undoes it). Seals retained with the W5b ledger stay readable by the pre-W5b reader only if the observation payload schema accepts `bar` — so revert the frontend and service together, and keep `current-source.payload.ts`'s optional `bar`/`replay` if any W5b seal was retained.
