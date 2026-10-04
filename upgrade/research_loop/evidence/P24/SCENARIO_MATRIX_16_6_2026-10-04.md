# P24-T12 — scenario matrix §16.6 mapped to current evidence, 2026-10-04

Agent AC · docs only. Denominator: **SC-01…SC-24** from guide §16.6
(`RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md:2933-2960`); `cross-screen-scenarios.json`
is named by the guide (:1017, :3847) but **does not exist in the repo**, and no
file under `evidence/` mentions an `SC-xx` id (grep, both trees). So **no retained
receipt is keyed to a scenario**; none carries the per-scenario side-effect oracle
(HTTP calls, DB write set, jobs) that §16.6 requires. Rules used: PASS_REUSED only
when a retained receipt proves the scenario's whole assertion; component or
unit/source evidence is listed as input but the row stays NEEDS_RUN.

Paths relative to `upgrade/research_loop/evidence/`. "(be)" = exists on `codex/be-gaps`
`0df6030f`, not in the lane copy. Preview = `http://localhost:8095` (writes there
need Bobby's explicit say-so; earlier harness was denied then approved in chat).

## Totals

| Disposition | Count | IDs |
|---|---:|---|
| PASS_REUSED | 1 | SC-22 (scoped to the backend load/restart half; see row) |
| NEEDS_RUN | 21 | SC-01…05, 07…20, 23, 24 |
| BLOCKED_EXTERNAL | 2 | SC-06 (upgrade half), SC-21 (new-route half) |
| OWNER | 0 | closing SC-06/SC-21 needs Bobby's disposition through P24-T15; no scenario is waived |

## SC-01…SC-24

| ID | Expected (short) | Existing evidence (input, not closure) | Disp. | Smallest run to close |
|---|---|---|---|---|
| SC-01 | click non-θ* trial 06→07→09→11→back; cursor changes, selection/params/RC unchanged, no mutation | P15/frontend-composition-claude.md; W5 gate (cursor probe) in FE-W1-W5/thanhvuong-test-results.json; unit tests in lane | NEEDS_RUN | Merged bundle, R-WFO-023 on preview, S06 click trial, visit S07/S09/S11, Back; capture request log (GET only) + selected params digest before/after |
| SC-02 | S14 parse+gates PASS, edit bytes, register with old receipt refused; mirror readonly | P23/F5_S14_BROWSER_REAL_WRITE_2026-09-29.md; FND-03 text in P24/V1_ACCEPTANCE.md:85 says changed-digest browser receipt still needed | NEEDS_RUN | S14 on preview: parse+gates, alter bytes, POST register with stale receipt, expect typed refusal, import count unchanged (write: needs Bobby ok) |
| SC-03 | narrow/pin inside declaration ok; widen outside refused; old run unchanged | P07, P08, P10 phase reports (source tests); P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md | NEEDS_RUN | S02 on preview: narrow within bound -> new intent same version; widen outside -> refusal needing new version; confirm old run row unchanged |
| SC-04 | main-trials/seed vs advanced alias stays in sync; crafted conflicting POST rejected; preview==POST==effective | P23/F5_NEGATIVE_API_MATRIX_2026-09-29.md; P02 requested_spec schema; W2 (S02 validation) in FE-W1-W5 | NEEDS_RUN | S02 browser edit of both fields; one curl POST with conflicting aliases (expect 4xx); compare effective spec to worker config of a created run |
| SC-05 | budgets carry applies_to; counters actual; no universal folds x trials | P08/P11/P15 contracts; P23/T12_ADMISSION_QUOTA_CHECKPOINT_2026-09-28.md; direct WFO 13/3 only (P23/WFO_DIRECT_ENGINE_RECOMPUTATION_2026-10-03.md) | NEEDS_RUN | S02/S03/S06 on 2 runs with different studies/folds/seeds incl. one early-stopped; compare screen counters to artifact counters |
| SC-06 | reproduce pins old effective values; experiment on newer release discloses diff; old artifacts not relabelled | P19/E13_REPRODUCTION_REAL_API_ACCEPTANCE_2026-09-27.md (reproduce half); upgrade half needs a second engine | BLOCKED_EXTERNAL (upgrade half) | Reproduce half already evidenced (needs same-candidate rerun in browser). Upgrade half needs a Portal-qualified second engine: Codex 1.1.0 profile binding + Bobby decision (see T05) |
| SC-07 | autosave x N, double submit, worker crash/retry: one attempt, retries separate, counts correct | P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md (same intent resumes, backend); P03/test-results.json (double-click); W2 draft in FE-W1-W5 | NEEDS_RUN | S02 draft autosave x3 + double-click create on preview (one write), then check S00/Library counts; backend crash/retry reused from T03 |
| SC-08 | engine selected=None: honest outputs, no best fallback, RC shows right reason | P05/WFO_SUMMARY_BUDGET_AND_PREVIEW_GATE_2026-10-01.md; P21/CG-FG-S11-02_backend_receipt_2026-10-01.md; P15/frontend-composition-claude.md | NEEDS_RUN | Locate a run with null selection on preview (or typed fixture in the lane), walk S06, S07, S09, S11 and read RC reason code; no existing receipt names such a run |
| SC-09 | centroid/per-fold: valid params, null trial/ref, no invented trial | R-WFO-027 per_fold_causal (FE-W1-W5/thanhvuong-test-results.json `w6_w7.causal_360`); P17/E16..., P21/W1_W2_BACKEND_REQUEST_CLOSEOUT_2026-10-03.md | NEEDS_RUN | R-WFO-027: S06 -> S07 -> S08 -> S11; assert selected params ordinal 2 STUDY_LOCAL, no global theta, no fold-last substitution |
| SC-10 | audit reuse and missing-retention child: reuse checklist, child pinned, optimizer 0, evidence_run_id via existing path | P23/T02_T12_SOURCE_CLOSEOUT_2026-09-30.md (reuse); (be) P23/NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md (child, 4 consumers); (be) P23/WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md (S09/S11 read 4/4) | NEEDS_RUN | Merged bundle on a reusable parent: S11 Create-linked-audit button -> one child -> P05 ACK -> publish step. Codex says button-to-child browser allocation not proved; needs Bobby ok (creates a job) |
| SC-11 | S05 open sealed card, no unlock source: metadata only, no new role/endpoint, no false PASS | P14/BR_F3_02_APPLIED_GUARDS_AND_W5_NAVIGATION_2026-10-03.md; FND-10 readonly | NEEDS_RUN | S05 on a run with sealed holdout; request log shows GET only, copy states unresolved scope |
| SC-12 | scan != evaluation != exposure; no re-seal/reset; no cross-user leak | P14 phase-report; source-attested exposure writer (P10/B7_B8...); coherent-restore preservation | NEEDS_RUN | Two QA accounts, same snapshot: user A scans, user B reads; clone after authorized evaluation; assert exposure unchanged by scan (needs second account) |
| SC-13 | boundary theta: DR-02 names, no "not optimum" claim, no new deploy gate | A12 mapping marks P13-T11 COVERED (RS-03/A12_GATE_ID_MAPPING_CLAUDE_2026-09-24.md; unit); P17/E2C_E16_S07_S08_CLAUDE_2026-09-26.md | NEEDS_RUN | S06/S07/S09 on a run with a boundary theta and one zero-width/pinned/categorical case; read copy against DR-02 |
| SC-14 | no-loss / zero-variance / missing benchmark / no overlap / permuted labels: typed undefined, no 0/NaN, no ordinal importance | P20/phase-report.md, P20/thanhvuong-frontend-receipt.md; V11 direct oracle covers six native + four summary metrics only | NEEDS_RUN | Typed technical fixtures in the lane (S09/S13) for each undefined case; DOM assertion no `0`/`NaN` where null |
| SC-15 | mount/drag/refresh with grid: no implicit jobs; explicit evaluate 81 cells -> actual unique configs; delta J correct | P23/T02_T12_SOURCE_CLOSEOUT_2026-09-30.md (81-cell what-if, backend); P23/UTILITY_CHECKPOINT_2026-09-27.md | NEEDS_RUN | S07 on preview: mount, drag, refresh with request log (0 POST, 0 jobs); one explicit evaluate; compare cell count with unique configs |
| SC-16 | same-timestamp events and raw seq gaps: next/prev by ordinal, no synthetic gaps; real gap refusal | P17/phase-report.md; FRONTEND_GAP_HANDOFF_THANHVUONG_2026-09-28.md; executeRoute.seq tests (lane, a226d1d9) | NEEDS_RUN | S08 on a run with equal timestamps; seek around a recorded gap; confirm refusal text and no invented chain |
| SC-17 | reveal ON then seek past exit then fold change: no future leak, labelled summary, no certificate change | P17/W5B_REPLAY_CLAUDE_2026-09-25.md; V1_ACCEPTANCE.md FND-15 says latest Reveal round trip required | NEEDS_RUN | S08 on R-WFO-027: reveal ON, seek past exit, change fold; screenshot + digest unchanged |
| SC-18 | fresh tab links with pick/trial/study/trade/seq/event_seq and conflicting aliases resolve; history does not change frozen selection | W5 `window`-in-hash and `runScreenHref` (lane, c4d84d1a); P02/P09/P15/P17 tests | NEEDS_RUN | One browser script: open 6 deep links in fresh tabs incl. conflicting aliases; Back/Forward; selection and run mode unchanged |
| SC-19 | local seal, timeout before/after R1 ACK, retry as the actor: no false published/approved, no duplicate | P22/README.md (intent replay); P23/PUBLICATION_REPLAY_CHECKPOINT_2026-09-27.md (3 retry POST -> DELIVERED replayed:true, one publication); P23/GATEWAY_UPSTREAM_TIMEOUT_2026-09-29.md; R-WFO-027 real publish | NEEDS_RUN | Backend replay reused; FE half missing: S11 state after an induced timeout on a fresh RC. Induced timeout must run on an isolated cell, not :8095 |
| SC-20 | promotion_pick absent / code-change GATES RESET / post-approval corruption: no pick, reset, revoke; mirror intact | P22/ol03-ol11-codex-receipt.md; P22/real-preview-receipt.json; R-WFO-027 `approval_read DENIED` copy | NEEDS_RUN | S10/S11 on R-WFO-027 + one case with code-change reset; read-only; assert no mutation calls |
| SC-21 | release with new route lacking mapper; old run in Atlas: informational reason, no auto-enable | P23/T13_CURRENT_ROUTE_NEGATIVE_CHECKPOINT_2026-09-28.md (preflight 409 `RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED`, default false, counts unchanged); P23/T07_T13_P04_RELEASE_PIN_GAP_2026-09-30.md | BLOCKED_EXTERNAL (new-route half) | Old-run-in-Atlas half is a quick browser read (NEEDS_RUN). A release with a new route needs a second engine/profile (see T05) |
| SC-22 | 20 users read/cursor/what-if lookup + heavy compute + bounded verify/export; restart; historical readable workers-off; aggregate 5 GB | P23/MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md §6 (120/120, Library 499, Progress 403, 738,488,320 B peak, clean b90a36a9); P24/V1_ACCEPTANCE.md delivered 2 (20/20 reads across restarts, worker OFF); (be) Report 377 / RC 487 ms, 435,445,760 B peak | PASS_REUSED (backend scope) | None for the backend. Caveat: control image changed after b90a36a9 (`629d9bef`) and `576a32fe` edited progress-ingress; Codex judged Library/Progress unaffected and did not retake. If Bobby wants it stricter, rerun the six named reads once on the final candidate |
| SC-23 | two users change version/draft/context; stale response late: old run unchanged, CAS no overwrite, no cross-run projection | (be) workspaceAudit.test.tsx (obsolete requests fenced, 20 tests); P03 CAS tests; P22/thanhvuong-backend-requests.md | NEEDS_RUN | Two sessions on preview editing the same declaration, one delayed response (devtools throttle); assert CAS refusal and projection unchanged |
| SC-24 | re-export/GC/backup restore after audit child/RC/exposure: graph and digests readable, no re-seal | (be) P23/CURRENT_CANDIDATE_AUDIT_502_RESTORE_BROWSER_2026-10-03.md (30/30 renders, 28 GET, migration 094); (be) NONREUSABLE...md (child survives restart + fresh restore); P23/MIXED_LOAD...§7 (151 tables, 83/86; three manifests under Bobby's exception) | NEEDS_RUN | Missing steps: re-export and GC after audit child; browse S01/S09/S10/S11 on the restored DB with the merged bundle. Codex notes the new audit proof postdates the older snapshot's restore |

## P24-T05 — precise state (BLOCKED_EXTERNAL, no PASS)

Note: the lead brief said "two images of the same 1.1.1, PyPI latest". Newer be-gaps
evidence changes that, so both facts are stated.

| Exists (proven) | Source |
|---|---|
| Portal accepts only QuantBT **1.1.1** (native 0.4.2); `QuantBTGateway._module()` rejects other versions; P10 `run-admission.service.ts` binds profiles to `er_quantbt_111`; `research_supervisor.py` enforces the 1.1.1 adapter | (be) P23/SECOND_ENGINE_UPGRADE_AND_HISTORICAL_SCOPE_2026-10-04.md |
| Published inventory 2026-10-03: latest is 1.1.1, no newer release | manifest v2 `published-engine-inventory-20261003.json` (verdict `LATEST_1_1_1_NO_NEWER_RELEASE`) |
| Different image ids for the same 1.1.1 wheel (current python 66cfd8cf vs rollback 1e454b12 vs qualification 7d68b990) | v2/v5 manifests; not two engines |
| A real second **wheel**: QuantBT 1.1.0 (native 0.4.1) on the same 684-row HMD snapshot, equity 20130.193634373325 both, trades 4/4, difference 0/0; run on an isolated qualification-only image 9a14f138 | same SECOND_ENGINE doc; receipt sha256 b6668139... (manifest v5) |
| Owner selected the isolated 1.1.0 -> 1.1.1 route (2026-10-04) | v5 `second_engine_experiment.authority` |

| Missing for P24-T05 / P23 T07/T13 / SC-06 / SC-21 | Who |
|---|---|
| A narrowly qualified 1.1.0 Portal profile/runtime binding in an isolated lane (admission, gateway, supervisor) | Codex implementation |
| An actual old-Portal in-flight run pinned to 1.1.0, then new default 1.1.1, then old reproduction and rollback with readers preserved | Codex run on an isolated cell |
| Bobby's decision to accept a bare-wheel qualification plus Portal transition as "second qualified engine", or an exception through P24-T15 | Bobby |

Do not change the version constant or relabel a 1.1.1 job. This is a Portal
version-dispatch gap, not a QuantBT execution gap. Current disposition stays
**BLOCKED_EXTERNAL / OPEN**.

## Other P24 IDs (for the lead's aggregate view; from V1_ACCEPTANCE.md plus newer be-gaps text)

| ID | Disp. | Note |
|---|---|---|
| T01, T02 | NEEDS_RUN | one exact-candidate import->report->RC journey; scratch/nonpublishable end to end |
| T03, T08, T10, T14 | PASS_REUSED (scoped) | each receipt names its image/code scope (see FE_CANDIDATE_MANIFEST); aggregate over the final candidate still OPEN |
| T04, T06 | NEEDS_RUN | T04 child now exists on be-gaps (R-WFO-020); T06 P22 chain proven, latest-product walk missing |
| T05 | BLOCKED_EXTERNAL | table above |
| T07 | NEEDS_RUN | restored browser exists (be); full byte integrity 83/86 under Bobby's exception for exactly three runs |
| T09, T13 | NEEDS_RUN | FE gate 228/228 on `index-C41KmM2A.js` exists and must be re-run on the merge; no field/action matrix document; Bobby review NOT_VERIFIED |
| T11 | NEEDS_RUN | FND ledger delivered; closure open |
| T12 | NEEDS_RUN | this table: 1/24 closed by retained receipts |
| T15 | OWNER | Bobby disposition on T05 and anything unclosed; no COR invented |

## Suggested run order for the lead (cheapest first)

1. Merge `claude/fe-parity` and `codex/be-gaps`, build once, re-run the 228-cell gate and vitest (also closes the FE half of T09/T13 evidence and SC-01, 09, 17, 18, 20 partially, since the gate loads those screens).
2. One browser script on R-WFO-023/027 (GET only): SC-01, 09, 15 (mount/drag/refresh), 16, 17, 18, 20, 21 (Atlas half), 13, 14 with request-log capture.
3. Needs Bobby's say-so for preview writes: SC-02, 04, 07, 10, 23.
4. Isolated cell only: SC-19 (timeout), SC-24 (GC/re-export), SC-12 (two accounts).
5. Blocked: SC-06 upgrade half, SC-21 new-route half, T05.
