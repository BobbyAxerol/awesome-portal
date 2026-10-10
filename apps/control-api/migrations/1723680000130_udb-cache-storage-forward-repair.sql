-- Up Migration
-- UDB-01: 129 was once shipped without an Up marker. Repair its actual DDL
-- through an append-only migration, never by rewriting the applied ledger.
-- Only this recomputable cache is unlogged; identity/evidence/history stay WAL-backed.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.execution_shared_read_cache SET UNLOGGED;
ALTER TABLE public.execution_shared_read_cache SET (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 5000,
  autovacuum_vacuum_cost_limit = 2000,
  toast.autovacuum_vacuum_scale_factor = 0,
  toast.autovacuum_vacuum_threshold = 5000,
  toast.autovacuum_vacuum_cost_limit = 2000
);

-- Down Migration
-- Intentionally preserve 129's already-established storage policy. Rollback
-- is an image/config rollback, not a downgrade of the cache or business data.
SELECT 1;
