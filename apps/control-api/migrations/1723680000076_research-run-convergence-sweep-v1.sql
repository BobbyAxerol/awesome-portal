-- E10-O3 (Unified §13.4.1) · let a read converge a workspace nobody opened.
--
-- E10 made convergence read-driven: `ResearchProgressService.reconcile()`
-- settles a lost terminal write and expires an undispatched RETRY_WAIT, and a
-- read of that workspace calls it. A workspace nobody opens therefore keeps a
-- stuck run until somebody does. Control API has no Research worker by design,
-- so the fix is to let one read *repair* further than it *reports*: it also
-- reconciles a small number of other workspaces that have work stuck in them.
--
-- That needs one global question — "which workspaces hold a job that can no
-- longer converge on its own?" — to be answerable without scanning history.
-- Every other Research index leads with `workspace_id`, so dropping the
-- workspace predicate turns the question into a sequential scan. Measured on
-- a disposable PostgreSQL with 200 000 runs across 100 workspaces:
--
--   without this index   parallel Seq Scan on research.jobs, 6 168 buffers, 37 ms
--   with this index      Index Scan, 7 buffers, 0.095 ms
--
-- The index is partial over the five non-terminal job states, so it holds the
-- live queue and not the archive: 16 kB beside a 48 MB `research.jobs` in that
-- same 200 000-run cell. `updated_at` leads it so the sweep reads the oldest
-- candidates first and stops at its LIMIT.
--
-- It is not a claim path. P06 claims by (workspace_id, state, queue_class,
-- retry_not_before, …) through `research_jobs_p06_claim_idx`, which stays the
-- only index that orders a claim.

CREATE INDEX research_jobs_convergence_sweep_v1_idx
  ON research.jobs (updated_at, workspace_id, job_id)
  WHERE state IN ('QUEUED', 'CLAIMED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED');

COMMENT ON INDEX research.research_jobs_convergence_sweep_v1_idx IS
  'E10-O3: bounded global oldest-first lookup of non-terminal Research jobs, so a read can reconcile a workspace nobody opened. Partial over the live queue only; never used to claim work.';

SELECT 1;
-- Integration 2026-09-27: incoming 069 becomes append-only 076 after 075.
-- No deployed ledger is rewritten and the convergence index is unchanged.
