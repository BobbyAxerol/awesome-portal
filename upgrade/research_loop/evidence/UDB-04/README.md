# UDB-04 — Cross-loop authorization, performance/DR and exact preview

2026-10-11 (Asia/Saigon) · Bobby approved UDB-04 · **ACCEPTANCE_OPEN — NOT_PHASE_PASS**.
Worktree `/home/bobby/portal-research`, shared `docs/research-loop-plan`,
parent runtime `16f2c18ca22c6ff11a016a2f171da5eaf104d2ba`.
Final image and exact Docker COPY-input hash are recorded separately, not
relabeled as a previous failed mixed-load candidate. Delivered backend/auth/
DB recovery does not close the remaining latency/browser gate. The later
combined final-artifact recovery is now proven on its named image, not pending.
Read [report](./phase-report.md), [tests](./test-receipt.md),
[Claude handoff](./handoff.md), [remaining gaps](./debt-register.json) and
[sanitized receipt index](./receipt-index.json).
Follow [Unified UDB-04](../../../UNIFIED_IMPLEMENTATION_PLAN.md#udb-04),
[UDB-03 consumer fixes](../UDB-03/codex-consumer-refinement.md),
[Core/domain isolation](../UDB-02/phase-report.md) and cleanup C4.

## Execution order and protected boundaries

1. Freeze actual runtime/source/config/DDL/image/artifact inputs. Rebuild only
   the preview web via the existing helper from the clean runtime candidate;
   unchanged backend/engine images are pinned and verified, not rebuilt for
   test/documentation-only edits. Preserve current/rollback images and data.
2. T01: owner-anchor Bobby, scoped reviewer/Stan, researcher/read-only,
   disabled/revoked/session-expired principals; Research/Execution/Governance
   direct API and UI, wrong workspace/object/profile, CSRF, idempotency and
   self-approval. Authority mutations/test identities are confined to an owned
   isolated cell; real preview only reads existing RC→R1 and ordinary routes.
3. T02: twenty distinct authenticated readers with concurrent retained
   Execution reads during one real HEAVY child and durable queued intents.
   Research ≤5,000,000,000 bytes; separately classified Execution budget;
   cgroup `memory.current`/peak (including page cache), connection queues,
   whole-host RAM/CPU/IO/disk measured. Keep existing warm summary500ms,
   trial750ms and replay1000ms SLOs. Never generate jobs from read traffic.
4. T03: separate Core/Execution outages/restarts/restores in that same
   isolated candidate; verify artifact bytes and pins, owner/grants/seals/
   publication, cross-domain availability and current auth custody. Restored
   pre-revocation state is not eligible for cutover. Preserve exact historical
   three-manifest disposition and strict denominator; do not invent bytes.
5. T04: real API Research + retained Execution browser at1280/660, keyboard,
   overflow/console, direct link/reload/workspace/export and real existing R1.
   Preserve Claude's UI/components/baselines; source-disabled/fixture/fault
   lanes stay separate. Reuse only unchanged hashes/dependencies, not old
   dirty-image results as candidate acceptance.
6. T05: revoke all owned test sessions, cancel only owned queued intents,
   bounded cell teardown, private backup/evidence retention30days, capacity
   snapshot and exact current/rollback image protection. No broad prune or
   business deletion, no VACUUM FULL.

No frontend redesign, direct Trading System access, Edge renewal, source/SSE/
command activation, remote push, dev/main/stable rollout or signed release.
No old user password reset/global grant change or bootstrap of shared preview.
Any known in-scope FAIL stays open until fixed and retaken; source unsupported
or owner UX decisions get a named disposition, never a fictional PASS.

## Exit

All applicable T01…T05, affected P23/P24 reconciliation, custody and cleanup
must pass. Maximum verdict: **CROSS_LOOP_PREVIEW_READY_FOR_BOBBY_REVIEW**,
not OWNER_ACCEPTED, PRODUCT_ACTIVE, full source-live or release PASS.
Report actual commands/results and reused evidence; board and handoff land
in one coherent normal-hook commit. No unsolicited remote push.
