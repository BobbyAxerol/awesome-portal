# Proposed patch — UNIFIED_IMPLEMENTATION_PLAN.md §13, 2026-10-04

Agent AC. Not applied. Hunks are against `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` at
lane HEAD `d0569d49` (7,583 lines). Verified with `patch --dry-run` on a copy.

| Hunk | Anchor | What |
|---|---|---|
| 1 | after line 3637 (P24 board row) and before the paragraph `**Frontend status 2026-09-30:**` (line 3639) | new paragraph + 4-row FE table for P21, P22, P23, P24 (no existing row is rewritten) |
| 2 | before `## 13.5. Chỉ mục thực thi từng phase` (line 4179) | new `### 13.4.2` implementation note in the §13.6 template (15 fields) |

Apply notes.
- Codex's `codex/be-gaps` edits lines 3636, 3637, 3691, 6287 and the end of file. The hunks above only insert and touch none of those lines, but hunk 1 sits next to 3637, so on `be-gaps` apply with `git apply --3way` or `patch -F2`; the content does not depend on the Codex rows.
- Wording of states uses the plan's vocabulary (§13.4 status vocabulary). Nothing is marked `OWNER_ACCEPTED`; the review state is `NOT_VERIFIED` and flips to `READY_FOR_BOBBY_REVIEW` only on the conditions written in hunk 2.
- Facts that could not be verified by this agent are written as such inside the text (Playwright command lines not stored; Linux identity not recorded; identity.json stale).
- The P23 (3636), P24 (3637) and OL-12 (3691) rows in the lane copy are stale versus be-gaps; see AMENDMENT_FE_2026-10-04.md rows 22-24. Taking be-gaps' version of those three rows and then applying this patch is the intended order.

```diff
--- a/upgrade/UNIFIED_IMPLEMENTATION_PLAN.md
+++ b/upgrade/UNIFIED_IMPLEMENTATION_PLAN.md
@@ -3637,4 +3637,15 @@
 | [P24](#rl-p24) | P23 | mọi màn | 12 | **IN_PROGRESS / Codex backend, Claude FE / 2026-10-03** — [P24 packet](./research_loop/evidence/P24/README.md): actual read-preserving producer rollback PASS (3 intake refusals, 20/20 historical reads, custody/migrations/jobs/outside runtime unchanged); current Control reader must be retained. Full 15-test / 20-FND disposition matrix, unsigned candidate and operating checklist delivered. Full-product browser/engine-two/strict integrity/owner review/signed release OPEN; no remote/deployment action. Historical status: PLANNED / unassigned. |
 
+<a id="rl-fe-w1-w7"></a>
+**Frontend board rows 2026-10-04 (FE campaign W1–W7, Claude/Thanhvuong; Codex slice marked):** sống tại [FE-W1-W5 packet](./research_loop/evidence/FE-W1-W5/thanhvuong-frontend-receipt.md); chi tiết ở [§13.4.2](#rl-fe-w1-w7-note). Mọi hàng dưới đây là `NOT_VERIFIED` ở mức sản phẩm cho tới khi Bobby rà bằng mắt; không hàng nào là `OWNER_ACCEPTED`.
+
+| Phase | Màn | FE state | Evidence / blocker |
+|---|---|---|---|
+| P21 | 11 | **IMPLEMENTED · NOT_VERIFIED** (Claude). S11 gồm Codex `d5d09875` (blocked_action, stale-seal wording, rail ordinal, RC record absences). S09/S11 explicit workspace + linked-audit consumer do Codex giao `7d18fe4e` (nhánh `codex/be-gaps`, chưa trên `claude/fe-parity`) | gate 228/228 trên `index-C41KmM2A.js` chưa gồm `7d18fe4e`; re-gate sau merge. [Receipt](./research_loop/evidence/P23/WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md) (be-gaps) |
+| P22 | 11 handoff | **IMPLEMENTED · NOT_VERIFIED.** R-WFO-027 publish thật trên :8095 (`rc_06GG2K1TN6QQNJJN3RJ5AS5XC1`, `apr_06GG2K4A9Q3AHFVK0WV5GXNCY2`); `approval_read DENIED` có copy riêng; stale seal một lối thoát | [test-results](./research_loop/evidence/FE-W1-W5/thanhvuong-test-results.json) `p22_publish`; HiFi/owner chưa |
+| P23 | mọi màn | **FE_QUALIFICATION_INPUT.** FE không thêm cờ/contract/migration; vitest 5892 pass/1 skip/338 file, tsc sạch, preview lane 105/105, W5 gate 123/123, overflow 0 ở 390/360/1280/1440, axe 0 critical/serious/moderate | in thật trên thiết bị: `DEBT-PRINT-REALDEVICE` OPEN_LOW; baseline Research 28 + legacy 100 PNG (packet ghi 101 ô) |
+| P24 | mọi màn | **OPEN_FE** cho T09/T13: gate + matrix màn đã có, field/action matrix chưa; T12 xem [matrix §16.6](./research_loop/evidence/P24/SCENARIO_MATRIX_16_6_2026-10-04.md) (1/24 đóng bằng receipt giữ lại) | [pin FE](./research_loop/evidence/P24/FE_CANDIDATE_MANIFEST_2026-10-04.json), [amendment](./research_loop/evidence/P24/AMENDMENT_FE_2026-10-04.md). Chuyển `READY_FOR_BOBBY_REVIEW` chỉ sau merge + re-gate xanh |
+
+
 **Frontend status 2026-09-30:** Claude's newer P15–P21 status and the remaining G1–G12 work are in [§13.4.1 G](#rl-open-ledger) and the [frontend gap evidence](./research_loop/evidence/FRONTEND_GAPS_STATUS_CLAUDE_2026-09-30.md); they supersede only the historical FE snippets in the rows above. The local P22/P23 backend acceptance rows and current P23 receipt remain authoritative. E11–E17 source/real-API closeouts below remain intact; the new E14 field record is linked from the frontend gap evidence.
 
@@ -4177,4 +4188,26 @@
 Phần Bobby làm trước được gắn vào chính row phase, không tạo “phase Bobby” song song.
 
+<a id="rl-fe-w1-w7-note"></a>
+### 13.4.2. FE campaign W1–W7 — implementation note (Claude, 2026-10-04; mẫu §13.6)
+
+```text
+Phase / assigned scope / effective Linux identity: P21–P24 frontend consumer; W1 run-status/exits/cursor links, W2 New Run + draft + Import, W3 shell/mobile top bar, W4 ít chữ, W5 chart contract + axe + a11y, W6 browser/print QA fixes, W7 Codex d5d09875 consumed + 360px causal; Linux identity not recorded in the packet
+Worktree / branch / base SHA / head SHA / upstream dependencies: /home/bobby/portal-research-fe · claude/fe-parity · base b2098a81 · code head 2f4cb81a (tree 65720614cd27) · docs head d0569d49 · depends on be-gaps 0df6030f (d5d09875, 576a32fe) and 7d18fe4e (not yet merged here)
+Implementer / reviewer / cross-agent handoff approval: Claude (Thanhvuong lane) / Bobby (NOT_VERIFIED) / Codex consumer slice 7d18fe4e approved by Bobby 2026-10-04
+Goal and delivered BE/FE panels/actions: FE only. Screens S00–S14 (+S04 404); G-25 search by R-label, G-26 Journey v5, B-1…B-5 and §31-1/2/3/5 bound; legacy export is prepare-then-download (f0346ef8)
+Files changed + real Git additions/deletions: git diff --numstat b2098a81..HEAD -- apps/portal/frontend (awk-summed; "tail -1" shows only the last row) = 342 files (215 text, 127 baseline PNG), +9313/-5684. Whole tree b2098a81..HEAD = 569 files +36833/-6473 (includes merged Codex backend). 43 commits
+Contracts + numeric/source/authority mapping: no new contract authored by FE. Generated types consumed: Library q=R-… (G-25), Journey v5 (G-26), run_status/lifecycle.failed_at/report_sealed/selected_trial_ordinal, blocked_action, rail selected_params ordinal (351 RUN_GLOBAL, 2 STUDY_LOCAL on R-WFO-027). packages/contracts/contracts-snapshot.json sha256 740e5a21…6b315 (schema_version 21, 287 digest entries, 43 generated files)
+Guide test IDs + source test IDs + actual commands/results/reused evidence: vitest full 5892 passed / 1 skipped / 338 files; tsc clean; preview real-API lane 105/105; e2e/_preview-research-w5.spec.ts 123/123 (S00–S14 + S04 404 × Research Light/Operations Dark × 1440/390, axe 0 critical/serious/moderate, real runs R-WFO-023, R-WFO-027, R-P04-022); lane + gate 228/228 on index-C41KmM2A.js (one S06 mobile real-read cell failed once under load, passed 3/3 alone). Rebuild/test line from rollback doc: cd apps/portal/frontend && npx tsc -b --noEmit && npm run build && npx vitest run. The Playwright command lines and logs are not stored in the packet (test-results.json note); the lead should attach them
+Delta source/data/engine/effective-spec + direct/storage/API/DOM comparison: not applicable to FE; DOM values compared to API on real runs by the real-API lane
+Visual/real/regression lane refs + copy/layout/console/network outcomes: research-loop.visual.spec.ts 28 baselines (16 changed for W5); visual.spec.ts 100 PNGs on disk vs 101 recorded cells (open discrepancy); overflow 0 at 390/360/1280/1440; tab stops S06 66/57, S07 20/17, S08 85/59, S09 57/51; 0 console errors on queued/cancelled after useEvidenceReadsAllowed; raw enum tokens S04–S11 398/79 -> 141/23; W6 QA report /home/bobby/portal-research-qa-2026-10-03/REPORT.md (224 screenshots, 55 flow shots, 7+28 print PDFs; private)
+Resources + scale-refine six fields + bounded cleanup decision: no backend resources; FE cardinality limits as in W4/W5 (one tab stop per chart, candle table behind Data above 120 rows); no cache deletion
+Protected Execution/kernel/shared surfaces + data/auth preservation: no Execution/kernel/backend edit; tokens --ink-faint/--ink-mute changed with Bobby approval 2026-10-02 (95 legacy baselines re-recorded); no flag, contract, migration added
+Dev URL / bundle/API/image/config/schema identity + rollback receipt: http://localhost:8095 serves index-C41KmM2A.js (sha256 215b10a6…d7203ad28; includes 2f4cb81a, excludes 7d18fe4e); ~/.config/portal-research-preview/identity.json (2026-10-03T18:15:07Z) lists web c13cb04c…, control-api 776f3982…, migration 093 and commit 4c443cec (not an ancestor of the lane); stale vs repo head 094, must be rewritten after the merged build. Rollback: FE-W1-W5/thanhvuong-rollback.md
+Debt / owner decisions / external dependencies: OPEN: DEBT-LEGACY-ES (OPEN_LOW), DEBT-OOS-ZERO (OPEN_DECISION: prints 0.000 for -3.3e-16), DEBT-PRINT-REALDEVICE (OPEN_LOW), DEBT-BASELINE-MIX (CAVEAT), DEBT-STALE-SEALS (OPEN_CODEX: R-WFO-022/023 stale by design). CLOSED: G-25, G-26, B-1…B-5, §31-1/2/3/5, W8 leftovers, D1–D12 QA findings
+Exit gate outcome / Bobby review state: NOT_VERIFIED. READY_FOR_BOBBY_REVIEW only when: claude/fe-parity and codex/be-gaps merged, one build, 228-cell gate + full vitest + visual verify-mode green on that bundle, identity.json rewritten from docker inspect
+Next phase/action + remaining prerequisites: merge + single build; re-run S09/S11 4 restored-proof cells; P24-T12 browser script for SC-01/09/15–18/20; Bobby decisions on T05 and DEBT-OOS-ZERO; signed release not dispatched
+```
+
+
 ## 13.5. Chỉ mục thực thi từng phase
 
```
