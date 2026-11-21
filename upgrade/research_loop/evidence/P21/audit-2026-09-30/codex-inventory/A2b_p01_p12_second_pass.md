# Slice P01–P12: CG-P02…CG-P12, RF/RS requests, BR-P10, DR/FND. Verified 2026-09-30

**Tree.** `/home/bobby/portal-research-fe` at `f7c76bae`, which is `docs/research-loop-plan`. It contains Codex `c2ec1443` / `2bfeb53e` and Claude's consolidation `925d4f22`. Since `c2ec1443`, the only change under apps/control-api, apps/portal/backend or packages/contracts is `925d4f22`.

**Method.** Every mention of each id was grepped across `upgrade/`, `apps/` and `packages/`, and the latest dated statement was taken. Each id was then checked against code (control-api src + migrations, portal backend src, packages/contracts/generated) and cited by file:line or commit.

**Abbreviations.** `U:` = UNIFIED_IMPLEMENTATION_PLAN.md · `EV/` = upgrade/research_loop/evidence/ · `CA/` = apps/control-api/src/research/ · `PB/` = apps/portal/backend/src/portal_api/ · `GEN/` = packages/contracts/generated/ · `FE/` = apps/portal/frontend/src/research/

**Not present in this tree:**
- Any `thanhvuong-backend-requests.md` under EV/P01–P12. Only P17–P23 have one.
- `CODEX_BACKEND_GAPS_2026-09-30.md`, the file D-AN-01 §4 cites for BR-AN-01.
- `research_portal_analytics.py`. This means D-AN-01 has not started.

**Classes:**
- **A**: blocks FE acceptance now
- **B**: screen source fact
- **C**: other ≤P21 backend correctness/contract
- **D**: P23/P24 qualification
- **E**: external (engine, ops, second engine, signing)
- **F**: Portal-computable under D-AN-01
- **—**: closed; verified in code

## 1. Id table

| id | title | class | phase | status verified (evidence) | minimal fix | acceptance test/receipt | FE consumer (screen·field) | proposed owner |
|---|---|---|---|---|---|---|---|---|
| CG-P02-01 | `$defs` required on wire RequestedSpec | — | P02 | DONE `3bb91fa5`. The only `$defs` left is the top-level type alias `GEN/research-preflight.d.ts:652`, which is not a RequestedSpec property | — | contracts spec (P02) | S02·preflight POST | — |
| CG-P02-02 | purge/embargo/label-horizon, inner folds, rolling width | **C** (open remainder) | P02/P08→P10 | PARTIAL. The contract and preflight are DONE `bd25e790` (`GEN/research-preflight.d.ts:141-193`). **Create still refuses every v2 spec:** `CA/run-admission.service.ts:215-222` → `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE`. The WFO profile is pinned `window_mode:"expanding"` (`PB/domain/research_delta_wfo_profile.py:37`) | Admit v2 into the signal-notional WFO profile. Pass inner/purge/embargo/rolling into `AdvancedWalkForwardRunner` (QuantBT 1.1.1 supports them per CG-P04-02). Otherwise keep the refusal but publish it as an Atlas route/profile fact, so S02 can disable the controls before create | run-admission spec (v2 create → 202) + P10 PG lane + one real WFO v2 run receipt (S05 shows purge/embargo) | S02·advanced WF step (rolling toggle, purge/embargo/inner folds); S05·fold anatomy | Claude (≤P21) |
| CG-P02-03 | capital/fee/slippage/sizing on the review row | B (deferred) | P02 | NOT_PUBLISHED by Bobby DQ-12. No requested-spec field exists, which is correct | Only if Bobby reopens DQ-12: versioned requested-spec fact | — | S02·review "account · execution" row (HiFi deviation) | Bobby |
| CG-P04-01 | Atlas mode facts (B-04) | — | P04 | RESOLVED: RF-02 B-04 `d67a0fb4`. `EV/RF-02/debt-register.json` B-04 RESOLVED | — | RF-02 16/16 | S12·modes | — |
| CG-P04-02 | `mode_1_decay × per_fold_causal` | — | P04 | DONE `57cf04ee`: `PB/services/research_engine_catalog.py:183,381`; `GEN/research-foundation.d.ts:249` `invalid_schedules` NOT_ADMITTED with reason | — | test_research_engine_catalog | S12·Rule One; S02·schedule | — |
| CG-P04-03 | reason per invalid schedule | — | P04 | DONE `05b4e96c` (`GEN/research-foundation.d.ts:249`) | — | same | S12·struck chips | — |
| CG-P04-04 | `oos_use` 4 states | — | P04 | DONE `bd2b60d1` (`GEN/research-foundation.d.ts:193` `oos_use_state` 5-enum) | — | W4 | S12 claim block; S02 claim forecast | — |
| CG-P04-05 | `cert_cap` / `avoid_when` | **E** | P04 | Typed NOT_PUBLISHED (`GEN/research-foundation.d.ts:191,243`). QuantBT 1.1.1 certifies by route, not by mode (U:4808). Reopened as CG-FG-S02-01, which is in another slice. **FE defect:** `FE/NewRun.tsx:1739` hard-codes "cert ceiling not published" and ignores `cert_cap.reason` | Engine: no Portal fix. FE: print `cert_cap.reason` | unit on NewRun | S02·cert glyph; S12·cap chip | engine (fact); Claude (FE copy) |
| CG-P04-06 | route description/method/status/backend/arbitrage/`route_params` | — | P04 | DONE `bd2b60d1` (`GEN/research-foundation.d.ts:163-164`) | — | W4 | S12 routes; S02 route grid | — |
| CG-P04-07 | claim qualifier, term meanings, mode 2–5 weights | — | P04 | DONE `bd2b60d1` (`GEN/research-foundation.d.ts:135,223-224`) | — | W4 | S12 claims/terms | — |
| CG-P04-08 | engine sub-stage vocabulary (11 pills) | E (closed by decision) | P04/P11 | NOT_PUBLISHED under DQ-04: five contract stages | Engine would have to publish sub-stages | — | S03·stepper | engine / Bobby |
| CG-P05-01 | runtime writer for `research.artifacts` / RS-02 ingest | — | P05 | DONE `7009ddcb`+`0513fe29`, real receipt `EV/RF-03/w1-preview-receipt.json`. Both profiles are in the contract (`CA/current-source.contract.ts:95,107-108,1052`). Imported runs are retained per E17 | — | W1 receipt; RF-06 28/28 | S03 retained tables; S04–S07 lanes | — |
| CG-P06-01 | attempt/queue read | — | P06 | DONE `390f179a` (`GEN/research-progress.d.ts:513,520,624`) | — | P11 spec | S03·attempts drawer | — |
| CG-P06-02 | live child progress channel | — | P06 | DONE `9d5c7ac3` (W2): `PB/services/research_progress.py:391` `fold_segment_observed`; producer `eta_s` at `PB/services/research_run_producer.py:225` | — | research-progress-w2 spec | S03 console/Gantt | — |
| CG-P06-03 | child caps vs real WFO | — | P06 | DONE `7009ddcb`: WFO 120 CPU-s / 240 s wall (`PB/domain/research_delta_wfo_profile.py:49,78-79`); P04 path still 45 s (`PB/workers/durable_worker.py:304`) | — | W1; P23-T02 PASS | S03 budget | — |
| CG-P06-04 | float `cpu_seconds` dropped | — | P06 | DONE `b0277b4f` (`PB/workers/durable_worker.py:1129`) | — | — | S03 usage | — |
| CG-P06-05 | budget kill misclassified | — | P06 | DONE `b0277b4f` (`PB/workers/durable_worker.py:876` RESOURCE_EXCEEDED) | — | — | S03 FAILED text | — |
| CG-P07-01 | R2 inventory for P07 routes | — | P07 | RESOLVED (U:4990; `EV/P07/debt-register.json`) | — | — | S14 | — |
| CG-P07-02 | class/dataclass file contract | C (deferred) | P07 | NOT_PUBLISHED under DQ-05: v1 literal `ALPHA_CONTRACT` + one function. Widening was marked "Codex design item" and was never scheduled | Bobby decides whether v2 parser widening is in V1.1 | — | S14·anatomy | Bobby |
| CG-P07-03 | 14-field mirror + per-field verdict | — | P07 | DONE within DQ-05 `28cc9e63`: 16 rows, `not_in_contract` (`GEN/research-alpha-import.d.ts:231-234`; `PB/services/research_alpha_analyzer.py:451-530`). **The verdict bug is S14-RW-BR-02 below** | — | W4 | S14·mirror | — |
| CG-P07-04 | gate timing, QUARANTINED_*, expires_at, declared digest | — | P07 | DONE `28cc9e63` (`GEN/research-alpha-import.d.ts:252,267,279`). RUNNING is client-only by decision | — | W4 | S14·pipeline | — |
| CG-P07-05 | RegistryEntry supersedes/name/strategy_id/warmup/columns | — | P07 | DONE `a1926f25`+`349657bb`, migration 057 (`GEN/research-alpha-import.d.ts:164-210`) | — | P07 PG 9/9 | S02 steps; S14 strip | — |
| CG-P07-06 | `may_activate` + DRAFT affordance | — | P07 | DONE `8f0c4c4e` (`GEN/research-alpha-import.d.ts:221,297`) | — | — | S14·activate | — |
| CG-P08-01 | server `may_create_run` | — | P08 | RESOLVED in P08 scope (U:5033), then P10 predicate | — | — | S02 | — |
| CG-P08-02 | rolling window mode | **C** (same remainder as P02-02) | P08 | Contract DONE (`GEN/research-preflight.d.ts:173,192`). Create refuses v2 (`CA/run-admission.service.ts:215-222`) | see CG-P02-02 | see CG-P02-02 | S02 rolling toggle; S05 | Claude |
| CG-P08-03 | per-gate preflight list + `field_path` | — | P08 | DONE `bd25e790` (`GEN/research-preflight.d.ts:299-313,376`) | — | research-w4-preflight spec | S02 result → step | — |
| CG-P08-04 | dataset catalog | — | P08 | DONE `28cc9e63` (`CA/dataset-catalog.controller.ts:18`) | — | W4 | S02 dataset select | — |
| CG-P08-05 | trial/seed/bounds/sweep ceilings | — | P08 | DONE: `CA/preflight-gates.ts:107-127` sweep ceiling; `CA/preflight.contract.ts:234`; `GEN/research-foundation.d.ts:391,502` | — | W4 | S02 validators | — |
| CG-P08-06 | gap scan, holdout seal (DR-01), holdout cap | — (cap E) | P08 | DONE `bd25e790` (`GEN/research-preflight.d.ts:116-117`). Holdout cap stays NOT_PUBLISHED (no source). **FE defect:** `FE/PreflightPanel.tsx:399-401` prints `bars/missing_bars/gap_runs ?? 0`, although `bars?` is optional (`GEN/research-preflight.d.ts:78`) | FE: typed absence instead of 0 | unit PreflightPanel | S02·gap-scan table; S05 | Claude (FE) |
| CG-P09-01 | exact P04 axes/claim types | — | P09 | RESOLVED (U:5079; U:3623) | — | — | S12 | — |
| CG-P09-02 | canonical journey/atlas/preflight fixtures | — | P09 | DONE. Journey is now v3 (`packages/contracts/fixtures/research-foundation.journey-v3.valid.json`), and the e2e loads v3 at HEAD (`e2e/fixtures.ts:262`, `ac0b3101`) | — | fixture lane | S00/S12 | — |
| CG-P09-03 | descriptor availability of mounted screens | — | P09 | DONE by E12 v3 (`9e205179`, migration `1723680000067`). The v3 fixture has 23 AVAILABLE; the 5 DEPENDENCY_REQUIRED cards are all Execution cards (paper, approval, gate R1/R2, stages) | — | test-p09-postgres 7/7 | S00·cards | — |
| CG-P09-04 | descriptor = HiFi 00 (28 cards) | — | P09 | DONE `ea221dc2` → v3 (28 cards) | — | same | S00 | — |
| CG-P09-05 | Atlas caps 32/8/16 | — | P09 | DONE `ea221dc2` | — | contract test | S12 T06 | — |
| CG-P09-06 | historical release labelling | — | P09 | DONE `ea221dc2`. The FE binding of `historical_identity` is tracked as CG-FG-S12-01 (other slice) | — | — | S12 historical chip | — |
| CG-P10-01 | `config_digest` | — | P10 | DONE `996eef6c` (`GEN/research-foundation.d.ts:387-388`) | — | RF-02 | S02 submit | — |
| CG-P10-02 | admission beyond fixed profile | **E** (remainder) | P10 | Delta WFO DONE `7009ddcb`. Imported/DRAFT branch exists (`CA/run-admission.service.ts:37-42,190-204`) and was accepted on an isolated cell (OL-01/E17, migration 074). Remainder: Production rollout (F10). Other routes and v2 remain refused by design (see CG-P02-02) | Ops rollout | E17 receipt; prod receipt | S02 create; S14 → S02 | Bobby/ops |
| CG-P10-03 | real refusal code for imported av_ | — | P10 | DONE `f8217217` | — | — | S02 refusal | — |
| CG-P10-04 | producer progress facts | **B** (small remainder) | P10 | DONE `9d5c7ac3`, except **trial rate**: no `rate` fact exists in the producer or in `GEN/research-progress.d.ts`. FE prints a literal sentence (`FE/RunProgress.tsx:105,561`) | Publish `trials_per_s` (or a typed NOT_PUBLISHED with reason_code) beside `eta_s` | producer unit + S03 unit | S03·03-M rate | Claude |
| CG-P10-05 | refuse mode/schedule mismatch | — | P10 | DONE `f8217217` | — | — | S02 forecast | — |
| CG-P10-06 | cancelled-before-progress / QUEUED null | — | P10 | DONE `3bb91fa5` | — | — | S03 states | — |
| CG-P11-01 / -02 | fold_timeline, methodology_certificate | — | P11 | RESOLVED (display-fact amendment, U:5240) | — | — | S03 | — |
| CG-P11-03 | run identity, declared folds, claim cursor | — | P11 | DONE W2 (`GEN/research-progress.d.ts:531-556,622`), plus `display_label` (D1) | — | w2 spec | S03 identity strip | — |
| CG-P11-04 | budget facts | — | P11 | DONE `5bc77b9b` | — | — | S03 budget bar | — |
| CG-P11-05 | preview enables RETAINED_ARTIFACTS | — | P11 | DONE `dba47502`. `ac0b3101` enables every Research flag on the preview | — | — | S03 | — |
| CG-P11-06 | cancel-before-source NOT_REQUIRED | — | P11 | DONE `7e3e7ee9` (`CA/progress.repository.ts:225,611`). Retry-dispatch semantics are E10-O2 (Bobby) | — | — | S03 cancelled | — |
| CG-P11-07 | no in-place retry; clone requested-spec | — | P11 | DONE (`CA/progress.service.ts:136-138,177`; `CA/progress.controller.ts:84`) | — | — | S03 "new run with same draft" | — |
| CG-P11-08 | snapshot on every SSE event | — | P11 | DONE (`CA/progress.controller.ts:179-184`) | — | — | S03 live | — |
| CG-P11-09 | declared digests; unmeasured usage null | — | P11 | DONE (`GEN/research-progress.d.ts:314,358,360`) | — | — | S03 | — |
| CG-P12-01 | status census | — | P12 | No contract (U:5304) | — | — | S01 | — |
| CG-P12-02 | S01 stat trio (OOS Sharpe · Δ decay · trades) | **F** | P12 | DONE `7b80ae07` (`CA/run-library.service.ts:49-93,231`), all-time/engine. **D-AN-01 §3:** thumbnail chips must be **last-30D, labelled "last 30D"**. No `last_30d` exists (`grep last_30` = 0). Decay on P04 is a source absence (`P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT`) and not a D-AN-01 metric | BR-AN-01 v2: `last_30d` block (Sharpe, return, trade/episode count) with `origin:PORTAL_DERIVED`, `scope`, `input_digest`; typed absence for old runs | numeric test on a known series; library contract fixture | S01·card stat trio | Codex (BR-AN-01 per D-AN-01 §4) + Claude FE label |
| CG-P12-03 | S01 sparkline | **F** | P12 | DONE `7b80ae07`. It reduces the **whole** OOS equity to ≤24 points (`CA/run-library.service.ts:229,534-551`), which is all-time; D-AN-01 §3 asks for last-30D + label | Sparkline window = last 30D of the same scoped series, plus a `window` field | sparkline contract test; S01 unit | S01·sparkline | Codex (BR-AN-01) + Claude |
| CG-P12-04…10 | mode chip, cancelled ledger, rc, legacy row, cursor, claim parity, q= | — | P12 | DONE `7b80ae07` (`CA/run-library.service.ts:891-915`; `CA/run-library.contract.ts:95,207`). rc is now OL-13 | — | run-library spec | S01 | — |
| BR-P10-01 | bound-version declaration + trial ceiling to browser | — | P10 | CONSUMED 2026-09-21 (`GEN/research-alpha-import.d.ts:158-215`; `GEN/research-foundation.d.ts:384`) | — | S02 probe 23/23 | S02 validators | — |
| BR-P10-02 | release optimizer defaults | — | P10 | CONSUMED (`GEN/research-foundation.d.ts:385`; `PB/tests/test_research_engine_catalog.py:118`) | — | — | S02 §9 tables | — |
| CG-RF02-01 | narrow seccomp/AppArmor for child | **E** (remainder) | RF-03/P06 | CODE DONE: `deploy/compose.research-progress.yaml:69-75` (seccomp json + `apparmor=portal-research-child` enforce; OL-01 accepted on isolated cell). Remainder: Production host rollout (F10) | Ops | prod receipt | S14→S02 imported run | Bobby/ops |
| CG-RF02-02 | NATS idle consumer | — | RF-03 | DONE `5b2cf660` (worker-image test PASS) | — | — | — | — |
| CG-RF02-03 | retention materializer | — | RF-03 | Folded into CG-P05-01: DONE | — | — | S04–S07 | — |
| CG-RF02-04 | P14 timeline review | — | RF-03 | ACCEPTED `12750366` | — | — | S05 | — |
| CG-RF02-05 = RF01-DG-02 | `test-p02-python-pin.sh` against a 1.1.1 image | **D** | RF-01/P02 | OPEN, never re-run. The script defaults to `local/portal-portal-api:dev` (`scripts/research-loop-v11/test-p02-python-pin.sh:9`); the pin says 1.1.1 (`upgrade/backend/bar05/environment-report.json:19`; `constraints/portal.txt:13`). The last result was FAIL_PRE_EXISTING (`EV/RF-01/test-results.json:16`) | Run with `P02_PINNED_RUNTIME_IMAGE=<preview/P23 worker image>`, or re-pin the report | script PASS receipt in P02/P23 | — | Claude (P02) / Codex P23 (CG-P23-05) |
| CG-RF02-06 | review of Claude RF-01/02 backend | — | RF-03 | ACCEPTED (`EV/RF-03/README.md:43`) | — | — | — | — |
| RS-01 | correctness repairs A01–A08 | — | RS-01 | No in-scope backend debt (`EV/RS-01/debt-register.json`) | — | RS-01 report | S04–S08 | — |
| RS-02 | current-source adapters | — | RS-02 | No in-scope debt; closed_debt CG-P05-01, split-read slot `10a490e3` | — | W1 | S04–S08 | — |
| RS-03 | rich consumer + A12 gate mapping | **D** | RS-03 | FE W3b delivered `28da9470`. A12 mapping: 62 GAP at 09-24, P13–P15 closed by W3. The residual P16/P17 gate-ID gaps feed the P24 DR/BR/GX closure | Refresh the A12 table against current tests | A12 table with 0 unexplained GAP | S04–S08 | Claude (≤P21 map) → Codex P24 |
| S14-RW-BR-01 | register replay of ACTIVE version → 500 | **A** | P07 | OPEN, confirmed. `CA/repository.ts:1074-1093` binds `supersedes_alpha_version_id = alphaRow.active_version_id` (line 1092). On replay of the active version this equals its own id and hits `research_alpha_supersedes_not_self_check` (migration `1723680000057…sql:8-9`) before `ON CONFLICT` | Read the existing row first and skip the INSERT on replay, or bind `NULLIF(active_version_id, $2)` | p07-alpha-import spec: register → activate → register again → 201 `replayed:true`; S14 real write retake | S14·register step (replay) | Claude (≤P21). The FRONTEND_GAPS §6 owner "Codex" is wrong |
| S14-RW-BR-02 | failed gate marks the wrong mirror fields | **A** | P07 | OPEN, confirmed. `PB/services/research_alpha_analyzer.py:464-469,514` marks every field sharing a failed gate as FAIL (e.g. `version` under `contract-complete`), while the missing field (`warmup_bars`) is GATED | Mark FAIL only on the field(s) that caused the gate failure (use the gate's per-field reason). A present-but-valid field under a failed gate → PASS/VERIFY | `test_w4_cg_p07_03_a_failed_gate_marks_its_fields_fail` neighbour with warmup missing | S14·mirror `check` column | Claude |
| S14-RW-BR-03 | gates/activate 201 vs OpenAPI 200 | — | P07 | DONE `4e343fe9` (`CA/alpha-import.controller.ts:80,122` `@HttpCode(200)`). The 201 was seen on an older preview image | — | re-verify on rebuilt preview | S14 | — |
| BR-D4-1 | exact bar edges / earliest first window per dataset·symbol·tf[·av] | **B** | P08/P10 | OPEN: no `first_bar_start`/`last_closed_bar`/`earliest_first_window` in GEN or `research_dataset_catalog.py`. Overlaps CG-FG-S02-02 | Additive nullable fields on the dataset catalog symbol (metadata sidecar), with a NOT_PUBLISHED reason | contract fixture + S02 prefill unit + preflight receipt | S02·window prefill, timeline bar counts | Claude |
| BR-D4-2 | rule for prefilling interior windows | B (decision) | P08/P10 | BLOCKED on Bobby (methodology) | Bobby picks (a) a release-config rule or (b) server `suggested_windows` | — | S02·interior dates | Bobby → Claude |
| BR-D4-3 | locked-profile admission facts (92-day span, folds 2–16, fixed tf) | **B** | P10 | OPEN: only server-side (`CA/delta-wfo.profile.ts:45`, `CA/run-admission.service.ts:414`); not in `AtlasSubmissionConstraints` | Publish them beside `submission_constraints` (covered by `config_digest`) | contract fixture + S02 unit | S02·advanced WF limits | Claude |
| S14-RW-OPS-01 | preview `PORTAL_PUBLIC_ORIGIN` blocks localhost writes | E | P10 | OPEN, ops | ops decision | — | S02/S14 writes on preview | Bobby/ops |
| E10-O2 / E10-O3a | retry dispatch vs expire; sweep cadence > ~30 workspaces | D (Bobby) | P06/P11 | BLOCKED on Bobby (U:3781, F7) | Decide, then measure | — | S03 FAILED `P06_RETRY_NOT_DISPATCHED` | Bobby → Claude |
| DR-01 | holdout seal/unlock authority | D | P02/P08/P14 | DECIDED: no unlock exists or is built (`EV/RS-03/A12…:225,232` DECIDED). The P02 register still says OWNER_GAP_NOT_IMPLEMENTED | Closure only | P24 DR closure | S05·unlock (span, no request) | Codex (P24) |
| DR-02 | shared bound-warning definition S06/S07 | D | P13/P15/P16 | DECIDED W5a (`EV/DECISIONS_BOBBY_2026-09-25.md:34`). The P02 register says CONTRACT_FIXTURE_ONLY | Closure only | P24 | S06/S07 warnings | Codex (P24) |
| DR-03 | promotion_pick source | D | P19/P22 | DECIDED + OL-03 CLOSED (U:3681) | Closure only | P24 | S10 pick | Codex (P24) |
| DR-04 | attempt creation / draft totals | D | P02/P03/P19 | RULE_FIXED (guide §3.3). **The P02 register's `DR04` is a different decision** (202 facade), an id collision | Renumber P02 DR01–DR08 or map them to guide DR-01…07 | P24 | S10 counts | Codex (P24) / Claude (register) |
| DR-05 | reproduce/clone/upgrade/audit intents | D | P02/P04/P10 | RULE_FIXED; backend publishes `REPRODUCE_EXISTING`/`REPRODUCTION_OF` (`GEN/research-run-create.d.ts:65-78`). The FE always sends `intent_kind:"NEW"` (`FE/useNewRun.ts:103-105,156`). Not required by the HiFi, except for an S08 mention | None required. Optional entry point | P24 | S02/S08 | Claude (optional) |
| DR-06 | canonical optimizer fields / alias conflict | D | P02/P04/P08 | FROZEN_AND_VALIDATED (P02 register DR06; P08 alias refusal) | Closure only | P24 | S02 serializer | Codex (P24) |
| DR-07 | RC → downstream pin/approval | D | P02/P22 | P22 CLOSED (OL-04/05/11). The P02 register's `DR07` (producer auth BLOCKED_BY_P03_P10) is stale: P10 has the signed Portal hop (U:3623) | Closure only | P24 | S11 | Codex (P24) |
| FND-01…FND-20 | design findings R01–R08 (guide §3.2) | D | P01–P24 | Each is a design rule mapped to phases. The P02–P12 parts are satisfied by the rows above (FND-03/04/05/10/18/19/20 via P07/P08/P10/P11/P04/P01). No FND has an open ≤P12 backend id. Formal closure is "FND/COR/DR closure" in P24 (U:6430-6444), and P24 is not started | P24 closure table citing the phase evidence | P24-T01…T15 | all screens | Codex (P24; board row U:3637 still "unassigned", so Bobby should confirm) |

## 2. Adjacent FE defects found while verifying (≤P12 screens, HEAD `f7c76bae`)

- `FE/PreflightPanel.tsx:399-401`: `?? 0` on optional window `bars`/`missing_bars`/`gap_runs`. This breaks the rule that null is never printed as 0.
- `FE/NewRun.tsx:1739`: hard-coded "cert ceiling not published" instead of `cert_cap.reason`.
- `FE/AlphaImport.tsx:113-121,890`: copy "Not admitted yet (OL-01)" is stale. OL-01 is accepted on an isolated cell, and the imported admission branch exists at `CA/run-admission.service.ts:190-204`.
- `FE/progressClient.ts` `console`/`events`: no `workspace_id` query; `RunProgressRoute` passes no workspace. This is 2_wiring X7 and is still true.
- `FE/RunProgress.tsx:561`: rate prints a literal sentence, not a reason_code (see CG-P10-04).

## 3. STALE ledger rows (the row says OPEN or pending but the work is done, or the owner is wrong)

1. **U:3615 (RF-03 board row).** It says "ONE_BOBBY_DECISION (`CG-RF02-01`) … Open: CG-RF02-01 (host profile load needs Bobby)". The profile is now attached (`deploy/compose.research-progress.yaml:69-75`) and OL-01 is accepted on an isolated cell. Only the production rollout (F10, ops) remains.
2. **U:3623 (P10 board row).** It ends "Open: **CG-P10-01**", but CG-P10-01 was resolved in `996eef6c` (U:4808; RF-02 debt RESOLVED).
3. **`EV/RF-02/debt-register.json` RF02-DG-02.** It says "REQUESTED Codex CG-RF02-01..05". 01 is code-done, 02/04/06 are accepted, 03 was folded into CG-P05-01 (done). Only 05 is open, and its owner is Claude (≤P21) per the 09-24 rule.
4. **`EV/RF-01/debt-register.json` RF01-DG-01 "PLANNED".** It was delivered by RF-02. RF01-DG-02 is still open (= CG-RF02-05).
5. **Stale phase debt registers.** `EV/P02/debt-register.json` P02-DG-01/02/03, `EV/P03/…` P03-DG-01/02, `EV/P04/…` P04-DG-01/02/03 and `EV/P05/…` P05-DG-01/02/03 are still NOT_STARTED / PENDING / HANDOFF_READY, although P04–P11 and RF-03 delivered them. `BACKEND_DEBT_P01_P21 §1` flagged them on 09-24 and they were never updated.
6. **`EV/P02/decision-register.json`.**
   - DR01 and DR03 say OWNER_GAP_NOT_IMPLEMENTED, and DR02 says CONTRACT_FIXTURE_ONLY. All three were decided (DECISIONS_BOBBY 09-25; OL-03).
   - DR07 says "producer auth BLOCKED_BY_P03_P10", but P10's signed hop is done.
   - DR04–DR08 use the same ids as guide DR-04…07 for different topics (id collision).
7. **`EV/RS-03/debt-register.json` `frontend_acceptance_pending` W3b.** It was delivered in `28da9470` (RF-06 28/28).
8. **`EV/RS-02` and `RS-03` `explicit_source_truth_boundaries`.** They still say warmup/purge/embargo and objective decomposition/prune/importance are "not published". CG-P14-02 and CG-P15-04 (W3 `b621c5af`) published them on the retained lane.
9. **`EV/RF-03/README.md:30,50,60-63`.** Still reads CG-P05-01, CG-P07-03/04, CG-P06-02 and CG-P08-05 as "stays OPEN"/partial. W1/W2/W4 delivered all of them, and there is no supersession note in the file.
10. **`EV/CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md:88,148-150`.** Same stale "remains OPEN" paragraphs, contradicting the table in the same file.
11. **`EV/CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md:112-121`.** The ownership split still names Codex for CG-P11-03…09, but Claude took over on 09-24 and delivered them in W2.
12. **`EV/P09/E12_JOURNEY_DESCRIPTOR_V3_CLOSEOUT_2026-09-27.md`.** It names migration `1723680000074`, but the file is `1723680000067_research-journey-descriptor-v3.sql`. 074 is `imported-execution-v1`.
13. **`EV/FRONTEND_GAPS_STATUS_CLAUDE_2026-09-30.md` §6.**
    - S14-RW-BR-01/02/03 have owner "Codex"; they are ≤P21, so Claude.
    - BR-03 is already fixed (`4e343fe9`).
14. **`EV/P21/audit-2026-09-30/2_wiring.md`.** Stale relative to this HEAD:
    - X3 says the e2e loads the deleted journey v2. It now loads v3 (`ac0b3101`).
    - It says S14-RW-BR-* and BR-D4-* "exist only on Claude's unpushed line / unmerged G2 doc". Both are now in the tree (`EV/P10/S14_REAL_WRITE_RECEIPT…`, `EV/P10/G2_D4…`).
15. **`EV/P01/debt-register.json` external deps.**
    - P01-GAP-03 is RESOLVED (its own closure_notes).
    - P01-GAP-05 (1.0.8 pin) is resolved (`constraints/portal.txt:13` = 1.1.1).
    - P01-GAP-01 (`doc-page.js` missing from the HiFi 09 archive) is **still true** (8_visual_sweep).
16. **HIFI_AUDIT_S00_S14 (09-26) line 53.** The "availability P→A for 5 cards" item was closed by E12 v3 (`9e205179`).
