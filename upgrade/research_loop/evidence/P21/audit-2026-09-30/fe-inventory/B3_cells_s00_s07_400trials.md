# Cell audit S00–S07 on the 400-trial WFO runs (2026-09-30, read-only)

**Runs audited**
- Main run: claude-preview **R-WFO-020** `rrun_3258a4c4…`.
- Spot-check: bobby **R-WFO-002** `rrun_d61c000d…`.
- Comparison runs: 3-trial R-WFO-017 `rrun_17f76212…` and P04 R-P04-018.

**How it was captured**
- Playwright on `https://research-portal.primusspark.com` (claude-preview auto-login) and on `localhost:8095` (bobby, logged in through the API).
- Every `/api/` response was captured per page and compared with the screen text (`innerText`).
- Widths 1440 and 660.
- Nothing was pressed: no preflight, create, evaluate or verify.

**Where the evidence is**
- Screenshots: `cellsA/<screen>_<user>_<width>.png`; the 3-trial run has the suffix `_17f76212`; there are also crops and `S07_whatif_claude_1440.png`.
- Raw API and text dumps: `api/<user>_<width>/<screen>.{api.json,text.txt}`, plus `api/fetch*.json` and `api/S02_steps_claude_1440.txt`.

**Tree read:** `portal-research-fe` HEAD `8c50e5a1`.

**Bobby spot-check:** the outcome is identical on every screen. Only labels, digests and timestamps differ, because the seed is the same. Real differences are marked **[bobby]**.

**Classes:**
- **OK**
- **EMPTY-HONEST (EH)**
- **WRONG (W)**
- **NO-API (NA)**
- **SCALE (SC)**
- **FE-LOCAL (FL)**

**Owner shorthand:**
- `B1#n`, `B3#n` = rows of `CODEX_BACKEND_GAPS_2026-09-30.md`.
- `AN-nn` = D-AN-01 / BR-AN-01.
- `QB` = QuantBT engine.
- `FE` = Claude frontend.
- `NEW` = a gap not in either open list.

**Load time.** Time from `goto` to network idle at 1440 was 0.95–1.9 s on every screen. The slowest were S04 at 1.67 s and S04 execute at 1.59 s.

**DOM size (at 1440)**

| Screen | DOM nodes | Page height | Cause |
|---|---|---|---|
| S04 summary | 5,179 | 3,202 px | 955-row screen-reader equity table |
| S04 execute | 3,028 | — | — |
| S01 | 2,728 | 5,185 px | 39 cards |

Every other screen has fewer than 1,600 nodes.

---

## Worst issues (ranked)

1. **S06 is dead on any 400-trial run** (SCALE, NEW, Codex).
   - What fails: `GET /current-source/search` returns **503** `RESEARCH_CURRENT_SOURCE_UNAVAILABLE` ("incompatible or exceeds its bounded budget"). The response is 187 B and it fails on both workspaces and with `?fold=`. The 3-trial R-WFO-017 returns 200 with 31 KB.
   - Likely cause: `8c376879` raised `CURRENT_SOURCE_MAXIMUM_TRIAL_ROWS` to 400. It left `diagnostics.probe.objective_rows/objective_rows_recomposed ≤ 128` (`current-source.contract.ts:815-816`) and the candidate arrays `≤ 64` in place. The zod `valid()` then fails (`current-source.service.ts:1421`).
   - Knock-on:
     - Every panel from A1 to A6, B1 to B4, the ledger and the surface is "not published".
     - S05 "θ* parameters" and the S04 Search tab fall with it.
     - The trial ledger, paging and surface charts **cannot be tested at 400 rows**.
2. **S06 fallback states false things** (WRONG, FE).
   - It falls back to the legacy `/search?fold=1` read and prints `P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED`, a P04 code, on a WFO run.
   - It prints "mode not published / schedule not published" although mode_1_decay × global is served by 4 other reads.
   - It prints "**POOL FREEZE · NONE — NO SEARCH RAN**" although 400 trials ran.
   - The hub tab strip says "S2 SEARCH · DONE · fold 1" above that body.
3. **S02 `?from=` silently turns a 400-trial run into a 1-trial draft** (WRONG, FE + Codex `B3#14`).
   - Optimization shows `Optuna trials = 1`, and the review shows "1 · none · 42". The source is `requested_spec.optuna_trials = 400`.
   - The panel "current submission profile · P10.FIXED-QUALIFICATION.V1 · trials 1 · random seed MUST_BE_NULL" contradicts:
     - the seed 42 shown next to it;
     - the source run's `execution_profile_id = p10.delta-signal-notional-wfo.v1`.
   - The atlas `submission_constraints` is stale.
   - The FE fills `accepted_trial_count` into the draft (`NewRunRoute.tsx:342-347`), and the copied 400 does not survive it.
4. **S02 `?from=` walk-forward date inputs are blank** (WRONG, FE, NEW).
   - The inputs are `datetime-local`, and the draft value is `2026-05-01T00:00:00Z` (with the Z), so the browser drops it. The same happens to `First OOS`.
   - The copy says "The outer bounds here hold your own values, so nothing was prefilled", while the Review rail prints `2026-05-01T00:00:00Z → 2026-07-31T00:00:00Z`.
   - The first OOS `2026-06-01` (`split_mode`) is shown nowhere.
5. **θ* identity and objective disagree across screens** (WRONG, NEW, Codex + FE).

   | Screen | Trial | Objective shown |
   |---|---|---|
   | S03, S04 cursor | trial **394** (`progress.folds[].selection.trial`, 1-based) | "best J₁ 4.948" (tqdm and console, IS objective) |
   | S03 fold rows | — | "global best J₁ **−4.797**" (`selection.objective`) |
   | S07 | trial **393** (`frozen_selection.selected_trial_id`, 0-based) | "objective −4.797" |
   | S07 what-if | — | "J₁ 4.948278702312006 · base 4.948…" (`what_if.grid.base_objective`, `objective_kind MODE_1_DECAY_J`) |

   Two numbers of opposite sign, both labelled J₁ or "best", stand for the same θ*. The screens never name which is the IS objective and which is the Mode-1 J.
6. **"Stitched OOS" series include 744 pre-OOS bars** (WRONG scope, Codex series projection, NEW).
   - Affected: the S04 return distribution (buckets sum to 2,184; the 1,759 zero bucket is inflated by the flat May bars), the rolling-20 series (2,164 obs, flat from 05-01) and the S01 sparkline (`first_at_utc_ms = 2026-05-01`, "of 2184 pts").
   - The true OOS count is **1,440** (`summary_analytics.oos_observation_count`, `split.stitch.observation_count`).
   - The S04 equity chart does shade "before the first OOS window", so only its title is off.
7. **S04 Claim tab "declared source absences" reads the wrong lane** (WRONG, FE).
   - It lists `benchmark, funding, audited_fills, per_fold_metrics — not published` from the legacy hub `/evidence.source_absences`, all coded `P13_SOURCE_EVIDENCE_NOT_PUBLISHED`.
   - The current-source lane publishes per-fold metrics; they are drawn on the Summary tab of the same hub. The current-source absences (`route_ledger`, `in_sample_account`, `rolling_sharpe`) are not listed.
8. **S07 F4 "sealed params digest 2944fed1ec99eb9d3940c1b7"** is the QuantBT candidate id (`stage4_binding.rows[0].value`, identity rule `…CANDIDATE_ID_V1`). The real params digest `aeb7bab2…` (`stage4_binding.sealed_params_sha256`) sits in F3 on the same screen. So the page shows two different "params digest" values (WRONG, Codex row label + FE).
9. **S00 "13 · Alpha version" still says PICK A RUN / "pick a run →"** although the descriptor now serves `requires_alpha: true, requires_run: false`. `B1#3` is delivered and the FE is unbound. The Compare card is the reverse case: it is served with `requires_run: true` and shows no run pick (WRONG / FL, FE).
10. **Shell "Runs (1)" on both workspaces** comes from the legacy `/api/runs`: one ETHUSDT legacy row, not workspace-scoped. The Run Library shows 39 (claude) or 17 (bobby). **[bobby]** The same legacy row shows "recorded QUEUED" in the Library while `/api/runs` says `COMPLETED` (WRONG, Codex `B1#13` neighbourhood, NEW).

---

## S00 Journey (`/research/quantbt`)

`GET /api/v1/research/journey` (descriptor rev 4, sha `376acce5…`).

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Header | module title / "REAL" / subtitle | OK | QuantBT Backtest · REAL | registry | — | — |
| Header | chip | OK | delta-rsi-polynomial-alpha | `/api/strategies[0].strategy_id` | — | — |
| Header | "Runs (1)" button | W | Runs (1) | `/api/runs` = 1 legacy row (ETHUSDT, `527d2b99`); Library `page.total_rows` = 39 | Codex `B1#13` / FE | Legacy endpoint is not workspace-scoped; the count contradicts S01 |
| Title block | kicker, title, subtitle | W (HIFI) | "QuantBT Backtest — journey map" | — | FE | 00-1a…d confirmed |
| Legend | swatches | W (HIFI) | 3 swatches SHIPPED/REDESIGN/EXECUTION on the left | — | FE | HiFi has 2 on the right |
| Descriptor | revision + digest footnote | OK | descriptor revision 4 · quantbt_journey · 376acce5… | `descriptor.revision`, `content_sha256` | — | — |
| P1–P8 | 28 cards: title, description, target_kind badge | OK | all 28 match | `phases[].cards[].{title,description,target_kind}` | — | — |
| P2 | 13 · Alpha version | **W** | PICK A RUN · "pick a run →" | `requires_alpha: true, requires_run: false` | FE (`B1#3` delivered) | `screenRoutes.ts` still forces a run |
| P6 | Compare | FL | REDESIGN, link `/research/quantbt/compare`, no run pick | `requires_run: true` | FE | Route table decides, not the served flag (2_wiring S00 confirmed) |
| P6 | Engine Atlas | OK | REDESIGN, `/research/quantbt/atlas` | `requires_run: false` | — | — |
| P5–P7 | run-scoped cards | OK | PICK A RUN | `requires_run: true` | — | — |
| P7–P8 | Paper Trading, Approval Inbox, Gates, Paper/Sandbox | EH | BLOCKED, printed twice (badge + foot) | `availability: DEPENDENCY_REQUIRED` | not fillable by design | Duplicate "BLOCKED" word per card |
| Mapping | 6 rows | W | 07 · OVERVIEW → Evidence Flow · Summary "adds … **rolling Sharpe & beta** …" | `descriptor.mapping[0].adds` | Codex (descriptor copy) per D-AN-01 | Stale under D-AN-01 (rolling dropped). Rows are not links (0 `<a>`), 00-8 confirmed |
| 1440 / 660 | layout | OK | no horizontal scroll at 660 (h 3,036 px) | — | — | — |

## S01 Run Library (`/research/quantbt/runs`)

`GET /api/v1/quantbt/runs?limit=50` (131 KB, 39 rows) plus lazy `/sparkline` for each card in view. All 18 sparklines loaded after scrolling.

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Header | title, links | OK / W | "lineage ↗ select an alpha group below" is a hint, not a link | — | FE | 01-1 confirmed |
| Filters | status / mode / alpha chips | OK | mode_1_decay · Delta-RSI Polynomial Alpha | `filter_catalog` | — | — |
| Counters | runs line | OK | 39 runs · 18 completed · 19 failed · 2 cancelled | `status_counts` | — | — |
| Claim ledger | bar + text | OK | 0 issued · 18 not issued · 19 failed · 2 cancelled | `claim_ledger` | — | — |
| Card R-WFO-020 | id / status / mode / binding / instrument | OK | R-WFO-020 · COMPLETED · mode_1_decay · global · …av_1_0_0 · BTCUSDT · 1h | `display_label`, `status`, `mode.display`, `binding.av`, `instrument.display` | — | — |
| Card | created | OK | 2026-09-30 19:22Z | `created_at_utc_ms` 1790796175319 | — | — |
| Card | cert | EH | "cert —", with the title "The engine did not publish a methodology certificate…" | `certificate.availability.reason_code = SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` | QB | Code not visible; the sentence is in the tooltip only |
| Card | rc chip | W | (absent, no text) | `rc: null`, `rc_availability.reason_code = P21_NO_PERSISTED_RELEASE_CANDIDATE` | FE | Silent omission, 2_wiring S01 confirmed |
| Card | relationship marker | OK (n/a) | — | `relationship.kind = PRIMARY` | — | — |
| Card | evidence trail S1–S5 | OK | 5 chips done | `stages[].state = done` | — | — |
| Card | sparkline | **W** | "STITCHED OOS EQUITY · 23 of 2184 pts · extrema kept" | `sparkline.source.first_at_utc_ms = 2026-05-01`, `source_observation_count = 2184`; OOS = 1,440 | Codex (series scope) + `AN-19` | Includes 744 pre-OOS flat bars; D-AN-01 wants last-30D |
| Card | OOS SHARPE | W (scope) | 1.36 | `stats[oos_sharpe].value` "1.3615…", `definition_id …selected-trial-mean-oos-sharpe` | `AN-19` | Value = API. The label hides "fold mean"; D-AN-01 requires last-30D |
| Card | Δ DECAY | OK | 3.59 | "3.5867…" | — | — |
| Card | TRADES | OK | 19 | "19" | — | Sum of fold trades (S04 shows child-tape 7 and 0 fills) |
| Card | claim note | OK | NOT ISSUED — The Delta walk-forward study sealed … | `claim.text` | — | — |
| Cancelled cards | EQUITY / PROGRESS / TRIALS / ELAPSED | EH | not reported, empty spark | — | — | No reason code |
| **[bobby]** Legacy card `527d2b99` | status | **W** | "recorded QUEUED · not monitored" | Library row `status = QUEUED`; `/api/runs` → `COMPLETED`, `completed_at 2026-09-23` | Codex | Two reads disagree |
| Scale | 39 cards | OK | 2,728 nodes, 5,185 px; lazy sparklines (4 on first paint) | `page.has_more = false` | — | Cursor paging past 50 not exercised |
| 660 | layout | OK | no horizontal scroll, h 9,610 px | — | — | — |

## S02 New Run (`/runs/new`, `?from=<long run>`)

The walk went through every step up to Review. **Preflight and Create were not pressed.** Reads:
- `atlas`
- `datasets`
- `alphas`
- `requested-spec` (`?from`)
- `alpha-versions/…/publication`

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Header | release line | OK | quantbt-engine==1.1.1 · er_quantbt_111 | atlas `current_release` | — | — |
| Header | "COPIED FROM rrun_3258a4c4" | W | short run id | `requested-spec.run_id`; label R-WFO-020 is available | FE | D4 walk confirmed |
| Stepper | 8 steps | W | every step ✓, including Walk-forward whose 3 date inputs are blank | — | FE | FG 02-8b; wraps to 2 rows at 1440 (02-7) |
| Context | alpha select | W **[claude]** | options include `s14-ui-receipt`, `s14-api-receipt` (probe alphas) | `/research/alphas` | Codex / data hygiene | Test residue in the product picker |
| Context | alpha / version / lifecycle / source / entrypoint / TFs | OK | Delta-RSI · av_1_0_0 · ACTIVE · 34dc1847d051 · strategy.delta_rsi:generate_signals · 1h·4h·1d | publication read | — | — |
| Context | last published rc | EH | not published · P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED | publication | not fillable yet (P22) | — |
| Route | 14 routes | OK | signal_notional DEFAULT … options DEFERRED | atlas routes | — | — |
| Data | dataset / symbol / tf | OK | crypto-binance-1m · BTCUSDT · 1h | `requested_spec.data` | — | D6 (4h vs 1h) not reproduced on `?from` |
| Walk-forward | Analysis start / End / First OOS inputs | **W** | blank `mm/dd/yyyy --:--` | `walk_forward.start = 2026-05-01T00:00:00Z`, `end_exclusive = 2026-07-31T00:00:00Z`, `split_mode = 2026-06-01T00:00:00Z` | FE (NEW) | `datetime-local` rejects the "Z"; copy says "nothing was prefilled" |
| Walk-forward | frequency / window / mode / schedule | OK | weekly · expanding · mode_1_decay · global | `requested_spec` | — | — |
| Walk-forward | label horizon / purge / embargo | OK | empty | not in `requested_spec` (v1) | — | — |
| Walk-forward | fold-plan preview | NA | "server derives … at preflight" | none before preflight | `B3#13` | 02-l |
| Parameters | 8 ranges | OK | window 20–60 … slpercent 0.7–2.5 | publication declared space; `overrides = []` | — | — |
| Optimization | Optuna trials | **W** | **1** | `requested_spec.optuna_trials = 400` | FE + Codex `B3#14` | Clone loses 399 trials |
| Optimization | seed | W | 42, with the panel "random seed MUST_BE_NULL" | `random_seed = 42`; atlas `submission_constraints.random_seed = MUST_BE_NULL` | Codex `B3#14` | Self-contradiction |
| Optimization | submission profile | **W** | P10.FIXED-QUALIFICATION.V1 · trials 1 · overrides FORBIDDEN | atlas `submission_constraints.profile_id`; run `execution_profile_id = p10.delta-signal-notional-wfo.v1` | Codex `B3#14` | Stale: 400-trial runs are accepted |
| Optimization | defaults · 28 fields | OK | pinned by protocol | atlas `optimizer_defaults` | — | — |
| Review | window timeline | W | 2026-05-01T00:00:00Z → 2026-07-31T00:00:00Z · weekly · expanding | first OOS 2026-06-01 not printed; ISO with seconds and Z | FE | HiFi draws IS/OOS bars (02-10a) |
| Review | claim forecast | W | NOT_CAUSAL… · OOS retrospective · "cert ceiling not published" | atlas `cert_cap.reason` served | FE | CG-P04-05 confirmed |
| Review | trials · stop · seed | **W** | 1 · none · 42 | 400 · null · 42 | FE | See the Optimization row |
| Review | preflight panel | EH | "6 panels, none read yet · Create run: Run preflight first." | — | by design | Not pressed |
| 660 | layout | OK | h 1,217 px, no horizontal scroll | — | — | — |

## S03 Progress (`/runs/<id>/progress`, redirects to `#fold=9`)

`GET /research/runs/<id>/progress` and `console?after_seq=0&limit=500` (448 events).

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Header | h1 / crumb | OK | Run completed — R-WFO-020 | `run.display_label` | — | — |
| Header | transport | OK | stream closed at terminal frame | terminal | — | FG 03-T only matters for other states |
| Meta strip | status / protocol / mode / instrument / route / engine / config | OK | COMPLETED · advanced · mode_1_decay · global · BTCUSDT 1h · signal_notional · er_quantbt_111 · sha256:69c943… | `run.*` | — | — |
| Meta strip | queue | OK | HEAVY · queued 2026-09-30 19:22 UTC · 1 worker attempt | `queue`, `attempts` | — | — |
| Claim passport | claim | OK | The Delta walk-forward study sealed … | `progress.claim.text` | — | — |
| Claim passport | certification | EH | not published | `methodology_certificate.reason_code = SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE` | QB | Code not shown |
| Claim passport | seal | OK (raw) | mandatory SEALED · optional NOT_APPLICABLE | `readiness` | FE | Raw enums |
| Claim passport | hand-off cursor | OK | fold 9 · trial 394 · prm_aeb7ba | `claim.handoff_cursor` | — | The evidence link carries `fold=9&trial=394` |
| Claim passport | 4 methodology claims + forecast | NA | absent | no field | `B3#5` | 03-I/J |
| Pipeline | S1–S5 chips | OK | ✓ ×5 | `stages[].state = DONE` | — | — |
| Pipeline | trials | OK | 400 / 400 trials · 100% | `overall.trials_done/declared`, `pct` | — | — |
| Pipeline | study | OK | study global — scores all 9 folds | `run.declared_folds.count = 9` | — | — |
| Pipeline | elapsed / eta | OK | 48s · none — run final | `elapsed_s 48`, `eta_s null` | — | — |
| Pipeline | rate | EH | rate not reported | no field | `B3#17` | Literal sentence, no code (CG-P10-04) |
| Pipeline | tqdm line | OK | global study · trial 400/400 · best J₁ 4.948 · pruned 11/400 | `overall.tqdm_line` | — | 11 PRUNED lines counted in the console |
| Pipeline | budget | OK | 0.733/30.000 core-min | `budget.used/cap` | — | — |
| Fold Gantt | count | OK | 9 of 9 folds reported | `folds[]` length 9 | — | — |
| Fold Gantt | rows fold_01 / 08 / 09 | **W** | "global best J₁ **−4.797** · trial 394 · prm_aeb7ba" | `folds[].selection.objective = "-4.7969…"`, `trial = 394` | Codex + FE | Same screen says "best J₁ 4.948"; −4.797 is the selection J, not the best J₁ |
| Fold Gantt | segment timeline | EH | (bars only) | `fold_timeline.reason_code = SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS` | `B3#4` / QB | Code not shown |
| Fold Gantt | blank area under 3 rows | W (HIFI) | ~150 px empty | — | FE | 03-O confirmed |
| Evidence cursor | fold / trial / params | OK | fold_09 · #394 · prm_aeb7ba | `handoff_cursor` | — | — |
| Artifacts | bundle | OK | 253.4 KB · sha256:08cbe4ff… | `mandatory_bundle.size` 259475 / 1024 | — | KiB printed as KB |
| Artifacts | 5 rows | OK / W | names left-ellipsized at 170 px ("…effective-spec-receipt.json"), no `title` | `artifacts[].name/size/digest/state` | FE | The full name is unreadable anywhere |
| Retained tables | RESEARCH_BUNDLE | OK | ROWS 2,633 · BYTES 323.2 KB · SEALED 19:23 UTC | `retained_artifacts[0]` | — | — |
| Retained tables | coverage | NA | not reported | no field | — | — |
| Retained tables | export | EH | "server has not published an export action" | `reader_href: null` | Codex `B1#7` | — |
| Console | 400 trial lines + prune | OK / SC-ok | J₁ values; trial 394 J₁ = 4.948 | console events (448) | — | 931 nodes total; paging by `after_seq` exists |
| Footer | handoff chips S1–S5 | OK | links carry `#fold=9&trial=394&params=…` | — | — | — |
| 660 | layout | OK | h 1,878 px | — | — | — |

## S04 Evidence Flow — Summary (`/evidence#stage=summary`)

Reads:
- `/quantbt/runs/<id>/evidence` (legacy hub)
- `/current-source/evidence`
- series `EQUITY`, `MONTHLY_RETURNS`, `ROLLING_RETURNS_20`, `RETURN_DISTRIBUTION`
- `requested-spec`
- `progress`

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Run strip | run / mode / alpha / instrument / route / engine / created | OK | R-WFO-020 · … · quantbt-engine 1.1.1 · rs02.quantbt-signal-notional-wfo.v1 · 19:22Z | cs `provenance`, `requested-spec` | — | — |
| Dataset drawer | coverage / gaps | NA | "▾" drawer | none | `B3#1` | 04-C |
| Claim strip | NOT_ISSUED + text | OK | — | cs `claim` / progress `claim.text` | — | — |
| Claim strip | VALIDATION / CHRONOLOGICAL / OOS_USED / CAUSALITY | OK (raw) | WALK_FORWARD_OOS · NOT_CAUSAL_… · YES · RETROSPECTIVE_… | `claim.*.value` | — | Upper-cased raw tokens |
| Claim strip | HOLDOUT_STATE | EH | n/a | `claim.holdout.reason_code = P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT` | by design | Code not shown |
| Claim strip | EXECUTION_CONTRACT / RUNTIME AUTHORITY | OK | CLOSE_TARGET_V2 · bar_close → same_close · NATIVE_VECTORIZED · numba_units_v2 | `claim.execution_contract`, `runtime_authority` | — | — |
| Claim strip | CERTIFICATION | EH | not published | — | QB | — |
| Claim strip | copy | W | "Claims issued by quantbt-engine … UI never infers"; a side column at 660 | — | FE | 04-G confirmed at 660 |
| Tab strip | SUMMARY | OK | 8 of 15 metrics · 6 series | counted | — | — |
| Tab strip | S1 / S3 subtitles | W (HIFI) | "DONE · fold 1" | — | FE | 04-H confirmed |
| Tab strip | S2 SEARCH | **W** | DONE · fold 1 | body = PARTIAL / 503 | FE | See S06 |
| Evidence cursor | fold chips / trial / params / seq | OK | fold_01…09 · #394 · global · aeb7bab2 · none selected | `progress.handoff_cursor`, cs `fold_verdicts` | — | Direct entry lands on fold 1 (the S03 link lands on 9) |
| Window switch | IS / OOS / Holdout Live / Compare | NA | only OOS live | no hub window read | 04-K (no packet) | — |
| Tile | FINAL EQUITY | OK | 20,255.87 | `passport.final_equity` | — | — |
| Tile | NET RETURN | OK / W | +1.28% "retained stitched account" | `passport.net_return_fraction` 0.012794 (= `summary_analytics.net_oos_return`) | FE | Equal here only because May is flat; tile not bound to `net_oos_return` (2_wiring) |
| Tile | OOS SHARPE · FOLD MEAN | W (scope) | 1.36 | `fold_verdicts.mean_oos_sharpe` | `AN-01` | D-AN-01: hero = all-time |
| Tile | MAX DRAWDOWN | OK | −1.07% | `passport.max_drawdown_fraction` | — | — |
| Tile | TRADE COUNT | OK | 19 | `fold_verdicts.total_oos_trades.value` | — | Same hub also shows 7 (CHILD_TAPE) and 0·0·0 fills; labelled, but 3 counts |
| Tiles | SORTINO / CAGR / PF / LONG-BAR / SHORT-BAR HIT | EH | not published · "retained lane · no such field" | no field (`UI_RETAINED_LANE_HAS_NO_FIELD`) | `AN-02…05` | Engine computes them (RA:106) |
| Tile | SHARPE DECAY · FOLD MEAN | OK | 3.59 | `fold_verdicts.mean_decay` | — | — |
| Tile | BARS PROCESSED | W (scope) | 2,184 "retained observations" | `passport.artifact_table_rows.observations` 2184; OOS = 1440 | FE / Codex | Not labelled as including pre-OOS |
| Tile | INITIAL EQUITY | OK | 20,000.00 | `passport.initial_equity` | — | — |
| Tile | BENCHMARK RETURN | EH | not published · "retained lane · benchmark" | `source_absences.benchmark = QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES` | `AN-11` (Portal, not QB) | Code attributed to the source is stale under D-AN-01 |
| Tile | FUNDING TOTAL | EH | not published | no field | not fillable (spot) | — |
| Tiles | count | W (HIFI) | 15 tiles | — | `AN-01` / FE | HiFi 5 hero tiles (04-L) |
| EChart 1 | equity | OK / W | "Equity — stitched OOS account · 955 of 2,184 … range 19,999.00 – 20,474.22 · deepest −1.07% at 2026-07-28 02:00Z" | EQUITY series; pre-OOS shaded "before the first OOS window" | FE | Title says OOS while 744/2184 bars are pre-OOS (shaded, legend explains) |
| EChart 1 | IS leg | EH | "No IS equity series is drawn…" | `in_sample_equity.reason_code = QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT` | QB (`AN-25`) | — |
| EChart 1 | a11y table | SC | 955 rows × 3, full ISO-ms, in the DOM | series | FE | 5,179 nodes; 04-AA confirmed (ISO-ms, raw floats) |
| EChart 2 | underwater | OK | −1.07% | derived from the same series (labelled) | — | — |
| Fold verdict | summary | OK | 7 DRAG · 0 WARN · 2 PASS — OOS 1.36, decay +3.59 | `fold_verdicts.counts`, `mean_*` | — | — |
| Fold verdict | 9 rows (S_OOS, decay, trades, DD, contribution, worst, verdict) | OK | e.g. fold_09 −11.03 · +14.54 · 3 · −0.35% · −0.34% · −0.16% @ 2026-07-27 22:00Z · DRAG | `fold_verdicts.rows[*]` | — | 0.00 values are served zeros (fold_02/06/07); "+0.00%" sign on zero |
| EChart 3 | rolling Sharpe 63 | EH, but superseded | "not applicable — 59 daily UTC returns" | `rolling_sharpe_63.reason_code = P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW` | `AN-16/17` (FE drop) | D-AN-01: panel must become "Strategy vs benchmark — all time" |
| EChart 3 | rolling beta | EH, but superseded | not published — no benchmark | `source_absences.benchmark` | `AN-10/17` | — |
| EChart 4 | return distribution | **W** (scope) | "stitched OOS · 12 points from 2,184"; 1,759 in the ~0 bucket; axis "−0.00%" | `RETURN_DISTRIBUTION` counts sum 2,184 | Codex (NEW) | Should be 1,440 OOS returns; "−0.00%" rounding leak |
| EChart 4 | a11y bucket table | W | raw 34-digit decimals `[-0.002293309695928114, -0.001725376196665943416666666667)` | series | FE | 04-AA |
| Monthly | 2 cells | OK / W (HIFI) | +2.32% 6/26 · −1.01% 7/26 | `MONTHLY_RETURNS` | — | 04-S blank stretch confirmed |
| Behavior | heading | W | "BEHAVIOR — ENGINE-PUBLISHED, UI RENDERS · segment OOS" | — | FE (`AN-28`) | D-AN-01 copy |
| Behavior | WIN RATE / PAYOFF / AVG HOLDING / MAX CONSEC LOSS | EH | not published | `behaviour.*.reason_code = QUANTBT_ROUTE_PUBLISHES_NO_AUDITED_TRADE_LEDGER` | `AN-14` | Code not shown |
| Behavior | TURNOVER | OK / W | 11,646.76 (no unit) | `turnover_notional` 11646.76 | FE | Notional currency unit missing |
| Behavior | EXPOSURE | OK | 55.63% | `exposure_fraction` 0.55625 | `AN-12` (L/S/F) | — |
| Behavior | BETA / CORR | EH | not published | benchmark absence | `AN-10` | — |
| Behavior | skew / kurtosis / vol / DD duration / Sortino / CAGR | NA | not drawn at all | no field | `AN-06…09` | — |
| EChart 5 | rolling-20 return | **W** + drop | "stitched OOS · 137 points from 2,164"; flat from 05-01 | `ROLLING_RETURNS_20` | `AN-18` (FE drop) + Codex scope | Still requested; pre-OOS included |
| Footer note | engine trades | OK | Engine total trades (CHILD_TAPE): 7 | `summary_analytics.total_trade_count` 7 | — | — |
| Passport | 9 cells | OK | 20,000.00 · 20,255.87 · +1.28% · −1.07% · 2,184 · 2,184 · 9 · 400 · 39 | `passport.*` | — | — |
| Passport | absences | EH | route ledger / audited fills / benchmark — not published | `source_absences.*` | QB / `AN-10` | Codes not shown |
| 660 | layout | W | claim side column; tab strip scrolls (98 elements beyond 660 inside the scroller); fold labels on EChart 1 overlap ("fold_03fold_04fold_05") | — | FE | — |

### S04 other tabs

| Tab | Cell | Class | Screen | API | Owner | Note |
|---|---|---|---|---|---|---|
| split | body = S05 embedded | see S05 | — | — | — | Includes "θ* parameters not published RESEARCH_CURRENT_SOURCE_UNAVAILABLE" (503 search) |
| search | body = S06 embedded | **SC / W** | PARTIAL, P15_CURRENT_P04_… | cs search 503 | Codex NEW | See S06 |
| freeze | body = S07 embedded | see S07 | — | — | — | HT-1 footer inside the tab |
| execute | readout | W | "fold 0", "position −0.0270801", "range 57758.6 – 82828.7" | replay | FE | 08-16 / D11 confirmed; 358 elements beyond 660 inside the chart |
| execute | stitched account chips | FL | fold_01 +1.42% … fold_09 −0.34% | `fold_verdicts.return_fraction` matches | — | Values equal the served fractions |
| execute | orders · fills · trades / transitions / fees / rejected | OK | 0·0·0 · 6 · 5.82 · 0 | replay | — | — |
| execute | fold capital | W | `carry_position` raw | `fold_capital.policy` | FE | D11 |
| execute | transition ledger 6 rows | OK | e.g. 2026-06-01 00:00Z entry → short 0 → −0.0270801 · 73,855.00 · 2,000.00 · 1.00 | replay transitions | — | — |
| claim | claim / certificate | OK / EH | NOT_ISSUED; certificate not published | — | QB | — |
| claim | cert caps table | NA | "per-stage caps — not published" | none | Bobby cap policy | 04-E/V |
| claim | window disclosure | OK / NA | OOS 9/9 folds; IS / Compare rows not published; Holdout 0 denied | `claim.*` | `B3#13` | — |
| claim | manifest | OK | 5 artifacts (same as S03) | progress | — | — |
| claim | **declared source absences** | **W** | benchmark · funding · audited_fills · **per_fold_metrics** — not published | legacy `/evidence.source_absences` (`P13_SOURCE_EVIDENCE_NOT_PUBLISHED`); cs publishes `fold_verdicts` | FE (NEW) | Contradicts the Summary tab |
| atlas | layout | W | 9 elements overrun to x = 1,447 at 1440 | — | FE | FG 12-02 confirmed |

## S05 Split (`/runs/<id>/split`)

Reads `current-source/split` (13 KB), legacy `/split` (P14 not-published) and `current-source/search` (**503**).

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Facts | protocol / selection / span | OK | advanced walk-forward · weekly · expanding · GLOBAL · [2026-05-01, 2026-07-31) 1h | `requested-spec`, `fold_plan` | — | — |
| Facts | outer folds | OK | 9 observed | `fold_plan.folds` len 9 | — | — |
| Facts | inner folds | EH | n/a | `guards.inner_folds.reason_code = QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION` | by design | Reason only in title (X-08) |
| Facts | purge / embargo / label horizon | OK | 0 bars ×3 | `guards.*_bars.value = 0` (AVAILABLE) | — | Served zeros, not null |
| Facts | warmup | OK | none | `guards.warmup_policy = none` | — | — |
| Facts | strict outer OOS | OK | no · OOS used for selection | `guards.oos_used_for_selection = true` | — | — |
| Facts | readiness / θ* params | OK | READY · aeb7bab2d51c… | progress | — | — |
| Fold construction | windows bar, IS / OOS legend | OK | IS [2026-05-01 ⋯ 07-26] · OOS [2026-06-01 ⋯ 07-30] | `fold_plan.folds[*]` | — | — |
| Fold construction | warmup | EH | n/a · QUANTBT_WARMUP_POLICY_IS_NONE | `guards.warmup_bars` | by design | — |
| Fold construction | 9 fold rows | OK / W | fold_01 [2026-05-01 ⋯ 06-07] … | `fold_plan.folds` | FE | Date ranges hidden at 660 (FG 05-06) |
| Fold construction | holdout | EH | n/a · P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT | `claim.holdout` | by design | — |
| θ* flow | lane labels | W | 0 … 8 (raw) | `fold_id` 0-based | FE | X3 confirmed |
| θ* flow | per-fold S | OK | S 10.189 … −11.030 | `fold_plan.folds[].score.oos_sharpe` | — | — |
| θ* flow | IS bar label | W (HIFI) | "IS" | `n_studies`, trial count available | FE | FG 05-09 |
| θ* flow | **θ* parameters** | **SC** | not published · RESEARCH_CURRENT_SOURCE_UNAVAILABLE | cs search 503 | Codex NEW | Works on the 3-trial run |
| Fold table | 9 rows (train, bars, purge, test, bars, embargo, params, IS S, OOS S, decay) | OK | fold_01 [2026-05-01, 05-31] 744 · 0 · [06-01, 06-07] 168 · 0 · … 5.239 · 10.189 · −4.950 | `fold_plan.folds[].anatomy/score` | — | fold_09 96 test bars is correct |
| Boundary integrity | holdout kept out | EH | n/a · no holdout segment | — | — | — |
| Boundary integrity | gap scan | OK | 8 of 8 boundaries · no gap | `gap_scan.measured/contiguous 8` | — | — |
| Boundary integrity | train ∩ test = ∅ | **FL** | ✓ "retained fold plan" | served `guards.train_test_disjoint = {verdict PASS, basis RETAINED_FOLD_UTC_WINDOWS_…}` | FE (`B1#9` delivered) | FE still asserts from `foldPlanReady` (`SplitDetail.tsx:1890`) |
| Boundary integrity | purge / embargo applied rows | NA→W | absent | served guards | FE | FG 05-14 |
| Stitched provenance | digest / segments / obs | OK | d3ef76646dce… · 9 segments · 1440 observations · verified | `stitch.*` | — | 1440 contradicts the S04 "stitched OOS 2,184" |
| Feeds-forward / cert | cert | EH | not published SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE | — | QB | — |
| 660 | layout | W (minor) | "OOS" chips clipped to "OO"; fold table (min-w 760) scrolls | — | FE | — |

## S06 Search & Selection (`/runs/<id>/search`)

Reads `/search?fold=1` (legacy, P15 P04 code) and `current-source/search` (**503**).

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Status | PARTIAL banner | W | "The source has not reported this run's search facts yet" | cs 503 = over budget / contract, not "not reported" | FE + Codex NEW | Wrong reason |
| Claim row | OPTIMIZATION_MODE / SCHEDULE | **W** | mode not published / schedule not published | mode_1_decay × global served by Library, progress, split and requested-spec | FE | — |
| Claim row | VALIDATION / CHRONOLOGICAL / OOS_USED / OOS COLUMN / SCORING / METRIC / PROFILE / SELECTION / STRICT OOS | **W** | not published — "the source receipt is not published" | legacy `P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED`; the same claims are served on S04 | FE | P04 code on a WFO run |
| Claim row | READINESS | W | not ready | run READY elsewhere | FE | — |
| What this mode reads | Atlas link | W | "names no declared mode" | mode known | FE | — |
| A1 | search space / sampler / trials·grid | **SC** | not published | cs 503 | Codex NEW | 3-trial run: 8-row table, grid 21,379,147,776, "3 requested · 3 retained" |
| A2 | trial surface | **SC** | not published · P15_CURRENT_P04_… | cs 503 | Codex NEW | 3-trial: scatter; 400 untestable |
| A3 | progression / pruned rail / prune reasons | **SC** | not published | cs 503 | Codex NEW | tqdm shows 11 pruned exist |
| A4 | sampled regions | **SC** | not published | — | Codex NEW | — |
| A5 | importance | **SC** | not published | — | Codex NEW | 3-trial: "needs ≥ 8 trials" (would now qualify) |
| A6 | interactions | SC (EH on 3-trial) | not published | 3-trial: `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS` | QB | — |
| Freeze line | pool freeze | **W** | "POOL FREEZE · **NONE — NO SEARCH RAN**" | 400 trials, 39 candidates (cs evidence passport) | FE | False statement |
| B1 | pool freeze funnel | **SC** | not published | — | Codex NEW | 3-trial: K = ⌈3 × 0.1⌉ = 1 |
| B2 | formula terms | **SC** | not published | — | Codex NEW | 3-trial: J = −9.81, 4 of 4 recompose |
| B3 | best ≠ selected | **SC / W** | "The source published no selection for this run." | cs freeze `frozen_selection.selected_trial_id = 393` | Codex NEW / FE | — |
| B4 | θ* journey | **SC** | not published | — | Codex NEW | — |
| Fold inspection | fold 1 | W | "Fold 1 was requested. The source published nothing for it." | — | FE | — |
| Trial ledger | rows / paging / 400 rows | **SC (untestable)** | refusal: "The Research service did not answer. Try again. (RESEARCH_CURRENT_SOURCE_UNAVAILABLE … request_id …)" + "ledger is not published — P15_CURRENT_P04_…" | cs 503; contract `ledger.trials ≤ 200`, `returned_rows ≤ 200` | Codex NEW | Two contradicting reasons in one panel; "Try again" will never succeed |
| Candidate ledger | — | SC | absent | — | Codex NEW | 3-trial: 1 of 1 candidate |
| Search cinema | — | NA | no placeholder | — | QB | 8_sweep #4 |
| 660 | layout | OK | h 2,064 px | — | — | — |

**Looks good on 3 trials, breaks on 400:** all of S06, the S05 θ* params and the S04 Search tab. The 3-trial R-WFO-017 renders every panel from A1 to B4 plus both ledgers (1,141 nodes). The 400-trial run renders nothing but refusals (519 nodes).

## S07 Freeze (`/runs/<id>/freeze`)

Reads `current-source/freeze` (43 KB) and legacy `/freeze?fold=1`.

| Block | Cell | Class | Screen | API field / value | Owner | Note |
|---|---|---|---|---|---|---|
| Header | selection | **W** | available · trial **393** · objective −4.797 | `frozen_selection.selected_trial_id = 393`, `objective = "-4.7969…"` | Codex / FE NEW | S03 and the S04 cursor say trial 394 |
| Header | readiness / as-of | OK | ready · 2026-09-30 19:23 UTC | `as_of_utc_ms` | — | — |
| Ordering | data time | OK | 2026-05-01T00:00:00Z → 2026-07-31T00:00:00Z · 9 declared folds | requested-spec / `fold_ordering.counts.folds` | — | ISO with seconds (X6) |
| Ordering | verdict | OK | ⚠ NOT CAUSAL · GLOBAL SELECTION · NOT_CAUSAL_… · RETROSPECTIVE_… · oos_used_for_selection = true | `fold_ordering.source_claims` | — | — |
| F1 data time | 9 rows | OK | IS ends before OOS · not causal · global selection · no OOS generation child | `fold_ordering.folds[].{boundary,verdict,oos_generation_child}` | — | Reason code `QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD` not shown per row |
| F1 wall clock | ordering | EH | not published · QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS | `fold_ordering.wall_clock` | QB | — |
| F2 frozen θ* | digest / shared | OK | aeb7bab2 · shared · "one θ* for folds 1–9" | `stage4_binding.sealed_params_sha256`; `selection_scope GLOBAL` | FE | "folds 1–9" vs fold_01–09 (07-11) |
| F2 table | 8 params (range, position, value, reading) | OK | rvol 1–2.5·0.1 · 73.33% interior · 2.1 … slpercent 2.5 at upper bound | `declared_space.parameters[*]` | — | — |
| F3 digest chain | params / strategy / engine / dataset / config | OK | sha256:aeb7bab2d51c… · 34dc1847d051… · 1.1.1 · 8581c52986a4… · 0668e6418ba2… | provenance / `parameter_authority` | — | — |
| F3 | bundle digest | EH | not published · "QuantBT strategy fingerprint" | no field | QB | No code |
| Custody | manifest / import digest | OK | match 50fd97ec / a64def18 · 2,633 rows | `integrity.*` | — | — |
| Custody | artifact bytes | EH | not verified yet | `byte_verification.reason_code = P16_ARTIFACT_BYTES_NOT_VERIFIED_YET` | by design (verify not pressed) | — |
| F4 binding | state | EH | not compared | `stage4_binding.reason_code = QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD` | QB | — |
| F4 binding | **sealed params digest** | **W** | 2944fed1ec99eb9d3940c1b7 | `rows[0].value` = candidate id (`identity_rule …CANDIDATE_ID_V1`); true digest `aeb7bab2…` | Codex label + FE NEW | Two "params digest" values on one screen |
| F4 binding | per-fold rows ×2 | W | "fold_01 —" … "fold_09 —" | `rows[1].folds[].state = NOT_PUBLISHED` + code | FE | 07-12 confirmed; the dash hides the code |
| Authority | code-fixed | EH | not published | `code_fixed.reason_code = P04_DELTA_KERNEL_PUBLISHES_NO_CODE_FIXED_VALUE_LIST` | QB | P04 code wording on a WFO run (served) |
| What-if | slider names | W | "entry_z → rvol", "atr_mult → slpercent" | `sliders[].hifi_name` | Codex + FE NEW | HiFi placeholder names leak into the product |
| What-if | slider geometry | W | slpercent thumb mid-track, ends labelled 2.1 / 2.5 | `values = [2.1…2.5, 2.5×4]`, `clamped[5..8] = true` | FE | D7 confirmed |
| What-if | ΔJ₁ / J₁ / base | **W** | ΔJ₁ 0 · J₁ 4.948278702312006 · base 4.948278702312006 | `grid.base_objective`, `cells[x4y4].objective` | FE | Raw float (D7); opposite sign to the header −4.797 |
| What-if | coverage | OK | 5 / 81 cells evaluated · 44 missing | `coverage.label`, `actions.evaluate_grid.missing_evaluations = 44` | — | 5 evaluated = clamped copies of one parent trial |
| What-if | formula footnote | W | "mode 1 decay j over the global study is folds" | `objective_kind MODE_1_DECAY_J`, `objective_scope GLOBAL_STUDY_IS_FOLDS` | FE | `words()` of an enum reads as English ("is folds") |
| What-if | actions | OK | evaluate grid · create sibling attempt → | `actions.*.may_submit/may_create` | — | Not pressed |
| 660 | layout | OK | h 3,035 px, 0 overflow | — | — | — |

---

## Confirm / deny against the open lists

**Confirmed in the browser today**
- 00-1a…d, 00-8
- 01-1
- 2_wiring S01 rc
- D4 walk
- FG 02-8b, 02-7, 02-10a
- CG-P04-05 FE
- 03-O
- 04-G (660), 04-H, 04-S, 04-AA
- D-AN-01 copy
- AN-16/17/18
- 04-L
- X3 / FG 05-07/08, FG 05-06, FG 05-09
- 07-11, 07-12, D7
- 08-16 / D11
- FG 12-02
- HT-5 (now worse: tab DONE vs body refusal)

**Changed since the lists were written**
- `B1#3` (`requires_alpha`) is now served. The FE row "CG-S00-AV-01 FE" is now pure FE work.
- `B1#9` (`train_test_disjoint`) is now served. FG 05-15 is now "bind", and the FE value is still FE-asserted.

**Not reproduced**
- D6 (S02 Review 4h vs 1h) on `?from=`: the Review shows 1h.

**New (not in B1 or A5)**
- S06 503 at 400 trials.
- S06 fallback lies ("NO SEARCH RAN", P04 code, mode not published).
- S02 clone trials 400 → 1.
- S02 blank `datetime-local` inputs.
- θ* trial 393 vs 394, and J₁ 4.948 vs −4.797.
- Stitched-OOS series and sparkline include pre-OOS bars.
- S04 Claim-tab absences come from the wrong lane.
- S07 F4 candidate id labelled as params digest.
- What-if `hifi_name` leak.
- Shell "Runs (1)" from the legacy list.
- **[bobby]** Legacy row QUEUED vs COMPLETED.
- Probe alphas in the S02 picker.
