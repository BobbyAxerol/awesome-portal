-- BE-P16 (Execution Loop V2, ELP2-05/06 financial publication, ELP2-REQ-06-002).
-- Additive: three new tables, no existing column, constraint, writer, view or index changes.
--
-- Private, rebuildable derivation custody for the Manager NAV / NET_PNL series writer. It stores what a
-- retained Manager revision (execution_manager_model_revisions) already says, one observation per
-- (revision, subject, metric, economic partition), so a later revision can state a window of points without
-- re-reading up to 1024 documents of up to 8 MiB. It is NOT a second economic ledger and NOT an authority:
-- every value is the exact decimal sum the Manager reader already derives from SOURCE_VERIFIED facts, or a typed
-- absence (reason_code) when methodology, units, cutoff or fact census do not allow one. Nothing is converted,
-- rebased, interpolated or carried forward.
--
-- Append-only (observations and revision markers). Writers run inside the Manager projection transaction (lease
-- fenced by persistManagerProjection) or in a lease-fenced bounded backfill; both are idempotent on the primary key.
-- Retention follows execution_manager_model_revisions (the FK); there is no automatic delete.
-- Up Migration
CREATE TABLE execution_manager_series_revisions (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  revision text NOT NULL,
  supersedes_revision text,
  source_epoch text NOT NULL,
  projection_generation text NOT NULL,
  as_of_ms bigint NOT NULL CHECK (as_of_ms >= 0),
  qualification text NOT NULL CHECK (qualification IN ('SOURCE_VERIFIED','TEST_ONLY')),
  doc_completeness text NOT NULL CHECK (doc_completeness IN ('COMPLETE','PARTIAL','UNRESOLVED')),
  doc_freshness text NOT NULL CHECK (doc_freshness IN ('FRESH','STALE','UNKNOWN')),
  observation_count integer NOT NULL CHECK (observation_count >= 0 AND observation_count <= 128),
  observation_digest text NOT NULL CHECK (observation_digest ~ '^sha256:[a-f0-9]{64}$'),
  calculation_revision text NOT NULL,
  writer_fencing_token bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,environment,profile_id,revision),
  FOREIGN KEY (workspace_id,environment,profile_id,revision)
    REFERENCES execution_manager_model_revisions(workspace_id,environment,profile_id,revision)
);
CREATE INDEX execution_manager_series_revisions_as_of
  ON execution_manager_series_revisions (workspace_id,environment,profile_id,as_of_ms);

CREATE TABLE execution_manager_series_observations (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  revision text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('portfolio','manager_book')),
  subject_id text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('NAV','NET_PNL')),
  partition_key text NOT NULL CHECK (partition_key ~ '^sha256:[a-f0-9]{64}$'),
  economic_partition jsonb NOT NULL CHECK (jsonb_typeof(economic_partition)='object'),
  population_digest text NOT NULL CHECK (population_digest ~ '^sha256:[a-f0-9]{64}$'),
  as_of_ms bigint NOT NULL CHECK (as_of_ms >= 0),
  point_ts_ms bigint CHECK (point_ts_ms >= 0),
  value text CHECK (value ~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'),
  reason_code text CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  currency text,
  basis text,
  methodology_ref text,
  origin_ms bigint,
  source_confidence text CHECK (source_confidence IN ('VERIFIED','PROVISIONAL','UNKNOWN')),
  input_digest text NOT NULL CHECK (input_digest ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY (workspace_id,environment,profile_id,revision,subject_type,subject_id,metric,partition_key),
  FOREIGN KEY (workspace_id,environment,profile_id,revision)
    REFERENCES execution_manager_series_revisions(workspace_id,environment,profile_id,revision),
  -- A value and a reason are mutually exclusive and one of them is mandatory: an absence never carries a number,
  -- a number never carries a reason, and a value always states the instant it is true at.
  CONSTRAINT execution_manager_series_value_xor_reason CHECK ((value IS NULL) <> (reason_code IS NULL)),
  CONSTRAINT execution_manager_series_value_has_point CHECK (
    (value IS NULL AND point_ts_ms IS NULL AND currency IS NULL AND basis IS NULL AND methodology_ref IS NULL AND source_confidence IS NULL)
    OR (value IS NOT NULL AND point_ts_ms IS NOT NULL AND currency IS NOT NULL AND basis IS NOT NULL
        AND methodology_ref IS NOT NULL AND source_confidence IS NOT NULL))
);
CREATE INDEX execution_manager_series_observations_key
  ON execution_manager_series_observations (workspace_id,environment,profile_id,subject_type,subject_id,metric,partition_key,as_of_ms);

-- One row per scope. Checkpoint of the writer: the newest observed revision (live path), the keyset cursor of the
-- bounded backfill (resume after a restart), the last typed absences (counts per reason, bounded) and the last error.
CREATE TABLE execution_manager_series_checkpoints (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  head_revision text,
  head_as_of_ms bigint CHECK (head_as_of_ms >= 0),
  backfill_state text NOT NULL DEFAULT 'NOT_STARTED' CHECK (backfill_state IN ('NOT_STARTED','IN_PROGRESS','COMPLETE')),
  backfill_cursor_created_at timestamptz,
  backfill_cursor_revision text,
  backfill_processed bigint NOT NULL DEFAULT 0 CHECK (backfill_processed >= 0),
  last_absence_revision text,
  last_absences jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(last_absences)='array' AND jsonb_array_length(last_absences) <= 64),
  last_error_code text CHECK (last_error_code ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  last_error_revision text,
  writer_fencing_token bigint,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id,environment,profile_id),
  CHECK ((backfill_cursor_created_at IS NULL) = (backfill_cursor_revision IS NULL))
);

CREATE FUNCTION execution_manager_series_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'execution manager series observations are append-only' USING ERRCODE = '55000';
  RETURN OLD;
END $$;
CREATE TRIGGER execution_manager_series_revisions_immutable
  BEFORE UPDATE OR DELETE ON execution_manager_series_revisions
  FOR EACH ROW EXECUTE FUNCTION execution_manager_series_reject_mutation();
CREATE TRIGGER execution_manager_series_observations_immutable
  BEFORE UPDATE OR DELETE ON execution_manager_series_observations
  FOR EACH ROW EXECUTE FUNCTION execution_manager_series_reject_mutation();

COMMENT ON TABLE execution_manager_series_revisions IS
  'Rebuildable chain marker per observed Manager revision (even with zero observations) so a window can state gaps; append-only; no authority';
COMMENT ON TABLE execution_manager_series_observations IS
  'Private derivation custody: exact-decimal partition totals of SOURCE_VERIFIED facts or a typed absence; no FX, rebase, interpolation or carry-forward; append-only';
COMMENT ON TABLE execution_manager_series_checkpoints IS
  'Writer checkpoint: live head, bounded-backfill keyset cursor, last typed absences and error; fenced by the Manager consumer lease; not a source checkpoint or ACK';

-- Down Migration
-- Disable the series slot of the Manager runtime and keep these tables: they are derivation custody of retained
-- revisions. No automatic destructive rollback (dropping would silently shorten every published window).
