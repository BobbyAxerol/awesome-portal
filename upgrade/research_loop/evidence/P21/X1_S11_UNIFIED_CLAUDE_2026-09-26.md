# X1 · Screen 11 unified — W5c features on the integrated S11, P22 adapter on the two real routes, W7 lane, B2, intake flag — Claude, 2026-09-26

Status: **S11_UNIFIED · P22_ADAPTER_ON_CODEX_CONTRACT · W7_RENDERED · B2_DELIVERED · PUBLICATION_INTAKE_FLAG (default off) · REAL_API_READS_RECEIPTED (preview c66836bf, pre-P22) · P22_WRITE_BROWSER_PROVEN_ON_A_LABELLED_DOUBLE.**

Worktree `.claude/worktrees/agent-a6ddb6a47d4c483c9`, branch `worktree-agent-a6ddb6a47d4c483c9`, base
`origin/docs/research-loop-plan` @ `177df754`. Commits in §8; nothing pushed.

Bobby, 2026-09-26: Screen 11 = Thanhvuong's integrated version; separate publish-intake flag; Claude decides the
pending copy/display items per HiFi/spec; close every gap HiFi↔frontend and frontend↔backend.

## 1. Read (file @ `177df754`)

`evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md` (F1, F2, F3, B2, B9); `P21/W5C_S11_CLAUDE_2026-09-25.md` (D-01…D-12);
`P21/W7_P21_RETAINED_LANE_CLAUDE_2026-09-25.md` §7; `P22/README.md`, `phase-report.md`, `rollback.md`,
`frontend-handoff-claude.md` (Codex integration note), `thanhvuong-frontend-receipt.md` (VD-P22-01…14, B-P22-01…07),
`thanhvuong-backend-requests.md`; HiFi `release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html`,
`docs/screens/11_release_candidate.md`; guide `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` P22 ("Publish
confirmation/loading"); code: `release-candidate*.ts`, `release-candidate-publication*.ts` (control-api),
`research-release-candidate*.openapi.json`, the S11 frontend files, `e2e/_preview-research-real-api.spec.ts`,
`e2e/research-qualification/stubs.ts`.

Key fact: the integrated adapter was written for Thanhvuong's three-route contract (compose carrying `publication`
and `mirror`, `/mirror`, `/publish/reconcile`). The branch runs **Codex's** contract: P21 compose (`mirror: null`,
`state: "DRAFT"` literal) + `GET …/publication` + `POST …/publish`. Its tests mocked a shape the server never sends.

## 2. HiFi → component → field → state → test

| HiFi element | Component | Field / operation | States | Tests |
|---|---|---|---|---|
| Breadcrumb, title, subtitle, run report | `Header` | `run_id` | all | U03 |
| State chip DRAFT / PUBLISHED / NOT_PUBLISHABLE | `StateChip` (`stateChipOf`) | `run.binding`, `local_seal.delivery_state`, publication `state` | 3 + `SEALED_LOCAL` chip until delivered | U06, U27, U33, U42, U48; e2e |
| NOT_PUBLISHABLE banner | `Banner` | `run.binding === null`, `source_absences.alpha_binding` | scratch | U06 |
| 5-node rail (links alpha→10, run→04) | `Rail` + `railRoute` | `rail[5]` | ink/gold/green/dim; dim never links | U05; e2e |
| Taxonomy + last-rc + verdict | `Taxonomy`, verdict | `taxonomy`, `published_comparison` (P22 facts now, B2), `gate_verdict` | UNSET/UNCHANGED/CHANGED; predecessor links its pack | U07 |
| Claim / engine chips | `CertChip` ×2 | `certification_axes.*` | value / ghost with sentence+code | U08 |
| 12-row pack + counter | `PackBlock` | `pack[12]`, `pack_counts` | COMPLETE/DEGRADED/INPUT/MISSING, reason sentence + code | U09, U10, U16; e2e |
| Row source link | `packSourceRoute` (contract key) | `pack[].source.href` presence | linked / unlinked (Alpha 360°, declaration) | U11; e2e |
| INPUT edit + save | `DeclarationRow` | PATCH `researchReleaseCandidateDraftPatchV1` | field-path issues / saved / 409 / 403=404 / 503 / 400 | U19–U25; e2e DOUBLE |
| YAML + copy | `RecordBlock` | `yaml[17]` | null → `null  # reason` | U12, U13 |
| Local seal (confirm) | `SealCard` + `Confirm` | `actions.may_seal`, draft fences, POST seal | blocked / dirty / confirm / sealing / 422 / 409 / replay | U26–U29; e2e DOUBLE |
| Publish card (confirm) | `PublishCard` + `publishBlock` | P21 `actions.publish` ∧ P22 `may_publish`/`blocked_reason`, `source.eligible_methodology_claim_ids`, POST publish | blocked by code / claim choice / confirm / publishing / 409 / 401 / 403=404 / 503 | U31–U38, U46; e2e DOUBLE-P22 |
| Unknown outcome | `UnknownOutcomeCard` | publication `state` PENDING/UNKNOWN, `may_publish` | retry only when server admits | U35 |
| Published card | `PublishedCard` | `published.{at_utc_ms,by_username,receipt_digest,approval_id}`, `approval.evidence_set_hash` | read / not read | U33, U42 |
| Approval mirror (solid) | `MirrorCard` | `approval_read`, `approval.*`, `candidate_relation` | AVAILABLE / DENIED / NOT_FOUND / UNAVAILABLE / stale / read failed — never the ghost | U41–U43 |
| Approval mirror (ghost) | `MirrorGhost` | `source_absences.approval_mirror` or publication code | before delivery only | U44; e2e |
| Sealed pack route | `PackScreen` | GET pack + GET publication | published / ghost with link to composition | U47–U50 |

## 3. Decisions (Bobby delegated the pending copy/display items)

| # | Decision | Why |
|---|---|---|
| X1-D01 (VD-P22-04, W5c D-01) | Seal **and** publish each need an inline `role=alertdialog` confirmation; focus moves to the confirm button; the HiFi button label is unchanged. | Guide P22 FE "Publish confirmation/loading"; Codex P22 handoff "POST only on explicit confirmation"; both write an immutable record. Spec §3 "click → PUBLISHING" still holds for the confirmed click. |
| X1-D02 | The browser sends `{schema_version, expected_pack_digest, methodology_claim_id}` only; `request_key` = `rcpub:<rc>` and the R1 summary are derived by the server from the sealed pack. | Audit F2 "locally written publish summary"; contract relaxed (OpenAPI 1.1.0), a replay derives identical bytes. |
| X1-D03 (W5c D-03) | Chip: `NOT_PUBLISHABLE` (no binding) > `PUBLISHED` (seal `delivery_state` DELIVERED or publication DELIVERED) > server `state`. `SEALED_LOCAL` beside it until delivered. | Spec §2.1; `PUBLISHED` only from a server fact. |
| X1-D04 (W5c D-04) | Row links by contract key, only when the server published a source. | Old preview hrefs (`/replay`, `/research/alphas/…`) are not served routes. |
| X1-D05 | Publish button label = HiFi label with the rc id, "publish blocked — bind alpha_version first" (spec §13) for scratch, "publish blocked" before a seal; the reason is said once beside it (sentence · code, `aria-describedby`). | T14; no duplicated text; no enabled-but-inert button. |
| X1-D06 | Publication read backoff 15/30/60/120/300 s while visible for 0/408/429/5xx; 401/403/404/other 4xx are terminal states; DELIVERED/PENDING re-read every 60 s. | Spec §3 T17/T18; audit F2 "transient ≠ denied". |
| X1-D07 (spec T07) | After delivery the INPUT rows lose their edit button and the seal/publish cards leave the side column. | Spec pitfall 4. |
| X1-D08 | The 01 rc chip of a LOCAL_SEAL opens `/research/quantbt/release-candidates/rc_…`; the W5c `#pack=` link forwards there (malformed ids ignored). | One pack route everywhere. |
| X1-D09 (B2) | Taxonomy compares code+entrypoint / params / dataset digests with the newest DELIVERED candidate of the same Alpha; CHANGED → verdict "R1 + R2 must run — … changed" (HiFi); no predecessor → `P22_NO_PUBLISHED_PREDECESSOR`. | Spec §2.3 / T10; server-side, no FE diff. |
| VD-P22-01 | SLA prints `sla_due_at` / `expires_at` verbatim; no countdown. | No browser date arithmetic. |
| VD-P22-02 | "assignee pool: not published" (ghost and card). | No contract field; the HiFi "Quant Reviewers" was an invented fact. |
| VD-P22-03 | `published_at` / `by` = `published.at_utc_ms` / `published.by_username`. | Server receipt. |
| VD-P22-05 | Unknown-outcome card with "publish again — same request", enabled only when the server says `may_publish`. | Codex: UNKNOWN is not success, retry with the original key. |
| VD-P22-06 | Radio of the server's eligible claims when there are several; none → blocked with its reason. | Contract requires one claim. |
| VD-P22-07 | `candidate_relation: SUPERSEDED` is its own line beside the raw status. | Raw status unchanged. |
| VD-P22-08 | Outcome vocabulary = governance enum (APPROVED · APPROVED_WITH_CONDITION · CHANGES_REQUESTED · DENIED · EXPIRED); the note says "one of the outcomes above" instead of "one of six". | HiFi names values governance never returns (REJECTED, SUPERSEDED, _CONDITIONS). |
| VD-P22-09 | The pack route reads the publication too: published card + mirror when delivered, otherwise a ghost that links to the composition. | "No ghost after publish" on every route. |
| VD-P22-10 | YAML = the server's 17 fields (no `created_at`). | Contract. |
| VD-P22-11 | No `effective_status` line: the Codex mirror has none. | Contract. |
| VD-P22-12 | Refusal copy by status (spec §3) plus one sentence per P22 `blocked_reason` (`RC_REASON_SENTENCES`); unknown codes print alone. | Codex answers blocked states as 200 + `blocked_reason`, not 4xx codes. |
| VD-P22-13 | SoD note on the publish card only (HiFi). | HiFi. |
| VD-P22-14 | Published card adds the receipt digest and approval id (mono). | Server facts that distinguish receipt from approval. |
| B-P22-01/02/06 | Resolved by Codex's integration: its two-route contract and migration 0063 are canonical; Thanhvuong's alternate backend is not adopted. | `P22/phase-report.md` review section. |
| B-P22-03 | Codex routes are in the r2 ledger (`r2Ledger.test.ts` green). | Test run. |
| B-P22-04 | Open (Codex B8): child AUDIT_OF_SELECTION / `rrun_` not in `run_read_models` → real candidates answer `P22_GOVERNANCE_SOURCE_UNAVAILABLE`; S11 shows that typed. | Backend. |
| B-P22-05 | This table. | — |
| B-P22-07 | New flag `FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION`, default false; enable only after B8 and a real receipt. | Runbook section. |

## 4. Defects fixed

Frontend (audit F2, eight): (1) no `/mirror` call — one `GET /publication`; (2) transient outage → `unavailable`/`stale`
with backoff, never `denied`; (3) no ghost after publish (delivery fact or publication read decides; unreadable R1 read is
typed); (4) publish gated on P22 `may_publish`/`blocked_reason` (and P21 affordance); (5) no enabled-but-inert button —
every enabled button opens a confirm that sends; (6) 401/403/404/4xx on the publication read are their own states;
(7) no invented facts (assignee pool, "decisions none recorded", quorum/version/blockers, browser summary); (8) no
fake combined compose / reconcile route. Also: absent digest cells wrap instead of clipping the reason code (seen in
the 1440 screenshot); publish label no longer repeats its reason.

Backend: B2 (P21 no longer hardcodes `P22_*_NOT_COMMISSIONED`); B9 intake flag; server-derived request key/summary.
W7 P04 golden re-cut proof: decoded before/after differ in exactly **48 single-line hunks, all `reason_code`** —
24 × `P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED` → `P22_NO_PUBLISHED_PREDECESSOR`, 24 × `P22_PUBLICATION_NOT_COMMISSIONED`
→ `P22_LOCAL_SEAL_REQUIRED` (12 variants × virtual/declared); sha256 before `98194d3666036784`, after `754564a9bef0211f`.
The two WFO fixtures differ in the same two lines each (`W7_WRITE_FIXTURES=1`).

## 5. Tests (exact counts)

| Gate | Result |
|---|---|
| control-api `vitest run test/research- test/config.spec.ts test/governance` on disposable PostgreSQL 16 (`postgres:16-alpine`) | **83 files passed, 1 skipped; 544 passed, 1 skipped** |
| of which new/changed | service B2 ×2, publication X1 ×3 (derived key/summary, intake dark, reconciliation with intake dark), config ×1, W7 PG spec (intake dark/open + PENDING intent read under the runtime role) |
| control-api `tsc -p tsconfig.build.json` | exit 0 |
| contracts `snapshot.py --check` | 215/215; publication spec + RC spec 5 passed |
| frontend `vitest run src/research src/execution/r2Ledger.test.ts src/execution/disabledReason.test.ts` | **42 files, 1285 passed, 0 failed** (S11: 63; `releaseCandidate.test.tsx` deleted after porting U01–U24) |
| frontend `tsc --noEmit -p tsconfig.json` / `npm run build` | exit 0 / exit 0 |
| P23 runner typecheck (`e2e/research-qualification/tsconfig.json`) | S11 stub clean; the 4 remaining errors are the pre-existing S10 lineage stub (audit F8, X3/Codex) |
| real-API lane, Vite dev proxy → preview :8095 (image `c66836bf`, no P22 routes, no W7), `-g "X1 S11"` | **8/8 at 1280+660, 8/8 at 1440+660**: P04 and WFO compositions equal to the API (17 lines, 12 rows, reasons, source links, rail tones/links, gates, chip), no `/mirror`, no publication read before a seal, overflow 0, axe serious/critical 0 (D-B1 exception only); DOUBLE declarations/409/confirmed seal → real publication read answers 404 → typed "This build serves no publication for this candidate"; DOUBLE-P22 publish → PUBLISHED, receipt, solid mirror, no ghost, body = 3 keys |
| hook | ran on both code commits (§8) |

**Screenshots looked at** (`~/.config/portal-research-preview/receipts/X1/`): `X1-S11-P04-laptop` (1440) — found the
clipped absent-digest reason and the duplicated publish label, both fixed and re-run; `X1-S11-DOUBLE-P22-published-laptop`
(PUBLISHED chip, receipt, mirror PENDING, SLA verbatim, no ghost); `X1-S11-WFO-mobile` (660: PARTIAL notice above
the blocks, pack scrolls in its frame, 7 MISSING with codes); `X1-S11-DOUBLE-sealed-mobile` (SEALED_LOCAL beside
DRAFT, not-found publication read typed, ghost kept because nothing was delivered).

## 6. Unfinished and why

- **Preview not rebuilt** (read-only lane): the live preview still answers the pre-P22/pre-W7 composition (WFO 3·0·2·7
  PARTIAL, `P22_PUBLICATION_NOT_COMMISSIONED`, no `/publication` route). W7 8·2·2·0 and P22 publish are proven on the
  canonical fixtures (unit) and on labelled browser DOUBLEs; the e2e asserts the W7 sentence automatically once rebuilt.
- **Real publish** blocked by Codex B8 (`rrun_`/child audit not in `run_read_models`) → `P22_GOVERNANCE_SOURCE_UNAVAILABLE`.
- **Intake flag** is dark everywhere; no environment flipped.
- Telemetry events (spec §15): no Research telemetry sink exists.
- P23 runner S10 stub (4 type errors) belongs to X3/Codex.

## 7. Rollback

Revert per commit. Frontend revert restores the integrated adapter (with its F2 defects). Backend revert restores the
hardcoded P22 absences, the required browser summary/key (the integrated FE sent them) and removes the flag — note that
without the flag publish intake is governed by the P21 flag alone again. No migration, no data change.

## 8. Commits

| Commit | Subject |
|---|---|
| `608aa933` | feat(research): P22 intake flag, server-derived publish request, P21 prints P22 facts (B2) — 20 files, +446 −50 |
| `66be48ae` | feat(research): Screen 11 unified on the two real P22 routes, W5c features ported, W7 lane rendered — 12 files, +2604 −3251 |
| (this) | docs(research): X1 Screen 11 unified record |
