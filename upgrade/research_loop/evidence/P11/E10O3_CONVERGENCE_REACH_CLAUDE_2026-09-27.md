# E10-O3 — convergence reaches a workspace nobody opens (Claude, 2026-09-27)

Unified §13.4.1 E10, open item **E10-O3** of
[`E10_RUN_STATE_CLAUDE_2026-09-26.md`](E10_RUN_STATE_CLAUDE_2026-09-26.md) · backend ≤P21
(P06/P11), Claude. No P22/P23 service was touched. Migration used: **069** (064–068 were
taken or reserved; ≥070 stays Codex's).

Branch `feat/e10-o3-convergence-reach`, from `origin/docs/research-loop-plan` @ `05f0d6a0`.
Not pushed.

## The hole

E10 built the convergence: `ResearchProgressService.reconcile()` settles a lost terminal write
(or fails it with a typed reason) and expires an overdue `RETRY_WAIT` as
`P06_RETRY_NOT_DISPATCHED`. It is driven by reads — the progress read and the Run Library list
call `reconcileBestEffort` (≤ once / 10 s / workspace / process) — and by the P06 claim path's
lease sweep. **Nobody reads that workspace ⇒ nothing converges.** The decision (Bobby) was: no
worker. So the question is whether a read can *repair* further than it *reports*.

## What I measured

### 1. The claim path cannot carry it

`recoverExpiredDurableJobsInTransaction` (`repository.ts:3438`) filters `WHERE j.workspace_id = $1`,
and `claimNextDurableJob` is only reached from run *create* in that same workspace (P10 dispatches
once, at create). So the lease sweep fires in workspace A only when somebody creates a run in
workspace A. It has no reach into B. **Dead.**

### 2. There is no RLS — the `WHERE` clause is the whole boundary

No `ENABLE ROW LEVEL SECURITY` and no `CREATE POLICY` exists in any of the 68 migrations (67 before
this change), and
`research.workspace_id` / `research.actor_user_id` are set as session variables that nothing reads.
Workspace scoping is entirely the SQL predicate plus, for writes,
`ResearchMetadataRepository.withScopedTransaction`'s `workspace_members` check
(`repository.ts:5055`). So a global query is *possible*; a global **write** still needs an identity
that is a member of the target workspace.

### 3. A global stranded-terminal query is an unbounded scan — with evidence

Every index on the Research tables leads with `workspace_id`, and
`research.run_progress_snapshots` has exactly one (`(workspace_id, run_id, received_at DESC)`).
Disposable PostgreSQL 16, real migrations, **200 000 runs across 100 workspaces**, history spread
over 83 days, exactly one genuinely stranded run, one healthy long-running job with a live lease,
one permanently-QUEUED job. `EXPLAIN (ANALYZE, BUFFERS)`:

| | query | plan | buffers | time |
|---|---|---|---|---|
| A | stranded, workspace-scoped (E10 today) | bitmap index scans over that workspace's 2 000 terminal events | 32 146 | **43.7 ms** |
| B | stranded, **global**, no new index | Parallel Seq Scan on `run_progress_events` **and** on `run_progress_snapshots`, 200 000 loops above them | **3 208 756** | **4 715.6 ms** |
| F | B + a 7-day recency window | event side shrinks to 16 700; **still** Parallel Seq Scan on `run_progress_snapshots` (200 000 rows) | 275 918 | **319.2 ms** |
| H | F + a dedicated partial index on terminal events (1 352 kB) | index used on events; **still** Parallel Seq Scan on `run_progress_snapshots` | 271 894 | **283.9 ms** |
| C | overdue `RETRY_WAIT`, workspace-scoped | `research_jobs_p06_claim_idx` | 6 | 0.149 ms |
| D | overdue `RETRY_WAIT`, **global**, no new index | same index, still an Index Scan | **6** | **0.125 ms** |
| E | sweep discovery, global, no new index | Parallel Seq Scan on `research.jobs` | 6 168 | 37.3 ms |
| G | sweep discovery, global, **+ migration 069** | Index Scan, oldest-first, stops at LIMIT | **7** | **0.095 ms** |

Reading B/F/H: the stranded-terminal predicate is a LEFT JOIN anti-condition between the journal
and the RS-01 checkpoint, joined to the snapshot that names the head sequence. No index bounds an
anti-join, and `run_progress_snapshots` has no global index at all, so a recency window and a
dedicated terminal-event index together only shrink the *event* side — PostgreSQL still sequentially
scans all 200 000 snapshot rows, and would scan all of them at a million too.
**A global stranded-terminal query cannot be made bounded**, and that is why the chosen design does
not contain one.

Reading D/G: the *workspace-level* question is cheap. `research.jobs` already has a partial index
over three non-terminal states, and 069 extends that idea to all five with `updated_at` leading, so
the sweep reads oldest-first and stops. Its size is O(live queue), not O(history): **16 kB beside a
48 MB `research.jobs`** in that same 200 000-run cell.

### 4. "Reconcile the workspaces the caller is a member of" buys nothing here

Read (not written) from the two live databases: the preview
(`portal-research-preview-portal-postgres-1`) is the only one with a `research` schema at all, and
it has **2 workspaces, 1 member each, no user in more than one**. Dev (`portal-portal-postgres-1`)
has **6 workspaces, 3 of them with no members at all**, and the largest membership is 2 workspaces
for one user. So a membership-bounded widening reaches **zero** extra workspaces on the only
environment that holds Research data, and by construction can never reach a workspace whose members
never log in. Rejected.

### 5. `/readyz` is a real periodic caller — and the wrong place

`compose.yaml:222` and `deploy/compose.production.yaml:197` both run
`GET /api/control/readyz` every **10 s**, `timeout 5s`, `retries 6`. It is genuinely periodic on
every deployment. It is also unauthenticated, and a sweep that takes over 5 s six times running
would mark Control API unhealthy and restart it — a worse failure than the bug. Rejected, recorded.

Worth recording alongside it: **Control API is not worker-free as a process.**
`ExecutionProfileProjectionWorker` and `ExecutionSharedReadCacheMaintenanceWorker` both implement
`OnApplicationBootstrap` and self-schedule. "No worker" is a *Research* design rule (P06/P11), not a
fact about the service. The decision not to add one stands; the premise is narrower than it reads.

### 6. The preview no longer holds the four E10 runs

`:8095` now runs `local/portal-research-preview-control-api:rf02` (rebuilt 59 minutes before this
read), not `c81e8dc2`. Its database has 47 runs / 47 jobs / 40 terminal checkpoints across 2
workspaces, **zero** `RETRY_WAIT` and **zero** stranded terminals. Nothing was written to it; this
is a read. E10-O1 still needs its own receipt on a preview built from that branch.

## What I chose

**A read repairs further than it reports.** After `reconcileBestEffort` converges the workspace
being read, it asks one bounded global question — "which workspaces hold a job that can no longer
converge on its own?" — and runs the *existing, unchanged* per-workspace `reconcile()` on at most
two of them.

| Piece | Where |
|---|---|
| `research_jobs_convergence_sweep_v1_idx` — partial over the five non-terminal job states, `updated_at` leading | migration 069 |
| `workspacesPendingConvergence(actor, idleSeconds, limit)` — the one query that crosses a workspace boundary; returns `{workspaceId, actorUserId}` and nothing else | `progress.repository.ts` |
| `withSweepTransaction` — read-only, same role and same statement/lock/idle budgets as every Research read, session `research.workspace_id = '*'` so a global sweep is distinguishable from a workspace read in `pg_stat_activity` | `progress.repository.ts` |
| `reconcileBestEffort` split into `reconcileWorkspaceBestEffort` (E10's rule, unchanged) + `sweepPendingWorkspacesBestEffort` | `progress.service.ts` |

Why this shape and not the others:

- It contains **no global stranded-terminal query** — measurement 3 says that cannot be bounded.
  Instead the global question is only *which workspace*, and the already-bounded per-workspace
  `reconcile()` (16 stranded + 32 retry-wait + the lease sweep) does the finding. Once a workspace
  is named for any reason, every stranded terminal in it is settled, not just the one that named it.
- It manufactures **no identity**. Each swept workspace is reconciled as
  `jobs.requested_by_user_id` — the account that asked for that work, a member by construction, and
  the same class of identity `settleStranded` already uses (the producer's `actor_user_id`). If that
  account has since left, `withScopedTransaction`'s membership check refuses the write and the sweep
  skips that workspace. Fail closed, proven by E10-O3-03.
- It adds **no process**. Nothing is scheduled; a read triggers it or it does not happen.

### The bound, exactly

| Budget | Value | Why |
|---|---|---|
| Global question per process | ≤ 1 / **60 s** (`SWEEP_INTERVAL_MS`) | measured at 7 buffers / 0.095 ms |
| Rows it may return | **64** (`SWEEP_CANDIDATE_LIMIT`) | hard `LIMIT` on an ordered index scan; deduplicated by workspace in TS so the batch can rotate |
| Workspaces reconciled per tick | **2** (`SWEEP_WORKSPACE_BATCH`) | one read never pays for many; worst case ≈ 2 × 44 ms added to one read per minute |
| Same workspace, re-swept | ≤ 1 / **300 s** (`SWEEP_WORKSPACE_COOLDOWN_MS`) | read from the same per-workspace clock, so the sweep rotates instead of re-picking the oldest |
| Job idleness before a workspace is a candidate | **300 s** = `RETRY_WAIT_DISPATCH_GRACE_SECONDS` | an existing constant, not a new number: past it, the P06 contract says nothing would have claimed it |
| E10's own per-workspace rule | **unchanged**, ≤ 1 / 10 s / workspace / process | `reconcileWorkspaceBestEffort(scope, RECONCILE_INTERVAL_MS)` |
| Per-workspace clock size | cleared whole above **512** entries | it is a throttle cache; losing it fails safe toward reconciling again |

A live lease is excluded (`wa.expires_at > now()`): P06 heartbeats extend the *attempt* row and
never touch `jobs.updated_at`, so without that predicate every long healthy run would look stuck.
E10-O3-01 pins exactly that.

### What it does not change

The sweep returns `void`, writes no response field, and is wrapped so nothing throws into the read
path (`reconcileBestEffort`'s existing contract). E10-O3-01 asserts that the run it repaired in
another workspace is still `RESEARCH_PROGRESS_NOT_FOUND` from the reading workspace, before and
after. Only timing changes: one read per minute per process does up to two extra reconciles.

## Tests (exact)

| Gate | Command | Result |
|---|---|---|
| P11 disposable PostgreSQL | `scripts/research-loop-v11/test-p11-postgres.sh` | **20/20** (17 before + E10-O3-01…03), exit 0 |
| P10 disposable PostgreSQL | `test-p10-postgres.sh` | 5/5, exit 0 |
| P06 disposable PostgreSQL | `test-p06-postgres.sh` | 10/11 — `V11-P06-DR` fails in this worktree only: it shells out to `apps/portal/.venv`, which this worktree does not have, and the shared one holds `quantbt-engine 1.0.8` against an expected `1.1.1`. Environmental, not a code failure; the pre-commit hook runs it with the right cell. |
| P12 disposable PostgreSQL | `test-p12-postgres.sh` | 9/10 — **pre-existing at `05f0d6a0`**: re-ran the same lane with my working tree stashed and got the identical `CG-P12-02/03/04/09` failure (an unexpected `lane: "PORTAL_PERSISTED_RESEARCH"` in `sparkline.source`). Not mine. |
| control-api unit (progress rs01 / w2 / controller / contract, library controller / contract / metric-flow) | `vitest run test/research-progress-*.spec.ts test/research-run-library.{controller,contract,metric-flow}.spec.ts` | **42/42** |
| control-api DB-backed run-library service | `vitest run test/research-run-library.service.spec.ts` | **17/17** |
| `tsc --noEmit` (control-api) | — | **0 new errors**: 102 before my change, 102 after, all in `test/**`, none in `src/**` (measured by stashing) |
| migration 069 applies | disposable cell, all 68 migrations | index created with the exact partial definition; planner picks it |
| Scale measurement | disposable cell, 200 000 runs / 100 workspaces | table above |
| **pre-commit hook** (`scripts/verify-workspace.sh`, not bypassed) | the code commit | **exit 0** — "Portal monorepo verification passed". Inside it: control-api CI cell **1 248 passed / 1 skipped (1 249)** over 158 files, `packages/contracts` **191/191**, migration history append-only over 85 protected files. |

Not run here: the frontend suites and the visual baseline (no frontend file changed), and a real-API
receipt on the preview (read-only — E10-O1).

## Residual risk, in plain words

1. **A workspace still converges late, not immediately.** The sweep reaches at most 2 workspaces
   per minute per process, and only when somebody reads *something*. A deployment with 10
   workspaces converges every stuck one within about 5 minutes of any read anywhere; 100 workspaces
   takes about 50 minutes. It is not a worker and does not pretend to be one. If Research ever grows
   past a few dozen workspaces with long idle periods, this bound is the thing that will need
   revisiting — raise `SWEEP_WORKSPACE_BATCH`, or accept a worker.
2. **Nobody reads anything, anywhere ⇒ nothing converges.** This narrows E10-O3 from "per workspace"
   to "per deployment", it does not close it. A Portal with no traffic at all still keeps stuck runs.
   The honest floor without a scheduler.
3. **A stranded terminal whose job already closed (`SUCCEEDED`/`FAILED` with no RS-01 checkpoint) is
   the one shape the global discovery cannot name by itself** — it is not in the live-queue index,
   and measurement 3 says finding it globally is unbounded. It is still settled whenever that
   workspace is swept or read for any other reason, and it holds no queue slot. It reads FINISHING
   until then.
4. **A workspace whose stuck work is owned by a departed account is skipped by the sweep.** That is
   deliberate (the write boundary is real), but it means such a workspace converges only when a
   current member reads it. A future option, if it matters: resolve a current member instead of the
   requester — that is a policy decision about whose identity performs a repair, so it is Bobby's.
5. **If Research ever gains row-level security keyed on `research.workspace_id`, the sweep stops
   working** — its session sets `'*'`, which no policy would match, so the discovery would return
   nothing and every workspace would go back to converging only on its own reads. That is a safe
   failure (no leak, no error), but it is silent, so whoever adds the first policy has to decide
   what a global sweep is allowed to see.
6. **Migration 069 lands before 068.** 068 is reserved for Codex and does not exist on this branch.
   On any database where 069 has already run, a later-merged 068 will be applied after it — harmless
   for an index-only migration, but it is the same ordering hazard recorded for preview databases.

## Left open

| # | Item | Owner |
|---|---|---|
| E10-O1 | Unchanged: rebuild a preview from this branch and take a real-API receipt. The four runs E10 predicted are no longer on `:8095` (it was rebuilt as `rf02` with a clean dataset), so that receipt now has to be produced from a fresh strand, not found. | Claude, needs Bobby's go |
| E10-O2 | Unchanged: redispatch instead of expire, if retries are wanted. | Bobby decides |
| E10-O3 | **Closed to the bound above.** Residual risks 1–6 are the remainder; risk 1 is the one with a number on it. | — |
| E10-O3a | If Research grows past ~30 workspaces, re-measure risk 1 and decide between a bigger batch and a worker. | Bobby, when it matters |

## Commits

| Commit | What | Files | +/− |
|---|---|---|---|
| `473ac849` | E10-O3 bounded global convergence sweep — migration 069, `workspacesPendingConvergence` + `withSweepTransaction`, the sweep budgets in `progress.service.ts`, and P11 E10-O3-01…03 | 4 | +334 / −2 |
| _(this record)_ | the measurement, the options weighed, the bound, the residual risk | 1 | — |

Both passed the pre-commit hook (`verify-workspace.sh`, exit 0). Not pushed.
