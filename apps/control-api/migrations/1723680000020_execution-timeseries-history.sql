-- P4-D follow-on (owner directive 2026-09-03): the served snapshot is a
-- bounded hot window, but analysis needs the full depth of every time-series
-- row the drain ever accepted. This table is that store: append-only, exact
-- source rows keyed by the relation's own id, ordered by the source (ts, id)
-- serving key. The projection worker fills it as a side effect of the same
-- resumable drain that feeds the snapshot ladder — no second source read.
CREATE TABLE execution_timeseries_history (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  relation_key text NOT NULL,
  row_id text NOT NULL,
  ts timestamptz NOT NULL,
  fields jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id, relation_key, row_id)
);

CREATE INDEX execution_timeseries_history_range_idx
  ON execution_timeseries_history (workspace_id, environment, profile_id, relation_key, ts, row_id);

-- Restart every ladder drain from the head of the source stream so the
-- history store backfills the rows earlier cycles read and discarded.
DELETE FROM execution_profile_relation_cursors;
