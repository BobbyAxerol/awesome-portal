# Rà HiFi ↔ frontend màn 00–14 (Claude, 2026-09-26)

Bobby (2026-09-26): "kiểm tra frontend các màn hiện tại với các màn HIFI đã đầy đủ chưa, cũng
đưa vào kế hoạch để code và đóng gap bổ sung bên cạnh backend". Kế hoạch và trạng thái nằm ở
[Unified §13.4.1 mục E](../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-open-ledger); file này là bằng
chứng chi tiết từng khối.

**Cách làm.** Ba lượt rà song song (00–04, 05–09, 10–14), đọc HiFi
`release-v1.1/QuantBT NN *.dc.html` từng khối, chụp HiFi và màn thật ở 1440/660 trên API preview
thật `:8095` (run P04 + WFO, font thật), xem từng cặp ảnh. Mỗi gap xếp một lớp: FE, BE≤P21
(Claude), BE P22+ (Codex), quyết định thiết kế; lệch HiFi đã chốt chỉ trích nguồn, không đếm.
Ảnh và log (không commit) ở scratchpad `hifi-audit/shots/`.

**Giới hạn — đọc trước khi tin số.**
- Cây được rà là `0b6b7fb8` (X3). Hai lỗi F-04 lượt 05–09 báo ở S09 (404 → EMPTY) đã sửa trong
  `396b6450`; lượt 10–14 báo "3 câu 403/404 khác nhau" — S09/S11 đã về một câu, S03/S04 còn "Run
  not found" (`RunProgress.tsx:1918`, `EvidenceFlow.tsx:3688`, đã xác nhận) → mục E1.
- Preview là image `c66836bf` (trước P22, W7, X2, lineage 1.1): các panel X2 ở S06/S07 chưa hiện
  trên dữ liệu thật — ghi "kiểm lại sau OL-23", không đếm là gap.
- Preview chỉ đọc: không thử được preflight/create/cancel/publish ghi thật; 401 thật không thử
  được qua proxy (fixture lane P23 đã phủ 401: 78/78 trên `396b6450`).

| Lượt | FE | BE≤P21 | BE P22+ | Quyết định thiết kế | Đã chốt, bỏ |
|---|---|---|---|---|---|
| 00–04 | 38 | 17 | 2 | 4 | 20 |
| 05–09 | 30 (+3 chung) | 8 | 1 | 4 | 28 |
| 10–14 | 32 | 3 | 4 | 14 | 86 |
| **Tổng** | **100 (+3)** | **28** | **7** | **22** | **134** |

---


## Lượt 00-04

### HiFi vs frontend audit: Research Loop screens 00–04

Audited 2026-09-26 (read-only). Code: `portal/.claude/worktrees/agent-af165baa3f4d8979a` @ `0b6b7fb8` (`apps/portal/frontend/src/research`, abbreviated `R/` below).
HiFi: `upgrade/research_loop/release-v1.1/QuantBT 0{0..4} *.dc.html`.
Real data: Vite :5191 proxied to the read-only preview :8095 (origin `research-portal.primusspark.com`, dev-access header plus `claude-preview` session). P04 run `rrun_8c9c9991…`, WFO run `rrun_e1fa9e5c…`, and queued, failed and stuck runs from the same library.
Shots: `shots/s0004-{hifi|real}-<screen>[-variant]-{1440|660}.png`. Text dumps and the measurement data (`measure.json`) are in `s0004/`.

**Classes:** **FE** = frontend-only · **BE≤21** / **BE22+** = needs a backend field or endpoint (≤P21 is Claude's, P22+ is Codex's) · **BD** = needs a design decision from Bobby. Deviations that are already decided are cited once under each table and left out of it.
**Not covered:** the preflight, create-run and cancel POSTs (the preview is read-only). A true 401 page (the proxy always adds the dev-access header). A live RUNNING run (the preview had none; the queued runs are stuck).

---

### Screen 00 · Journey Map (`/research/quantbt/journey`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 00-1 | Header: mono kicker "QUANT ECOSYSTEM PORTAL · RESEARCH LIGHT", title "Journey Map — shipped portal × redesigned evidence flow" (Newsreader 27px/400), subtitle "Every card opens the real screen…", 2-swatch legend on the right | "QuantBT Backtest — journey map" 22px/300, a different subtitle, no kicker, a 3-chip legend under the subtitle | Copy and size differ. DQ-02 says the HiFi wins on copy | FE | — | S | `hifi-00-1440` vs `real-00-1440`; `R/JourneyMap.tsx:306`; `measure.json` 00.title |
| 00-2 | Phase label (Inter 13/600). P6 row fits 5 cards, then 4 | Phase label renders in Newsreader (inherits the serif h2). Cards are 180–300px flex, so P6 wraps at 4 | Typography and card rhythm | FE | — | S | `measure.json` 00.phaseTitle; `R/JourneyMap.tsx:208` |
| 00-3 | Every redesign card opens its screen | S4 Execute Replay, Attempt Lineage, Compare, Release Candidate and Run Report render **SOON**. The descriptor still says `PLANNED`, but routes for S08/S10/S13/S11/S09 are mounted | Stale server availability. The map says built screens do not exist | BE≤21 | `journey.descriptor.v2.ts:87–95`: availability `P`→`A` for `execute_replay`, `attempt_lineage`, `compare_runs`, `release_candidate`, `run_report`. Needs a revision bump plus a registry migration (the registry is immutable, see CG-P09-04) | M | `real-00-1440`; `s0004/journey.json` |
| 00-4 | Cards open real screens, with no run context needed | 14 per-run cards (Run Progress, Evidence hub, S1–S5…) are greyed "SELECT RUN" and the map has no way to pick a run | A dead end: the reader cannot reach any run-scoped screen from the map | BD | — (option: a "pick a run" link to Run Library that carries the card's target, or "latest run") | M | `real-00-1440`; `R/JourneyMap.tsx:141` |
| 00-5 | "13 · Alpha version" is a live card | Greyed "NOT ROUTED" (the resolver has no `alpha_version_legacy`) | Unreachable card | FE | — | S | `real-00-1440`; `R/screenRoutes` |
| 00-6 | Mapping block: mono caps header "WHERE THE REDESIGN PLUGS INTO THE SHIPPED RUN VIEW — TAB BY TAB", gold mono **links** in the redesign column, footnote "The shipped tabs stay the run view's skeleton…" | "What the redesign adds" (serif). The redesign column is bold ink and not a link. No footnote | Copy, style and missing links | FE | — | S | `R/JourneyMap.tsx:337–350` |

Dropped as decided: the Portal shell and sidebar are kept, so the page is not full-width (DQ-01, AUDIT_P01_P10 §5). Alpha Import card copy follows the server v1 contract (DQ-05). Arrows stay visible at 660 (RF-04 README l.15). Availability comes from the server, with a bundled snapshot while a read fails (DQ-03).

---

### Screen 01 · Run Library (`/research/quantbt/runs`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 01-1 | Header link "attempt lineage" opens Lineage | "lineage ↗ select an alpha group below" is a hint, not a link, even though `filter_catalog.alphas` has exactly one alpha | Extra step, no link | FE | — | S | `real-01-1440-top` |
| 01-2 | Running card: PROGRESS `fold 3/5`, TRIALS `341 / 600`, ELAPSED `42m` | Queued rows print **"available"** three times. The server sends `availability.state = AVAILABLE` with `value: null`, and the UI prints `WITHHELD_WORDS.AVAILABLE` | A contract violation shown to the user. The frontend should also treat AVAILABLE+null as absent | BE≤21 | P12 library projection: never emit `AVAILABLE` with a null value (use `PENDING_SOURCE_CALLBACK`/`NOT_PUBLISHED`). Also an FE guard at `R/RunLibrary.tsx:268` | S | `s0004/text-real-01.txt:412–418`; `s0004/library.json` (`rrun_0df059…`, `rrun_6f9ffe…`) |
| 01-3 | Status pill matches the run | `rrun_0df059…` is **QUEUED** in the library, but all 5 stages are done and its claim says "sealed its artifacts". On S03 it is **FINISHING**, "terminal record is still being written", and has been since 2026-09-24 | The two screens disagree on status, and the run never finishes materialising | BE≤21 | P11 terminal materialisation plus the P12 status projection (library `status` must follow `effective_status`, and a stuck FINISHING needs a timeout or reason) | M | `real-01-1440`; `s0004/text-real-03-queued-stale.txt` |
| 01-4 | Failed card: FAILED AT `fold 2 · S2` | FAILED AT `2026-09-25T04:08:00.427Z` (raw ISO with ms, in red) | Raw value | FE | — | S | `real-01-1440-failed` |
| 01-5 | Failed card trail: the failing stage is red | S1–S4 look "done" and S5 is hollow. There is no fail stage, and nothing says where the run died | No "where" | BE≤21 | P12 `stages[].state = fail` plus a `failed_at_stage`/fold stat (X2 B5 already derives "failed at {stage}" for S09) | S | `real-01-1440-failed`; `library.json` stats `FAILED_AT` |
| 01-6 | Claim note sits in the right column on every card | On failed cards the note drops below the trail on the left | Inconsistent row layout | FE | — | S | `real-01-1440-failed` |
| 01-7 | Completed WFO card: sparkline plus OOS Sharpe, Δ decay, trades | The WFO run shows "not published" ×3 and an empty sparkline (`P13_SOURCE_EVIDENCE_NOT_PUBLISHED`), yet S04 for the same run shows OOS Sharpe −5.35, decay 3.91 and a 1,056-pt equity | The library ignores the retained lane | BE≤21 | P12 library: read the W7 retained lane (`rs02.delta-signal-notional-wfo.v1`) for stats and sparkline | M | `real-01-1440-top` rows 2, 4, 6 vs `real-04-wfo-1440-part0` |
| 01-8 | rc chip (`rc_2026_08_c · APPROVED`, `rc_ (draft) · DRAFT`), SUPERSEDED line, scratch badge | Not visible. `rc_availability` is `P21_NO_PERSISTED_RELEASE_CANDIDATE` on every row; the rendering path exists (`R/RunLibrary.tsx:885`) | Data absent; approval states need Governance | BE22+ | P22 approval writer / mirror (OL-03, OL-04) | S | `library.json` |
| 01-9 | 7 cards, one screen | 33 cards on one page: 5,017px tall at 1440 and 8,795px at 660 | Page guard (already tracked as OL-21 `S01-RUNLIBRARY-PAGE-GUARD`) | FE | — (`page.limit=50` already exists) | M | `real-01-1440`, `real-01-660` |
| 01-10 | Filter chips | Chips write `?status=FAILED`. A lowercase link (`?status=running`) is silently ignored and the full list shows | Deep-link fragility | FE | — | S | `s0004/text-real-01-empty.txt` |
| 01-11 | Summary bar "7 runs · 5 completed · 1 running · 1 failed" | "33 runs · 0 issued · 15 not issued · 2 pending · 16 failed" (a claim ledger, not status counts) | The meaning changed from the HiFi | BD | — | S | `real-01-1440-top` |

Dropped as decided: the "stitched OOS equity" label on single-window runs (H1). Two-decimal currency with no `$` (H6). No module header, with an in-page breadcrumb (DQ-01). The compare bar works (same key → "open compare →", different key → refusal copy), so it is not a gap.

---

### Screen 02 · New Run (`/research/quantbt/runs/new`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 02-1 | Breadcrumb "Runs / New Run" | Link row "Run Library · Import a version · Full route atlas" | Not the HiFi breadcrumb (DQ-01) | FE | — | S | `hifi-02-1440` vs `real-02-1440` |
| 02-2 | Title at x=272, y=91. Subtitle Newsreader 13.5. Engine-release line under the subtitle. Panel titles Inter 12/600 caps | Title at x=296, y=114: S02 alone gets 24px more inset and ~23px more top gap than 01/03/04. Subtitle 13px. Engine line sits right of the title. Panel titles render in Newsreader | Geometry and typography | FE | — | S | `measure.json` 02.*; `real-02-step0-1440` |
| 02-3 | Badge "PUBLISHABLE · av_0_9_3" | Before any selection it reads "PUBLISHABLE · no version bound", which contradicts itself. After binding it shows the long `av_delta_rsi_polynomial_alpha_1_0_0` instead of `version_label av_1_0_0` | Wrong state and a long id | FE | — | S | `R/NewRun.tsx:1423–1425,1633–1635` |
| 02-4 | Opens with the alpha and version bound | Opens empty. The fact strip shows six "not reported" and a "Version declaration: Not read for this declaration…" panel before anything is chosen. The registry has exactly one ACTIVE entry | Empty-state wording implies the server withheld facts. Could preselect the single entry | FE | — | S | `real-02-1440` |
| 02-5 | Context card: IMPORT STATE (U14), SUPERSEDES, links "lineage → · runs of this av_ → · import new version →", RC-composition note | Only alpha, version, lifecycle, source, entrypoint and timeframes | Missing facts and links. `lifecycle_state` and `supersedes_state=HISTORICAL_NOT_RECORDED` are already in the registry | FE | — | S | `real-02-step0-1440`; registry `/api/v1/research/alphas` |
| 02-6 | Context: "LAST PUBLISHED RC rc_2026_08_c · APPROVED" | Absent | Publication fact | BE22+ | P22 publication/approval read per `alpha_version_id` | S | `hifi-02-1440` |
| 02-7 | Stepper: 8 pills on one row, caption = state ("valid" / "preflight pending") | Wraps to 2 rows at 1440. The caption is a static description ("alpha · av_ binding"); state shows only through the icon | Layout and state wording | FE | — | S | `real-02-step*-1440` |
| 02-8 | No errors before the user reaches a step | The rail shows a red box "A symbol is required / A holdout end-exclusive is required…" on first load | Premature validation | FE | — | S | `real-02-1440` |
| 02-9 | Gold "CLAIM FORECAST — THE ADDITION" card: mode×schedule, source, claim `RETROSPECTIVE / COMPAT`, payload sha, the italic "augmentation" note | A plain box in the "Review" rail. The claim prints the raw enum `not_causal_multi_fold_global_calibration` and "OOS: retrospective" | Styling, copy and a raw enum | FE | — | S | `real-02-wf-mode-1440` |
| 02-10 | CERT CEILING **C** plus "Want B? Advanced Walk-Forward with per_fold_causal". Window timeline bars with bar counts (8,766 / 3,282 / 2,454) | "cert ceiling not published". Timeline is text only, "not declared → not declared" | Data missing | BE≤21 | Cert ceiling per mode×schedule on the Atlas/foundation read (P09), and bar counts per window from dataset coverage (P10 dataset/preflight) | M | `real-02-wf-mode-1440` |
| 02-11 | Route grid: badge = admission (OK / RUST / LEGACY / EXP / DEFERRED) | Not-admitted cards carry a **SUPPORTED** badge next to red refusal text. Two headings ("ENGINE ROUTES" and "ROUTE"). "full route atlas →" moved to the breadcrumb | The badge contradicts the card | FE | — | S | `real-02-step2-1440` |
| 02-12 | Data: declaration box (required columns, declared timeframes, warmup bars, seed) | Missing. The registry declaration carries `required_columns`, `warmup_bars=300`, `determinism.seed_required`, `timeframes` | Unused data | FE | — | S | `hifi-02-step3` vs `real-02-step3`; registry JSON |
| 02-13 | Data and walk-forward prefilled (dataset, BTCUSDT, IS/OOS/Holdout dates) | Dataset "choose a dataset", symbol empty, all six dates empty | No defaults | BD | — (prefill from the dataset's coverage, or keep a blank form) | S | `real-02-step3/4-1440` |
| 02-14 | Parameter table with a header row (PARAM / DECLARED / DIM / LOW / HIGH / STEP / STATUS) and a "declared bounds" status | No header row, no STEP column (step is in the declaration), status reads just "declared" | Missing columns | FE | — | S | `real-02-step5-1440` |
| 02-15 | Optimization: trials, early stop and seed inputs | Inputs are editable, yet the same panel says the profile `P10.FIXED-QUALIFICATION.V1` makes overrides FORBIDDEN and seed/early stop MUST_BE_NULL | The controls contradict the admission profile. They should be disabled with a reason | FE | — | S | `real-02-step6-1440` |
| 02-16 | Review: summary table plus primary "RUN PREFLIGHT" in the main panel | The summary moves to the rail. The main area shows **6 stacked EMPTY panels** ("No preflight has been run…") and a small ghost "Run preflight" button, then "Create run" and a 7th empty panel | A heavy empty state, and the primary action is buried | FE | — | M | `real-02-step7-1440` |
| 02-17 | "RULES OF THIS SCREEN" footer | Missing (01 and 03 have it) | Copy | FE | — | S | `real-02-1440` |
| 02-18 | — (spec: `?step`) | Clicking a pill does not write `?step=`, so a reload loses the step | Deep link | FE | — | S | `probe02` log: URL stays `/runs/new` |

Dropped as decided: strategy cards replaced by `strategy_id` pinned to `alpha_id` (DQ-07). 12 routes NOT_ADMITTED with reasons (DQ-11). No "Account · execution" row (DQ-12). Optimizer defaults folded into an accordion (RF-04 README l.38). The HiFi itself breaks at 660 (horizontal overflow of 316px); the real page does not, so that is not a gap.

---

### Screen 03 · Run Progress (`/research/quantbt/runs/:id/progress`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 03-1 | Title "Run progress — R-WFO-119" | At 660 the run id breaks mid-token ("…905a17 / d5") | Wrapping | FE | — | S | `real-03-wfo-660` |
| 03-2 | Claim passport: VALIDATION_CLAIM, CHRONOLOGICAL_CLAIM, OOS_USED_FOR_SELECTION, HOLDOUT_STATE, CERTIFICATION, in forecast then issued | Shows the claim sentence, certification, seal and hand-off cursor. The 4 methodology claims are absent. On a queued run the **FORECAST box is empty** (title only) | The passport's main job is missing | FE | — (forecast from the Atlas by mode×schedule, as S02 does; issued from the hub/lane claim read) | M | `real-03-*-1440`; `real-03-queued-1440` |
| 03-3 | Queued/running states | Queued `rrun_9c3f…` (since 2026-09-23, "next attempt not before 2026-09-23 11:41", 3 days overdue) shows endless skeleton shimmer for the stepper, Gantt and artifacts, and no overdue notice | No stale or overdue state, and no typed empty state | FE | — | S | `real-03-queued-1440` |
| 03-4 | CANCEL RUN on a non-terminal run | Stuck `RETRY_WAIT` runs are never redispatched, and `may_cancel=false`, so the user cannot stop them | A run that is stuck for good | BE≤21 | P06/P11 queue: redispatch or expire overdue RETRY_WAIT, and let the owner cancel it | M | `/api/v1/research/runs/rrun_9c3f…/progress` `current.job_state=RETRY_WAIT` |
| 03-5 | Artifacts: 7-row manifest (fold_plan.json, search-trace.parquet, selection_trace.json, parameter_set.json, series/stitched.parquet, claims.json, holdout DENIED) with state and note | WFO: 2 progress files plus the RESEARCH_BUNDLE table. P04: 4 files plus sealed holdout DENIED | Manifest incomplete, worst on WFO | BE≤21 | P05/P11 per-run manifest of the sealed evidence artifacts, including the W7 retained lane | M | `real-03-wfo-1440` vs `hifi-03-completed-1440` |
| 03-6 | Short artifact names, formatted sizes | ROWS `1063`, BYTES `163826`, SEALED AT `2026-09-25T21:10:25.516Z` (raw). Paths truncated from the left ("…rch/progress-journal.ndjson") | Raw numbers and dates | FE | — | S | `R/ArtifactPanel.tsx:122–123`; `real-03-wfo-1440` |
| 03-7 | Gantt rows fill the panel | With 1–2 folds, ~200px of blank space above the cursor row | Fixed height | FE | — | S | `real-03-p04-1440` |
| 03-8 | Console: stage events, `fold_0x frozen · best J₁…`, `BUILDING_ARTIFACTS · claims.json issued` | WFO: 3 `global trial n` lines. P04: 1 line | Engine journal is thin | BE≤21 | P11 journal: publish fold-freeze and artifact-build events | S | `real-03-wfo-1440` vs `hifi-03-completed-1440` |
| 03-9 | ARCHIVE RUN in the terminal state | None | No action or endpoint | BD | — (an archive endpoint would follow if kept) | S | `hifi-03-completed-1440` |
| 03-10 | — (the HiFi has no failed design) | "ARTIFACT_COMMIT_FAILED — P05 seal was refused (400 RESEARCH_INVALID_INPUT)" and "1 / 1 trials · 85%" | Raw codes as prose (VD-P23-01: screen words, not server prose) | FE | — | S | `s0004/text-real-03-failed.txt` |
| 03-11 | Denied / 404 | Heading "Run not found — …" plus "does not exist in this workspace, or you cannot read it here" | Against the X3 one rule (a 404 reads like a 403, with the F-04 sentence) | FE | — | S | `R/RunProgress.tsx:1918`; `text-real-03-missing.txt` |

Dropped as decided: 5 contract stages instead of 11 engine pills (H5, DQ-04). Poll floor 5 s vs the HiFi's 8 s (DQ-02: the spec wins on behaviour). The demo transport controls exist only in the prototype. The Stage-log tab matches the HiFi (`real-03-stagelog-1440`). The FINISHING-forever run is counted under 01-3.

---

### Screen 04 · Evidence Flow (`/research/quantbt/runs/:id/evidence`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 04-1 | Claim strip in display language: "NO — read once after freeze", "SEALED · LOCKED", "CHRONOLOGICAL_CAUSAL" | WFO shows raw `not_causal_multi_fold_global_calibration`, `retrospective_global_calibration`, OOS_USED_FOR_SELECTION `true`, HOLDOUT_STATE `n/a` | Raw enums and a bare boolean | FE | — | S | `real-04-wfo-1440-part0`, `real-04-wfo-660-top` |
| 04-2 | Claim strip populated | P04: all 8 claims "not published" | Hub issues no claims for the P04 profile | BE≤21 | P13 hub: methodology claims for the fixed P04 qualification (or a typed `NOT_APPLICABLE` with a reason) | S | `real-04-p04-1440-part0` |
| 04-3 | CERTIFICATION `B` plus "Stage 1 sets the cap ↗" | "not published" (`SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE`) and no cap link | Certificate absent | BE≤21 | P13/W7 methodology certificate (engine source) | S | both runs |
| 04-4 | Stage-tab subtitles carry facts ("5 folds · holdout sealed", "600 trials / fold", "3 digests · ✓ order", "cert B") | Generic "DONE · fold 1" | Less information | FE | — (the facts are in the split/search/freeze reads) | S | `real-04-*-1440-part0` |
| 04-5 | Deep dives "S2 search · S3 freeze · S4 replay · promotion · journey map" are all links | "S4 replay" and "promotion" are greyed "Screen 08 is not built yet (P17)" / "Screen 11 is not built yet (P21)", though both routes are mounted | Stale disabled links | FE | — | S | `R/EvidenceFlow.tsx:1270–1272` |
| 04-6 | Every published tile shows a value | WFO: TRADE COUNT "not published" while the verdict table lists 5+5 trades. Sortino, CAGR, PF and both hit rates show `UI_RETAINED_LANE_HAS_NO_FIELD` | Aggregate fields missing | BE≤21 | W7 retained lane: aggregate trades, Sortino, CAGR, profit factor, hit rates | M | `real-04-wfo-1440-part0` |
| 04-7 | EChart 1 "Equity — IS vs stitched OOS": two series and a legend | OOS only (no IS equity series) | IS series missing | BE≤21 | P13/W7: `EQUITY_IS` series | M | `hifi-04-1440-part0` vs `real-04-*-part0` |
| 04-8 | Stitched OOS starts at the first OOS window | WFO line runs flat at 20,000 from 2026-06-05 to fold_01 (~2026-07-01), so a month of pre-OOS time reads as flat OOS performance | Misleading segment | FE | — (shade or clip before the first `fold_*` OOS start; or the lane stops sending pre-OOS rows) | S | `real-04-wfo-1440-part0/1` |
| 04-9 | Smooth equity | P04 serves 25 points from 744 (EXTREMA_BUCKET_V1), which looks jagged, although the footnote says the hub cap is 192. WFO serves all 1,056 | Over-downsampled | BE≤21 | P13 hub series: serve up to the 192 cap / FULL ≤2000 as W3 CG-P13-05 did for the lane | S | `real-04-p04-1440-part0/2` |
| 04-10 | EChart 3 rolling Sharpe · rolling beta vs benchmark | Both panels empty: WFO `UI_RETAINED_LANE_HAS_NO_SERIES` and no benchmark. P04 rolling Sharpe is `not applicable` (<63 daily returns) | Series missing | BE≤21 | Retained lane rolling-Sharpe series (the benchmark series is an engine-side dependency) | M | `real-04-wfo-1440-part1` |
| 04-11 | Behaviour tiles (beta, corr, skew, kurtosis, win rate, avg holding, exposure, turnover) | All 8 "not published" on both runs | Analytics missing | BE≤21 | P13/W7 behaviour analytics | M | `real-04-*-part1/2` |
| 04-12 | Monthly returns grid fills its card | 1 cell, then ~250px of blank space (the card is stretched to the behaviour card's height) | Layout | FE | — | S | `real-04-wfo-1440-part1/2` |
| 04-13 | Per-fold verdict table | P04: "per-fold metrics — not published" (WFO works) | P04 lane lacks fold facts | BE≤21 | P13 hub `fold_facts` for the P04 profile | S | `real-04-p04-1440-part1` |
| 04-14 | Denied / 404 | "Run not found in this workspace / No run with this id exists in your current workspace…" | States non-existence, against the X3 one rule (404 = 403 = denied, F-04 sentence) | FE | — | S | `R/EvidenceFlow.tsx:3688`; `real-04-missing-1440` |
| 04-15 | 660: claims stack in one column | The claim box keeps 2 columns; the "Claims issued by…" note takes ~40% of the width and squeezes the claims | Mobile layout | FE | — | S | `real-04-wfo-660-top` |
| 04-16 | — | The charts' accessible data table reads `19996.892873321103`, `-0.002863191197955050224529246766933654409025539909` and ISO-ms timestamps | Raw precision for screen readers (DQ-08: round, full value on hover or copy) | FE | — | S | `s0004/text-real-04-p04.txt:194–200` |

Dropped as decided: 15 metric tiles instead of 5 (H2). EChart 3 split plus EChart 5 added (H3). Passport as a card with an inline dataset panel (H4). Currency without `$` (H6). No zoom slider (P13 `frontend-composition-claude.md` "zoom slider… spec 04 §7 puts on Screen 08"). Metric rounding (DQ-08).

---

### Counts

| Class | 00 | 01 | 02 | 03 | 04 | Total |
|---|---|---|---|---|---|---|
| FE | 4 | 5 | 14 | 7 | 8 | **38** |
| BE≤21 | 1 | 4 | 1 | 3 | 8 | **17** |
| BE22+ | 0 | 1 | 1 | 0 | 0 | **2** |
| BD | 1 | 1 | 1 | 1 | 0 | **4** |
| Decided, dropped | 4 | 3 | 4 | 3 | 6 | **20** |

### Most important gaps

1. **The library hides WFO results (01-7, BE≤21, M).** The run library shows "not published" for WFO Sharpe, decay and trades, while S04 shows the numbers for the same run. The entry screen undersells the only real walk-forward.
2. **The journey map calls five built screens "SOON" (00-3, BE≤21, M), and every per-run card is a dead end (00-4, BD).** The map is supposed to be how people get around, but it points at nothing past the hub.
3. **Run status is inconsistent and some runs are stuck (01-3, 03-4, BE≤21, M).** The same run is QUEUED in the library and FINISHING on S03. RETRY_WAIT runs are 3 days overdue and cannot be cancelled. The library also prints "available" for null values (01-2).
4. **Stale "not built" links on S04 (04-5, FE, S).** S4 replay and promotion are disabled although S08 and S11 are routed. This is a one-line fix and is on the main path.
5. **S02 first impression (02-3/4/8/16, FE).** The badge contradicts itself, errors show before any input, "not reported" appears everywhere, and six empty preflight panels bury the primary action. The declaration facts the registry already sends (warmup, columns, step) are not used (02-12/14).
6. **The claim passport on S03 lacks the four methodology claims, and the forecast box is empty for queued runs (03-2, FE, M).**
7. **Raw values on screen (FE, S each):** claim enums and a bare `true` (04-1, 02-9), ISO-ms timestamps (01-4, 03-6), unformatted row and byte counts (03-6), and server error codes as prose (03-10).
8. **The refusal rule is broken on 404 (03-11, 04-14, FE, S).** Both screens state "not found" instead of the X3 denied sentence.
9. **Evidence series and analytics are missing (04-6/7/10/11, BE≤21, M):** IS equity, rolling Sharpe, behaviour tiles and aggregate trade count. Also the misleading flat pre-OOS segment on the WFO equity chart (04-8, FE).

---

## Lượt 05-09

### HiFi vs frontend audit: Research Loop screens 05–09

Audited on 2026-09-26 by Claude (subagent). This was a read-only audit: no repo tree was edited.

### Setup

- **Code audited:** `/home/bobby/portal/.claude/worktrees/agent-af165baa3f4d8979a/apps/portal/frontend` at `0b6b7fb8`. All `file:line` references below are relative to its `src/research/`.
- **HiFi sources:** `upgrade/research_loop/release-v1.1/QuantBT 05–09 *.dc.html`, rendered in Chromium from `file://`. HiFi 09 needs `doc-page.js`, which does not exist, so it was forced visible with injected CSS (the same method as the P18 receipt).
- **Real data:** the preview API on `:8095`, identity `c66836bf`.
  - P04 run: `rrun_8c9c9991bdd0cfe72100da64ebee1150`.
  - WFO run: `rrun_e1fa9e5cae3bcef8f8e38311905a17d5`.
  - Sign-in went through the real BFF as `claude-preview`.
- **Vite server:** ran on **:5196, not :5192.** Sibling audit agents share `scratchpad/hifi-audit/` and already held 5192 and 5193 with `vite.audit.config.mts`. My own config is `hifi-audit/s0509/vite.s0509.config.mts`. It sets `fs.allow` for the symlinked `node_modules` and uses the same proxy headers.
- **Screenshots:** in `hifi-audit/shots/`, all looked at.
  - HiFi: `hifi-0N-{1440,660}.png`.
  - Real: `real-0N-{p04,wfo}-{1440,660}.png`.
  - Interaction shots: `real-08-wfo-1440-row-reveal.png`, `crop-real-08-wfo-row-reveal.png`, `crop-real-09-*`.
  - Missing-run shots: `real-{split,search,freeze,execute,report}-missing-run-1440.png`.
  - Each shot has a `.txt` beside it with the requests, the overflow value and the page text.
- **Preview caveat.** The preview image `c66836bf` is 41 commits behind the audited HEAD. So X2's `declared_space`, `surface`, `stage4_binding` and `parameter_authority` do not appear on the real screens. S06 A1 range column, A2 surface, A3 charts, A4 histograms, B4 θ\* journey and region heatmap, plus S07 F2 declared range and F4 binding, all fall back to "not published".
  - The code for them exists (`SearchDetail.tsx:1288, 2162–2267`; `FreezeDetail.tsx:1141–1157`).
  - These are **verification debt for OL-23** (rebuild the preview, then take a real receipt). They are listed per screen under "verify after rebuild" and **not counted as gaps**.
- **What-if and byte-verify** are `NOT_ENABLED` on the preview (flags off). The enabled states were not seen.

### Classes and sizes

**Classes:**
- **FE** — frontend only.
- **BE≤P21** — needs a backend field or endpoint that Claude owns (P14–P18).
- **BE P22+** — needs a backend field or endpoint in Codex's scope.
- **DEC** — a HiFi deviation already decided. The source is cited and the row is dropped from the priority list.
- **BOBBY** — needs a Bobby design decision.

**Sizes:** S ≤ ½ day · M 1–2 days · L > 2 days.

---

### Cross-screen findings (05–09)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| X1 | Topbar breadcrumb `Research / QuantBT Backtest / R-WFO-118 / Stage N · …` | Shell topbar stops at `Research / QuantBT Backtest` on every stage screen | Run and stage are missing from the topbar | BOBBY (P17 receipt §4.1 proposes a separate shell task) | — | S | `hifi-05-1440.png` vs `real-05-wfo-1440.png` |
| X2 | Run label `R-WFO-118` in the page breadcrumb | Full `rrun_e1fa9e5c…a17d5` (37 chars) in the breadcrumb on all 5 screens and in the S09 title | No short run label | BOBBY. If a label is wanted, it needs a display id | BE≤P21: a `run_label`/display id on the P10/P11 run identity | S | all `real-*` shots |
| X3 | Folds numbered `fold_01…05` everywhere | Fold labels are `0`/`1` (S05 table, S07 F1, S08 chips, S09 folds). The hash uses `fold=1/2`: clicking row "1" on S05 writes `fold=2`. S07 copy says "one θ\* for folds 1–2" | Two numbering schemes on one screen and across screens | FE | — | S | interaction log (S05 row click → `#fold=2`); `FreezeDetail.tsx:928`; `real-07-wfo-1440.png` |
| X4 | One page frame: title at x=272 / y=91, subtitle `#939db0` italic 13.5px | S05/S06 match exactly (measured). S07/S08 do not use `SCREEN_FRAME`: title at x=280 / y=106, subtitle `#68738a`, gap 12px instead of 14px. S07 wraps F1–F3 in an extra outer "FREEZE" card the HiFi does not have | Frame drift between sibling stage screens | FE | — | M (S07 un-nesting) | `SplitDetail.tsx:120`; `FreezeDetail.tsx:1580`; `ExecuteDetail.tsx:1192`; geom probe |
| X5 | Page breadcrumb: sans, ink, `Stage 3 · Freeze` | S07/S08 breadcrumb is all mono and grey, with extra `← S2 Search` links; S05/S06 match the HiFi | Style inconsistency | FE | — | S | `real-07-wfo-1440.png` vs `real-05-wfo-1440.png` |
| X6 | Timestamp style `as-of 2026-08-12 04:18Z` | S05/S06 match. S07 P04 shows `as of 2026-09-26T10:04:17.920Z` and S08 `2026-09-25T21:10:26.361Z` (raw ISO with ms) | Raw timestamps | FE | — | S | `real-07-p04-1440.png`, `real-08-wfo-1440.png` |
| X7 | Tokens as lowercase words (`walk_forward · 5 outer folds`) | WFO lane humanises. P04 lane prints raw enums: `THREE_WINDOW_CURRENT`, `FIXED_PROFILE_NO_SEARCH`, `FIXED_PARAMETER_PROFILE`, `P08_METADATA_BOUND`, `NOT_EXPOSED_TO_CHILD_TAPE`, `NUMERIC`. P14's own deviation said the chip reads "p08 metadata bound" | Raw enums on P04 lane (S05, S06, S09 identity) | FE | — | S | `real-05-p04-1440.png`, `real-06-p04-1440.png` |
| X8 | Denied / missing state | S05/S06 show a full "RUN NOT AVAILABLE" page with the Run Library breadcrumb. S07/S08 keep stage nav and put DENIED in a panel. S08 still prints the P04 subtitle ("Orders, fills, positions and candles were not published by this source") for a run that does not exist. **S09 maps 404 → EMPTY "No report was found for this run"** | One refusal rule not applied on S09. The ledger (OL-20) says the S09 F-04 fix merged, but `reportClient.ts:336–345` still maps 404→`empty` in this tree | FE | — | S | `real-*-missing-run-1440.png` |

---

### Screen 05 — S1 Split

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 5.1 | Header: breadcrumb, title, subtitle, source · as-of, COPY EVIDENCE LINK | Present. Title, subtitle and position identical (measured). Copy link copies the product URL with the fold | none | — | — | — | geom probe; clipboard log |
| 5.2 | Protocol switcher (walk_forward / train_test / full_sample) + WINDOW_MODE chips | One chip `advanced walk-forward · weekly · expanding` | Demo switcher not built | DEC (demo lanes may not share a product route: P15/P16 composition "Deliberate deviations") | — | — | `hifi-05-1440.png` |
| 5.3 | Facts grid: span, outer, inner, purge, embargo, holdout | Present, plus readiness, θ\* params, label horizon, warmup and strict outer OOS | none (additive) | — | — | — | `real-05-wfo-1440.png` |
| 5.4 | S1 fold construction: per-fold rows with purge/embargo hatches, year ticks, right-hand date ranges | Present. Ticks are thinned per the CG-P14-01 ruling. Hatches are absent only because purge/embargo = 0 bars. **At 660 the per-fold date ranges are dropped** (the HiFi keeps them) | Missing date ranges at 660 | FE | — | S | `real-05-wfo-660.png` vs `hifi-05-660.png` |
| 5.5 | 5 / 32 folds scale-demo toggle | absent | Demo control | DEC (same demo-lane rule, P14/P15 composition) | — | — | `hifi-05-1440.png` |
| 5.6 | Holdout band `SEALED · LOCKED` + "caps certification at ≤ B" | WFO: n/a with `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT`. P04: hatched band + `P08_METADATA_BOUND`; cert-cap sentence omitted | Chip wording and cap | DEC (P14 composition "Deliberate deviations"; W6A-D03 no grade policy). Raw-enum casing is X7 | — | — | `real-05-p04-1440.png` |
| 5.7 | S2 θ\* flow: search bar `search · 512 trials · IS only`, ❖ freeze marker, `prm_… frozen 06-30 23:59Z`, `trade OOS → S 1.28` | Rows present with `GLOBAL · trial 0` and the OOS S. **The search bar reads only "IS"**, with no trial count, although `search_contract` has n_studies and trials per study | Missing trial count on the bar | FE | — | S | `real-05-wfo-1440.png` |
| 5.8 | Freeze time on the θ\* flow | absent | — | DEC (X2 F5: QuantBT publishes no freeze/OOS-read clocks) | — | — | X2 record §2 |
| 5.9 | Fold table: FOLD … IS SHARPE / OOS · S_FULL / Δ DECAY | WFO populated (the HiFi body is empty). P04: IS/OOS/Δ read "not in read" | P04 cells say "not in read" instead of the source reason (`P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE`, as on S09) | FE | — | S | `real-05-p04-1440.png` |
| 5.10 | Boundary integrity: 5 ✓ rows (train∩test, purge applied, embargo applied, inner ⊂ outer, holdout untouched) + fold_plan digest | WFO: 3 rows (holdout n/a, gap scan "no field", train∩test ✓). **No purge or embargo row**, although the split publishes purge 0 / embargo 0 bars | Purge/embargo rows missing | FE | — | S | `real-05-wfo-1440.png` |
| 5.11 | Boundary integrity: gap scan | "no field in the retained lane" | Field missing | BE≤P21 | P14/RS-02 retained split `gap_scan` (W3b open list) | M | W3B record "S05" absences |
| 5.12 | Stitched OOS provenance: stitch digest "verified against fold boundaries" | "stitch digest — not in the split read" | Field missing | BE≤P21 | `stitch_digest` on `current-source/split` and the P14 split (W3b open list) | S | `real-05-wfo-1440.png` |
| 5.13 | "What this stage feeds forward" + cert cap | Present with a next link; methodology certificate typed absent | Cert cap | DEC (W6A-D03) | — | — | — |
| 5.14 | Rules footer | Shorter; the Train/Test and full-sample sentences are dropped | Copy | DEC (P14 composition: rules footer verbatim spec §2.7) | — | — | — |
| 5.15 | Links: Evidence Flow, next S2, S4, Lineage | All resolve and carry `#stage=&fold=` | none | — | — | — | interaction log |

**Verify after rebuild:** none.

---

### Screen 06 — S2 Search & Selection

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 6.1 | Header + COPY EVIDENCE LINK | Present. The link copies the URL with stage, fold, trial, params, mode, schedule and pick | none | — | — | — | clipboard log |
| 6.2 | OPTIMIZATION_MODE 5-mode switcher + SCHEDULE chips; "demo tape" line | Two fixed chips | Demo switcher | DEC (P15 composition "Deliberate deviations": five-mode demo tape) | — | — | `hifi-06-1440.png` |
| 6.3 | Claim row (validation, chronological, oos_used, OOS column state, scoring, metric) | Present with QUANTBT origin tags. P04 prints raw enums (X7) | none | — | — | — | `real-06-wfo-1440.png` |
| 6.4 | "What this mode reads": per-fold glyph strip (fold_01…05, hatched withheld OOS cell) | Tokens printed as text + Engine Atlas link; no glyph | Visual missing | FE (mode × schedule matrix is already served to the Atlas) | — | M | `hifi-06-1440.png` vs real |
| 6.5 | SEARCH CINEMA: 5-step playback + "play the selection" | absent | Decided for P04 (no trials). The WFO lane now has retained trials in order, but no sampler trace (`QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_TRACE`) | BOBBY: rebuild the cinema from ledger order on WFO, or keep it omitted | — | M | P15 composition "Deliberate deviations" |
| 6.6 | A1 search space | Kind, low…high, step and θ\* present. **P04: the range-position column overflows the card at 1440** ("interio…" clipped at the right edge) | Clipped column | FE | — | S | `real-06-p04-1440.png`; `SearchDetail.tsx:591–599` |
| 6.7 | Stage A/B freeze line label `POOL FROZEN · K=[512×0.10]=52 · 2024-09-30 23:59Z` | "POOL FREEZE · FROZEN" + `◀ OOS` chip | No K (the timestamp is DEC per X2 F5) | BE≤P21 | `search_contract.top_is_k` is null on the real WFO run; populate it on P15 retained search | S | `api/…current_source_search.json` |
| 6.8 | B1 pool freeze: trials evaluated, feasible (constraint ≤ 0), top-IS pool, re-evaluated on inner folds, selected, plus the K callout "pool closes BEFORE any OOS" | Three bars (trials 3, pool 1, selected 1); no feasible row, no K callout | Rows and callout missing | BE≤P21 (K and feasible count) + FE (callout) | `top_is_k`, `feasible_trial_count`, or a typed absence if QuantBT does not publish it | S | `real-06-wfo-1440.png` |
| 6.9 | B2 formula typeset (KaTeX) + term table | Formula as a plain mono line; term table present | Typesetting | FE (the P15 KaTeX omission was because the trace was unpublished; the formula is now shown as text) | — | S | `real-06-wfo-1440.png` |
| 6.10 | B2 sub-panels: per-fold decay bars of θ\*, and the pool on the S_IS × S_OOS plane | absent. Per-fold decay exists (S05 fold table Δ decay; current-source evidence fold verdicts) and candidates carry s_is/s_oos | Panels missing | FE (cross-read the fold verdicts already served to S04/S05; alternatively add them to the search read) | — | M | `real-06-wfo-1440.txt` (S06 does not read evidence) |
| 6.11 | B3 best ≠ selected: each card lists S_IS, S_OOS, d decay, max_dd | One number per card | Card detail | FE (s_is/s_oos/decay/J are in `candidates`) + BE≤P21 for per-candidate max_dd | `candidates[].max_drawdown`, or a typed absence | S | `real-06-wfo-1440.png` |
| 6.12 | Trial ledger: seed + digest per row | "not published" | — | DEC (W3b: retained rows carry neither) | — | — | W3B record S06 |
| 6.13 | Ledger row → pick | Works: `#…&pick=0` | none | — | — | — | interaction log |
| 6.14 | A5 importance · A6 interactions | Typed absences | — | DEC (X2-D03 Spearman proxy needs ≥ 8 trials; A6 `…DID_NOT_PUBLISH_PARAMETER_INTERACTIONS`) | — | — | X2 record |
| 6.15 | Rules footer | Shorter (no mode-switching sentence) | Copy tied to the demo switcher | DEC (follows 6.2) | — | — | — |

**Verify after rebuild (OL-23, not counted):**
- A1 range-position column with DR-02 bound warnings, grid size and levels.
- A2 trial surface.
- A3 progression charts.
- A4 histograms.
- A6 region heatmap.
- B4 θ\* journey with the top-decile column.

---

### Screen 07 — S3 Freeze

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 7.1 | Title "Freeze — what was sealed, and when" + subtitle | "S3 · Freeze — ordering & integrity" + a different subtitle | Copy | DEC (P16 composition re-audit: title verbatim spec 07 §2.1; spec subtitle withheld because ordering is NOT_ASSERTED) | — | — | — |
| 7.2 | Header meta `parameter_set.json · bundle manifest · as-of` + COPY EVIDENCE LINK | Chip strip (lane, selection, readiness, as-of); **no copy evidence link** | Copy link missing (S05/S06 have it) | FE | — | S | `real-07-wfo-1440.png` |
| 7.3 | Ordering scenario switcher + "binding to stage 4" demo chips | absent | Demo | DEC (P16 composition "Deliberate deviations") | — | — | — |
| 7.4 | ✓ ORDER VERIFIED / claim / CERT FROM THIS STAGE B | WFO: "⚠ NOT CAUSAL · GLOBAL SELECTION" + claim; no cert | Badge and cert | DEC (P16 deviations; W6A-D03) | — | — | — |
| 7.5 | F1 data-time rows per fold with a θ\* label | Present (fold 0/1, `OOS child = frozen θ* · 2671e27b`). Numbering is X3 | none | — | — | — | — |
| 7.6 | F1 wall clock (params_frozen_at, bundle_frozen_at, outer_oos_first_read_at) | Typed absence from the server | — | DEC (X2 F5) | — | — | — |
| 7.7 | F2 fold selector `‹ fold_03 · prm_7c1a9e ›` | One shared set with a "shared params — global schedule" banner | — | DEC (P16 deviation "one frozen set"; global schedule) | — | — | — |
| 7.8 | F2 footer "PROPOSE NEW ATTEMPT →" | Only "create sibling attempt →" inside the what-if card, disabled while what-if is off. **With what-if off there is no path to propose a new attempt** | CTA missing | FE (link to `runs/new?from=<run>`, independent of the what-if flag) | — | S | `real-07-wfo-1440.png` |
| 7.9 | F3 digest chain: ParameterSetV1 canonical form → params digest → strategy source PROTECTED_SHA256 → engine pin → dataset hash → config hash ⇒ bundle digest, plus VERIFY DIGEST | Retained custody card: manifest + import digests MATCH, row count, verify now, byte verify off. The chain rows exist only in the collapsed provenance | Chain not drawn | FE (render it from provenance + X2 `parameter_authority`) | — | M | `hifi-07-1440.png` vs `real-07-wfo-1440.png` |
| 7.10 | Byte verification | "byte verification off" (`P16_ARTIFACT_BYTE_VERIFY_NOT_ENABLED`) | Open ops item | DEC / ledger (OL-02: observer + receipt on preview) | — | — | ledger OL-02 |
| 7.11 | What-if sandbox | Inert sliders **labelled `entry_z` / `atr_mult` (HiFi demo names)**, not the Delta axes `rvol` / `slpercent` fixed by W5a A10c. The disabled reason is printed twice | Wrong labels + duplicate copy | FE | — | S | `WhatIfCard.tsx:128, 342`; `real-07-wfo-1440.png` |
| 7.12 | Copy θ\* digest | Works; copies the full sha256 (X2-D07) | none | — | — | — | clipboard log |
| 7.13 | Rules footer | Different copy | Copy | DEC (spec-verbatim rule, P16 composition) | — | — | — |

**Verify after rebuild (OL-23, not counted):**
- F2 declared range, range position and reading columns on WFO.
- F4 binding down to Stage 4 (BOUND / DRIFT) on both lanes.
- What-if enabled grid.

---

### Screen 08 — S4 Execute Replay

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 8.1 | Title "Execute — the frozen params trading the tape" | "S4 · Execute Replay — what this source can replay" | Copy | DEC (W5B D12) | — | — | — |
| 8.2 | Header artifact line (bars.parquet · events.parquet · ds_…) + COPY EVIDENCE LINK | absent | — | DEC (W5B D13; P17 receipt §4.1) | — | — | — |
| 8.3 | Route selector (5 routes), LENS manager/quant/audit, SCALE DEMO | One route chip + contract line | — | DEC (P17 receipt §4.1: one route per run; W5B D13 lens) | — | — | — |
| 8.4 | Stitched account fold chain with ⇄ param handoff | Fold chips with bars and return, capital policy line, whole-run overview strip | none | — | — | — | `real-08-wfo-1440.png` |
| 8.5 | IS / OOS / HOLDOUT band above the chart | One text line "FOLD 0 · OOS TEST WINDOW …" + shading in the overview strip | Band not drawn (fold windows are known from the split read) | FE | — | S | `hifi-08-1440.png` vs real |
| 8.6 | Candle chart + S/T markers | WFO: candles + T markers. P04: equity samples only; candles `P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS` | P04 hub lane has no candles | BE≤P21 (P17 hub replay candles for P04, like W5b D1 did for WFO); low priority | P17 `candle_windows` on the P04 hub | L | `real-08-p04-1440.png` |
| 8.7 | Price / position / equity panes with axes | WFO equity pane shows one y label. **P04: equity y labels collide at the top ("20,020 / 20,010"); drawdown labels −0.001…−0.007 stack on each other** | Axis density and collision (W3b "left open") | FE | — | S | `real-08-p04-1440.png` |
| 8.8 | Trade tape (green/red spans) | absent | No trades | DEC (W5B D14) | — | — | — |
| 8.9 | Transport ⏮ ◀◀ ◀ ▶ ▶ ▶▶ ⏭ + speeds | WFO fine. **P04: the first/last buttons render as empty glyph boxes** (⏮/⏭ are not in the font) | Missing glyphs | FE | — | S | `real-08-p04-1440.png`; `ExecuteDetail.tsx:352, 384` |
| 8.10 | "play across folds · ON" | absent; play stops at the window end by design ("read only when you ask") | Behaviour choice | BOBBY (play-across would issue reads at each window boundary) | — | S | `real-08-wfo-1440.png` |
| 8.11 | Readout `t · bar · event_seq · position · equity` | WFO good (formatted). **P04: `equity 19996.892873321103` raw** | Raw number | FE | — | S | `ExecuteDetail.tsx:435` |
| 8.12 | Event ledger | WFO: target-transition ledger (DEC W5B D3). **P04: sample ledger prints raw equity and 60-digit drawdown floats; dates wrap over 3 lines; the page overflows horizontally by 67 px at 660** | Raw numbers + overflow | FE | — | S | `ExecuteDetail.tsx:479–480`; `real-08-p04-660.txt` (scrollWidth 727) |
| 8.13 | Trade blotter · MAE×MFE · PnL distribution | Typed absences | — | DEC (W5B D14) | — | — | — |
| 8.14 | Trade anatomy: shows the selected trade's causal chain by default; a row click selects | Empty "Pick a transition…" until the small `#` button is clicked. Clicking the row or kind cell does nothing | Default selection + row target | FE | — | S | `ExecuteCandleReplay.tsx:648, 844`; interaction log |
| 8.15 | Causal reveal | Works (hides rows, totals and fold returns). **But the chart x-domain collapses to one candle at the right edge, and the whole-run overview strip still shows every future candle** | Reveal geometry + leak in the overview strip (W5B D10 says candles are cut) | FE | — | S | `crop-real-08-wfo-row-reveal.png` |
| 8.16 | Cost timeline | Present with fees; funding NOT_APPLICABLE with the run config reason | none | — | — | — | — |
| 8.17 | Child audit, KPI tiles | Extra (W5B D17) | none | — | — | — | — |
| 8.18 | Links ← S3, next Run Report | Present | none | — | — | — | interaction log |

**Verify after rebuild:** none. The P04 replay fixtures from X2 B6 are covered in unit tests only.

---

### Screen 09 — Run Report

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 9.1 | No-print bar "Hub · Stage 5 Claim / Release Candidate & Publish / Run Report" | Present, plus Print, Export JSON/CSV and disabled Parquet/Archive | none (additive) | DEC for Parquet/Archive (X2-D09) | — | — | `crop-real-09-wfo-top.png` |
| 9.2 | Title `R-WFO-118 — mom_breakout_v3 on BTCUSDT · 4h` + meta "generated · from immutable artifacts · engine" | Title from the server + mono run id. **The meta line breaks mid-word** ("research.report-present / ation.v1") because of `word-break: break-all` | Wrapping | FE | — | S | `ReportDetail.tsx:153, 174, 197, 214` |
| 9.3 | Certification box `B` | "not published" + reason, **also broken mid-word** ("…CERTIFICAT / ION_GRADE"); same wrapping rule | Grade is DEC (W6A-D03); the wrapping is part of 9.2 | DEC / FE (in 9.2) | — | — | same |
| 9.4 | (none in the HiFi) | "RUN REPORT · PARTIAL: The source did not publish headline values, artifact digests, passport facts". On WFO only 2 of 6 tiles, some artifacts and 1 passport fact are absent | Overstated notice (`.some()` → the whole category is named) | FE | — | S | `reportClient.ts:360–372` |
| 9.5 | Claim passport (6 engine keys) | WFO: verbatim keys. P04: "sealed source facts" | none | — | — | — | — |
| 9.6 | Identity (9 rows, short digests) | 23 rows, full digests | — | DEC (CG-P18-11; P18 receipt D3: full digests) | — | — | — |
| 9.7 | Identity on P04: "optimization" | `mode_1_decay × global` with no qualifier (S06 says "declared not executed") | Misleading on a fixed-profile run | BE≤P21 | P18 identity value/qualifier for a declared-not-executed optimizer | S | `crop-real-09-p04-top.png` |
| 9.8 | Headline: OOS RETURN · OOS SHARPE · MAX DD · TRADES·WIN, values coloured by sign | No OOS return tile, although net return is in metrics (−0.37% WFO / −0.15% P04). Values are not coloured | Return tile + sign colour | BE≤P21 (tile) + FE (colour) | P18 `headline` should include net OOS return | S | `crop-real-09-wfo-top.png` |
| 9.9 | Metrics table · warnings | Extra | — | DEC (P18 receipt §4.1: contract wider than the HiFi) | — | — | — |
| 9.10 | Equity: 6 y-ticks, grid, fold markers, underwater with trough label | IS dashed + OOS + fold markers + handoff caption. **Y axis has only min/max labels; the underwater "deepest −0.67%" label overlaps the curve** | Axis density + label collision | FE | — | S | `crop-real-09-wfo-mid.png` |
| 9.11 | Per-fold verdict (8 cols) + prose footnote | 8 columns. Footnote reads "0, 1 drag the run." | Copy (fold numbering is X3) | FE | — | S | same |
| 9.12 | Certification chain with a cap column | Sourced checks (caveat/pass/fail). Source keys break mid-word ("…segment / s") | Cap is DEC (W6A-D03/D05); the wrapping is in 9.2 | DEC | — | — | — |
| 9.13 | Key artifacts & digests | Part filenames + short digests; reason codes wrap mid-word | Download is DEC (W6A-D07); the wrapping is in 9.2 | DEC | — | — | — |
| 9.14 | Promotion state | Typed absence + "compose the release candidate" link | — | DEC / ledger (OL-03, Codex P22 writer) | BE P22+ (`attempt_promotion_pick_facts_v1` writer) | — | ledger OL-03 |
| 9.15 | Provenance: "Evidence link: portal://runs/…?bundle=…" | Revisions and digests; **no evidence link** | Link missing (X2-D06 pattern: product URL) | FE | — | S | `real-09-wfo-1440.txt` (no "evidence link") |
| 9.16 | Footer | Present | none | — | — | — | — |
| 9.17 | 404 state | "EMPTY — No report was found" | — | FE (in X8) | — | — | X8 |

**Verify after rebuild:** the failed-run sheet (X2 B5/F6) and the 32-fold print. Neither can be reached from the preview's runs.

---

### Counts per class

Each gap row is counted once, by its primary class. Rows with no gap, 9.17 (a duplicate of X8) and the "verify after rebuild" panels are excluded. Three rows are split between classes (6.8, 6.11, 9.8: a backend field plus FE work); they appear in both counts.

| Class | Count | Rows |
|---|---|---|
| FE | **30** (+3 split rows) | X3–X8; 5.4, 5.7, 5.9, 5.10; 6.4, 6.6, 6.9, 6.10; 7.2, 7.8, 7.9, 7.11; 8.5, 8.7, 8.9, 8.11, 8.12, 8.14, 8.15; 9.2, 9.4, 9.10, 9.11, 9.15 (+ FE halves of 6.8, 6.11, 9.8) |
| BE≤P21 | **8** | 5.11, 5.12, 6.7, 8.6, 9.7, and the backend halves of 6.8, 6.11, 9.8. X2 also becomes BE≤P21 if Bobby wants a short run label |
| BE P22+ | **1** | 9.14 (promotion pick writer, OL-03, already Codex's) |
| DEC (dropped) | **28** | 5.2, 5.5, 5.6, 5.8, 5.13, 5.14; 6.2, 6.12, 6.14, 6.15; 7.1, 7.3, 7.4, 7.6, 7.7, 7.10, 7.13; 8.1, 8.2, 8.3, 8.8, 8.13; 9.1, 9.3, 9.6, 9.9, 9.12, 9.13 |
| BOBBY | **4** | X1 (topbar breadcrumb), X2 (short run label), 6.5 (search cinema on WFO), 8.10 (play across folds) |
| Verify after preview rebuild (not gaps) | 9 panels | S06 × 6, S07 × 3 (X2 code is present; the preview predates it) |

Sizes of the open items:
- FE: 26 S and 4 M (X4, 6.4, 6.10, 7.9).
- BE≤P21: 6 S, 1 M (5.11), 1 L (8.6).
- BOBBY: 4 S.

### Most important gaps

1. **S08 P04 lane prints raw floats** (60-digit drawdown, `equity 19996.892873321103`) and overflows 67 px at 660; the transport shows missing-glyph boxes (8.11, 8.12, 8.9). It is the only screen here that breaks the "no raw numbers" rule. FE, S.
2. **S09 404 still maps to EMPTY** (X8). The open ledger (OL-20) says this was fixed and merged; in this tree `reportClient.ts:336–345` still does it. The S08 denied state also keeps a subtitle about a non-existent run. FE, S.
3. **S07 what-if sliders are labelled with HiFi demo parameters** (`entry_z` / `atr_mult`) instead of `rvol` / `slpercent` (7.11). With what-if off there is also no "propose new attempt" path (7.8). FE, S.
4. **Fold numbering is 0-based in labels and 1-based in the hash and copy** across 05/07/08/09 (X3), for example S07's "for folds 1–2" beside folds 0/1. FE, S.
5. **S07/S08 frame drift** from S05/S06 and the HiFi: offset, subtitle colour, the extra nested "FREEZE" card, mono breadcrumb, raw ISO timestamps, and no copy link on S07 (X4–X6, 7.2). FE, M.
6. **S08 causal reveal** collapses the chart domain and leaves future candles visible in the whole-run overview strip (8.15). The trade anatomy is empty until a tiny `#` button is clicked (8.14). FE, S.
7. **S09 sheet polish:**
   - The PARTIAL notice overstates what is missing (9.4).
   - `break-all` splits words across the meta line, certification box, chain and artifacts (9.2).
   - The equity y axis is sparse and the trough label collides (9.10).
   - The OOS return tile is missing from the headline (9.8, needs P18 `headline`).
8. **S06 Stage B detail** (6.7, 6.8, 6.10, 6.11):
   - Needs `top_is_k` and a feasible count (both BE≤P21).
   - Per-fold decay bars and the S_IS × S_OOS pool plot are missing (FE M).
   - B3 cards show one number instead of four.
9. **Backend ≤P21 fields still missing on the retained lane:** `stitch_digest` and gap scan on the split read (5.11, 5.12), `top_is_k` (6.7), and the P04 identity qualifier (9.7).
10. **Rebuild the preview (OL-23) before trusting S06/S07.** Nine X2 panels could not be seen on real data at all.

---

## Lượt 10-14

### HiFi vs frontend: Research Loop screens 10–14 (read-only audit, 2026-09-26)

**What was compared**

- **Code:** `/home/bobby/portal/.claude/worktrees/agent-af165baa3f4d8979a/apps/portal/frontend` at HEAD `0b6b7fb8` (X3, which already merges X1 and X2).
- **Server:** Vite dev on `localhost:5193`, config `hifi-audit/s1014/vite.s1014.config.mts`. It proxies `/api` to the read-only preview `:8095` (image `c66836bf`: before P22, before W7, lineage contract 1.0). Login is `claude-preview` through `/api/auth/login`. Fonts load; `fs.allow` includes `/home/bobby/portal-research`.
- **Data:** alpha `delta-rsi-polynomial-alpha`, P04 run `rrun_8c9c9991…1150`, WFO run `rrun_e1fa9e5c…17d5`, and for the S13 pair a second WFO run `rrun_f5e09186…1cb2`.
- **HiFi:** the `release-v1.1/QuantBT 1{0..4} *.dc.html` files, opened from disk. Nothing was edited or committed in any repo tree.

**Shots** are in `hifi-audit/shots/`. They come as `hifi1N-{1440,660}.png` and `real1N*-{1440,660}.png` pairs, plus `state-s1N-*.png` (loading / 503 / 401 / 403 / 404), the tab and mode shots (`*12-execution*`, `*12-claims*`, `*13-markets*`, `*13-pair*`), and the `real14-double-*` shots. For those S14 shots, parse and gates came back from the canonical `packages/contracts/fixtures/research-alpha-import.*.valid.json` through `page.route`, so no write reached the preview.

**Class codes**

- **FE:** FE-only.
- **BE:** needs a backend field or endpoint. The row names the field and whether it falls in ≤P21 (Claude) or P22+ (Codex).
- **DEC:** a HiFi deviation that is already decided. These are listed after each table with their citation and are **not** counted as gaps.
- **BOBBY:** needs a design decision from Bobby.

**Size:** S = under half a day, M = 1–2 days, L = more than 2 days.

**Two general notes**

- **The HiFi has no 660 layout.** Every HiFi overflows at 660 (scrollWidth 673–732) and the S10 HiFi breaks apart (see `crop-hifi10-660-0.png`). At 660 I therefore judged the real screens against the rule of no horizontal overflow and a readable layout. All 12 real 660 shots have scrollWidth 660.
- **Some absences come from the old preview, not from the frontend.** The preview predates P22, W7 and lineage 1.1 (OL-23). Several absences on screen come from that alone: `P11_PROGRESS_CALLBACK_NOT_YET_MATERIALIZED` on S10, `P22_*_NOT_COMMISSIONED` in S11's taxonomy and publish card, and the WFO pack at 3·0·2·7. They are not listed as frontend gaps.

---

### Screen 10: Attempt Lineage (`/research/quantbt/alphas/:alphaId/lineage`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 10-1 | Crumb `Attempt Lineage — mom_breakout_v3 · BTCUSDT · 4h` | `Attempt Lineage — Delta-RSI Polynomial Alpha`; no market or timeframe | Subject has no market/timeframe; the lineage `alpha` object carries none, and an alpha can span several markets | BOBBY | If kept: `alpha.default_market/timeframe` on lineage (≤P21, P19) | S | real10-1440 / hifi10-1440; P19 receipt:518 "chưa có request" |
| 10-2 | Short attempt ids (`att_01`) in the version band, card head, selected title and diff | Raw 37-char `ratt_9c3f…04d` everywhere; the selected-panel title is uppercased (`RATT_E1FA9E5…`); a probe row truncates it mid-hash | No display rule for ids (8-hex + full in `title`/copy) | FE | — | S | real10-wfo-selected-1440; P19 receipt:519 (recorded, no decision) |
| 10-3 | Run label `R-WFO-114` next to the attempt | Full `rrun_…` id | No field carries a human run label | BOBBY + BE | `primary_run.display_label` (or ordinal) on lineage/compare/RC (≤P21, P13/P19) | M | P19 receipt:517 "chưa có request" |
| 10-4 | Tree nested by `parent_attempt`, with a gold change note (`optimization_schedule: global → per_fold_decay`) and a diff vs parent | 33/33 attempts are `parent_state: ROOT`; every card says "root — no parent"; the tree is flat and "diff vs parent" is always "Root attempt" | The structure the screen was built for never appears on real data. Either the clone/New-Run path (`/runs/new?from=`) does not write `parent_attempt_id`, or the seed never cloned. Needs checking | BE | Check that a clone writes `attempts[].parent_attempt_id` + `relation_to_parent` (≤P21, P10/P19) | M | api-…lineage.json (all ROOT); real10-probes-1440 |
| 10-5 | Selected attempt: 5 rows + line "Weakest number, strongest claim — the node this tree exists to produce." | 20 rows (intent, primary run, run state, exec profile, engine release, 2 digests, retries, created/updated…) + verdict/exposure lines; the HiFi line is missing | Panel is 3–4× taller than the HiFi; the technical rows could sit under a disclosure | BOBBY | — | S | real10-wfo-selected-1440 vs hifi10-1440 |
| 10-6 | `claim  STRICT_OUTER_OOS` (a claim family) | `claim  NOT_ISSUED`: a raw state enum printed as the value | Raw enum on screen; should read "not issued" with the reason | FE | — | S | LineageDetail.tsx:1582-1586; real10-wfo-selected-1440 |
| 10-7 | One status pill per attempt (SUPERSEDED/ACTIVE/ABANDONED/DRAFT) | Version pill ACTIVE **plus** raw run chip (QUEUED/FAILED/READY) on every row; 33 green ACTIVE pills in the probe list | S10-RAW-STATE-CHIP still AWAITING_DECISION | BOBBY | — | S | P19/thanhvuong-debt-register.json:43-49; real10-probes-1440 |
| 10-8 | No screen-level notice (the pick card explains itself) | Full-width "ATTEMPT LINEAGE · PARTIAL — promotion pick (P19_…)" card above the root card, repeating the pick card below it | The partial notice pushes the tree down about 110 px and says the same thing as the pick card | BOBBY | — | S | real10-1440 |
| 10-9 | Not in HiFi | "COUNTS — the multiple-testing disclosure" panel | S10-COUNTS-PANEL AWAITING_DECISION (the S13 twin VD-P20-08 was decided "keep") | BOBBY | — | S | P19/thanhvuong-debt-register.json:27-33 |
| 10-10 | Source chip `attempts.json · lineage is engine-recorded` | Same words, but the read authority is `PORTAL_PERSISTED_RESEARCH` (printed in the counts panel) | S10-SOURCE-CHIP-VS-READ-AUTHORITY AWAITING_DECISION; the chip names a source this read does not use | BOBBY | — | S | debt-register.json:35-41 |
| 10-11 | `cert C` / `cert B` on each card | `cert not published` (engine does not publish a grade) | S10-CERT-NOT-PUBLISHED wording AWAITING_DECISION; the absence itself is by contract | BOBBY | — | S | debt-register.json:19-25 |
| 10-12 | PROMOTION PICK `att_03 · R-WFO-118 · prm_… → rc_ (draft) · gate R1 next` | "source did not publish a promotion pick — nothing here picks one" + code | Real pick needs the P22 writer | BE | `attempt_promotion_pick_facts_v1` writer = governed approval of a sealed RC (OL-03 / CG-P19-10, **P22+** Codex) | — | U:3662; real10-1440 |

States: loading, 503 (unavailable, "read again"), 403/404 (identical neutral denied) and 401 (shell Frame 01D) all render correctly (`state-s10-*.png`). Links: runs, new run, compare, import new version, declare at New Run, open evidence, run report, freeze, release candidate, clone and reconcile all resolve to served routes. "rc & publish" is struck through when there is no rc, which is correct. 660: single column, no overflow.

**Dropped (already decided):**

- The 4 filter chips + counter: VD-P19-01.
- Server band order: VD-P19-02.
- Chip wrap and radius: VD-P19-03.
- 26 px rail: VD-P19-04.
- Promotion-rule copy + "awaiting a published pick N · promotion closed M": VD-P19-05 / D-W6B-08.
- Probe toggle collapsed on load: VD-P19-07.
- Storied/probe split: D-W6B-02.
- Paging: D-W6B-03.
- 3-decimal metrics and "selected trial, mean of folds": W6B checklist :68 / D-W6B-04.
- No "gate R1 next" (rc chip instead): W6B :71.
- Untried = the ACTIVE version's list: D-W6B-05.
- Amber on white (axe): D-W6B-10.

All cites are in `U:5549-5555` and `P19/W6B_P19_CLAUDE_2026-09-25.md`.

---

### Screen 11: Release Candidate & Publish (`/research/quantbt/runs/:runId/release-candidate`; S11 = Thanhvuong version + X1)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 11-1 | Pack item names in sentence case, 13 px Inter ("Alpha Version passport") | UPPERCASE, letter-spaced ("ALPHA VERSION PASSPORT") | CSS bug: the item is `<th scope=row>` and inherits `styles/base.css:39-45` (`table th {text-transform:uppercase; letter-spacing:.06em}`); `.rc-pack .item` does not reset it | FE | — | S | ReleaseCandidateDetail.tsx:341, :959; real11-p04-1440 |
| 11-2 | Record preview: values shortened (`sha256:3fe4a1…`), all inside the card | 64-hex values `white-space:nowrap` run past the card's right edge (scroll inside `.rc-yaml`, but at a glance they look cut off); the lower half of the card is empty because it stretches to the side column | Needs a display rule (ellipsis + full value in `title`; copy yaml already copies the exact bytes) and no stretch | FE | — | S | ReleaseCandidateDetail.tsx:368-374; real11-p04-1440, real11-wfo-1440 |
| 11-3 | Rail: `SELECTED PARAMS prm_7c1a9e · θ* #143 · SelectionTraceV1`; `RUN / ATTEMPT R-WFO-118 · att_04` | Selected params = a 64-hex `parameter_bundle_digest` wrapped over 3 lines; run node = full `rrun_…` + full `ratt_…` | Raw digests/ids in the rail (FE short-id/digest rule, same as 10-2). The prm id and trial ordinal are not in the P21 composition | FE + BE | FE: shorten. BE: `selection.selected_parameter_artifact_id` + `trial_number` on the RC composition (≤P21, P16/P21) | S (FE) / M (BE) | real11-p04-1440 |
| 11-4 | Crumb `Evidence Flow / R-WFO-118 / Release Candidate & Publish` | `… / rrun_8c9c…1150 / …` | Run label: same field as 10-3 | BOBBY + BE | `display_label` (≤P21) | — | real11-p04-1440 |
| 11-5 | No meta line under the title | `PORTAL_PERSISTED_RESEARCH  as of …  source <64 hex>  draft VIRTUAL · revision 0` | Raw enums and a full hash in a visible line (X1-D02's boundary line is a different sentence); humanise ("draft not saved yet"), shorten the digest | FE | — | S | real11-wfo-1440 |
| 11-6 | Pack header: title, then the claim-ceiling/engine-cert chips and counter on the same line, right-aligned | Chips and counter wrap below the title at 1440 | Header does not fit on one line; the title could use the HiFi's shorter mono size, or the chips could keep `margin-left:auto` | FE | — | S | real11-p04-1440 vs hifi11-1440 |
| 11-7 | 660 (no HiFi): the pack scrolls in its frame (X1 accepted) | Rows 4–6 / 9 / 10 have 60–90 px of empty height at 660 because the off-screen Note column wraps | Row height set by the hidden column; clamp the note or move it into a row detail at ≤760 | FE | — | S | real11-p04-660 |
| 11-8 | Change taxonomy UNCHANGED/CHANGED against the last published rc | All UNSET, `P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED` (old preview; X1 B2 now says `P22_NO_PUBLISHED_PREDECESSOR`) | A real comparison needs a DELIVERED predecessor | BE | Delivered publication → `published_comparison` (OL-04/OL-05, **P22+**) | — | real11-p04-1440; X1 §4 |
| 11-9 | Approval-inbox ghost: assignee pool, conditions, decision outcomes | "assignee pool: not published · conditions: not published" | Mirror fields not in contract | BE | `assignee_pool`, `effective_status`, quorum, decision, `created_at` (OL-07 / CG-P22-03/06, **P22+**); `conflicting_approval_href`, `details.downstream_code` (OL-09, **P22+**) | — | real11-p04-1440; U:3666,3668 |
| 11-10 | Publish card with an enabled gold CTA | "publish blocked" + `P22_PUBLICATION_NOT_COMMISSIONED` | A real publish is blocked by `rrun_` not being mirrored into `run_read_models` | BE | OL-04 / CG-P22-02 (**P22+**); OL-06 methodology claim from the sealed pack (**P22+**) | — | U:3663,3665 |

States: loading, 503, 403 = 404 (neutral "This run may not exist…") and 401 (Frame 01D) are correct (`state-s11-*.png`). Rail links go alpha → S10 and run → S04. Row sources link to S05, S04, S06, S08, S09, S12 and S13, all served. The pack reached 6·1·2·3 on P04 and 3·0·2·7 on WFO (old preview).

**Dropped (already decided):**

- Inline confirm for seal and publish: X1-D01.
- Server-derived publish body: X1-D02.
- Chip precedence and SEALED_LOCAL: X1-D03.
- Row links by contract key: X1-D04.
- Publish-button label + reason once: X1-D05.
- Backoff and terminal states: X1-D06.
- Edit/seal leave after delivery: X1-D07.
- One pack route: X1-D08.
- SLA verbatim: VD-P22-01.
- "assignee pool: not published": VD-P22-02.
- Governance outcome enum: VD-P22-08.
- 17 YAML fields, no `created_at`: VD-P22-10.
- No `effective_status`: VD-P22-11.
- SoD note: VD-P22-13.
- Receipt + approval id on the published card: VD-P22-14.
- Local-seal card (P21 addition), CAS in the body, declarations edited in their row, tints mapped to tokens, inset-bar gold/green, dashed ghost without opacity: W5c D-02, D-05…D-10.
- Pack scrolling in its frame at 660: X1 §5.
- Routes = only `GET …/publication` + `POST …/publish`: OL-11.

---

### Screen 12: Engine / Mode Atlas (`/research/quantbt/atlas#tab=…&run=…`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 12-1 | Mode card in 3 columns: WHAT IT READS · OBJECTIVE · SCHEDULE → CLAIM; 5 cards in about 1,450 px | 2 columns (claim facts + objective / suspect + artifacts); the schedule chips move to the card header; the page is 5,446 px against the HiFi's 2,273 | Density and layout parity is still an open RF-04 item ("HiFi 3-column density… Bobby's visual approval") | BOBBY | — | L | RF-04/README.md:18,41; real12-p04-1440 vs hifi12-1440 |
| 12-2 | OBJECTIVE: one formula + one term table | Three stage formulas (is_search / oos_candidate_selection / fixed_or_post), a params table, a term table with source lines and a selection-metric line, all always expanded | Keep the RF-02 #5 engine text; show the stage that governs selection and put the other stages, the params and the source locators behind a disclosure | FE | — | M | crop-real12-1440-top.png |
| 12-3 | `← this run` marker + accent border on the card of the run's mode when the atlas is opened from a run | `run=` is read from the hash but no card is marked (EngineAtlas only uses it for the Search links) | Missing marker; the run's `mode × schedule` has to be read (run-library item `mode.schedule` / progress) | FE | — | M | EngineAtlas.tsx:662-665,776, :1273; hifi12-1440 vs real12-p04-1440 |
| 12-4 | Rule Two: "…`optimization_mode` (this page) belongs to the walk-forward endpoint; `CandidateSelector.mode` (best · feasible_best · pareto_first · robust_plateau) belongs to the optimization package and appears only inside Stage 2's decision card." | "Two selector layers, never mixed: `optimization_mode` belongs to this page; the execution route does not." | The copy names a different second layer (execution route rather than CandidateSelector) and drops the selector list. Restore the HiFi text if 1.1.1 exposes those selector values; otherwise record the deviation | FE | — | S | EngineAtlas.tsx:898-900 |
| 12-5 | Routes tab: one compact card "EXECUTION ROUTES — SUPPORT MATRIX, NOT ASPIRATION" + `arbitrage_support_matrix() · nautilus_support_matrix()`, 14 one-line rows | 14 multi-line blocks (4 axis chips, reason, endpoint sentence, WF line, source, route_params disclosure), no card or title; 2,638 px | The axis chips are decided (D-1); the missing card title and the density are open under the same RF-04 density item as 12-1 | BOBBY | — | M | real12-execution-1440 vs hifi12-execution-1440 |
| 12-6 | Claims tab: card "CLAIMS BY CONTRACT — TWO AXES, NEVER MIXED", 4 columns with NEVER CLAIMS in gold, cert `L2 · causal`, prose foot "…The two chips on the Release Candidate screen carry the axes separately." | No card or title; never-claims as a teal sub-line; cert `L2` without its word (the word is in a mono evidence line); foot is the mono formula only | Table shape, colour and foot copy differ from the HiFi (the L0/L2 mismatch is shown, which is right per H8) | FE | — | S | real12-claims-1440 vs hifi12-claims-1440 |
| 12-7 | "RULES OF THIS SCREEN" on every tab | Only on WFO modes | Footer missing on the Routes and Claims tabs | FE | — | S | EngineAtlas.tsx:923; real12-execution/claims-1440 |
| 12-8 | Per-card link | "open search & selection →" on all 5 cards, cursored to mode_2…5 for a P04 run that only ran `mode_1_decay × global` | Links to Search in a mode the run never ran; link only the run's mode, or label the others "not this run" | FE | — | S | links probe (s1014/links.mjs output) |
| 12-9 | 660 (no HiFi) | The release block (CURRENT chip / engine / retained history / CTA) lays out centred and ragged under the title | Right-aligned block is not restacked at narrow width | FE | — | S | crop-real12-660-top.png |

States: loading (skeleton), 503, 403 and 401 are correct (`state-s12-*.png`). Clicking a schedule chip changes the claim and the OOS chip, as the HiFi does (`real12-schedclick-1440`).

**Dropped (already decided):**

- Route status as axis chips: D-1.
- No `declare →`/`replay parity →` per route: D-2.
- No OPEN DEMO: D-3.
- Rule One colour: D-4/D-B2.
- `--ink-faint` contrast: D-B1/DS-01.
- SUSPECT copy from the manifest: D-B3.
- No "what it reads" pulse: D-B4.
- Cert cap / avoid-when "not published": CG-P04-05.
- Engine formula text: RF-02 #5.
- KaTeX pin: Q5.
- Back link / header CTA: RF-02 #7, RF-04.
- Release-facts panel and struck-through schedules: RF-02 #8.
- OOS-use wording: H7.
- L0/L2 mismatch shown: H8.
- `er_quantbt_111`: DQ-09.
- Demo pair: DQ-10.

Cites are in `RF-02/README.md:70-86`, `AUDIT_P01_P05:73-75`, `DECISIONS_BOBBY_2026-09-25.md:25-26` and `U:4273-4274,4373`.

---

### Screen 13: Compare (`/research/quantbt/alphas/:alphaId/compare?mode=&runs=`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 13-1 | Attempts ladder: 4 cards on one row, each with a claim and a number | 33 cards in 9 rows (4,053 px). 21 are FAILED/QUEUED with every fact "not published", and each still gets a `claim ↑ →` arrow | X3 §2 flagged it: a denser view past about 12 attempts (collapse no-claim attempts into compact rows, as S10 does with probes) is a new decision | BOBBY | Optional server `presentation_kind` for compare, as P19 has (≤P21, P20) | M | crop-real13-1440-top.png; X3 §2 "Scale observation" |
| 13-2 | Card head `att_01` / `R-WFO-114 · mode_1 × global` | 37-char `ratt_…` wrapped over 3 lines + full `rrun_…` | Short-id rule (as 10-2) and run label (as 10-3) | FE (+ BE for the label) | `display_label` (≤P21) | S | same shot |
| 13-3 | Claim line: a family (`STRICT_OUTER_OOS`) + one sentence | `claim.text` printed verbatim: `validation_claim=walk_forward_oos · chronological_claim=not_causal_multi_fold_global_calibration · oos_used_for_selection=true` | Server key=value string on screen; per VD-P23-01 "the words on screen are the screen's", so it should render as labelled facts | FE | (or P20 composer publishes prose, ≤P21) | S | api-…compare_mode_attempts.json (6 SOURCE_ATTESTED); crop-real13-1440-bot.png |
| 13-4 | EChart 1: per-fold bars coloured by claim class, 4 attempts, `fold_01…` | 8 series all one teal (same class), so bars cannot be told apart; the legend has 8 identical swatches with full run ids; x axis `fold 0 / fold 1` | Within one claim class each attempt needs its own shade/pattern (ACTIVE heavier); legend needs short ids; folds should read 1-based as in the HiFi | FE | — | M | crop-real13-1440-bot.png |
| 13-5 | No footnote | "`ratt_…, ratt_…` (25 ids) have no per-fold rows: P20_P04_…" in one mono paragraph | Raw id dump; show a count + disclosure | FE | — | S | CompareDetail.tsx:1101-1105 |
| 13-6 | Config diff: 4 attempt columns, ACTIVE marked | 33 columns with uppercase raw ids; the table is clipped at the card edge | Needs a column limit (ACTIVE + the attempts shown / selected) and short ids | FE | — | M | CompareDetail.tsx:1123-1160; crop-real13-1440-bot.png |
| 13-7 | "What this trajectory says": narrative with links to "the tree" (S10) and "the release candidate" (S11) | Server `P20_ATTEMPT_TRAJECTORY_V1` sentence, no links | Missing the two in-text links (a Lineage link exists elsewhere, in the meta line) | FE | — | S | hifi13-1440 vs crop-real13-1440-bot.png |
| 13-8 | Markets: one small multiple **per market** (BTCUSDT·4h, ETHUSDT·1h, SOLUSDT·4h) | 24 cards, all `BTCUSDT · 1h` (one per run, bounded PARTIAL) | Mode meaning drifts: on a one-market alpha it becomes a run list. Needs grouping by market key (latest/ACTIVE run per key) or a rule on what a card is | BOBBY + BE | Group `markets[]` by ComparisonContractKey market part (≤P21, P20 composer) | M | crop-real13m-top.png vs hifi13-markets-1440 |
| 13-9 | Pair: delta table heads are the two alpha names; legend `mom_breakout_v3 · R-WFO-118 (B)` | Heads are raw uppercase run ids broken over 2 lines; A/B chips hold full run ids | Use A/B + short id (full id in `title`) | FE | — | S | real13-pair2-1440 |
| 13-10 | Metric names only | Visible sub-labels `RS02_OOS_MEAN_OF_FOLDS`, `RS02_OOS_SUM_OF_FOLDS` under "OOS sharpe"/"trades" (these are scopes, not refusals) | Map to words ("mean of folds"), as S10 D-W6B-04 does | FE | — | S | real13-pair2-1440 |
| 13-11 | 660 (no HiFi) | Attempt cards keep a fixed height with about 50 px blank at the bottom | Card min-height carried over from the grid | FE | — | S | crop-real13-660-top.png |

States: loading, 503, 403 = 404 (neutral) and 401 are correct (`state-s13-*.png`). Pair REFUSED on P04 × WFO, with the mismatched key part marked, looks right (`real13-pair-1440`). Pair AVAILABLE on two WFO runs gives overlay, deltas, ρ = 1.00, the weaker-claim banner and intentional differences (`real13-pair2-1440`).

**Dropped (already decided):**

- "two runs, one key" wording: VD-01/11.
- Portal-derived ρ chip: VD-02.
- Lifecycle pill, ACTIVE border, lines past 8 folds, config diff in ladder order: VD-03…06.
- Mono disclosure line: VD-08.
- No demo pair toggle, pair from the URL: VD-07.
- Canonical route: VD-09.
- `PAIR_NEEDS_TWO`: VD-12.
- "UI subtracts nothing": VD-13.
- Weak → strong order and the `claim ↑ →` arrow: VD-14.
- No demo digits: VD-15.
- Red mismatched key parts: VD-16.
- Family-only chip: VD-17.
- Rank colours: VD-19.
- Server caption: VD-20/25.
- B − A: VD-21.
- Title width: VD-22.
- Weaker-claim row: VD-23.
- Sampling lines: VD-24.
- ρ to 2 places: VD-26.
- Y axis: 2 server extremes, **no rebase to 100**: VD-27, G12.
- Δ coloured by sign: VD-28.
- "OOS sharpe" without "(stitched)": VD-29.
- Gold banners on raised paper: VD-30.
- Cert NOT_PUBLISHED: W6A-D03.
- researchFormat: W6A-D09.
- EXTREMA_BUCKET: W6A-D11.
- Static SVG instead of ECharts: D5.

Cites are in `P20/X3_S13_P23_CLAUDE_2026-09-26.md §2`, `U:5679-5712` and `P18/W6A…:40-68`.

---

### Screen 14: Alpha Import (`/research/quantbt/alpha-import`)

| # | HiFi block | Current | Gap | Class | Backend need | Size | Evidence |
|---|---|---|---|---|---|---|---|
| 14-1 | Title `Alpha Import — standardize the code artifact` + dashed `QUARANTINE` chip; italic subtitle; mono meta `POST /api/v1/alphas/import · owner-only · browser never executes code` | `Alpha Import`, a different one-line subtitle, no state chip, no meta line | Title, chip and meta line missing (the chip can reflect parse-receipt state: none / QUARANTINE / registered) | FE | — | S | AlphaImport.tsx:625-646; real14-1440 vs hifi14-1440 |
| 14-2 | Crumb `Journey / Alpha Import · next: New Run →` | Three bare 10 px links "Journey map  Run Library  New Run →" with no separator and no current page | Not the shared crumb pattern used on 10–13 | FE | — | S | AlphaImport.tsx:630; real14-1440 |
| 14-3 | Horizontal stepper card (numbered circles, title + sub-line, active step tinted) | Vertical sections with boxed numerals `1 SOURCE / 2 GATES / 3 REGISTER` | Three steps are decided (DQ-06), but the stepper visual and the active-step state are missing | FE | — | M | real14-1440 vs hifi14-1440 |
| 14-4 | Two columns: mirror table (about 2/3) left; drop zone + "Entrypoint shape" card right; the explanation "One file is the whole artifact… mismatch → QUARANTINED_DIGEST_MISMATCH" under the drop zone | One column: full-width drop zone, then a paste textarea, then the mirror; the explanation sentence is missing | Layout and copy differ; the entrypoint card is replaced by the collapsed code anatomy (decided), but the side column and its copy are not | FE | — | M | real14-double-parsed-1440 vs hifi14-1440 |
| 14-5 | Mirror as a table FIELD / DECLARED VALUE / CHECK (PASS · VERIFY · SMOKE · GATED) + a rules foot ("Field rules are validation, not suggestion: `strategy_id ^[a-z][a-z0-9-]{2,63}$` · version SemVer immutable · …") | Two-line rows (value + note) with a state chip and a code; no rules foot | Row shape and the foot copy differ (the 16 rows and the not-in-contract set are decided) | FE | — | M | real14-double-gates-1440 |
| 14-6 | "RULES OF THIS SCREEN" footer | None | Missing footer (every other screen has one) | FE | — | S | grep: no "rules of this screen" in AlphaImport.tsx |
| 14-7 | End-to-end parse → gates → register → activate on real data | Not proven on the preview (this audit used fixture doubles for parse/gates, because writes were out of scope); admission still refuses import/DRAFT runs | Real-backend receipt missing; an imported alpha cannot run yet | BE | Admission for import/DRAFT (`run-admission.service.ts:153,160`, ≤P21 Claude) after the prod host profile (OL-01, ops) | M | RF-04/README.md:19; U:3660 |

States: the registry read gives loading, 503 ("The Research service did not answer") and 403 (the F-04 sentence) (`state-s14-registry-*.png`). Before-parse EMPTY states are correct. Parse and gates render on the canonical fixtures.

**Dropped (already decided):**

- 3 authority states, not 4: S14-VIS-01/DQ-06.
- v1 single-function contract; anatomy is a collapsed sub-step: DQ-05/CG-P07-02.
- `strategy_id = alpha_id`: DQ-07.
- 16 mirror rows, `not_in_contract` fields: CG-P07-03.
- Gate RUNNING is client-only, µs per gate: CG-P07-04.
- Route under QuantBT, legacy `/imports` kept: FD-P09-02.
- Own refusal table: RF-01.

Cites are in `P09/frontend-composition-claude.md:13-21`, `AUDIT_P01_P10:314-316`, `RF-03/W4…:32-33`.

---

### Cross-screen (listed once, not repeated in the tables)

| # | Gap | Class | Size | Evidence |
|---|---|---|---|---|
| X-1 | Shell breadcrumb stops at `Research / QuantBT Backtest`; the HiFi adds the run label and the screen (`… / R-WFO-118 / Release Candidate`) | BOBBY (shell-owned) | S | all real1N-1440 vs hifi1N-1440 |
| X-2 | Content gutter: HiFi title at x = 272 (24 px); S10/S11/S13 at x = 280 (32 px); S12/S14 at x = 296 (48 px); title y 101–114 vs 90 | FE | S | s1014/measure.mjs output |
| X-3 | Denied sentence has three wordings: S10 "This alpha may not exist…", S11 "This run may not exist…", S13 "This alpha or these runs may not exist…", while S12/S14 use the F-04 sentence ("You don't have access to this in your current workspace, or it doesn't exist."). 403 = 404 holds on each screen; the wording is not one rule | FE | S | lineageClient.ts:309, releaseCandidateClient.ts:375, compareClient.ts:288; state-s1N-forbidden |

---

### Gap counts (the decided items above are dropped, not counted)

- 10-3, 11-4 and 13-2's label part are one field (`display_label`), and 11-3 has an FE part and a BE part.
- Counting rule: every row counts once under its first class, and the BE parts of mixed rows count under BE.

| Class | S10 | S11 | S12 | S13 | S14 | Cross | Total |
|---|---|---|---|---|---|---|---|
| FE-only | 2 (10-2, 10-6) | 6 (11-1, 11-2, 11-3 FE, 11-5, 11-6, 11-7) | 7 (12-2, 12-3, 12-4, 12-6, 12-7, 12-8, 12-9) | 9 (13-2, 13-3, 13-4, 13-5, 13-6, 13-7, 13-9, 13-10, 13-11) | 6 (14-1…14-6) | 2 (X-2, X-3) | **32** |
| Needs backend | 2 (10-4 ≤P21, 10-12 P22+) | 4 (11-3 BE ≤P21, 11-8, 11-9, 11-10: P22+) | 0 | 0 | 1 (14-7 ≤P21 + ops) | 0 | **7** (3 ≤P21, 4 P22+) |
| Bobby decision | 8 (10-1, 10-3, 10-5, 10-7, 10-8, 10-9, 10-10, 10-11) | 1 (11-4) | 2 (12-1, 12-5) | 2 (13-1, 13-8) | 0 | 1 (X-1) | **14** |
| HiFi deviation already decided (dropped) | 12 | 24 | 16 | 27 | 7 | — | **86** |

Two of the Bobby rows also carry a ≤P21 backend field if Bobby chooses to add it:

- 10-3 / 11-4 / 13-2: `display_label`.
- 13-8: market grouping.

---

### Most important gaps

1. **Real data breaks the S10/S13 story (10-4, 13-1).** All 33 attempts are ROOT, so the lineage tree never nests and "diff vs parent" is always empty. Compare's ladder turns into 33 cards of FAILED and QUEUED attempts with no claim, all marked `claim ↑ →`. Check that clone writes `parent_attempt_id` (≤P21), then decide on a compact treatment for attempts without a claim.
2. **No short-id or run-label rule (10-2, 10-3, 11-3, 11-4, 13-2, 13-6, 13-9).** Raw 37-char `ratt_`/`rrun_` ids and 64-hex digests fill card heads, rail nodes, legends, table heads and the S11 rail. One FE display rule (8-hex + `title`) fixes most of it. `display_label` (R-WFO-###) is a ≤P21 backend field that needs Bobby's yes.
3. **S12 density (12-1, 12-2, 12-5):** 5,446 px against 2,273 in the HiFi, and the routes tab at 2,638 px. The 3-column layout and the "← this run" marker (12-3) are what the HiFi is built on. RF-04 already lists this as awaiting Bobby.
4. **S14 does not look like the HiFi (14-1…14-6).** It is missing the stepper, the two-column layout, the title/QUARANTINE chip/meta line, the three-column mirror with its rules foot, and the footer. The work is FE only and no backend is needed. End-to-end import on real data is still blocked by admission (14-7, ≤P21).
5. **S11 CSS bug (11-1):** the pack item names are uppercased by the global `table th` rule. It is a one-line fix and appears on every S11 screenshot.
6. **Raw server strings shown as copy (10-6, 13-3, 13-10, 11-5):** `NOT_ISSUED`, the `validation_claim=…` key=value text, `RS02_OOS_MEAN_OF_FOLDS` and `draft VIRTUAL`. Per VD-P23-01 the words on screen must be the screen's own.
7. **P22+ backend items (10-12, 11-8/9/10)** stay on Codex: OL-03, OL-04/05/06/07/09. On screen they are typed correctly as absences.

---
