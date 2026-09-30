# Research Loop V1.1 — FE↔BE wiring audit (screens 00–14, P22, P23), 2026-09-30

Read-only. Nothing was built, tested, committed or edited, apart from this file.

**Union evaluated.** Codex `/home/bobby/portal-research` is now at **`c2ec1443`**, not `2bfeb53e`. It gained three P23 F5 docs/test commits and no product or contract change. On top of that:
- w1-build `d7db1cb3` plus its uncommitted changes (AlphaImport token fix, TopBar option A)
- G1 `agent-afd8…`
- G3 `agent-ab5c…`
- G4/G7 `agent-a12f…`
- G8 `agent-a935…`
- G2 `ed33db0d`

**Method.**
- For every research operation, the FE client URL was compared with the OpenAPI path and the control-api `@Controller`/route.
- The generated `.d.ts` property names were grepped against non-test FE source.
- Each hit was triaged by hand: material, diagnostic, or request-only.
- The typed-absence sites were harvested and mapped to request ids.
- Screen detail came from four read-only sub-audits; I spot-checked the load-bearing lines myself.

The prior survey (`P21/CODEX_BACKEND_AND_COMPAT_SURVEY_CLAUDE_2026-09-30.md`) was confirmed, with the corrections in §4.

## 0. Cross-cutting findings

| # | Finding | Evidence | Owner |
|---|---|---|---|
| X1 | **All 48 research operations in the 17 research OpenAPI files use the same path on all three layers** (FE client, OpenAPI, controller). There is no path or verb mismatch. | e.g. `releaseCandidateClient.ts:106-131` = `release-candidate*.controller.ts`; `replayClient.ts:125-171` = `replay/current-source.controller.ts` | — |
| X2 | **CSRF header name drift, contract only.** The runtime uses `x-portal-csrf` on both sides (`control-api/src/auth/cookies.ts:5`, FE `auth/authApi.ts:76`). Four OpenAPI files still declare `x-csrf-token`: research-alpha-import, run-create, preflight and progress. The P22 publication contract is already correct (`x-portal-csrf`). Real writes pass (P23 F5 S02/S14), so this is contract drift, not a runtime break. This is CG-FG-S14-01, and it covers 4 files, not 1. | `packages/contracts/openapi/research-{alpha-import:107, run-create:136, preflight:164, progress:101}` | ≤P21 → Claude |
| X3 | **The deleted journey-v2 fixture is still loaded by e2e.** Loading it throws ENOENT, so every spec that uses `stubPortalApi` (24 specs, including visual) and the fixture lane break. | `e2e/fixtures.ts:262`, `e2e/_probe-research-rf01.spec.ts:234`, `e2e/_probe-research-product.spec.ts:48`. Product code (`foundationRoutes.tsx:39`) and `research-qualification/stubs.ts:579` already use v3. | Claude |
| X4 | **`imported_alpha` (ImportedAlphaReadBinding) is served on S06 and S07 but never read.** On an imported run, `source_digest`, `entrypoint` and categorical/boolean params arrive only through this field. | `research-search.d.ts:281` (served `search.service.ts:414`); `research-freeze.d.ts:169` (served `freeze.service.ts:417`); 0 FE reads | Claude |
| X5 | **Imported-alpha wording.** `SplitDetail.tsx:~2017-2020` compares against the literal `P04_OBSERVED_AFTER_FIXED_PROFILE`. Codex widened the union with `IMPORTED_*`, so imported runs fall through to the weaker wording "was observed". | `research-split.d.ts:83` | Claude |
| X6 | **Ownership.** The FG ledger (`FG-backend-requests.md`) and Unified §13 L3698-3712 name Codex as owner of every CG-FG-S02…S14 packet. The 2026-09-24 ownership rule gives Claude FE+BE for ≤P21, **including open Codex requests**. S02–S14 are all ≤P21 phases (P04/P10/P11/P13–P21), so in practice **Claude owns all 37 packets**. Codex owns only CG-FG-P22-01 (and P23/P24). The ledger has not been re-owned. | memory `research-loop-p01-p21-ownership`; Unified L3896 "Tất cả OPEN, owner Codex" | Bobby/ledger |
| X7 | **Workspace scope leaks.** Several reads take `workspace_id` but the FE does not pass it: progress `console` and `events` (`progressClient.ts:160,189`), with `RunProgressRoute.tsx:16` passing no workspace at all. Export `download_href` is built without `?workspace_id` (`report.service.ts:388`), so on a non-default workspace (for example claude-probe) the download resolves against the default. | as cited | Claude (both ≤P21) |

## 1. Per screen

Verdicts:
- **WIRED**: every material served field is read, and the only absences left are source or engine limits.
- **PARTIAL**: the screen works, but there are served-not-read material fields or FE-side packet work.
- **GAP**: a broken or missing binding. No screen is GAP at product level; the e2e harness for S00 is broken (X3).

### S00 Journey Map — WIRED (e2e broken, X3)
- **Read:** `GET /api/v1/research/journey`. FE `foundationClient.ts:54` = OAS = `foundation.controller.ts:24`. Cursor keys match.
- **Served, not read:** `JourneyCard.requires_run`. The FE recomputes it from its own route table (`JourneyMap.tsx:150` → `screenRoutes.ts needsRunToOpen`). It is a duplicated fact that could drift; low priority.
- **Waiting on backend:** none.
- **Mismatch:** only the e2e v2 fixture (X3).

### S01 Run Library — WIRED (minor)
- **Reads:** `GET /quantbt/runs`, `/{id}/sparkline`, and the P22 `GET /research/alpha-versions/{id}/publication` (OL-13 rc chip, bound at `RunLibrary.tsx:912-1070`).
- **Served, not read:**
  - `rc_availability`: when `rc` is null the chip is silently omitted and the reason code is never shown (`RunLibrary.tsx:1381`). Small material gap.
  - `relationship{kind,parent_run_id,logical_run_key,technical_retry_count}`: `REPRODUCTION_OF_RUN` and `AUDIT_OF_SELECTION` children get no parent marker. Material if the HiFi shows child or retry rows.
  - `counters.*` and sparkline constants: diagnostic.
- **Waiting on backend:** none.
- **Ledger:** Unified L3957 still lists OL-13 as "chờ Codex" (waiting on Codex). That is stale; it is delivered and bound, with fixture-only acceptance.

### S02 New Run — PARTIAL
- **Reads:** preflights POST/GET, datasets, POST `/research/runs`, and requested-spec (clone). All paths match; the only drift is the CSRF name (X2).
- **Served, not read:**
  - **`reproduction` + `REPRODUCTION_OF`** (E13, `1ac1c628`). The FE sends only `SIBLING_OF`/`CLONE_OF`, always with `intent_kind:"NEW"` (`useNewRun.ts:103-105,156`). So there is no reproduce entry point, `CLONE_FOR_EXPERIMENT` is never sent, and `reproduction.environment_equivalence` is never shown. Only the refusal copy exists (`runCreateClient.ts:226-230`).
  - Atlas `min_folds_maximum` and `train_window_pattern` are hard-coded in `runDraft.ts:312,348`. The values agree today, so this is a drift risk, not a bug.
  - Dataset `source_class`, `usage_scopes`, `excluded_scopes`: not rendered. Minor.
- **FE honesty bug (not a wiring gap):** `PreflightPanel.tsx:399-401` renders `bars`, `missing_bars` and `gap_runs` as `?? 0`, which breaks the null-is-not-0 rule. `expected_bars` is not shown.
- **Waiting on backend:**
  - CG-FG-S02-01, cert ceiling. `cert_cap` is always `AtlasNotPublishedFact` (`foundation.d.ts:191`). S02 hard-codes "cert ceiling not published" (`NewRun.tsx:1585`) instead of reading `cert_cap.reason`, which is fixable on the FE now.
  - CG-FG-S02-02 = BR-D4-1, per-window bar counts ("not declared → not declared", `NewRun.tsx:1559-1566`).
  - BR-D4-2 (owner rule, Bobby) and BR-D4-3 (`max_span_days`/fold bounds) exist only in the unmerged G2 evidence doc.
- **G2 (`ed33db0d`):** reads only `DatasetCatalog.symbols.items[].coverage{first_month,last_month,months}` plus `source_timezone` and `coverage_rule`. All of these exist at HEAD. It merges clean.

### S03 Run Progress — WIRED
- **Reads:** progress, events (SSE), console, requested-spec, cancel. They match. Minor: `console` and `events` do not pass `workspace_id` (X7).
- **Served, not read:**
  - `ProgressTrialPayload.best_objective` (live best-so-far, `progress.d.ts:276`): small material gap.
  - `CancelResponse.status`/`source_marker`: stored in the hook (`useRunProgress.ts:217,660`) but never rendered, so `PENDING_RECONCILIATION` is invisible. Small material gap.
  - `usage.*`, `evidence_digest`, `split_digest`, `job_state`, `may_retry`/`retry_reason` constants: diagnostic.
- **Packets:**
  - S03-01: the total is served as `run.declared_folds` and bound (`RunProgress.tsx:1931,2132`). The planned-fold list is still absent.
  - S03-02: only one `claim` exists, and it is bound (`:1447-1470`). The four methodology claims are not published, and there is no placeholder for them.
  - S03-03: **delivered and bound** (`declared_folds.count`, `overall.trials_declared`). The absence at `:450` prints a literal sentence instead of the server's `reason_code`.
  - S03-04: `artifacts` + `retained_artifacts` + `denied_artifacts` (holdout `P08_SEALED_HOLDOUT_UNLOCK_NOT_INSTALLED`) are bound. There is still no fixed 7-row manifest.

### S04 Evidence Hub — PARTIAL
- **Reads:** `/evidence`, `/evidence/series`, `/current-source/evidence`, `/current-source/evidence/series`. The kind enums match.
- **E11/E14 `summary_analytics` is bound:**
  - `in_sample_equity` (`EvidenceFlow.tsx:3311-3353`)
  - `rolling_sharpe_63` (`:1806,1902`)
  - the six `behaviour` tiles (`:3150-3190`)
  - `total_trade_count`
- **Served, not read:**
  - **`summary_analytics.net_oos_return` is read nowhere.** The "Net return" tile uses the account figure (`passport.net_return_fraction` / `NET_RETURN_FRACTION`, `:2968,1400`). E14 defines the OOS net return as distinct from account return. Either bind it or label the tile as account return. Material.
  - Diagnostic: `input_digest`, `trade_ledger_record_count`, `window_days`, `omitted_non_finite_count`, `market_overview` (it belongs to S08).
- **Waiting on backend:**
  - S04-01, 7-field claim strip. Delivered on the retained lane (`ClaimStrip`, `current-source.d.ts:1199-1231`) and bound (`RetainedClaimFields :2194-2260`). The P13 hub `Claim` lacks it: `UNPUBLISHED_CLAIM_FIELDS :354`, rendered with **`reason_code:null`** (`:392,507,798`).
  - S04-02, dataset coverage: absent (`:899-912`, `reason_code:null`).
  - S04-03, EQUITY_IS: superseded by E11 `in_sample_equity`. On WFO the selected candidate's IS equity is a source absence (`source_absences.in_sample_account`).
  - S04-04, per-fold metrics: the retained `fold_verdicts` are bound. On P04 it is a source limit (`P04_CHILD_PUBLISHES_RUN_FINAL_ONLY`).
  - S04-05: benchmark (`source_absences.benchmark`) and `ROLLING_BETA_63` are still absent; the rest is bound.
  - S04-06, cert cap per stage: absent (`SourceGap cert-chain :3669`).
  - S04-07, window-disclosure counts: absent (static text `:89,3674`).
  - Several FE-invented reason codes are not tied to any packet: `P13_PUBLISHES_NO_TRIAL_CURSOR|PARAMS_DIGEST|EVENT_SEQ` (`:1209-1235`), `SERIES_*_NOT_PUBLISHED` (`:1755`), `UI_RETAINED_LANE_HAS_NO_*` (`:2902`).

### S05 Split — PARTIAL (FE honesty bug)
- **Reads:** `/split`, `/current-source/split`. They match.
- **Served, not read:**
  - `absence_authority` (constant `FIELD_LOCAL`): diagnostic.
  - `gap_scan.boundaries[]` per row (`previous_fold_id`, `boundary_utc_ms`, `gap_bars`) and `contiguous_count`: only counts and max are shown. Minor.
- **Waiting on backend:** CG-FG-S05-01 `train_test_disjoint` is absent from the split, current-source and control-api schemas.
- **FE_GAP 05-15 is still live.** `SplitDetail.tsx:1873` draws a ✓ ("train ∩ test = ∅, every fold") whenever `foldPlanReady` is true, which is an FE-asserted fact. It should become a typed absence now (debt `FG-debt-register.json:365`).
- **Other:** imported-alpha wording (X5). G4 changes only headings.

### S06 Search/Selection — PARTIAL
- **Reads:** `/search`, `/current-source/search`. Paths match. The FE sends only `cursor` on the retained lane: `fold` and `before` are never sent, so `ledger.fold_filter.fold_id` is always null (`SearchDetail.tsx:2322`).
- **Served, not read:**
  - **`imported_alpha`** (X4).
  - `selection.roles.candidate_source_trial_ids` and `search_contract.optuna_trials_per_study`: diagnostic.
- **Waiting on backend:**
  - S06-01, `selector_confidence`: absent.
  - S06-02, `levels`: present on the retained lane and bound (`SearchDetail.tsx:1268`); absent on the research-search DTO (P04 shows NOT_PUBLISHED, `:588-600`).
  - S06-03, `surface.grid`: absent. The S07 9×9 what-if grid is a different fact.
  - S06-04, `surface.interactions`: pinned NOT_PUBLISHED (`QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS`).
  - S06-05, `pool.frozen_at_utc_ms`: absent (`SearchStageB.tsx:143`).
  - S06-06, `Trial.seed`/`params_digest`: absent. `ChildAuditRecord.seed` is the child-strategy seed, not the Optuna trial seed.
  - Engine requests E5-O1 (`QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN`, `SearchStageB.tsx:399`) and E5-O2 (`…DOES_NOT_ISOLATE_THE_TOP_IS_POOL`, `…DID_NOT_PUBLISH_THE_TOP_IS_POOL_RULE`): QuantBT engine owner.
- **G8:** reads `current-source/split fold_plan.folds[]` and Atlas `modes[].facts.schedules[].oos_use_state`/`reads.*`. All exist at HEAD. It merges clean.

### S07 Freeze — WIRED (imported gap)
- **Reads:** `/freeze`, `/freeze/verify`, `/current-source/freeze`, what-if evaluate. They match.
- `engine_pin` (E16-R2, now required) is bound in `DigestChain.tsx:160-190`. **Closed.**
- **Served, not read:**
  - **`imported_alpha`** (X4).
  - Diagnostic: `engine_pin.execution_adapter_id`/`adapter_contract_digest` (DigestChain uses the provenance copy), `frozen_candidate.candidate_id`, what-if `evaluation_key`/`source_ref`.
  - Inert on P04: `effective_cell_count`, `objective_definition`, `selection_*`, `diagnostic_evaluate`.
- **Waiting on backend:** none (no S07 packet).
- **Typed-fixture risk:** because `engine_pin` is now required, typed fixtures built at `d3d99f26` (e.g. G4's `freezeDetail.test.tsx`) may fail `tsc` after the merge.

### S08 Execute/Replay — PARTIAL
- **Reads:** `/execute/replay`, `/current-source/replay`, `/current-source/replay/transitions`, `/current-source/replay/child-audit`. They match, and the FE excludes `at_ordinal` from the retained lane at the type level.
- **Served, not read:** **`market_overview`** (`replay.d.ts:185`, Codex). The FE reads only `candle_overview` (Claude E16-R1; `ExecuteDetail.tsx:183`, `ExecuteCandleReplay.tsx:354`).
  - The two come from different sources: `market_overview` from the hub core, `candle_overview` from the evidence bundle (`replay.service.ts:224-245` vs `302-340`).
  - Both use the ≤48-bucket schema. The "≤12" figure in the survey is not in the contract.
  - Risk: when the hub side is AVAILABLE and the evidence side is absent, the screen shows an absence even though data exists.
  - **Bobby decides:** drop one field, or add a fallback.
  - Retained-lane `sequence.*`, `route.oms_mode/margin_mode`, and child-audit lifecycle flags: diagnostic.
- **Waiting on backend:**
  - S08-01, `FoldSegment.params_digest`: absent. Per-fold digests already exist on progress `selection.params_digest` and freeze `stage4_binding REPLAY_PARAMS`, so they could be bound from those reads instead.
  - S08-02: the bounded `candle_overview` is bound. The per-bar data is still `P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS` (`ExecuteDetail.tsx:1101,1442`).
  - S08-03, `execution.counts` on P04: absent from `research-replay.d.ts`. The retained lane has it and it is bound.
- **G1:** reads `execution.fold_capital.segments[]`, `page.has_more/next_cursor` and `rows[].source_ordinal`. All exist at HEAD, with no new query or shape. Codex edited `CandleOverviewStrip` at lines 494-546; G1's hunks start at 548, so re-check at merge.

### S09 Report — PARTIAL
- **Reads:** `/report`, exports POST/GET/download. They match. `display_label` (CG-FG-D1-O1) is bound (`reportClient.ts:164`).
- **Served, not read:** `audited_run_id`, `content_type`, `failed_stage_label`, `part_count`: diagnostic (`part_count` matters once bytes are published).
- **Waiting on backend:** CG-FG-S09-02. The `digest` at `report.d.ts:177` is on Artifact v1, not EquityV2. `EquityV2` (`:286-296`) has no digest or path, so the caption stays counts, sampling and UTC only (`ReportDetail.tsx:704-707`).
- **Mismatch:** `download_href` has no workspace (X7).

### S10 Attempt Lineage — PARTIAL
- **Reads:** `/research/alphas/{id}/lineage`. It matches.
- **OL-03 pick:** read through the lineage `promotion_pick`, which is backed by `attempt_promotion_pick_facts_v1` written by the P22 settlement (`lineage.service.ts:645`).
- **Served, not read:** `lineage_revision`, `material_change_threshold`, `storied_when`: diagnostic.
- **Waiting on backend:**
  - S10-01. `selected_trial_id`/`artifact_id` exist only on the **P22 publication** pick (`research-release-candidate-publication.d.ts:188-198`) and are unbound. The lineage pick has neither, and nothing anywhere has `param_set_id`. **`LineageDetail.tsx:1054` still prints the approval `source_digest` in the param-set slot**, which should become a typed absence.
  - S10-02: absent. **The FE still derives `lineageStatus` itself** (`LineageDetail.tsx:200-210`, used at `:2117`), which is rule-5 debt.
  - S10-03, `claim.family`: absent.
  - S10-04: conditional on VD-FG-01-18/-21.

### S11 Release Candidate + P22 publication — PARTIAL
- **Reads:** compose, draft, seal, pack, the publication GET, publish, and the alpha-version publication GET. All match; there is no `/mirror` or `/reconcile` route.
- **Bound from P22 (OL-07/OL-09/OL-13):**
  - `assignee_pool(_availability)`, `decision_outcomes`, `quorum`/`blocker_count`, `effective_status`, `rc_superseded`/`candidate_relation`
  - top-level `downstream_code` plus `conflicting_approval_href`, `reconcile_allowed`, `intent_actor` (`ReleaseCandidateDetail.tsx:1370-1860`)
  - `display_label` top-level on compose and pack (`releaseCandidateClient.ts:202,217`)
- **Served, not read:**
  - **The publication `promotion_pick.{approval_status, artifact_id, fact_digest, selected_trial_id}`** (`publication.d.ts:185-198`). S11 never shows the WRITTEN/PENDING_APPROVAL pick state or the trial id. Material.
  - `claim_candidates`: duplicates `eligible_methodology_claim_ids`, which is read.
  - Governance metadata (`by_user_id`, `captured_at`, `request_key`, `subject_id`, …): diagnostic.
- **Waiting on backend:**
  - S11-02: absent from compose and pack. The only trial id lives on the P22 pick, where it is unbound.
  - S11-03: conditional (VD-FG-01-26). The typed absence reads "not part of the frozen pack" (`ReleaseCandidateDetail.tsx:828,831,1060`). It overlaps CG-P21-05 (`pack_counts`/`certification_axes`).
  - **CG-FG-P22-01 (Codex):** still open. `Problem` has no `details` (`publication.d.ts:209-215`), while the closeout text still says `details.downstream_code`. The FE binds the top-level field.
- **Acceptance:** OL-05 is backend-delivered (`P22/real-preview-receipt.json`, isolated preview). The FE real-API lane for S11/P22 is still deferred (`S11-REAL-API`, `S11-P22-REAL-E2E`), and FG-05 has fixture-lane evidence only.
- **Stale ledgers:**
  - `P22/thanhvuong-backend-requests.md:158-166` shows CG-P22-01…06/A/B/C as OPEN. In fact CG-P22-01/02/03/04/06 are superseded by OL-06/04/07/08, and CG-P22-B = CG-FG-P22-01.
  - `P21/…:160-164` shows CG-P21-01…05 as OPEN, now Claude-owned.

### S12 Engine Atlas — PARTIAL (FE-side)
- **Reads:** `GET /research/quantbt/atlas` (`release_id`, `route`, `mode`). It matches.
- **CG-FG-S12-01 is already served by the backend.**
  - The HISTORICAL union (`atlas:null` + `historical_identity{…facts_state,facts_reason}`, `foundation.d.ts:410-447`) has existed since `5069b39a` (2026-09-23), along with the contract fixture `research-foundation.historical-identity.valid.json`.
  - **The FE does not read `historical_identity`, `facts_state` or `facts_reason`.** `foundationRoutes.tsx:227` takes `read.data?.atlas`, the historical note is hard-coded copy (`EngineAtlas.tsx:1401-1407`), and with `atlas:null` the body renders empty.
  - The e2e fixture `e2e/research-foundation/atlas-historical.json` breaks the union: it has a full `atlas` and no `historical_identity`.
- **Served, not read:** `walk_forward_status` (`foundation.d.ts:491`), which may be a HiFi route column; `source_release_id` is diagnostic.
- **Waiting on backend:** S12-02. `CandidateSelector` exists in no contract; the name appears only in FE comments.

### S13 Compare — PARTIAL (close to WIRED)
- **Reads:** `/research/alphas/{id}/compare`. It matches. `display_label` is bound (`compareClient.ts:264-268`) and has a scoped real receipt.
- **Served, not read:** `provenance.current_source_revision`: diagnostic.
- **Waiting on backend:** S13-02. `RunCertification` is a constant `NOT_PUBLISHED`/`grade:null` (`compare.d.ts:105-112`, `compare.service.ts:123`). The FE shows `P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE` (`CompareDetail.tsx:603-609`).
- **G4 conflict:** G4 conflicts with Codex FG-04a (5 hunks, grid vs flex); Bobby picks one. G4 is not CSS-only: 9 files, +448/−69, including a11y heading changes.

### S14 Alpha Import — PARTIAL
- **Reads:** `GET /research/alphas`, the import parse/gates/register POSTs, and activate. They match.
  - Status codes: gates and activate are 200 and parse and register are 201 (`alpha-import.controller.ts:61-122`, `4e343fe9`), and these equal OAS.
  - S14-RW-BR-03 (201 on gates/activate) was taken on an older preview image. **It is fixed in code; re-verify on a rebuilt preview.**
- **Served, not read:**
  - **`import_attestation`** (E6-BR-01: `signature`/`sbom` NOT_PUBLISHED with `RESEARCH_ALPHA_IMPORT_{SIGNATURE,SBOM}_NOT_PRODUCED`, `alpha-import.d.ts:175-196`). The FE uses a hard-coded `REGISTRATION_ABSENT.signature` with a generic code (`AlphaImport.tsx:129-133,1371`). Bind the server codes.
  - `quarantine_code` and `supersedes_state`: minor.
  - The `ResearchAlphaAnalysis` fields (`*_message`, `gate_facts`, …) are the private analyser schema, not a gap.
- **Waiting on backend:**
  - S14-01: CSRF drift (X2).
  - S14-02, `may_activate_reason`: absent. The FE states the ADMIN reason itself (`AlphaImport.tsx:714-715`).
  - S14-03, per-version `may_create_run`: absent. `RUN_NOT_ADMITTED` at `:117-122,1235-1252`. Its copy "Not admitted yet (OL-01)" is stale, because OL-01 is an accepted isolated backend (production rollout is Bobby/ops).
  - S14-04, `total`/cursor: absent. Separately, the FE filters on the client (`:815`) even though the server supports `alpha_id` (`useAlphaImport.ts:99`).
  - S14-RW-BR-01: still reads as open in code. The replay path binds `supersedes = active_version_id` (itself) before `ON CONFLICT` (`alpha-import.repository.ts` ~1074-1093), which gives a 500. Claude-owned.
  - S14-RW-BR-02: not verified.
  - **The S14-RW-BR-* ids exist only on Claude's unpushed line.**

### P23 lane surfaces — PARTIAL
- **Runner:** the P23 runner (`e2e/research-qualification/*`, `stubs.ts:579` journey-v3) is aligned with the current contracts, and scoped real-browser receipts exist:
  - F3 WFO 12/12 at S03–S08
  - F3 30/30 deep links plus the S11→R1 bridge 2/2
  - F5 S02/S14 write, refusal 8/8 and revocation 4/4
  - T15
  - D1-O1 5 deep links
- **Open:** canonical F3 54/54, F5 typed 502, the full OL-24 lane, T07/T13 (second engine), and T14 non-reusable audit child.
- **FE blockers for these lanes:**
  - X3 (the journey-v2 ENOENT is the cause of the 64 OL-24 failures)
  - the S12 historical e2e fixture
  - `engine_pin`-required typed fixtures
- **Ledger:** `P23/thanhvuong-backend-requests.md:169-175` (CG-P23-01…05, CG-P22-C) is contributor-era and largely overtaken by Codex's P23 cell work. It needs a triage pass by Codex, who owns P23.

## 2. Verdict table

| Screen | Verdict | Material served-not-read | Waiting on backend (open) | Path/shape mismatch |
|---|---|---|---|---|
| S00 | WIRED* | — | — | e2e v2 fixture (X3) |
| S01 | WIRED | `rc_availability`, `relationship` | — | — |
| S02 | PARTIAL | `reproduction`/`REPRODUCTION_OF` | S02-01, S02-02 (=BR-D4-1), BR-D4-2/3 | CSRF (X2) |
| S03 | WIRED | `best_objective`, cancel `status` | S03-01 list, S03-02, S03-04 manifest | `console`/`events` without workspace |
| S04 | PARTIAL | `net_oos_return` | S04-01 hub, S04-02, S04-05 benchmark/beta, S04-06, S04-07 | — |
| S05 | PARTIAL | — | S05-01 (+ FE ✓ bug 05-15) | — |
| S06 | PARTIAL | `imported_alpha` | S06-01, 02 (P04), 03, 04, 05, 06; E5-O1/O2 (engine) | `fold` never sent |
| S07 | WIRED | `imported_alpha` | — | — |
| S08 | PARTIAL | `market_overview` (vs `candle_overview`) | S08-01, S08-02 per-bar, S08-03 | — |
| S09 | PARTIAL | — | S09-02 | `download_href` without workspace |
| S10 | PARTIAL | P22 pick `selected_trial_id` | S10-01 (param_set), 02, 03, 04c | FE-derived status (rule 5) |
| S11 | PARTIAL | P22 pick state + `selected_trial_id` | S11-02, S11-03c, CG-FG-P22-01 (Codex), CG-P21-05 | — |
| S12 | PARTIAL | `historical_identity`/`facts_reason` (S12-01 served) | S12-02 | e2e historical fixture breaks the union |
| S13 | PARTIAL | — | S13-02 | — |
| S14 | PARTIAL | `import_attestation` | S14-01 (contract), 02, 03, 04; S14-RW-BR-01/02 | CSRF (X2) |
| P22 | PARTIAL | pick state | CG-FG-P22-01; FE real-API lane | — |
| P23 | PARTIAL | — | canonical F3 54/54, F5 502, OL-24, T07/T13 | X3 blocks the fixture lane |

## 3. The 37 CG-FG-S02…S14 packets

**Triage state:** none of the 37 has a Codex comment or addendum in `FG-backend-requests.md` or Unified L3699-3710. **All still say OPEN, owner Codex.** Only CG-FG-D1-O1 (delivered and bound) and CG-FG-R2-01 (delivered `0b868c6f`) were closed by addenda. Under the 2026-09-24 rule all 37 are ≤P21 and therefore Claude-owned (X6). The column below is this audit's classification against contracts at `c2ec1443`.

| Packet | Status now | Note |
|---|---|---|
| S02-01 cert ceiling | OPEN | `cert_cap` is always NotPublished. The FE should at least read `cert_cap.reason` (it is hard-coded now). |
| S02-02 bars per window | OPEN | = BR-D4-1 |
| S03-01 planned folds + total | PARTIAL, bound | the total is served as `declared_folds`; the list is still absent |
| S03-02 4 methodology claims | OPEN | a single claim is bound |
| S03-03 study N of M | **DELIVERED, bound → close** | `declared_folds.count`, `trials_declared` |
| S03-04 artifact manifest | PARTIAL, bound | retained and denied artifacts are served; no fixed 7-row manifest |
| S04-01 7-field claim strip | PARTIAL | retained lane bound; hub open, rendered with `reason_code:null` |
| S04-02 dataset coverage | OPEN | |
| S04-03 EQUITY_IS | **SUPERSEDED by E11 → close** | `in_sample_equity` bound; WFO IS is a source absence |
| S04-04 per-fold metrics | PARTIAL, bound | P04 is a source limit |
| S04-05 benchmark/rolling/dist/behaviour | PARTIAL, bound | benchmark and ROLLING_BETA_63 still absent |
| S04-06 cert cap per stage | OPEN | |
| S04-07 window-disclosure counts | OPEN | |
| S05-01 train_test_disjoint | OPEN | the FE ✓ bug 05-15 must be fixed regardless |
| S06-01 selector_confidence | OPEN | |
| S06-02 Parameter.levels | PARTIAL | retained lane bound; P04 DTO absent |
| S06-03 surface.grid | OPEN | not the what-if grid |
| S06-04 surface.interactions | OPEN | pinned NOT_PUBLISHED |
| S06-05 pool.frozen_at_utc_ms | OPEN | |
| S06-06 Trial.seed/params_digest | OPEN | not ChildAuditRecord.seed |
| S08-01 FoldSegment.params_digest | OPEN | could be bound from progress/freeze digests instead |
| S08-02 candle_windows P04 | PARTIAL, bound | overview bound; per-bar absent |
| S08-03 execution.counts P04 | OPEN | retained lane bound |
| S09-02 EquityV2.digest + path | OPEN | the `report.d.ts:177` digest is Artifact v1 |
| S10-01 pick param_set/trial | PARTIAL, unbound | `selected_trial_id` is on the P22 pick only; LD:1054 shows the wrong digest |
| S10-02 lineage_status | OPEN | the FE derives it (rule-5 debt) |
| S10-03 claim.family | OPEN | |
| S10-04 (conditional) | OPEN, waiting on VD-FG-01-18/-21 | |
| S11-02 param_set/trial_number | OPEN | the P22 pick `selected_trial_id` is unbound |
| S11-03 (conditional) | OPEN, waiting on VD-FG-01-26 | overlaps CG-P21-05 |
| S12-01 HISTORICAL fixture | **DELIVERED (09-23) → close BE** | FE work: bind `historical_identity`/`facts_reason` and fix the e2e fixture |
| S12-02 selector mode vocabulary | OPEN | |
| S13-02 compare cert grade | OPEN | constant null |
| S14-01 CSRF header name | OPEN | contract-only drift in 4 files; runtime OK |
| S14-02 may_activate_reason | OPEN | |
| S14-03 may_create_run | OPEN | FE copy about OL-01 is stale |
| S14-04 registry total/cursor | OPEN | the FE also ignores the server `alpha_id` filter |

**Tally:**
- Delivered or superseded: **3** (S03-03, S04-03, S12-01).
- Partially delivered: **8** (S03-01, S03-04, S04-01, S04-04, S04-05, S06-02, S08-02, S10-01).
- Open: **26**, of which 2 are conditional on owner decisions.
- Of the 26 open, several can move on the FE alone, without backend work:
  - S02-01: read `cert_cap.reason`.
  - S05-01: turn the ✓ into a typed absence.
  - S10-01: typed absence instead of the digest.
  - S14-03: copy.
  - S08-01: bind the alternative digests.

## 4. Corrections to the prior survey

- Codex HEAD is `c2ec1443` (+3 docs/test commits since `2bfeb53e`). No contract change.
- "OL-13 waiting on Codex" (FE gaps doc §4c, Unified L3957): it is **delivered and bound** on S01 and S02.
- `market_overview` is not "≤12 buckets". It shares the ≤48 schema; the real difference is the **source**: hub core vs evidence bundle.
- S14-RW-BR-03 is fixed in code (`4e343fe9`); the receipt came from an older preview image.
- CSRF drift covers 4 OpenAPI files, not only alpha-import.
- G4 is not CSS-only (9 files, including FreezeDetail and SplitDetail heading changes).
- New in this audit: X4 (`imported_alpha`), X7 (workspace leaks), S04 `net_oos_return`, S12-01 already served, S02 `?? 0`, S05 ✓ still live, S10 wrong digest in the param slot, and S11 P22 pick unread.
