# Cells S08–S14 on the 400-trial Delta WFO run (read-only, 2026-09-30)

**Runs**
- Long run: R-WFO-020 `rrun_3258a4c4…` (claude-preview workspace). Spot check: bobby's R-WFO-002 `rrun_d61c000d…`.
- Reference runs: R-WFO-017 `rrun_17f76212…` (3 trials) and R-P04-018 `rrun_464bf9c3…`.

**How this was captured**
- Playwright ran against `research-portal.primusspark.com` (claude-preview) and `localhost:8095` (bobby, logged in through the API). Every `/api/` JSON response was saved next to the screen text.
- Raw captures (screen text and API JSON): `…/scratchpad/fe0930/capB/<screen>/`.
- Screenshots: `…/scratchpad/fe0930/cellsB/`. Crops are in `cellsB/crops/`.
- Load time is measured to network idle and includes auth: 3.5–4.7 s on every screen, for both the 400-trial and the 3-trial runs. The browser never took longer to render the 400-trial run; the extra trials never reach the browser, except the child-audit read.

**Classes**
- OK · EMPTY-HONEST · WRONG · NO-API · SCALE · FE-LOCAL, as defined in the task.
- **UNBOUND** is added here for one case: a HiFi block the screen does not draw although a served field carries its data.
- `660` rows are layout breaks at 660 px.

**Bobby spot check (R-WFO-002):** same outcome on every screen, including:
- identical numbers on S08: same QuantBT run fingerprint `bba8e52d8399…`;
- the same S09 404;
- the same two S11 MISSING rows.

The only differences are labels and ids.

---

## Root finding first — the 400-trial run breaks two server facts, and three screens inherit them

**A. QuantBT's child audit drops every out-of-sample-generation record.**
- Each fold returns `records` = 64 of `source_record_count` = 223/222. The whole run gives `execution.child_audit.source_record_count` = 2000 and `records_dropped_by_source` = 2212.
- All 9 folds contain only the context "anti-leakage in-sample search". I probed every fold; none has an "out-of-sample generation" row.
- Freeze confirms it: `fold_ordering.folds[*].oos_generation_child.state` = NOT_PUBLISHED, reason `QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD`, for all 9 folds.
- On R-WFO-017 (3 trials) the same read returns 6 of 6 records, and the generation child is `audit #10`.
- Consequences:
  - S08: the trade-anatomy "child" link is stuck on "reading…" and the audit table marks no row.
  - S11: evidence-pack item 6 is MISSING, so a local seal is impossible.
  - S09 would show no θ* children.
- Owner: the QuantBT engine (2000-record audit cap, with generation rows written last), or Codex (retain generation rows first, or serve them as a separate field).

**B. `current-source/search` refuses the 400-trial run.**
- It returns 503 `RESEARCH_CURRENT_SOURCE_UNAVAILABLE` "…exceeds its bounded budget", even with `?limit=1`. The same call on R-WFO-017 returns 200.
- The report sidecar (`report.service.ts` `retainedCore`) calls `currentSource.search(scope, runId, {limit:1})`. The call fails, the best-effort sidecar swallows the error, and no report is sealed.
- `GET /report` then returns 404 `RESEARCH_REPORT_NOT_FOUND` for R-WFO-020, bobby's R-WFO-002, and the cancelled 400-trial runs R-WFO-018 and R-WFO-019.
- The library probe also found 404 on older 3-trial runs R-WFO-010…014. So the sidecar's silent failure is not only a 400-trial problem, but search-over-budget is the verified cause on the long run.
- Consequences:
  - S09 cannot render.
  - S11 item 7 is MISSING.
  - S10's "run report" link is dead.
- Owner: Codex (search budget at 400 trials; report sidecar must record its failure).

**C. The trial number differs by one between screens.**
- Progress `folds[].selection.trial` = 394.
- Freeze `frozen_selection.selected_trial_id` = "393", and S11 prints "retained trial 393".
- One read is 0-based and the other 1-based, and neither says which. Owner: Codex (one numbering, labelled).

---

## S08 Execute Replay — `/runs/rrun_3258a4c4…/execute` (R-WFO-020)

Screenshots:
- `cellsB/s08_1440_load.png` (crops `s08_1440_load_0..3`)
- stepping: `s08b_1440_{next1,fold05,fold09}.png`
- 660: `s08_660_load.png`
- 3-trial reference: `s08_017_load.png`
- bobby: `s08_bob_load.png`

Reads:
- `current-source/replay`: 205 KB
- windowed `replay?limit=168&at=…`: 317 KB
- `transitions`: 7 KB
- `child-audit?fold=N`: 52 KB (6 KB on 3 trials)
- P13 `execute/replay`: NOT_PUBLISHED, unused

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| header | provenance strip | OK | `RS02.QUANTBT-SIGNAL-NOTIONAL-WFO.V1 · ENGINE 1.1.1` | `provenance.source_adapter_id`, `engine_version` 1.1.1 | — | |
| execution contract | revision · as of | OK | `rs02_replay_a32dede7286464… · 2026-09-30 19:23Z` | `revision`; `as_of_utc_ms` 1790796223799 | — | |
| execution contract | route line | OK | `contract close_target_v2 · signal bar close · fill same close @ close · accounting certified` | `execution.route.{engine_id,signal_phase,fill_phase,fill_price_policy,accounting_certified}` | — | |
| execution contract | readiness / claim / causality | OK | `ready` · `walk_forward_oos` · `retrospective_global_calibration` | engine tokens, verbatim | — | Engine vocabulary, quoted as the engine emits it. |
| execution contract | params (HiFi "params") | UNBOUND | — (no params cell) | progress `folds[].selection.params_digest` = `aeb7bab2…` (all 9 folds) | FE | Confirms CG-FG-S08-01: the value is bindable now from progress, with no Codex join needed. |
| stitched account | 9 fold chips · bars | OK | `fold_01 · 168 bars` … `fold_09 · 96 bars` | `execution.fold_capital.segments[].bars` 168…96 | — | |
| stitched account | 9 fold chips · return | FE-LOCAL | `+1.42%`, `+0.00%`, `+0.17%`, `+0.57%`, `−0.62%`, `−0.02%`, `+0.00%`, `+0.11%`, `−0.34%` | `end_equity/start_equity−1` computed by the FE, e.g. fold 0: 20284.0139/20000 | FE (or Codex serve `return_fraction`) | All nine values are arithmetically right. Confirms FG 08-06. |
| stitched account | capital line | WRONG | `capital carry_position · continuous across folds · single stitched run` | `fold_capital.policy` `carry_position` (raw enum) | FE | Confirms D11. |
| overview strip | caption | WRONG | `2,184 bars in 156 candles of 14 bars … range 57758.6 – 82828.7` | `candle_overview.{source_bar_count 2184, emitted_bucket_count 156, bucket_bars 14, envelope.min_low 57758.6, max_high 82828.7}` | FE | The values are right; the range is ungrouped while the ledger prints `73,855.00`. Confirms D11. |
| fold strip | window / fold bars | OK | `source bars 2184 · window 745–912 of 2184 · fold bars 745–912` | `segments[0].first_ordinal` 744 / `last_ordinal` 911, shown 1-based | — | |
| fold strip | HOLDOUT | EMPTY-HONEST | `HOLDOUT not applicable` | P10 Delta WFO profile has no holdout | not fillable by design | No code is printed here; S09 prints `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT`. |
| candle pane | price axis | WRONG | `80000.00 … 58000.00` | `replay.rows[].bar.candle.*` | FE | Ungrouped. Confirms D11. |
| candle pane | position sub-pane axis | WRONG | only tick `0.00`; position is −0.0270801 | `accepted_position` "-0.0270800893642949" | FE | A 2-dp axis cannot show a 0.03-unit position; the pane reads as flat zero. |
| candle pane | x-axis @660 | 660 | end labels clipped `un` … `23:(` | — | FE | Confirms D10. |
| transport | speed default | OK (HIFI drift) | `1×` selected | — | FE | HiFi default is 4× (known FG 08-04). |
| readout | fold | WRONG | `fold 0` (chips say `fold_01`) | `fold_id` "0" | FE | Confirms 08-16. After stepping it also prints `fold 4` and `fold 8`. |
| readout | t · position · equity | OK | `2026-06-01 00:00Z · −0.0270801 · 19,999.00` | row `at_utc_ms`, `accepted_position`, `equity` 19999 | — | |
| readout | fees to here / transitions to here | OK | `1.00` / `1` | `bar.checkpoint.cumulative_fee`, `transition_count` | — | |
| readout | full-run fees | OK | `5.82` | `execution.totals.fee` 5.8233807 | — | |
| tiles | ORDERS · FILLS · TRADES | OK | `0 · 0 · 0` | `execution.counts.{orders,fills,trades}_published` 0 | — | Contradicts the "trades 19" that S01, S13 and S10 show for this run; see S13. |
| tiles | TARGET TRANSITIONS | OK | `6` | `counts.transitions` 6 | — | |
| tiles | FEES PAID | OK | `5.82` | `totals.fee` | — | |
| tiles | REJECTED ORDERS | OK | `0` | `counts.rejected_orders` 0 | — | |
| tiles | FOLD CAPITAL | WRONG | `carry_position` | `fold_capital.policy` | FE | Raw enum in the headline tile. |
| transition ledger | EVENTS | EMPTY-HONEST | `not published QUANTBT_CLOSE_TARGET_ROUTE_PUBLISHES_TRANSITIONS_NOT_AN_EVENT_TAPE` | `route_capabilities.execution_events` | QuantBT, by route design | |
| transition ledger | 6 rows | OK | e.g. #2 `2026-06-07 23:00Z exit → flat −0.0270801 → 0 63,298.50 1,714.13 0.86` | `transitions.rows` (6 = `source_transition_count`); fold 0 turnover 3714.13 = 2000 + 1714.13 | — | |
| trade anatomy | signal / target / account | OK | `bar 2026-06-01 00:00Z …`, `notional 2,000.00 at close 73,855.00 · fee 1.00 · equity 19,999.00` | transition row 1 | — | |
| trade anatomy | order / fill | EMPTY-HONEST | `not_applicable — close_target_v2 emits no order records (0 published)` | `counts.orders_published` 0 | by design | |
| trade anatomy | child | WRONG + SCALE | `reading this fold's child audit…`, permanently, on every fold (0, 1, 4, 8 tried) | child-audit read is 200; its 64 records contain no `out-of-sample generation` row | QuantBT / Codex (root A); FE | `generationOf()` returns null, and the FE shows a loading string for "absent". R-WFO-017 shows `audit #10 · out-of-sample generation · candidate 2671e27b…`. FE should print the freeze reason `QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD`. |
| child audit | caption | OK | `64 of 223 records for this fold (capped at 64) · run total 2000 · dropped by QuantBT 2212` | `source_record_count` 223, `truncated` true, `execution.child_audit.{source_record_count 2000, records_dropped_by_source 2212}` | — | The cap label is present. |
| child audit | table | SCALE | 64 rows, each wrapping to 3 lines, ≈2,950 px; page height 4,985 px vs 2,286 on R-WFO-017; DOM 2,871 vs 2,455 nodes | 64 `records`, all `anti-leakage in-sample search`, same IS window | FE (collapse), Codex (retain generation rows first) | Looks fine on 3 trials (6 rows, one marked). |
| child audit | "The marked row generated the out-of-sample bars" | WRONG | the sentence stays, but no row is marked | no generation record | FE | The copy must depend on the row being present. |
| trade blotter | TRADES | EMPTY-HONEST | `not published QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS` | `route_capabilities.trades` | QuantBT, by route design | |
| MAE × MFE | card | EMPTY-HONEST | `not published QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS` | `route_capabilities.mae_mfe` | by design | |
| PnL distribution (HiFi) | card | NO-API | card not drawn, and no typed absence | no trade records; no field | QuantBT (route) / FE absence card | Confirms 08-09. |
| validation — nautilus parity (HiFi) | card | NO-API | card not drawn | no field in `route_capabilities` or `execution` | QuantBT / Codex | Not on the B1 list. |
| cost timeline | this window | OK | `2 charged bars · fee 1.86` (fold_05: `0 … 0.00`; fold_09: `1 charged bars · fee 0.98`) | `segments[n].fee` 1.8571 / 0 / 0.9771 | — | "1 charged bars" is a plural bug. |
| cost timeline | full run | OK | `fee 5.82 · notional 11,646.76` | `totals.{fee, turnover 11646.7614}` | — | |
| cost timeline | FUNDING | EMPTY-HONEST | `not applicable QUANTBT_RUN_CONFIG_USE_FUNDING_FALSE` | `route_capabilities.funding` | by design | |
| cost timeline | fee rate | WRONG | `Fee rate 0.0005 one way, slippage 0 bps` | `route.fee_rate_oneway` "0.0005" | FE | Raw fraction beside "bps". Confirms 08-07. |
| route-aware facts | 6 rows | EMPTY-HONEST | ORDERS / FILLS / PARTIAL FILLS / OCO / SL/TP / MULTI-LEG with codes | `route_capabilities.*` codes match 1:1 | by design | |
| a11y data table | retained bars | OK | sr-only, raw floats (labelled "exact values") | rows | — | At 660 it measures 697 px but is visually hidden, so this is not a break. |
| stepping | next window / fold_05 / fold_09 | OK | loads `cursor=` / `at=` windows; `bar 1/96 · source bar 2089` | `segments[8].bars` 96, `first_ordinal` 2088 | — | One read per step; child audit is re-read per fold (64 rows each time). |

---

## S09 Run Report — `/runs/rrun_3258a4c4…/report`

Screenshots:
- `cellsB/s09_1440_load.png`, `s09_660_load.png`
- print, Letter: `s09_print_letter_WFO020.png`, `s09_1440_letter.pdf` (1 page)
- 3-trial reference: `s09_017_load.png`, `s09p_017_letter.pdf` (5 pages), `s09_print_letter_WFO017.png`

The only read is `GET /api/v1/quantbt/runs/rrun_3258a4c4…/report`, which returns 404 `{"code":"RESEARCH_REPORT_NOT_FOUND"}` (root B). Bobby's R-WFO-002 gets the same 404.

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| crumb / title | run label | WRONG | `rrun_3258a4c4` (crumb and sheet title) | display_label `R-WFO-020` is served by library, progress and RC | FE | The title falls back to the id when the report read fails. |
| header | CERTIFICATION box | WRONG | `not published · not a field of the report contract` | there is no report at all | FE | Asserts a property of a report that does not exist. |
| body | RUN REPORT state | WRONG | `DENIED — You don't have access to this in your current workspace, or it doesn't exist.` | 404 `RESEARCH_REPORT_NOT_FOUND`; the user is ADMIN of this workspace, and every other read of this run is 200; S11 names the true state `P21_RETAINED_REPORT_NOT_SEALED` | FE copy; Codex (serve a typed "not sealed" instead of the 404 conflation, for own-workspace runs) | The person is told they lack access; the truth is that the report was never sealed. |
| every HiFi block (passport, identity, 7 headline tiles, metrics, equity, per-fold verdict, cert chain, artifacts, final audit, warnings, promotion, provenance, exports) | — | NO-API | not rendered | no report row (root B) | Codex | 400-trial runs cannot have a report until search fits its budget. |
| print (Letter) | sheet | WRONG | 1 page: masthead `QuantBT Run Report rrun_3258a4c4` plus the certification box; the DENIED body is hidden by print CSS | — | FE | The printout looks like an empty report instead of saying none exists. |

**Reference: R-WFO-017 (3 trials), where the report exists.** These show what 400 trials would have to render, and they confirm or deny the known list:

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| meta | revision line | WRONG | `… research.report-presentation.v1 · source profile RS02_RETAINED_CURRENT_SOURCE` | `presentation_revision`, lane | FE | Confirms 09-02. |
| headline | OOS SHARPE | WRONG | `-5.355` (hyphen-minus; other units print `−`) | `frozen_core` metric −5.355 | FE | Confirms "minus". The metric is a fold mean; D-AN-01 wants all-time (AN-01). |
| headline | WIN RATE / FUNDING | EMPTY-HONEST | `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS` / `RS02_SUMMARY_PUBLISHES_NO_FUNDING_TOTAL` | — | D-AN-01 Portal analytics (AN-14) / by design | |
| metrics grid | 7 rows | NO-API | no Sharpe (all-time), Sortino, CAGR, PF or vol | `metrics[]` 7 fixed rows | D-AN-01 Portal analytics (AN-20) | Confirms AN-20. |
| equity | fold marks / legend | WRONG | marks `0`, `1`; legend `IS account` while absences say `in sample account — not published` | — | FE | Confirms 09-03 and D8. |
| source absences | rolling sharpe | WRONG | `rolling sharpe — not published · RS02_RETAINED_LANE_HAS_NO_DAILY_RETURN_SERIES` | server absence row | Codex / FE | D-AN-01 drops rolling views; this is now a stale absence. **Not on the known lists.** |
| provenance | evidence link | WRONG | `/research/quantbt/runs/rrun_17f76212/report?…` (short id) | — | FE | Confirms D2. |
| print | Letter | OK | 5 pages, clean sheet | — | — | G5b receipt for R-WFO-017. The 400-trial run cannot be printed (see above). |

---

## S10 Attempt Lineage — `/research/quantbt/alphas/delta-rsi-polynomial-alpha/lineage`

Screenshots:
- `cellsB/s10_1440_load.png`
- probes shown, R-WFO-020 selected: `s10b_1440_probes.png`, `s10b_1440_sel020.png` (crops `s10_sel_0/1`)
- 660: `s10_660_load.png`
- bobby: `s10_bob_load.png`

Read: `lineage?limit=128`, 132 KB, 39 attempts. Attempt-level only; 400 trials do not change this screen's size.

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| root card | alpha / av_ | OK | `Delta-RSI Polynomial Alpha · av_1_0_0 · ACTIVE · 34dc1847` | `alpha`, version lifecycle ACTIVE | — | |
| root card | attempts chip | OK | `ratt_9c3f2081 · +38 probes` | `counts.storied_returned` 1, `probe_returned` 38 | — | |
| root card | exercised / untried | OK | route, mode, 8 param ranges, `39 attempts read`; 11 untried routes | attempts' spec, atlas routes | — | |
| promotion pick | card | EMPTY-HONEST | `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK` | attempts[].promotion_reason_code | Codex B1#10 / P22 | |
| tree (default) | visible rows | WRONG | `showing 1 of 39`: only R-P04-001 (FAILED); R-WFO-020 is hidden under "show 38 probe attempts" | R-WFO-020 `presentation_kind` PROBE, `presentation_reasons` [] | Codex (why is a completed 400-trial study a probe?) / Bobby (D3 walk b) | The default view shows one failed attempt and none of the completed runs. |
| tree | status chip | WRONG | `ACTIVE` on all 39 nodes: 19 FAILED, 2 CANCELLED (R-WFO-018/019), 18 READY | `attempts[].state` FAILED / CANCELLED / READY; the chip comes from version lifecycle | FE (`LineageDetail.tsx:200-210`); Codex `lineage_status` | Confirms CG-FG-S10-02 and extends it: CANCELLED also reads ACTIVE. |
| tree | node label | WRONG | `ratt_3258a4c4 · rrun_3258a4c4` | `primary_run.display_label` `R-WFO-020` | FE | Confirms FG 10-11. |
| selected attempt | state | OK | `ready` | `state` READY | — | |
| selected attempt | claim | OK | `not issued` + source sentence | `run_facts.claim` | — | |
| selected attempt | OOS sharpe / decay | OK | `1.362 (selected trial, mean of folds)` / `3.587 …` | `run_facts.oos_sharpe` 1.3615, `decay` 3.5868, scope `SELECTED_TRIAL_MEAN_ACROSS_FOLDS` | — | The scope is labelled. D-AN-01 all-time Sharpe (AN-01) is not served. |
| selected attempt | cert | EMPTY-HONEST | `SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` | `run_facts.certificate` | QuantBT | |
| selected attempt | exposure | EMPTY-HONEST | `P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT` | `exposure.availability` | not on the Codex list (ask) | |
| selected attempt | `run report` button | WRONG | live link | report 404 (root B) | FE / Codex | Opens the DENIED page. |
| promotion rule | tally | FE-LOCAL | `awaiting a published pick 18 · promotion closed 21` | counted in the browser from `attempts[].promotion_state` | Codex (serve in `counts`) | The numbers are right: 18 READY; 19 failed + 2 cancelled = 21. |
| counts | 10 counters | OK | 39 / 39 / 0 / 39 / 19 / 0 / 0 / 0 / 1 / 38 | `counts.*`, all equal | — | The two CANCELLED attempts appear in no counter. |
| counts | coverage | OK | `COMPLETE · oldest 2026-09-23 11:28Z` | `coverage` | — | |
| layout | 1440 / 660 | OK | no overflow; 39 rows = 2,406 px, 952 nodes | — | — | Tree order is oldest-first, so R-WFO-020 is the last row. |

Bobby: 16 attempts, the same pattern (a FAILED storied node, 15 probes).

---

## S11 Release Candidate — `/runs/rrun_3258a4c4…/release-candidate` (nothing sealed or published)

Screenshots:
- `cellsB/s11_1440_load.png`
- 660: `s11_660_load.png` (crop `s11_660_a`)
- 3-trial reference: `s11_017_load.png`
- bobby: `s11_bob_load.png`

Read: `release-candidate`, 18 KB.

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| header | state / as of / source | OK | `DRAFT · 19:40Z · source cad7ef1e · draft not saved yet` | `state` DRAFT, `source_fingerprint` | — | |
| rail | alpha → av_ → run | OK | `delta-rsi-polynomial-alpha → av_… sha256:34dc1847d051 → R-WFO-020 ratt_3258a4c4` | `rail[]` | — | |
| rail | SELECTED PARAMS | WRONG (cross-screen) | `aeb7bab2 · retained trial 393 · global` | freeze `selected_trial_id` "393"; progress `folds[].selection.trial` 394 | Codex (root C) | |
| rail | rc_ | OK | `rc_(draft) assigned on local seal` | `P21_ASSIGNED_ON_LOCAL_SEAL` | — | |
| taxonomy | last published RC + 4 rows | EMPTY-HONEST | `UNSET`, `P22_NO_PUBLISHED_PREDECESSOR` | `taxonomy`, `published_comparison` | by design (first RC) | |
| gate verdict | title | OK | `local seal blocked — review evidence` | `gate_verdict.title` | — | |
| pack header | claim ceiling / engine cert | EMPTY-HONEST | `not published` ×2 | `P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED`, `P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED` | QuantBT | The codes are not printed on the chips. |
| pack header | counts | OK | `6 COMPLETE · 2 DEGRADED · 2 INPUT · 2 MISSING` | `pack_counts` | — | R-WFO-017 has 8 / 2 / 2 / 0. |
| pack | items 1, 2, 3, 5, 8, 11 | OK | COMPLETE + full 64-hex digests | `pack[].digest` | — | Full hex, as in known 11-10. |
| pack | item 4 methodology, item 9 robustness | EMPTY-HONEST | DEGRADED `P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED`, `P21_SOURCE_DEGRADED_EVIDENCE` | pack | QuantBT | |
| pack | item 6 final audit replay | EMPTY-HONEST · SCALE | MISSING `P21_FINAL_AUDIT_RUN_NOT_PUBLISHED` | pack item 6 | QuantBT / Codex (root A) | COMPLETE on R-WFO-017 ("2/2 folds … generation child … MATCH"). **Every 400-trial run is unsealable.** |
| pack | item 7 metrics semantics | EMPTY-HONEST · SCALE | MISSING `P21_RETAINED_REPORT_NOT_SEALED` | pack item 7 | Codex (root B) | COMPLETE on R-WFO-017. |
| pack | items 10 / 12 INPUT | OK | `— not declared · edit` | pack | researcher | Edit was not clicked. |
| record preview | 16 YAML keys | OK | e.g. `parameter_bundle_digest aeb7bab2…`, `report_revision null # P21_REPORT_REVISION_NOT_PUBLISHED` | `yaml` | — | |
| local seal | action | OK | `resolve MISSING rows first · P21_REQUIRED_EVIDENCE_MISSING` | `local_seal` | — | |
| publish | action | OK | `publish blocked · P22_LOCAL_SEAL_REQUIRED` | `actions` | — | |
| inbox mirror | ghost row | EMPTY-HONEST | `status not published · assignee pool: not published · conditions: not published` | `mirror` | P22 | |
| layout @660 | pack table | 660 | table 993 px in 660 px; digests clipped right; rows 90–220 px tall and mostly empty | — | FE | Confirms D10 walk. The record-preview digest span also overflows (745 px). |

---

## S12 Engine Atlas — `/research/quantbt/atlas`

Screenshots:
- `cellsB/s12_1440_load.png`
- tabs: `s12b_1440_routes.png`, `s12b_1440_claims.png`
- 660: `s12_660_load.png`
- bobby: `s12_bob_load.png`

Read: `atlas`, 116 KB. Release-level, so the run is irrelevant; the screen is identical for both workspaces.

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| header | release / history | OK | `CURRENT · er_quantbt_111 · quantbt-engine 1.1.1 · 1.0.8 — retained history` | `current_release`, `historical_releases[0]` | — | Clicking the 1.0.8 chip sent no request; the historical view was not verified. |
| header | release block width | 660/1440 | block right edge at 1443 px in a 1440 viewport | — | FE | Confirms FG 12-02 (3 px). |
| rules one / two | copy | OK | static | — | — | |
| mode cards ×5 | name / cert cap | EMPTY-HONEST | `cert cap not published` | `facts.schedules[].cert_cap` NOT_PUBLISHED | not fillable by design | QuantBT certifies routes, not modes. The reason sentence is served but not on the card. |
| mode cards | WHAT IT READS | OK (HIFI drift) | text chips | `artifact_fields` | FE | Known 7_root glyph strip. |
| mode cards | objective + terms + weights | OK | e.g. `decay_lambda 0.5 · decay_gamma 0.5 · candidate_decay_lambda unset` | `objective_summary` | — | |
| mode cards | schedule → claim | OK | `not_causal_multi_fold_global_calibration · walk_forward_oos · OOS: retrospective` | `facts.schedules[]` | — | |
| when-to-use | 5 rows | OK | verbatim | `when_to_use` | — | |
| when-to-use | AVOID WHEN | EMPTY-HONEST | `NOT PUBLISHED QuantBT 1.1.1 publishes no avoid-when guidance` | — | QuantBT | |
| routes tab | 11 rows | OK | status, family, contract, backend, report levels | `routes[]` | — | |
| claims tab | 7 contracts | OK | engine cert L1–L4, guarantee, never-claims | `claims[]` | — | No sideways scroll at 1440 on this read. |
| release facts | `trial_ceiling 4000`, optimizer default `n_trials 300` | UNBOUND | not shown | `current_release.trial_ceiling`, `optimizer_defaults` | FE (optional) | Useful next to a 400-trial run; no HiFi block asks for it. |
| layout @660 | — | OK | no overflow | — | — | |

---

## S13 Compare — `/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare`

Screenshots:
- attempts: `cellsB/s13_1440_load.png` (crops `s13_0/1`)
- 660: `s13_660_load.png`
- pair with R-WFO-017: `s13p_017_load.png`
- pair with R-P04-018: `s13p_p04_load.png`
- markets: `s13m_load.png`
- bobby: `s13_bob_load.png`

Read: `compare?mode=attempts`, 165 KB. The UI does allow comparing R-WFO-020 with R-WFO-017 and with R-P04-018 (pair mode, `?mode=pair&runs=A,B`).

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| header | revision / coverage | OK | `p20r1_17bea6bc · COMPLETE · 39 attempts` | `revision`, `coverage` | — | |
| header | claim family | EMPTY-HONEST | `P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED` | — | Codex B3#3 | |
| ladder | card count | SCALE | `16 with a claim · 39 returned` in 4 rows of 4; the HiFi ladder has 4 cards | `attempts` | Bobby (VD-FG-04-01) | Confirms ">12 density". |
| ladder | OOS Sharpe R-WFO-020 | OK | `1.362` | `original_metrics.OOS_SHARPE` 1.3615, scope `RS02_OOS_MEAN_OF_FOLDS` | — | D-AN-01 all-time Sharpe (AN-01) is not served; the ranking number is a fold mean over −11.03…18.16. |
| ladder | OOS Sharpe P04 R-P04-013…019 | OK | `0.744` | v3 value | — | **AN-22 / B1#5 look delivered:** P04 now matches the Library 0.744. Only R-P04-006 is still `P20_P13_OOS_SHARPE_NOT_AVAILABLE` (EMPTY-HONEST, an older run). |
| ladder | chip | WRONG | `ACTIVE` on all 16 cards | `alpha_version_lifecycle.value` ACTIVE (version, not attempt) | FE | The same defect as S10. |
| ladder | connectors | WRONG | `claim ↑ →` ×15, between cards that all have `rank 3` | `claim.rank` 3 on all | FE / Bobby wording | Confirms the S13 equal-claim finding. |
| ladder | cert | EMPTY-HONEST | `P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE` | `certification` | Codex B1#6 | |
| ladder | rc link | WRONG | bare `rc_` | `release_candidate` null | FE | Confirms 13-04. |
| per-fold chart | caption | OK | `10 attempts · 9 folds` | `fold_series` | — | |
| per-fold chart | R-WFO-020 series | OK | extremes 18.162 / −11.030 | `fold_series[].folds[].oos_sharpe` (fold 3 18.1621, fold 8 −11.0303) | — | |
| per-fold chart | zero folds | WRONG (plausible) | folds 2, 6 and 7 plotted at `0` | `oos_sharpe` "0" for folds 1, 5, 6 | QuantBT | The engine's zero-variance sentinel. Fold 5 held a position and paid a fee, so 0 is not an observed Sharpe. |
| per-fold chart | readability | SCALE | 7 of 10 series are identical 2-fold lines drawn on top of each other; 3 legend colours are near-identical greys; the 9-fold run stretches the axis so the 2-fold runs use 1/8 of the width | — | FE | Looked fine with 2-fold runs only. |
| per-fold chart | axis | OK (HIFI drift) | `fold 1 / fold 5 / fold 9` | — | FE | Known 13-06. |
| config diff | table | SCALE | 16 columns; table 1,831 px in a 1440 viewport (1,583 px at 660); about 6 columns visible; no "N of M" cap | `config_diff` | FE | Confirms 8_sweep S13. |
| config diff | baseline | FE-LOCAL + WRONG | `gold = differs from ACTIVE ratt_8d756a95` (R-P04-006) | no active attempt in the API; FE picks the first run whose version is ACTIVE (`CompareDetail.tsx:1270`) | FE / Codex | Every column is judged against an arbitrary P04 run. **Not on the known lists.** |
| trajectory | label | WRONG | `P20_ATTEMPT_TRAJECTORY_V1` | `trajectory` | FE | Known. |
| pair A=R-WFO-020 / B=R-WFO-017 | key match | OK | `BTCUSDT 1h signal_notional advanced` | `comparison_contract_key` | — | |
| pair | overlay | OK | `RETENTION_STRIDE_V1 · emitted 169 of 336` | overlay sampling | — | The raw sampling token is shown. |
| pair | OOS sharpe row | OK | `1.362 / -5.355`, Δ n/a `P20_COMMON_WINDOW_SHARPE_NEEDS_SOURCE_ANNUALIZATION` | `original_metrics`; `metrics[OOS_SHARPE]` NOT_APPLICABLE | D-AN-01 Portal analytics (AN-23) | The Δ absence is fillable under D-AN-01. |
| pair | "total return (OOS)" | WRONG | `−0.79% / −0.37% / +0.42%` | `metrics[NET_RETURN_FRACTION]` definition `common-window-net-return` (2026-07-01→07-14); A's OOS/original return is `+1.28%` (`original_metrics` 0.01279) | FE (label per row) | A common-window number is labelled "(OOS)" in the same table as full-run rows. |
| pair | max drawdown | WRONG | `−0.80%` (pair) vs `maxdd −1.07%` in markets mode, for the same run | common-window MDD −0.00796 vs `original_metrics` −0.01066 | FE | Two different values, both labelled "max drawdown", with no scope. |
| pair | trades | WRONG (cross-screen) | `19 / 10 · sum of folds` | `original_metrics.TRADE_COUNT` 19 (`RS02_OOS_SUM_OF_FOLDS`) | Codex (definition) / FE label | S08 says QuantBT emitted **0 trade records** and 6 transitions for this run. |
| pair | win rate | EMPTY-HONEST | `P20_SOURCE_PUBLISHES_NO_AUDITED_ROUND_TRIPS_FOR_WIN_RATE` | — | D-AN-01 (AN-14) | |
| pair | correlation | OK | `ρ = 0.17 · n 336 · INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL` | `correlation` (PORTAL_DERIVED) | — | |
| pair | weaker claim / spec diffs | OK | `WALK_FORWARD_OOS_COMPATIBILITY` / none | — | — | |
| pair A=R-WFO-020 / B=R-P04-018 | refusal | OK | `CONTRACT KEY MISMATCH P20_CONTRACT_KEY_MISMATCH` (advanced vs three_window_decay) | — | by design | |
| pair (mismatch) | labels | WRONG | `A rrun_3258a4c4 · B rrun_464bf9c3` | `runs[].display_label` R-WFO-020 / R-P04-018 | FE | |
| markets | single card | OK | `R-WFO-020 · 1 of 39 runs on this market · sharpe 1.362 · maxdd −1.07% · EXTREMA_BUCKET_V1 191 of 2184` | `original_metrics` | — | |

Bobby: 16 attempts, 11 with a claim; same defects.

---

## S14 Alpha Import — `/research/quantbt/alpha-import` (read-only; nothing parsed or registered)

Screenshots: `cellsB/s14_1440_load.png`, step 3 `s14b_step3.png`, 660 `s14_660_load.png`, bobby `s14_bob_load.png`. Read: `research/alphas`, 6 KB, 3 entries. This screen is not tied to a run, and bobby's is identical.

| block | cell | class | screen value | API field / value | owner | note |
|---|---|---|---|---|---|---|
| header | endpoint line | OK | `POST /api/v1/research/alphas/import/* · workspace members · activation ADMIN-only` | — | — | |
| stepper | 3 steps | OK | `Source & mirror / Quarantine gates / Register av_` (sr-only ", not done") | — | — | Keyboard issue known (14-04). |
| contract mirror | table | EMPTY-HONEST | `EMPTY No source has been parsed yet.` | no parse | by design (state) | |
| drop / paste | controls | OK | Parse disabled until input | — | — | Not exercised (write-adjacent). |
| registration (step 3) | panel | EMPTY-HONEST | `Registration opens once all seven gates pass.` | — | by design | |
| where it goes next | `new run with this av_ →` | WRONG | link shown while nothing is registered | — | FE | |
| where it goes next | OL-01 copy | WRONG | `Not admitted yet (OL-01)…` | registry entries carry no `run_admission` | FE / Codex B1#12 | Confirms CG-FG-S14-03. |
| registry | 3 chips | OK | `s14-ui-receipt av_0_1_0 ACTIVE rev 2 2026-09-30 07:16 UTC`, `s14-api-receipt …`, `Delta-RSI Polynomial Alpha av_1_0_0 ACTIVE rev 2 2026-09-23 10:57 UTC` | `entries[].{version_label, lifecycle_state, alpha_revision, registered_at_utc_ms}` | — | No total/cap, which is fine at 3 (B3#12). `import_attestation` is served but not on the chip. |
| layout @660 | — | OK | no overflow | — | — | |

---

## Counts (all tables above, both runs)

| class | count |
|---|---|
| OK | 68 |
| EMPTY-HONEST | 24 |
| WRONG | 35 |
| NO-API | 4 |
| SCALE | 7 |
| FE-LOCAL | 3 |
| UNBOUND | 2 |
| 660 layout | 3 |

- Rows with two classes are counted once under each: S08 child link (WRONG + SCALE), S11 items 6/7 (EMPTY-HONEST + SCALE), S13 diff baseline (FE-LOCAL + WRONG).
- The S09 "every HiFi block" NO-API row stands for 14 blocks that cannot render.

## Worst issues

1. **A 400-trial run can never be sealed or reported.**
   - QuantBT's 2000-record child audit drops every out-of-sample-generation record: 2212 dropped, generation rows written last.
   - `current-source/search` returns 503 over budget, so the report sidecar never seals.
   - Result: S11 has 2 MISSING rows and the local seal is blocked; S09 is 404.
   - Owner: QuantBT / Codex.
2. **S09 says "DENIED — you don't have access"** for the user's own run when the truth is "report not sealed".
   - Its print is a blank report sheet.
   - The crumb and title show the `rrun_` id.
3. **S08 trade anatomy is stuck on "reading this fold's child audit…"** forever.
   - The child-audit card promises a "marked row" that is not there.
   - The table grows to ≈2,950 px of identical in-sample rows.
   - On the 3-trial run everything is fine.
4. **The same run carries contradictory numbers across screens.**
   - Trades: S08 says 0 trade records and 6 transitions; S13 and the Library say "trades 19".
   - Selected trial: 394 on progress, 393 on freeze and S11.
   - Return: S13 labels a common-window −0.79% as "total return (OOS)" while the run's return is +1.28%.
   - Max drawdown: −0.80% vs −1.07%, both unlabelled for scope.
5. **Status is invented from version lifecycle on S10 and S13.**
   - FAILED, CANCELLED and READY attempts all read `ACTIVE`.
   - S13's diff baseline "ACTIVE ratt_8d756a95" is an arbitrary P04 run.
   - S10's default view hides every completed run (R-WFO-020 is a "probe") and shows one FAILED attempt.
6. **Known list, corrections from this data.**
   - AN-22 / B1#5 (S13 P04 OOS Sharpe) is now delivered for R-P04-013…019. Only R-P04-006 is still absent.
   - CG-FG-S08-01 needs no Codex work: `params_digest` is served in progress.
   - New items not on B1/A5:
     - S09 stale "rolling sharpe" absence (D-AN-01);
     - S13 arbitrary diff baseline;
     - S13 mixed-scope metric table;
     - S08 missing nautilus-parity card (NO-API);
     - S12 `trial_ceiling` unshown;
     - S13 per-fold 0-Sharpe sentinel.
