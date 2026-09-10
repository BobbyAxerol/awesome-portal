-- PHASE 3B (round 2) · a backfill that cannot be run without leaving a trace.
--
-- `FEATURE_EXECUTION_DURABLE_MIRROR` chooses which table history reads come
-- from, and each stack writes only the table its own flag selects. The other
-- one stops at the moment the flag was set — measured on dev 2026-09-10, the
-- unselected table's newest row was 4 days 19 hours old while the selected
-- one was minutes old. Flipping the flag without closing that gap would serve
-- those rows as current.
--
-- Closing it means copying rows between two tables that hold real trading
-- history, so the copy has to be identifiable afterwards: which direction,
-- when it started, whether it finished. A backfill nobody can point at later
-- is indistinguishable from data that was always there.
--
-- The migration adds no worker, route or flag. It creates the place a copy
-- records itself, and the backfill script refuses to copy a single row until
-- this table exists.

CREATE TABLE IF NOT EXISTS execution_backfill_markers (
  marker text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  -- Null while a run is in flight, which is exactly how a partial run is
  -- recognised afterwards.
  finished_at timestamptz,
  source_table text NOT NULL,
  target_table text NOT NULL,
  -- A copy from a table onto itself is a mistake, not a backfill.
  CONSTRAINT execution_backfill_markers_distinct_tables CHECK (source_table <> target_table)
);

COMMENT ON TABLE execution_backfill_markers IS
  'Phase 3B: one row per history backfill run. finished_at null means the run did not complete.';
