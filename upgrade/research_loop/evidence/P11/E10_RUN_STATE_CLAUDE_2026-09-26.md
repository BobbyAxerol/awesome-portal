# E10 — run state that is wrong or stuck (Claude, 2026-09-26)

Unified §13.4.1 E10 · audit rows 01-3, 01-5, 03-4 of
[`HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`](../HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md) · backend ≤P21
(P06/P11/P12), Claude. No P22/P23 service and no Codex migration was touched. Migration used:
**066** (064/065 were taken; 067–069 stay free).

Branch `fix/research-e10-run-state`, from `origin/docs/research-loop-plan` @ `396b6450`. Not pushed.

## What the preview showed (read-only, `:8095`, 2026-09-26)

| Run | Library | Screen 03 | Job | Attempt | Journal head |
|---|---|---|---|---|---|
| `rrun_0df059…` (WFO) | QUEUED | FINISHING, "terminal record is still being written" | `RETRY_WAIT`, retry due 2026-09-24 17:00 | 1 · `LOST_LEASE` (lapsed 16:38:31) | `run_completed` seq 26, received 16:37:06, `mandatory: SEALED`, no RS-01 checkpoint |
| `rrun_6f9ffea1…` (P04) | QUEUED | RUNNING | `RETRY_WAIT`, due 2026-09-23 12:22 | 1 · `LOST_LEASE` | S4 RUNNING |
| `rrun_9c3f2081…`, `rrun_9bd48dd9…` | QUEUED | QUEUED | `RETRY_WAIT`, due 2026-09-23 11:41 | 1 · `LOST_LEASE` | none |

`may_cancel` was `false` on all four. Every FAILED card had no red stage; `failed at` was a timestamp.

## Root cause

1. **Two derivations of one status.** The library view (migration 045) mapped the P06 job state
   only (`RETRY_WAIT` → QUEUED). Run Progress (`progress.service.ts`) put the RS-01 checkpoint
   first (pending → FINISHING), then the *previous attempt's* snapshot (`RETRY_WAIT` + RUNNING
   snapshot → RUNNING). Same run, two answers.
2. **The terminal write was lost and nothing could converge it.** `rrun_0df059…` was a W1 WFO run.
   Its `run_completed` was journaled first (by design), then the P04-lane report sidecar refused
   it — the bug the comment in `ingest` already records ("seen on the W1 preview with REPORTS
   on"). The relay retried until the lease lapsed. The next claim's lease sweep then scheduled a
   **retry of a sealed compute** (`RETRY_WAIT`); after that, `resolveIngress` fences every
   redelivery (no current attempt), so the checkpoint can never be written.
3. **Nothing dispatches a retry.** P10 dispatches a job once, at create
   (`claimNextDurableJob(jobId)`); no worker pool claims `RETRY_WAIT`. So every lost lease became a
   run that waits forever — P11's own contract (CG-P11-07) says there is no in-place retry.
4. **Cancel** was `ADMIN` only and only for `QUEUED/CLAIMED/RUNNING`, so a `RETRY_WAIT` run could
   not be stopped by anyone.
5. **Where a run failed** was never derived: the library refused to project a run failure onto a
   stage, and Run Progress published none.

## Fix

| # | Change | Where |
|---|---|---|
| 1 | `research.run_lifecycle_status_v1(...)` — one pure SQL function over job state, snapshot status, head journal event and RS-01 checkpoint. The library view and the progress read both call it; `effectiveStatus()` in TS now only validates its output. The library keeps its coarser vocabulary (FINISHING → RUNNING; HiFi S01 draws COMPLETED/RUNNING/FAILED) and gains `lifecycle_status`, `job_terminal_reason`, `source_terminal`. `RETRY_WAIT` reads QUEUED in both. | migration 066, `progress.repository.ts` |
| 2 | Lease recovery never retries an attempt that journaled `run_completed`/`run_failed`. | `repository.ts` `recoverExpiredDurableJobsInTransaction` |
| 3 | A lost terminal write converges: `ResearchProgressService.reconcile()` finds it (head event terminal, no checkpoint, lease gone or job moved on, journal ≥30 s old), rebuilds the ingress from durable rows only (journal event, snapshot, persisted evidence/split receipts), replays the same sidecars as `ingest`, then **finalizes** it (`settleJournaledTerminal`, fenced on expired lease / latest attempt; cancellation wins) — or **fails** it with `P11_TERMINAL_SIDECAR_FAILED` / `P11_TERMINAL_SIDECAR_PAYLOAD_LOST` — and writes the checkpoint and fans out. | `progress.service.ts`, `progress.repository.ts` `strandedTerminals`, `repository.ts` |
| 4 | An overdue `RETRY_WAIT` (300 s past `retry_not_before`, no journaled terminal) is **expired**, not redispatched: FAILED with `P06_RETRY_NOT_DISPATCHED: …`. Reason: P10 has no retry dispatcher and CG-P11-07 publishes no in-place retry (`may_retry: false`, new run from the requested spec). | `repository.ts` `expireOverdueRetryWait`, `run-state.ts` |
| 5 | Control API has no worker by design, so reads drive convergence: the progress read and the Run Library list call `reconcileBestEffort` (≤ once / 10 s / workspace / process, never throws). The claim path's lease sweep still runs as before. | `progress.service.ts`, `run-library.controller.ts` |
| 6 | The run's owner (its requester) or an ADMIN may cancel any non-terminal run: `QUEUED`, `CLAIMED`, `RUNNING`, `RETRY_WAIT`, `CANCEL_REQUESTED`. A `RETRY_WAIT` cancel is immediate (`CANCELLED`). | `progress.service.ts` |
| 7 | Where and why a FAILED run failed, one derivation (`run-state.ts failedAt`): P11 read gains `current.failed_at {stage, fold, basis}` and `current.terminal_reason {code, message, origin}` (additive, OpenAPI + regenerated d.ts + canonical fixture). P12 marks the stopping stage `blocked` (existing enum, HiFi red), `FAILED_AT` = `fold N · Sk`, `FAILURE_REASON` falls back to the typed control code. | `progress.service.ts`, `run-library.service.ts`, `packages/contracts/**` |
| 8 | S03: the failing stage pill is red with ✕ and a reason title; the failure line shows the control reason when the source reported none. S01: no code change — `blocked` already renders red. | `RunProgress.tsx` |

After a deploy of this branch, the first read of the preview workspace settles all four runs:
`rrun_0df059…` → **COMPLETED** (WFO: its report is best-effort, no evidence/split receipt is
named, the seal is present); `rrun_6f9ffea1…`, `rrun_9c3f2081…`, `rrun_9bd48dd9…` → **FAILED**,
`P06_RETRY_NOT_DISPATCHED`. This is a prediction from the code and the read-only data, not a
receipt: the preview was not written to.

## Tests (exact)

| Gate | Result |
|---|---|
| P11 disposable PostgreSQL (`test-p11-postgres.sh`) | **17/17** (13 before + E10-01…04) |
| P06 PostgreSQL | 11/11 |
| P10 PostgreSQL | 5/5 |
| P12 PostgreSQL | 10/10 (fixture now carries the terminal event + checkpoint a completed P10 run has) |
| P13 / P14 / P15 / P16 / P17 | 5 pass + 12 skip / 1 + 16 skip / 1 + 16 skip / 1 + 16 skip / 1 + 16 skip |
| RS-02 / RS-03 PostgreSQL | 9/9 / 3/3 |
| control-api unit (progress rs01/w2/controller/contract, library service/controller/contract/metric-flow) | **49/49** |
| control-api DB-backed (lineage, compare, current-source ×6, x2, rs01-migration, progress-repo, w5b) | 102/102 (commit 1), 38/38 re-run after commit 2 |
| `packages/contracts` vitest | **191/191**; `snapshot.py --check` 216/216 |
| frontend `src/research` vitest | **42 files / 1293 tests** |
| frontend `tsc --noEmit` | 0 errors in Portal sources (pre-existing `features/roadmap-task-board` module errors only) |
| pre-commit hook (`verify-workspace.sh`) | exit 0 on both code commits |

Not run: visual baseline (S03 pill colour only changes on a FAILED run; no baseline shot is a
FAILED S03), a real-API receipt on the preview (read-only; needs a rebuild — OL-23).

## Left open

| # | Item | Owner |
|---|---|---|
| E10-O1 | Rebuild the preview from this branch (migration 066) and take a real-API receipt that the four runs above converge; the preview is read-only for this task. Fold into OL-23. | Claude, needs Bobby's go to write the preview |
| E10-O2 | Redispatch instead of expire, if Bobby wants retries: needs a retry dispatcher (claim `RETRY_WAIT` + signed Portal hop with the new lease) and a decision that a lost lease is retried rather than failed. Today's contract (CG-P11-07) says fail closed. | Bobby decides; then Claude (P06/P10) |
| E10-O3 | Convergence is read-driven. A workspace nobody opens keeps a stuck run until the next read or claim. A periodic sweep needs a worker, which Control API deliberately has none of. | Bobby (ops) if wanted |
| E10-O4 | The library still has no FINISHING in its published enum (it reads RUNNING). Publishing FINISHING there touches the library, compare, lineage and evidence contracts. | Bobby decides |
| E10-O5 | S03 shows Cancel when `may_cancel && live`; it stays hidden once the source reported a terminal frame (a FINISHING run), which `reconcile` now settles instead. No FE change was needed for owner cancel. | — (note only) |

## Commits

| Commit | What | Files | +/− |
|---|---|---|---|
| `41fac511` | one lifecycle status (migration 066), settle lost terminal writes, expire undispatched retries, owner cancel | 10 | +1105 / −32 |
| `7c522e2b` | `failed_at` / `terminal_reason` contract + fixture, P12 `blocked` trail and `failed at`, S03 red stage | 14 | +356 / −29 |

Both code commits passed the pre-commit hook (`verify-workspace.sh`, exit 0).
