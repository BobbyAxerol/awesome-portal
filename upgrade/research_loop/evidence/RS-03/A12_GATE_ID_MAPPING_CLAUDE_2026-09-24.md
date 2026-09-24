# A12 — gate-ID mapping, Research Loop P13–P17 (Claude, 2026-09-24)

Astra A12 (`upgrade/research_loop/P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md:308–324`) and the
RS-03 exit (`…:526–546`) require each of the **68 base gate IDs** (`P13-T01…T13`,
`P14-T01…T13`, `P15/P16/P17-T01…T14`) and the **15 V1.1 IDs** (`V11-P13…P17-DR/BR/GX`)
to be mapped to an assertion or to an exact decision. This file is that mapping, read
against the code on `docs/research-loop-plan` at `a11d9161` (after W1). No test was run
for this mapping; it cites tests as they are written.

**Sources for the IDs:** guide `upgrade/research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md`
(P13 `:2112–2124`, P14 `:2175–2187`, P15 `:2245–2258`, P16 `:2310–2323`, P17 `:2374–2387`;
V11 `:2078–2080`, `:2145–2147`, `:2210–2212`, `:2279–2281`, `:2344–2346`). Unified §13.5
(`upgrade/UNIFIED_IMPLEMENTATION_PLAN.md:4829, 4881, 4950, 5006, 5085`) lists the same sets.
**Count check: base = 13 + 13 + 14 + 14 + 14 = 68; V11 = 5 × 3 = 15. Both match.**

## How a status was decided

- **COVERED** — a test asserts what the requirement says, cited as `file:line` of the
  `it`/`test`. If only part of the requirement is asserted, the ID is a **GAP (partial)**
  and the covered part is still cited.
- **DECIDED** — an exact, recorded owner/authority/scope decision says the behaviour must
  not exist yet, **and** a test asserts that it does not. Codex's own
  `SOURCE_CAPABILITY_BLOCKED` notes in the P15–P17 amendments do **not** count. Astra
  replaced them (`P13_P17_ASTRA…md:242–264, 336–340`; Unified `:4962–4967, 5018–5022,
  5097–5101`), and Bobby's D2 (`evidence/BACKEND_DEBT_P01_P21_CLAUDE_2026-09-24.md:165`)
  turns A10c what-if into real work.
- **GAP** — neither of the above.
- A test's own label is not evidence. Two label sets overclaim:
  - `scripts/research-loop-v11/p11-progress.spec.ts:556/702/773/859/973` carry labels such
    as `P13-T01/T03/T05/T09/T13` and `P17-T01/T04/T05/T07/T10/T11/T12/T14`. Each is one
    fixture scenario on the fixed P04 profile. P13-T01 is not an engine-parity oracle, and
    P17-T10/T11 have no sparse or same-timestamp sequence.
  - The FE describes `P13-T01…T11`, `P14-T01…T07`, `P15-T01…T06` and `P16-T01…T07` in
    `evidenceFlow/splitDetail/searchDetail/freezeDetail.test.tsx` reuse guide IDs for
    different local meanings. P17 already renamed its set to `S08-U*`
    (`evidence/P17/thanhvuong-frontend-receipt.md:262`). The same rename is recommended
    for the other four.
- Path aliases: `CA` = `apps/control-api/test`, `PB` = `apps/portal/backend/tests`, `FE` =
  `apps/portal/frontend/src/research`, `E2E` = `apps/portal/frontend/e2e/_probe-research-product.spec.ts`,
  `SC` = `scripts/research-loop-v11/p11-progress.spec.ts`.

## Totals

| Set | IDs | COVERED | DECIDED | GAP |
|---|---:|---:|---:|---:|
| P13-T01…T13 | 13 | 6 | 0 | 7 |
| P14-T01…T13 | 13 | 6 | 2 | 5 |
| P15-T01…T14 | 14 | 1 | 0 | 13 |
| P16-T01…T14 | 14 | 2 | 0 | 12 |
| P17-T01…T14 | 14 | 4 | 0 | 10 |
| **Base total** | **68** | **19** | **2** | **47** |
| V11 DR/BR/GX (P13–P17) | 15 | 0 | 0 | 15 |
| **All** | **83** | **19** | **2** | **62** |

The five "run every S0x test" IDs (P13-T07, P14-T08, P15-T09, P16-T09, P17-T09) are GAP
for one reason. Nothing in the repo or evidence maps the spec test matrices to
assertions. Those matrices are S04 T01–T18, S05 T01–T16, S06 T01–T19, S07 T01–T16 and
S08 T01–T22 (`release-v1.1/docs/screens/0{4..8}_*.md` §"Test matrix"), and a
`grep` for `S0[4-8]-T..` finds nothing.

## P13 — Evidence Flow Hub (S04)

| ID | Requirement | Status | Evidence / what is missing |
|---|---|---|---|
| P13-T01 | Engine-direct metrics equal raw engine output | **COVERED** | `PB/test_research_evidence_metrics.py:85` every ENGINE_DIRECT metric = QuantBT `full_report` over an independently cut OOS slice (exact float); `:104` Sharpe vs a numpy daily-close formula; real BTCUSDT opt-in `:319` (skipped without `PORTAL_RUN_HMD_REAL_SMOKE=1`) |
| P13-T02 | Derived rolling/calendar/benchmark have reference tests | GAP (partial) | Covered: monthly previous-close oracle `PB/test_research_evidence_r2.py:25, :58`; histogram closure `:83`; rolling Sharpe vs QuantBT `PB/test_research_evidence_metrics.py:120`; benchmark typed absence `CA/research-evidence.service.spec.ts:92` (benchmark not proven, Astra plan `:65`). **Missing:** no reference for `ROLLING_RETURNS_20` values. `r2.py:91` checks only coverage metadata |
| P13-T03 | Downsampling changes chart shape, not official metrics | GAP (partial) | Covered: sampled rolling points are exact engine values incl. extrema/endpoints (`PB/test_research_evidence_metrics.py:120`); metrics unchanged when rolling points withdrawn (`:210`). **Missing:** no test that an `EXTREMA_BUCKET_V1` equity sample leaves `NET_RETURN/MAX_DRAWDOWN` equal to the full-vector values |
| P13-T04 | Zero variance, missing funding/benchmark → reason, no zero fallback | **COVERED** | `PB/test_research_evidence_metrics.py:151` (zero variance/no losses → typed NOT_APPLICABLE, value None); `CA/research-evidence.service.spec.ts:92` (benchmark null + reason); `FE/evidenceFlow.test.tsx:479` (unpublished metric never 0), `:532` (funding warning NOT_APPLICABLE) |
| P13-T05 | Concurrent revision switch does not mix metrics/params | **COVERED** | `CA/research-replay.service.spec.ts:185` (bundle mixing Hub/series revisions fails closed); `CA/research-evidence.service.spec.ts:239` (series digest ≠ revision → 503); `FE/evidenceFlow.test.tsx:340` (discard, reread once); `E2E:1256` (chart at other revision discarded). No real-DB concurrent-publication fault test. That test is RS-01/A05 scope and noted only |
| P13-T06 | Historical readers do not relabel engine/certificate | **COVERED** | `CA/research-evidence-rf05.spec.ts:113` (pre-RF-05 projection stays typed NOT_PUBLISHED), `:318` (legacy row keeps `SOURCE_CONTENT_ONLY`), `:364` (1.0.8 row stays LEGACY); `FE/evidenceFlow.test.tsx:504` (no certificate from a claim string) |
| P13-T07 | All S04 spec tests run | GAP | No S04 T01–T18 → assertion inventory |
| P13-T08 | Required-field coverage complete; no fake null to pass | GAP | RS-02 matrix (`evidence/RS-02/field-action-coverage-matrix.md`) is a document, not a test. Open fields: `CG-P13-05/07/08` (`BACKEND_DEBT…md:74–76`) |
| P13-T09 | No-loss/zero-variance/empty/missing benchmark serialize with reason, not 0/NaN | **COVERED** | `PB/test_research_evidence_metrics.py:151`; `PB/test_research_evidence_r2.py:70` (NaN/inf typed); `CA/research-evidence-rf05.spec.ts:289` (AVAILABLE series with zero values rejected); `FE/evidenceFlow.rf05.test.tsx:1307` (seven typed absences, never 0) |
| P13-T10 | Nonselected trial click → Freeze/Report keep selected params + digest | GAP | No cross-screen test. W1 now has a 3-trial run to exercise it |
| P13-T11 | Same warning labels Search/Freeze use DR-02 definition; categorical/zero-width reason | GAP | DR-02 unresolved (guide `:207`, Unified `:3470`); no shared warning definition asserted across S06/S07 |
| P13-T12 | Causal reveal does not change certificate/claim; hides future exit/PnL | GAP | Reveal not built; Bobby decision `P17-FE-DG-02` open (`evidence/P17/thanhvuong-debt-register.json:71`) |
| P13-T13 | All-tab responses one revision; stale response never mixes runs | **COVERED** | `FE/evidenceFlow.rf05.test.tsx:1501` (another run's series at same content revision rejected); `E2E:1144` (one cursor across seven tabs); `SC:556` (Hub/series same revision in real PG) |

## P14 — Split, chronology, holdout (S05)

| ID | Requirement | Status | Evidence / what is missing |
|---|---|---|---|
| P14-T01 | Changing future data does not change past decisions on the declared causal path | GAP | No future-perturbation test. W1 WFO folds now exist (`evidence/RF-03/w1-preview-receipt.json` `split_fold_plan`); guide V11-P14 `:2139` asks for it |
| P14-T02 | Strict selector never reads outer OOS before the decision boundary | GAP | Only `NOT_ASSERTED` asserted (`FE/splitDetail.test.tsx:543`). No cutoff test on the WFO selector. No accepted exclusion |
| P14-T03 | Selection-input OOS disclosed, not strict-pass | **COVERED** | `CA/research-rf05-split-search.spec.ts:261` (`oos_used_for_selection` NOT_ASSERTED, OOS column REPORT_ONLY); `FE/searchDetail.test.tsx:1009, :1017`; `FE/splitDetail.test.tsx:552` (no verdict badge) |
| P14-T04 | Warmup not scored into evaluation returns | **COVERED** | `PB/test_research_evidence_r2.py:137` (OOS metrics exclude warmup/IS; counters labelled child-tape); `CA/research-split.service.spec.ts:47` (warmup-misaligned window rejected) |
| P14-T05 | Timezone/calendar/half-open edges correct | **COVERED** | `CA/research-split.contract.spec.ts:8` (discontinuity rejected); `CA/research-split.service.spec.ts:47` (inverted/zero/misaligned); `PB/test_research_evidence_r2.py:58` (naive index as UTC); `FE/splitDetail.test.tsx:397` (UTC labels), `:978` (`[start, end)`) |
| P14-T06 | Holdout unlock checks duplicate, race, permission | **DECIDED** | DR-01 unlock authority does not exist, and P14 must not create one: Unified `:4897–4899`, Astra plan `:65`, guide V11-P14 exit `:2149`. Tests assert no unlock exists: `SC:702` (`holdout_unlock` NOT_PUBLISHED), `CA/research-split.contract.spec.ts:17`, `E2E:1393` |
| P14-T07 | Historical run that used holdout keeps its label | GAP | No fixture of a used-holdout (legacy) run. `FE/splitDetail.test.tsx:490` covers only "not SEALED" wording |
| P14-T08 | All S05 spec tests run | GAP | No S05 T01–T16 inventory |
| P14-T09 | Opening Split/seal link reads metadata only, no evaluation/unlock side effect | **COVERED** | `E2E:1393` (click on unlock sends no request; nothing asks for holdout/evaluate); `SC:702` (after reads: NOT_EVALUATED/NOT_EXPOSED, one immutable row) |
| P14-T10 | Integrity PASS without evaluation not shown "used"; evaluated-unviewed not "unread" | **COVERED** | `FE/splitDetail.test.tsx:497` (evaluation and exposure separate facts); `CA/research-split.contract.spec.ts:17` (schema refuses EXPOSED). The "evaluated" branch cannot occur while DR-01 holds (see T06) |
| P14-T11 | No unlock authority → no substitute role/approval/endpoint; UI truthful | **COVERED** | `CA/research-split.service.spec.ts:17` (`holdout_unlock` NOT_PUBLISHED, href null); `FE/splitDetail.test.tsx:513, :522`; `E2E:1393` |
| P14-T12 | Clone/new version keeps exposure lineage; unknown history not clean | GAP | No clone/lineage exposure test |
| P14-T13 | Concurrent/retried unlock → one evaluation; reset/cache clear does not re-seal | **DECIDED** | Same DR-01 decision as T06. No seal or unlock is published: `CA/research-split.contract.spec.ts:17` (`source_seal`/`unlock` NOT_PUBLISHED) |

## P15 — Search, trial ledger, diagnostics (S06)

On the fixed P04 lane every P15 surface is a typed absence, and those tests pass
(`CA/research-search.service.spec.ts:57`, `SC:773`, `FE/searchDetail.test.tsx:463–507`).
They do not close optimizer gates: W1 produces a real 3-trial study, and Astra A09 says the
fixed profile is not an engine limit.

| ID | Requirement | Status | Evidence / what is missing |
|---|---|---|---|
| P15-T01 | Five modes + valid schedules have fixtures of the right scope | GAP | One admitted WFO profile (W1). DQ-10 (`AUDIT_P01_P10…md:319`) excludes only `mode_1 × per_fold_causal` |
| P15-T02 | Selected=None not replaced by raw best | GAP (partial) | Fixed lane: `CA/research-search.service.spec.ts:57`, `FE/searchDetail.test.tsx:507`. **Missing:** RS-02 lane with zero `SELECTION` rows |
| P15-T03 | Missing objective metric is an error, not score 0 | GAP (partial) | Fixed lane `FE/searchDetail.test.tsx:484`; no RS-02 trial with missing objective |
| P15-T04 | Formal constraints / post-filter sampler behaviour | GAP | Constraints not published (`CG-P15-03`, `BACKEND_DEBT…md:78`) |
| P15-T05 | Semantic dedupe not read as another prune reason | GAP | Prune reasons NOT_PUBLISHED (`CG-P15-03/04`) |
| P15-T06 | Same trial number in another study does not collide | GAP | No two-study/two-run test |
| P15-T07 | Ledger reaches every row beyond the scatter cap | GAP (partial) | Keyset exists (`CA/research-rs03-current-source-acceptance.spec.ts:331`, limit 201 → 400). No full walk that reconciles totals |
| P15-T08 | Sampler/seed/warm-start/baseline trace matches evidence | GAP | Only seed is on the Hub (`CA/research-evidence.service.spec.ts:121`); sampler/warm-start/baseline not published |
| P15-T09 | All S06 spec tests run | GAP | No S06 T01–T19 inventory |
| P15-T10 | Pick nonselected → inspector changes, θ*/Report/RC unchanged; back/forward | GAP (partial) | `FE/searchDetail.test.tsx:932` (click marks, does not select). No θ*/Report/RC invariance or history test. W1 ledger rows carry `parameters: {}` (receipt `search_ledger`), so the inspector cannot show θ |
| P15-T11 | Centroid selection with full params, no fake trial ID; ambiguous jump | GAP | No centroid/supplementary fixture |
| P15-T12 | Complete/selected/feasible/pruned/duplicate totals reconcile | GAP | `CG-P15-03` open |
| P15-T13 | Category permutation: valid diagnostic or typed N/A | **COVERED** | Typed N/A branch: `CA/research-search.service.spec.ts:57` (diagnostics NOT_APPLICABLE); `FE/searchDetail.test.tsx:463, :484`. This reopens once a diagnostic ships (`CG-P15-04`) |
| P15-T14 | Bound/widen per declaration + DR-02; mode-5 labels without fake OOS | GAP | Static range only (`CA/research-search.service.spec.ts:57, :125`); DR-02 unresolved; no widen |

## P16 — Freeze, integrity, what-if (S07)

| ID | Requirement | Status | Evidence / what is missing |
|---|---|---|---|
| P16-T01 | Fixed pool but selector saw OOS → not strict-pass | **COVERED** | `SC:973` (ordering NOT_ASSERTED, integrity PARTIAL); `CA/research-freeze.service.spec.ts:47`; `FE/freezeDetail.test.tsx:494` (windows without verdict) |
| P16-T02 | Causal boundary checked per fold | GAP | No per-fold check (W1 has 2 folds) |
| P16-T03 | Corrupt data/metadata → integrity failure | GAP (partial) | Metadata: `CA/research-freeze.service.spec.ts:100` (BLOCKED), `CA/research-current-source.service.spec.ts:160` (MISMATCH), `E2E:1982`. **Missing:** artifact bytes (A10a) |
| P16-T04 | Reverify never rebaselines expected digest from wrong bytes | GAP | A10a (`BACKEND_DEBT…md:86`) |
| P16-T05 | Missing/skewed clocks create no proof | **COVERED** | `SC:973` (ordering NOT_ASSERTED); `FE/freezeDetail.test.tsx:723` (no wall-clock mark). The source publishes no clocks, so "skewed" cannot arise (Astra plan `:65`) |
| P16-T06 | 9×9 grid lookup/snap, no interpolation | GAP | A10c is mandatory (Bobby D2, `BACKEND_DEBT…md:165`) |
| P16-T07 | Diagnostic jobs dedupe + resource budget | GAP | A10c |
| P16-T08 | Changed selection intent → new attempt/draft with lineage | GAP | `sibling_draft.may_create=false`; A10c step 4 |
| P16-T09 | All S07 spec tests run | GAP | No S07 T01–T16 inventory |
| P16-T10 | Fake timer cannot PASS verify while server pending/fail; corrupt artifact keeps expected digest | GAP | No fake-timer test (`FE/freezeDetail.test.tsx:406` only checks the server result path); byte half is A10a |
| P16-T11 | Final-audit plan targets frozen selection; no reselect, no fold-last default | GAP (partial) | Fixed lane: requested fold answered NOT_APPLICABLE (`SC:973`, `FE/freezeDetail.test.tsx:507`). No test that replay/audit targets W1's `selected_trial_id` |
| P16-T12 | Grid clamp mapping, unique evaluations, sparse not filled | GAP | A10c |
| P16-T13 | Slider/mount/refresh spawn no job; explicit compute idempotent | GAP (partial) | No-job half: `FE/freezeDetail.test.tsx:669, :681, :691`, `E2E:1660, :1684`. Explicit grid compute: A10c |
| P16-T14 | ΔJ scope; fixed params hash scope; out-of-declaration widen → new code version | GAP | A10c + `CG-P16-03` |

## P17 — Replay, state at cursor (S08)

| ID | Requirement | Status | Evidence / what is missing |
|---|---|---|---|
| P17-T01 | Event/fill/target routes have correct semantics, no fake ledger | **COVERED** | Target route: `CA/research-replay.service.spec.ts:70` (orders/fills/trades/positions NOT_PUBLISHED, no `order_id`), `SC:859`, `CA/research-current-source.service.spec.ts:115` (WFO fills reason). Event/fill routes: NOT_ADMITTED under DQ-11 (`AUDIT_P01_P10…md:320`, approved `RF-03/README.md:54`) |
| P17-T02 | Partial fills/OCO/funding/multi-leg units preserved | GAP | No `SOURCE_UNSUPPORTED_CONFIRMED` for signal-notional. Astra `:63` asks for the route's real output; guide `:2338` asks for supplementary QuantBT fixtures |
| P17-T03 | Reset-flat fold segments not falsely compounded | GAP | Fold capital convention NOT_PUBLISHED. W1 run has 2 expanding folds and no test |
| P17-T04 | Checkpoint/seek equivalence and gap refusal | GAP (partial) | Seek = sequential: `CA/research-replay.service.spec.ts:70` (ordinal 90 via pages vs `at`). Expiry recovery: `:167`, `FE/executeReplay.test.tsx:487`. **Missing:** a gap-refusal test (dense ordinals at seal are not tested) |
| P17-T05 | Sequence-scope collisions prevented | **COVERED** | `CA/research-rs03-current-source-acceptance.spec.ts:331` (Search cursor refused by Replay); `CA/research-replay.service.spec.ts:106`; `CA/research-current-source.service.spec.ts:160, :220` |
| P17-T06 | Long replay keeps DOM/browser/server memory bounded | GAP (partial) | Server: `CA/research-replay.contract.spec.ts:8` (limit 101 refused), `CA/research-rs03…spec.ts:296` (< 1 MiB). No committed browser DOM/heap measurement (the S08 probe was temporary) |
| P17-T07 | Seek/playback creates no compute job | **COVERED** | `SC:859` (jobs stay 1, no replay table); `CA/research-replay.service.spec.ts:70` (only `evidence.bundle`); `FE/executeReplay.test.tsx:297` |
| P17-T08 | Certificate badges only from actual evidence | GAP | True by construction (the contract has no certificate), but no assertion. The receipt claim (`thanhvuong-frontend-receipt.md:275`) is not a test |
| P17-T09 | All S08 spec tests run | GAP | No S08 T01–T22 inventory |
| P17-T10 | seq {10,12,90}: next/prev on existing rows, no fake 11; real gap detected | GAP | No sparse-sequence fixture |
| P17-T11 | Same-timestamp chain keeps source order; missing total order ≠ causal proof | GAP (partial) | `CA/research-replay.service.spec.ts:119` (`cross_stream_order` NOT_ASSERTED), `:70` (source order kept). No same-timestamp rows |
| P17-T12 | Deep link in a fresh tab + far-seek checkpoint = sequential state | **COVERED** | `CA/research-replay.service.spec.ts:70` (far seek = page walk), `:160` (`at_ordinal`); `FE/executeReplay.test.tsx:465`; `FE/inspectionCursor.test.ts:44` (seq/event_seq). Trade deep link: no trades exist |
| P17-T13 | Reveal ON hides future outcomes; no certificate/digest change | GAP | Reveal not built; `P17-FE-DG-02` awaiting Bobby |
| P17-T14 | Fold switch/child audit keep capital convention + original IDs; no compute on seek | GAP (partial) | No-compute half COVERED (see T07). Capital convention and child-audit IDs NOT_PUBLISHED |

## V1.1 DR / BR / GX

| ID | Status | Evidence / what is missing |
|---|---|---|
| V11-P13-DR | GAP (partial) | Engine parity exists on synthetic data (`PB/test_research_evidence_metrics.py:85–120`) and real BTC opt-in (`:319`). There is no recorded `delta-real-data` diff for monthly, rolling, underwater and fold summary against a raw reference on a real run |
| V11-P13-BR | GAP (partial) | Fixture browser field assertions exist (`E2E:1045–1301`). The real-API lane (`e2e/_preview-research-real-api.spec.ts:93`, RF-02 16/16) checks only visibility, overflow and refusals. It has no api-vs-ui values and was not run on the W1 WFO run |
| V11-P13-GX | GAP | `debt-register.json:5` says `[]` while A09–A12 are open (`BACKEND_DEBT…md:34`). No dev rebuild receipt |
| V11-P14-DR | GAP | No future-perturbation run on real WFO folds (guide `:2139`) |
| V11-P14-BR | GAP (partial) | Fixture: `E2E:1331–1439, :1824`. Real-API smoke only; no WFO fold-plan browser check |
| V11-P14-GX | GAP | Same debt-register/dev-build issue |
| V11-P15-DR | GAP | No DR-TUNE/DR-WFO matrix. The W1 run has 3 trials and 1 mode, with no statuses beyond COMPLETE (guide `:2204`) |
| V11-P15-BR | GAP | Scatter → pick → ledger → Freeze on real data not exercised |
| V11-P15-GX | GAP | As above |
| V11-P16-DR | GAP | No original-byte verify or corrupt-copy refusal (A10a); no grid (A10c) |
| V11-P16-BR | GAP (partial) | Verify waits for the server (`FE/freezeDetail.test.tsx:406`, `E2E:1660`). Grid states are A10c; no real-API check |
| V11-P16-GX | GAP | As above |
| V11-P17-DR | GAP | W1 replay lane is 200 (receipt `replay_route_capabilities`). No numerical diff; no supplementary route fixtures |
| V11-P17-BR | GAP | S08 is not in the real-API spec, the S08 browser probe was never committed, and `P17-FE-DG-04` is blocked on the flag |
| V11-P17-GX | GAP | Test count 24 (`P17/phase-report.md:59`) vs 25 (`P17/test-results.json:7`) not reconciled; debt register `[]` |

## GAP list — the smallest test that closes each

**P13**
- **P13-T02**: in `test_research_evidence_r2.py`, compare `_rolling_returns` values with an independent `equity[i]/equity[i-20]-1` over a 60-bar series.
- **P13-T03**: in `r2.py`, give `_p13_evidence_source` more than 192 OOS bars and assert `chart_sampling=EXTREMA_BUCKET_V1` while `net_return`/`max_drawdown` equal the full-vector values.
- **P13-T07**: write an S04 T01–T18 → test/assert table as a checked-in inventory file, plus a vitest that every row resolves to a real test name.
- **P13-T08**: a contract test that each S04 required field from the RS-02 matrix has a value or a typed absence in the Hub DTO (`CG-P13-05/07/08`).
- **P13-T10**: a Playwright journey on the W1 fixture: pick trial 1 in S06, then open S07/S09 and assert θ*/digest = selection trial 0.
- **P13-T11**: after the DR-02 decision, one shared warning-definition test used by S06 and S07.
- **P13-T12**: after `P17-FE-DG-02`, a unit test that Reveal masks future outcome fields and leaves the certificate/digest unchanged.

**P14**
- **P14-T01**: a real-engine WFO pytest that perturbs bars after fold-1's test end on a copy and asserts fold-1 selection and params are identical.
- **P14-T02**: the same run, perturbing only fold-k outer-OOS bars, and asserting fold-k selection does not change.
- **P14-T07**: a split read fixture for a legacy run with a holdout-exposure fact, asserting a used/unknown label rather than NOT_EVALUATED/SEALED.
- **P14-T08**: an S05 T01–T16 inventory, as for P13-T07.
- **P14-T12**: after the P19 lineage clone path, assert that clone exposure is inherited and unknown history stays unknown.

**P15**
- **P15-T01**: a fixture per admissible mode/schedule, or DQ-10-style exclusions for the rest, plus a test that each refused pair returns NOT_ADMITTED with a reason.
- **P15-T02**: an RS-02 service test with `SELECTION: 0`, asserting selection is typed absent and no ledger row is marked selected.
- **P15-T03**: an RS-02 trial with no objective, asserting a typed error or absence and never "0".
- **P15-T04**: after `CG-P15-03` publishes constraints, assert feasible/infeasible flags per trial.
- **P15-T05**: after `CG-P15-03`, assert a duplicate trial is typed DUPLICATE, not PRUNED.
- **P15-T06**: two sealed runs, both with `trial_id "0"`, asserting each search returns its own row and a cross-run cursor gets 400.
- **P15-T07**: seal 250 trials, walk every keyset page, and assert the count equals `source_trial_count`.
- **P15-T08**: publish sampler/seed/warm-start in the RS-02 search DTO and assert it equals the W1 profile (seed 42).
- **P15-T09**: an S06 T01–T19 inventory.
- **P15-T10**: a Playwright test on the W1 fixture: click trial 2 and assert the inspector changes while S07 θ* and the report are unchanged after back/forward. This also needs trial `parameters` retained in the ledger.
- **P15-T11**: a supplementary centroid fixture, asserting full params and `selected_trial_id=null`, and that jump-to-trial is disabled.
- **P15-T12**: after `CG-P15-03`, assert totals reconcile against `table_rows`.
- **P15-T14**: after DR-02, a bound-warning test on W1 params.

**P16**
- **P16-T02**: a per-fold causal check on the W1 two-fold run, asserting a per-fold verdict or a typed absence per fold.
- **P16-T03** and **P16-T04**: A10a, a flip-one-byte copy of a retained P05 part asserting MISMATCH/BLOCKED, and that reverify keeps the original expected digest.
- **P16-T06**, **P16-T07**, **P16-T12**, **P16-T14**: A10c (`BACKEND_DEBT…md:170–207`). Assert 81 unique cells, missing cells never 0, dedup by key, one job per click with cancel, and ΔJ labelled by mode/objective/window.
- **P16-T08**: sibling-draft read, asserting the draft carries `SIBLING_OF` lineage and the original run is unchanged.
- **P16-T09**: an S07 T01–T16 inventory.
- **P16-T10**: in `freezeDetail.test.tsx`, fake timers with the POST held pending, then rejected. After `advanceTimersByTime(60_000)`, assert no MATCH/PASS text.
- **P16-T11**: an RS-02 freeze/replay test asserting the audit target is `selection.selected_trial_id`, and that a fold query never defaults to the last fold.
- **P16-T13**: see A10c; the no-job half is already covered.

**P17**
- **P17-T02**: a real QuantBT pytest on the signal-notional result asserting no fills/OCO tuples, recorded as `SOURCE_UNSUPPORTED_CONFIRMED`, plus one supplementary route fixture.
- **P17-T03**: on the W1 two-fold equity, assert the fold-2 start is not compounded from fold 1 when the source says reset, or a typed convention.
- **P17-T04**: a seal with an ordinal gap `{0,1,3}` is refused, and replay never fabricates ordinal 2.
- **P17-T06**: a committed S08 Playwright test that plays through 1,000 samples and asserts DOM row count ≤ 100 and a heap bound.
- **P17-T08**: one `executeReplay.test.tsx` assertion that no `[data-certificate]` renders, plus a contract assertion that the replay schema has no certificate key.
- **P17-T09**: an S08 T01–T22 inventory.
- **P17-T10**: a replay fixture with sequence `{10,12,90}` asserting next/prev land only on existing rows.
- **P17-T11**: two observations with the same timestamp, asserting source order is kept and `cross_stream_order` stays NOT_ASSERTED.
- **P17-T13**: after `P17-FE-DG-02`, a unit test that Reveal masks future outcomes.
- **P17-T14**: fold switch on W1, asserting original fold IDs and a typed capital convention.

**V1.1 (all 15)**
- **DR**: one `delta-real-data` script over the W1 run that compares every S04–S08 API value with a direct QuantBT recomputation and records the diff. For P14, add the perturbation run. For P16, add the byte-corruption run.
- **BR**: extend `_preview-research-real-api.spec.ts` to S08 and to the W1 run, asserting API values equal the rendered text (api-vs-ui) on S04–S08.
- **GX**: correct the eight `debt-register.json` files (`in_scope_backend_debt: []` is wrong), reconcile P17 24/25, and record one exact dev build receipt.

## Observations found while mapping (not gates)

- W1 receipt `search_ledger.trials[*].parameters` is `{}` while `search_selection.parameters` holds 8 values. Trial 0's `objective` (−1.44) also differs from the selection objective (−9.81) for the same `trial_id "0"`. Either the ledger drops parameters, or the two objectives have different scopes that are not labelled. Owner check needed before P15-T10/T12 can pass.
- Current P17 control-api tests are 2 contract + 2 controller + 8 service tests plus `config.spec.ts` (19 `it`). Neither 24 nor 25 matches today's files, so re-count when reconciling GX.
