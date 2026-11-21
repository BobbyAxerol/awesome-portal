# P23 T02 plateau and T12 utility admission checkpoint — 2026-09-30

Scope: owned isolated `portal-research-p23-ol12` cell at `127.0.0.1:8096` only. No dev/production, Trading System source, shared preview, CLI mutation, or original sealed artifact was modified. Candidate `af18707af93e1f017fc3fb6c62778555e03cea8e` was clean; Control API image `sha256:62d13178dd6161bd5c782f4658597ff2ab192daf8f7b4d02a7592b58ec37c003`, Portal API/worker image `sha256:92223a41e4f342e16d8d963d566ba88997f78414ddaf77b53da142a863aa8739`.

## T02 — PASS for the exact plateau test

Source repair `51323644` retires only the terminal child's receipt-bound scratch after durable closeout, keeps lease/fencing, and joins the shielded child task on cancellation. Focused Python tests: 57/57. The clean cell then ran nine actual Advanced WFO jobs in three rounds, each `COMPLETED`, `FAILED` by exact owned child fault, and `CANCELLED` via public API after a real claim. All nine reached non-pending durable terminal materialization; the worker parent start identity remained the same. The harness waited for the natural actor-scoped preflight expiry at 8/8 and renewed only owned test sessions by normal login; it did not edit tokens or raise caps.

- Scratch root: 482 files / 13,792,158 bytes at baseline and after every round; market root remained empty. Original sealed artifact row digest set unchanged.
- Worker FD: 7 at baseline and all three round samples. API FD: 20, 21, 20 at round samples. Worker PSS: 131,735,552 → 139,979,776 bytes, within the 64-MiB plateau allowance.
- Peak sampled aggregate cell memory: 742,678,528 bytes against 5,000,000,000-byte cap; 228 samples.
- Private exact receipt: `/home/bobby/.local/state/portal-research-p23/20260927/runtime/plateau-t02-retake-af18707a.json`, SHA-256 `b3343b09e0e872629f3ab86c8c7fc7fdb8fdbeda643f7ff72167156383958fc0`.

The earlier `OWNER_SESSION_EXPIRED` receipt and the syntax-error first attempt remain historical failures, not overwritten. The accepted retake uses the repaired `plateau-receipt.mjs` and preserves all nine run IDs inside the private receipt.

## T12 — exact current-source WFO audit-reuse profile PASS

Migration 077 and `af18707a` impose one cross-replica transactional utility budget: four active jobs per workspace, two per actor, counting report export, diagnostic and transient verify slots. Existing same-key requests are checked before admission; the slot expires within 30 seconds on process loss and is released exactly on completion. The full Control API hook passed 1,348 tests (one existing skip), including the new unit and migration gates.

The actual isolated HTTP receipt used three authenticated test readers and one completed WFO report. Four export jobs were accepted, the fifth returned typed `RESEARCH_REPORT_ADMISSION_SATURATED` 503, same-key replay returned the original job with 202, and byte verify returned typed `RESEARCH_FREEZE_ADMISSION_SATURATED` 503. The bounded export worker drained those four; verify then returned 200 and the formerly rejected export returned 202. A second drain left zero active exports. Final aggregate memory: 574,881,792 bytes under the 5-GB cap. No source business row or original artifact was deleted.

- Private exact receipt: `/home/bobby/.local/state/portal-research-p23/20260927/runtime/t12-utility-quota-af18707a.json`, SHA-256 `4d2025454833c42ae280ba60554549942f7279b54ddea0e7941a862ff4e13c6b`.
- The prior positive utility receipt was from a different image and was **not** substituted for this candidate. On this same clean candidate a new actual WFO primary and what-if diagnostic both reached `COMPLETED/READY`; two exports reached READY, six byte verifies returned MATCH, the grid became fully evaluated, only the two explicit compute jobs appeared and frozen parent pins stayed identical. Both jobs were simultaneously RUNNING in sampled receipts; 807,170,048-byte peak remained under 5 GB.
- During that primary's RUNNING state, authenticated `GET release-candidate` gave `FINAL_AUDIT_REPLAY=COMPLETE` and `final_audit_run_id` equal to the retained WFO parent. Typed split/stitch returned MATCH. This is the §5.6 **reuse** path: retained selected replay and frozen OOS-generation child of the selected target; no second optimizer or invented audit child. The independent GET-only audit probe had no new job and also passed.
- Private combined receipt: `/home/bobby/.local/state/portal-research-p23/20260927/runtime/t12-audit-overlap-af18707a.json`, SHA-256 `7a48c771de1ddb75cc334043a3c7d6342fe301cd4a301a5fd1498174e4c9de89`. Independent audit-read receipt: `t12-audit-reuse-af18707a.json`, SHA-256 `29296a8c003c1d928ce8ae159f0ec685d651f104e8a4b255f3e33f9101b1ae73`. The earlier combined receipt without the audit read is retained separately, not treated as final.
- T12 is PASS for the currently supported eligible WFO audit-reuse profile with typed quota/backpressure. A non-reusable frozen selection still needs a genuine pinned linked audit child or a typed `NOT_PUBLISHED`; that is **not** silently certified by this receipt. No generic all-profile release claim follows.

Verdict: `T02 PASS`, `T12 current-source eligible WFO reuse PASS`; linked-child case remains a typed source gap. P23/P24 overall `OPEN`. No release or runtime activation claim.
