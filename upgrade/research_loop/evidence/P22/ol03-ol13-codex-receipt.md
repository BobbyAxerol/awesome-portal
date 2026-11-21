# OL-03 → OL-13 — P22 backend delivery and real-preview receipt

**Branch:** `codex/research-ol-p22-p24` (isolated worktree)  
**Integrated source head:** `88bdb9f5` (Codex P22 + Claude `9f0a9066`)  
**Scope:** P22 backend/contracts/runtime evidence only; no Research screen or P01–P21 service was edited.  
**Runtime lane:** isolated Compose project `portal-research-p22-publication`; shared preview `:8095`, dev, Production, Execution and Trading System were not called.

## Delivered scope

| OL | Result | Evidence |
|---|---|---|
| OL-03 | R1 transitions after initial delivery are reconciled by a server-owned trigger/function keyed by exact `approval_version`. The immutable original receipt is not rewritten; append-only settlements expose the latest approval and write the P19 promotion fact exactly once. | migrations 070–072; one `PENDING@1` settlement and one `APPROVED@2` settlement; one promotion fact after repeated reread |
| OL-04 | Exact sealed final-audit `rrun_` is materialised into the unchanged Governance read model through a narrow security-definer boundary. | migrations 070, 072, 073; one immutable bridge receipt |
| OL-05 | A namespaced P22-only stack ran one real historical-data WFO through local seal, publication, existing R1 and owner decision. | [`real-preview-receipt.json`](./real-preview-receipt.json) |
| OL-06 | Methodology claim is taken from the sealed P21 pack/run binding, not browser input or a mutable lookup. | source response claim `claim:sha256:cab7…922a`; P22 bridge/service tests |
| OL-07 | Governance mirror maps canonical `data.decisions`, raw/effective status, quorum, approval version, blockers, conditions and `created_at`; RC relation is server-derived. Missing assignee authority remains typed `NOT_PUBLISHED`. | generated `ResearchReleaseCandidateApprovalMirror`; owner/API and DB receipt |
| OL-08 | Canonical Governance create/detail fixtures cover success and typed failure/replay paths. | contract fixtures and focused tests |
| OL-09 | `conflicting_approval_href` and `details.downstream_code` remain server-owned typed fields. | OpenAPI/generated declaration + focused controller/service tests |
| OL-10 | R2 inventory covers the canonical P22 operations; generated route/contract gates pass. | `r2Ledger.test.ts`, contract snapshot and route inventory |
| OL-11 | Canonical RC publication surface stays exactly `GET …/publication` and `POST …/publish`; reconciliation is server-side. No `/mirror` or `/publish/reconcile` route exists. | OpenAPI, capability inventory and historical-handoff amendment |
| OL-13 | Named same-origin lookup by `alpha_version_id` returns the current RC/publication/approval relation or typed absence, so S01/S02 never scan RCs. | `researchAlphaVersionPublicationGetV1`; lookup `AVAILABLE` for the real RC |

## Real transition proof

- Run: `rrun_540c6543addbbd0625d3bd891770a8d9`, `COMPLETED`, alpha version `av_delta_rsi_polynomial_alpha_1_0_0`.
- P21 pack: `rc_06GDX4PYVK83R5FDPJQ8EVK7F7`, 8 complete / 2 degraded / 2 input / 0 missing, `may_seal=true`.
- Publication: `DELIVERED`, one attempt, approval `apr_06GDX9X6AZ9X1BV3MS3FVT5FC3`.
- Independent owner action used the existing Governance plan/apply API: `PENDING@1 → APPROVED@2`, quorum 1/1, blockers 0, decisions 1.
- Publisher reread returns promotion pick `WRITTEN`, approval version 2 and artifact `rart_61598d03c9be8ceb83d3d22484d5a391e2a43502`.
- Database cardinality after replay: publication 1, bridge 1, promotion receipt 1, P19 promotion fact 1, settlement 2 (the two authority versions), decision 1.
- The real path produced neither `RUN_NOT_MIRRORED` nor `P22_GOVERNANCE_SOURCE_UNAVAILABLE`; a repeated read created no duplicate fact or publication.

Full repository verification also passed: 158 Control API files/1,218 tests (one intentionally skipped DR test), 16 contract files/191 tests, PostgreSQL restore, protected-kernel, route-inventory and tracking reconciliation gates.

The structured receipt contains only non-secret IDs/digests and immutable container image IDs. Image revision labels were absent and are recorded as `NOT_PUBLISHED`, not inferred.

## Boundary and remaining owner

This closes the **P22 backend real-preview gate**. It does not claim Claude's S11 browser/HiFi acceptance, P23 resource/DR qualification, research-dev activation, P24, or Production. The next consumer action is mechanical: regenerate/consume the published declaration, render the S01/S02/S10/S11 facts, and take the browser-real receipt. Rollback remains flag/intake-only; immutable packs, publications, settlements, promotion facts and R1 decisions are retained.
