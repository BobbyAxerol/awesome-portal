-- Up Migration
-- The N21 shared-read cache is recomputable and rewritten every refresh. It does not need WAL, and its default autovacuum
-- thresholds (20% of a table that is always nearly empty) let dead TOAST pile up to 92 GB. Trigger on absolute dead
-- tuples instead, for the table and its TOAST relation alike.
ALTER TABLE execution_shared_read_cache SET UNLOGGED;
ALTER TABLE execution_shared_read_cache SET (
  autovacuum_vacuum_scale_factor = 0, autovacuum_vacuum_threshold = 5000, autovacuum_vacuum_cost_limit = 2000,
  toast.autovacuum_vacuum_scale_factor = 0, toast.autovacuum_vacuum_threshold = 5000, toast.autovacuum_vacuum_cost_limit = 2000
);

-- Down Migration
ALTER TABLE execution_shared_read_cache RESET (
  autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold, autovacuum_vacuum_cost_limit,
  toast.autovacuum_vacuum_scale_factor, toast.autovacuum_vacuum_threshold, toast.autovacuum_vacuum_cost_limit
);
ALTER TABLE execution_shared_read_cache SET LOGGED;
