# Research Loop V1.1: backend work not yet done, P01–P24 (read-only audit, 2026-09-30)

**Source:** `/home/bobby/portal-research` HEAD **`c2ec1443`**. This is newer than the brief's `2bfeb53e`: it is 126 commits ahead of `d3d99f26`, not 123. The three extra commits are `a9e8e826`, `38f3ab5e` and `c2ec1443`, all F5 browser refusal/revocation receipts, all scoped.

**Other sources:**
- Claude's line: `/home/bobby/portal-research-w1-build` @ `d7db1cb3` plus uncommitted files.
- The G2 agent worktree @ `ed33db0d`, which is not merged into Codex HEAD.

**Abbreviations:**
- `U:` = `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` at Codex HEAD.
- `EV/` = `upgrade/research_loop/evidence/`.

**Nothing was built, tested, edited or stashed.** Status comes only from the ledger, receipts and a read of source code.

Status key:
- **DONE**
- **DONE-scoped**: the scope is stated in the row
- **IN PROGRESS**
- **NOT STARTED**
- **BLOCKED-on-X**
- **EXTERNAL**: engine or ops work

---

## P01–P06 (foundation)

| Phase | Backend item | Status | Owner | Evidence |
|---|---|---|---|---|
| P01 | Inventory / matrices | DONE | Codex+Claude | U:3608 |
| P02 | `requested_spec` contract amendment | DONE | Codex | U:3609 |
| P03 | Schema/role/repository, T01–T11 | DONE | Codex | U:3610 |
| P04 | QuantBT 1.1.1 provenance, Atlas, admission | DONE | Codex | U:3611; RF-02 locator facts U:3615 |
| P04 | T07/T13 P04 installed-release pin (admission accepted `er_quantbt_112` against a 1.1.1 binding) | DONE-scoped: source fixed, typed 409, 45/45 focused tests. The runtime upgrade/rollback receipt is P23-T07/T13 | Codex (Bobby-approved ≤P21 edit) | `2bfeb53e`; EV/P23/T07_T13_P04_RELEASE_PIN_GAP_2026-09-30.md |
| P04/P09 | CG-FG-S12-01 HISTORICAL atlas fixture; CG-FG-S12-02 `CandidateSelector.mode` vocabulary | NOT STARTED | Disputed: the packet says Codex, the ≤P21 split says Claude (see M6) | U:3708; EV/FG/FG-backend-requests.md:675-709 |
| P04/P09 | CG-FG-S02-01 cert ceiling by mode × schedule on atlas/foundation read | NOT STARTED | Disputed (M6) | U:3699; FG:117-133 |
| P05 | Parquet custody, Rust reader, recovery | DONE | Codex | U:3612 |
| P06 | Lease/outbox/retry/cancel/recovery | DONE | Codex | U:3619 |
| P06/P11/P12 | E10: run-lifecycle SQL (mig 066), reconcile, RETRY_WAIT expiry, owner cancel | DONE | Claude | U:3781; EV/P11/E10_RUN_STATE_CLAUDE_2026-09-26.md |
| P06/P11 | E10-O1: real convergence receipt (fault injection) | DONE-scoped: F4 on owned cell 8096. Deliberately stranded terminal → read-recovered once; overdue retry → FAILED `P06_RETRY_NOT_DISPATCHED`; neighbour lease untouched | Codex | EV/P23/RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md:53-75; U:3843 (F4) |
| P11 | E10-O3: bounded cross-workspace sweep | DONE-scoped: code plus PG 20/20; mig 069 renumbered to **076** on HEAD. No dedicated runtime cross-workspace receipt | Claude | EV/P11/E10O3_CONVERGENCE_REACH_CLAUDE_2026-09-27.md:203,210; U:3819 |
| P11 | E10-O2 (redispatch vs expire) and E10-O3a (cadence above ~30 workspaces) | BLOCKED-on-Bobby | Bobby | E10O3:202-204; U:3846 (F7) |
| P06/P10 | CG-P23-T02-01: supervisor scratch growth | DONE: T02 PASS on `af18707a`, source `51323644` | Codex (Bobby-approved, formerly Claude) | U:3659; EV/P23/T02_T12_SOURCE_CLOSEOUT_2026-09-30.md |

## P07–P10 (import, preflight, journey, new run)

| Phase | Backend item | Status | Owner | Evidence |
|---|---|---|---|---|
| P07 | AST/7 gates/registry/activation | DONE | Codex | U:3620 |
| P07 | **S14-RW-BR-01**: register replay of an ACTIVE version → 500. The INSERT binds `supersedes = active_version_id` (itself) and hits `CHECK … IS DISTINCT FROM alpha_version_id` before ON CONFLICT | **NOT STARTED**: the logic is unchanged at HEAD | Claude (≤P21) | w1-build EV/P10/S14_REAL_WRITE_RECEIPT_CLAUDE_2026-09-30.md:140; HEAD `apps/control-api/src/research/repository.ts:1074-1093`; `migrations/1723680000057…sql:9` |
| P07 | **S14-RW-BR-02**: analyser marks FAIL on fields that passed, not on the failing `warmup_bars` | NOT STARTED (analyser unchanged since `d3d99f26`) | Claude | S14 receipt:141; `apps/portal/backend/src/portal_api/services/research_alpha_analyzer.py` |
| P07 | **S14-RW-BR-03**: `gates`/`activate` return 201 while OpenAPI says 200 | **DONE on Codex line** (`4e343fe9`, 09-27, `@HttpCode(200)`). The 201 was observed on the `d3d99f26` preview, which predates it | Codex | HEAD `alpha-import.controller.ts:80,122` |
| P07 | CG-FG-S14-01…04: CSRF header name, `may_activate_reason`, per-version `may_create_run`, registry `total`/cursor | NOT STARTED | Disputed (M6) | U:3710; FG:725-808 |
| P07/P22 | E6-BR-01: signature/SBOM | DONE-scoped: typed `import_attestation` NOT_PUBLISHED. No signing infrastructure exists (P24 "signed-release rehearsal") | Codex | EV/P23/phase-report.md:100-101 |
| P08 | HMD reader, preflight contract | DONE | Codex | U:3622 |
| P08/P10 | **BR-D4-1**: publish exact bar edges / earliest first window per (dataset, symbol, timeframe[, av]). Overlaps CG-FG-S02-02 | NOT STARTED. G2 branch `ed33db0d` is not merged | Claude (≤P21) | agent worktree EV/P10/G2_D4_S02_PREFILL_CLAUDE_2026-09-30.md:160-164 |
| P08/P10 | BR-D4-2: rule for prefilling interior windows | BLOCKED-on-Bobby (methodology decision) | Bobby → Claude | G2_D4:166-168 |
| P08/P10 | **BR-D4-3**: publish locked-profile admission facts (92-day span, folds 2–16, fixed tf) | NOT STARTED | Claude | G2_D4:170-172 |
| P09 | Journey/Atlas reads; E12 descriptor v3 | DONE | Codex/Claude | U:3623; U:3783 (E12) |
| P10 | Run-create; CG-P10-01 `config_digest` (`996eef6c`) | DONE | Codex/Claude | U:3623, U:3615 |
| P10 | OL-01/E17: imported DRAFT execution | DONE-scoped: isolated cell, three real DRAFT runs, AppArmor enforce | Codex | U:3679; EV/P10/E17_…RECEIPT_2026-09-27.md |
| P10 | OL-01 Production activation | EXTERNAL | Bobby/ops | U:3849 (F10) |
| P10 | S14-RW-OPS-01: preview `PORTAL_PUBLIC_ORIGIN` blocks the localhost:8095 write path | EXTERNAL | Bobby/ops | S14 receipt:144 |

## P11–P16 (progress, library, evidence, split, search, freeze)

| Phase | Backend item | Status | Owner | Evidence |
|---|---|---|---|---|
| P11 | Journal/SSE/cancel; W2 CG-P11-*; E15 input artifacts | DONE | Codex/Claude | U:3624; U:3786 |
| P11 | CG-FG-S03-01…04: fold plan + total, 4 methodology claims, study N of M, per-run artifact manifest | NOT STARTED | Disputed (M6) | U:3700; FG:155-225 |
| P12 | Library, feature-dark | DONE | Codex | U:3625 |
| P12/P13 | CG-P23-T08-01: warm Library p95 regression | DONE-scoped (current candidate, W06 ×2 at 500 ms) | Codex (approved) | U:3697 |
| P13 | Hub/series (Astra remediated); E11 retained analytics | DONE / DONE-scoped (isolated real API) | Claude/Codex | U:3626; U:3782 |
| P13 | CG-FG-S04-01…07: claim strip, dataset coverage, `EQUITY_IS`, per-fold metrics, benchmark/rolling, cert cap per stage, window counts | NOT STARTED | Disputed (M6) | U:3701; FG:229-353 |
| P14 | Split (A03 remediated); E14 | DONE / DONE-scoped | Claude/Codex | U:3627; U:3785 |
| P14 | CG-FG-S05-01: `SplitGuards.train_test_disjoint` | NOT STARTED | Disputed (M6) | U:3702 |
| P15 | Search; X2 B3 declared ranges + trial surface; E5 pool / `max_drawdown` | DONE | Claude | EV/P16/X2_P15_P18_GAPS_CLAUDE_2026-09-26.md:25-26; U:3773 |
| P15 | **E5-O1** (per-candidate OOS max drawdown) and **E5-O2** (K and realised pool for modes 3/4/5) | EXTERNAL: QuantBT engine, not computable by Portal | engine | EV/P15/E5_S06_STAGE_B_CLAUDE_2026-09-26.md:140-141; U:3847 |
| P15 | CG-FG-S06-01…06: `selector_confidence`, P04 `levels`, `surface.grid`, `interactions`, `pool.frozen_at`, `Trial.seed`/`params_digest` | NOT STARTED; S06-04 is probably engine-limited (`QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS`) | Disputed (M6) / engine | U:3703; X2:26 |
| P16 | Freeze verify; W5a A10; X2 B4 CG-P16-02/03 | DONE | Claude | X2:27-29 |
| P16 | OL-02: byte verify MATCH/MISMATCH | DONE-scoped (owned runtime cell) | Codex | U:3680 |

## P17–P21 (replay, report, lineage, compare, composer)

| Phase | Backend item | Status | Owner | Evidence |
|---|---|---|---|---|
| P17 | Replay W5b; X2 B6 fixtures; E16 / E16-R1 / E16-R2 | DONE / DONE-scoped (isolated) | Claude/Codex | U:3629; U:3787; U:3853 (F14) |
| P17 | CG-FG-S08-01 `FoldSegment.params_digest`; S08-02 P04 per-bar `candle_windows`; S08-03 P04 `execution.counts` | NOT STARTED. For S08-02, E16-R1 chose bounded overview without a per-bar chart, so it needs an owner decision | Disputed (M6) / Bobby for S08-02 | U:3704; U:3818 |
| P18 | Report v2; X2 B5 failed-run report, T10 final_audit | DONE | Claude | X2:30-31 |
| P18 | PARQUET/ARCHIVE export | DONE-scoped (decided typed absence, X2-D09) | Claude | X2:32 |
| P18 | CG-FG-S09-02: `EquityV2.digest` + artifact path | NOT STARTED | Disputed (M6) | U:3705 |
| P18/P21/P20 | CG-FG-D1-O1: `display_label` on Report/RC/Compare | DONE (backend `08fa8ee0` + FE `8ad39e83`). Only the F3 visual lane is open | Codex | FG:61-69; U:3711 |
| P19 | Lineage W6b; D1 labels; E13 reproduction | DONE / DONE-scoped | Claude/Codex | U:3632; U:3784 |
| P19 | CG-FG-S10-01…03: pick `param_set_id`, `lineage_status` + `superseded_by`, `claim.family`. S10-02 means the FE currently infers status (a rule-5 violation) | NOT STARTED | Disputed (M6) | U:3706; FG:563-615 |
| P19 | CG-FG-S10-04 `default_market`/`counts.promotion_*`; E13-O3 `CLONE_OF` migration | BLOCKED-on-Bobby (VD-FG-01-18/-21; §13.4.1 G(a)) | Bobby | FG:617-633; U:3961 |
| P20 | Compare; E7 markets grouping | DONE | Claude | U:3633; U:3776 |
| P20 | CG-FG-S13-02: `certification.grade` (currently constant null) | NOT STARTED | Disputed (M6) | U:3709 |
| P21 | Composer/seal W7 | DONE | Claude | U:3634 |
| P21 | CG-P21-01: canonical compose/pack/Problem fixtures | DONE-scoped: two compose fixtures exist; no pack or Problem fixture | Claude | `packages/contracts/fixtures/research-release-candidate.wfo-retained*.valid.json`; EV/P21/thanhvuong-backend-requests.md:160 |
| P21 | CG-P21-02: `pack[].source.href` vs FE routes | DONE in code (`/execute`, `/research/quantbt/alphas/…/compare`, `/research/quantbt/atlas`, alpha-360 null) but the ledger still says OPEN | Claude | `release-candidate.service.ts:461-506` |
| P21 | **CG-P21-03**: ETag sent but not declared in OpenAPI | NOT STARTED | Claude | `release-candidate.controller.ts:54,109`; OpenAPI has 0 `etag` |
| P21 | CG-P21-04: is `Problem.error.message` for the UI? | DONE-scoped on the FE side (FG-08: the FE never prints server prose). The contract statement is still open | Claude | EV/FG/FG-slice2-receipt.md; U:3905 |
| P21 | CG-P21-05: `pack_counts`/`certification_axes` | DONE on ComposeResponse; **PackResponse** still lacks them (the same field as CG-FG-S11-03) → BLOCKED-on-Bobby (VD-FG-01-26) | Claude | OpenAPI `ComposeResponseP21` vs `PackResponse` |
| P21 | CG-FG-S11-02: `selected_params.param_set_id` + `selected_trial_number` | NOT STARTED | Disputed (M6) | U:3707 |
| P16/P18/P21 | **CG-P23-T12-01**: explicit pinned `AUDIT_OF_SELECTION` child admission for non-reusable selections | **NOT STARTED**: a typed source gap. Only the reuse profile is PASS | Claude ≤P21 source; Codex runtime retake | U:3694; T02_T12 closeout: "linked-child case remains a typed source gap" |
| P16/P18 | CG-P23-T12-02: shared utility admission | DONE (mig 077, `af18707a`) | Codex (Bobby-approved) | U:3659; T02_T12 |
| P05/P06 | CG-P23-T03-01: typed disk-full | DONE-scoped (T03 clean-commit PASS on `761bc243`) | Codex (approved) | EV/P23/T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md |
| P12–P18 | CG-P23-T05-01: cache/ETag | DONE-scoped (`T05_RESEARCH_SCOPE_PASS`) | Codex (approved) | EV/P23/phase-report.md "T05 owner decision" |

## P22 (publication)

| Backend item | Status | Owner | Evidence |
|---|---|---|---|
| Publication saga, R1 mirror, settlement/promotion fact; OL-03…11 and OL-13 | DONE-scoped (isolated real preview; no dev/Prod) | Codex | EV/P22/README.md:3,46-60; U:3681-3690 |
| Product browser acceptance of S01/S02/S10/S11 | Belongs to F3/F5 (P23), IN PROGRESS | Claude FE + Codex cell | U:3635 |
| **CG-FG-P22-01**: `details.downstream_code` is documented in `Problem.details` (CO:39) but generated only at top level (GEN:176) | NOT STARTED | Codex | U:3698; `research-release-candidate-publication.d.ts:176` |

## P23 (qualification): IN PROGRESS (Codex)

| Item | Status | Evidence |
|---|---|---|
| T01 / W06 mixed load | DONE-scoped (`88be2acd`, two passes at 500 ms) | EV/P23/README.md:50-60 |
| T02 plateau | DONE-scoped (`af18707a`) | README:9 |
| T03 disk-full | DONE-scoped (`761bc243`) | README:78-81 |
| T04 PG/NATS/worker fault | DONE-scoped (`19a8e813`) | README:187-193 |
| T05 tenant/cache | DONE-scoped (Research scope). **Legacy `/api/runs/:id/export` (mutating GET, not workspace-scoped) is a separate security slice, NOT STARTED, with no owner named** | README:92-104 |
| T06 corrupt/restore | DONE-scoped | phase-report:92 |
| T07 / T13 engine upgrade, default, rollback, in-flight pin | **BLOCKED-on a second pinned QuantBT engine** (only 1.1.1 is installed). Source pin fix is done | T07_T13:59-65 |
| T08 cold cache | DONE-scoped | README:39-48 |
| T09 Execution isolation | DONE-scoped (same host; no AWS-HK) | README:34 |
| T10 full (browser/engine/resource on one candidate) | IN PROGRESS: Python suite green; full T10 is open | README:106-109 |
| T11 far-seek | DONE (backend/API) | README:195-202 |
| T12 utility/audit | DONE-scoped (eligible reuse profile). Linked child is open → CG-P23-T12-01 | README:9 |
| **T14 exposure / AUDIT_OF_SELECTION child restore** | IN PROGRESS / BLOCKED-on source facts (no real exposure fact or audit child exists) | phase-report:96 |
| T15 browser-real, cold, overlapping | DONE-scoped (`b4e5d09b`) | README:15 |
| F3 canonical 54/54 real-API lane | NOT STARTED as a whole. Subsets: 30/30 routes, S03–S08 12/12, S11→R1 2/2 | U:3842; README:11,17 |
| F5 real 502 | **NOT STARTED**. No authentic 502 source exists; it needs a source-honest disposition | F5_NEGATIVE_API_MATRIX:21; README:3 |
| F5 remainder: browser refusal 8/8, revocation 4/4, S02/S14 writes | DONE-scoped | README:3-5,24-26 |
| V11-P23-DR full (direct WFO recomputation) | IN PROGRESS: P04 direct parity and WFO retained parity are the scoped subsets | README:13,32 |
| V11-P23-BR (real browser) / GX | IN PROGRESS (BR is fixture-only PASS) | U:6391-6392 |
| OL-24 research-dev host receipt | BLOCKED-on Bobby/ops (no research-dev host) | U:3756 (OL-24) |

## P24: NOT STARTED

| Item | Status | Owner | Evidence |
|---|---|---|---|
| Full product acceptance / release rehearsal: BE real journey, FND/COR/DR closure, migration + auth preservation, signed-release rehearsal, P24-T01…T15, V11-P24 | NOT STARTED; BLOCKED-on P23 and FE acceptance. No `EV/P24/` directory exists | Codex by the role split (U:3667), but the board row says "PLANNED / unassigned" | U:3637, U:6430-6444 |

---

## Things both agents currently mis-state

- **M1 (Claude, `U:3946-3957` §13.4.1 G, which Codex merged unedited in `57f9e02e`):**
  - G3 says three reads lack `display_label`. They are delivered (`08fa8ee0` / `8ad39e83`).
  - G11 says OL-02 "needs G10". OL-02 was closed on 2026-09-27.
  - G10 says E10-O1/O3, E13, E14, E16-R1 and the S02/S14 writes "need a writable stack". Codex's cell 8096 already produced F4/E10, the E11–E17 30/30 run and the S02/S14 real writes.
  - (c) "Waiting on Codex" lists OL-13, OL-07, OL-09, OL-03, OL-05 and E16-R2. All of them are closed on the backend.
- **M2 (Claude survey, untracked `w1-build EV/P21/CODEX_BACKEND_AND_COMPAT_SURVEY_CLAUDE_2026-09-30.md` §1):**
  - It says CG-FG-R2-01 is "No. All OPEN". It was delivered in `0b868c6f` (FG:830).
  - It lists S14-RW-BR-03 as open Claude debt. It was already fixed on the Codex line (`4e343fe9`).
  - Its ≤P21 debt list leaves out **CG-P23-T12-01** (U:3694 assigns the source work to Claude) and BR-D4-1/3.
- **M3 (Claude, S14 receipt §1):** it says running an imported version is "still blocked by OL-01". OL-01/E17 was accepted on an isolated cell on 09-27. What blocks it is the `d3d99f26` preview build and default-off flags.
- **M4 (Codex, stale rows in the plan):**
  - The board P23 row (U:3636) still lists T02, T12 and T15 as OPEN. The 09-30 receipts supersede that.
  - Ledger rows U:3692 (T02-01) and U:3695 (T12-02) say OPEN; only the U:3659 note supersedes them.
  - U:3693 (T05-01 "full T05 OPEN") and U:3696 (T03-01 "T03 PARTIAL") have no supersession note, even though T05_RESEARCH_SCOPE_PASS and T03 clean-commit acceptance exist.
  - U:3712 still shows CG-FG-R2-01 as OPEN.
  - `EV/P22/thanhvuong-backend-requests.md:158-166` and `EV/P23/thanhvuong-backend-requests.md:169-174` still say OPEN although those items are answered.
- **M5 (Codex, FG:830):** "39 other packets remain open" counts D1-O1, whose backend is delivered. The backend packets actually open number 38: 37 screen packets (2 of them Bobby-gated) plus CG-FG-P22-01.
- **M6 (both agents, ownership):**
  - FG:3 names Codex as owner of every CG-FG-S02…S14 packet. They all change ≤P21 services, which the §13.4.1 split (U:3667) gives to Claude.
  - Codex's correction leaves them out entirely. Claude's survey records them as unanswered Codex items.
  - Result: 37 packets have no working owner. Bobby needs to assign them.
- **M7 (Codex correction):** it says "P24 assigned to Codex", but the board row U:3637 still reads "PLANNED / unassigned / —". Only the role-split paragraph backs the claim.
- **M8 (Claude debt list, CG-P21-*):** CG-P21-02 is effectively fixed in code, and CG-P21-05 is half done (compose only). The ledger still shows all five as OPEN, owner "Codex". Ownership moved to Claude on 2026-09-24.
- **M9 (brief):** the brief's "E10-O1/O3 convergence (needs fault injection)" is already covered by Codex's F4 fault-injection proof. Only E10-O3 lacks a runtime cross-workspace receipt; its bounded sweep code has passed PG tests.
