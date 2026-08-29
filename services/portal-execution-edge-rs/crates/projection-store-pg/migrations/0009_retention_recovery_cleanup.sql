CREATE TABLE portal_projection.retention_lifecycle_policy_snapshots (
    policy_id UUID PRIMARY KEY,
    workspace_id TEXT NOT NULL
      CHECK (workspace_id <> '' AND workspace_id = btrim(workspace_id)),
    environment TEXT NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
    policy_version TEXT NOT NULL
      CHECK (policy_version <> '' AND policy_version = btrim(policy_version)),
    policy_digest TEXT NOT NULL
      CHECK (policy_digest ~ '^sha256:[0-9a-f]{64}$'),
    hot_window_seconds BIGINT NOT NULL CHECK (hot_window_seconds > 0),
    rollback_window_seconds BIGINT NOT NULL CHECK (rollback_window_seconds > 0),
    storage_budget_bytes BIGINT NOT NULL CHECK (storage_budget_bytes > 0),
    soft_limit_percent SMALLINT NOT NULL CHECK (soft_limit_percent BETWEEN 1 AND 98),
    hard_limit_percent SMALLINT NOT NULL CHECK (hard_limit_percent BETWEEN 2 AND 99),
    max_journal_rows BIGINT NOT NULL CHECK (max_journal_rows > 0),
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (workspace_id, environment, policy_version),
    CHECK (soft_limit_percent < hard_limit_percent)
);

CREATE INDEX idx_retention_lifecycle_policy_latest
    ON portal_projection.retention_lifecycle_policy_snapshots
      (workspace_id, environment, created_at DESC, policy_id DESC);

CREATE TABLE portal_projection.retention_recovery_checkpoints (
    checkpoint_id UUID PRIMARY KEY,
    epoch_id UUID NOT NULL UNIQUE REFERENCES portal_projection.epochs(epoch_id),
    through_journal_ordinal BIGINT NOT NULL CHECK (through_journal_ordinal >= 0),
    through_projection_sequence BIGINT NOT NULL CHECK (through_projection_sequence >= 0),
    state_digest TEXT NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
    archive_digest TEXT NOT NULL CHECK (archive_digest ~ '^sha256:[0-9a-f]{64}$'),
    encryption_key_digest TEXT NOT NULL
      CHECK (encryption_key_digest ~ '^sha256:[0-9a-f]{64}$'),
    archive_verified_at TIMESTAMPTZ NOT NULL,
    restore_verified_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CHECK (restore_verified_at >= archive_verified_at),
    CHECK (created_at >= restore_verified_at)
);

CREATE TABLE portal_projection.retention_cleanup_runs (
    cleanup_run_id UUID PRIMARY KEY,
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id),
    policy_id UUID NOT NULL
      REFERENCES portal_projection.retention_lifecycle_policy_snapshots(policy_id),
    checkpoint_id UUID NOT NULL
      REFERENCES portal_projection.retention_recovery_checkpoints(checkpoint_id),
    status TEXT NOT NULL CHECK (status IN ('PLANNED', 'RUNNING', 'COMPLETED', 'ABORTED')),
    cleanup_not_before TIMESTAMPTZ NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    rows_removed BIGINT NOT NULL DEFAULT 0 CHECK (rows_removed >= 0),
    result_digest TEXT CHECK (
      result_digest IS NULL OR result_digest ~ '^sha256:[0-9a-f]{64}$'
    ),
    UNIQUE (epoch_id, checkpoint_id),
    CHECK (cleanup_not_before >= requested_at),
    CHECK (
      (status = 'PLANNED' AND started_at IS NULL AND completed_at IS NULL)
      OR (status = 'RUNNING' AND started_at IS NOT NULL AND completed_at IS NULL)
      OR (status IN ('COMPLETED', 'ABORTED')
          AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_retention_cleanup_due
    ON portal_projection.retention_cleanup_runs (status, cleanup_not_before)
    WHERE status = 'PLANNED';

CREATE OR REPLACE FUNCTION portal_projection.reject_retention_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'retention policy and recovery evidence are immutable';
END;
$$;

CREATE TRIGGER retention_lifecycle_policy_immutable
    BEFORE UPDATE OR DELETE ON portal_projection.retention_lifecycle_policy_snapshots
    FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_retention_evidence_mutation();

CREATE TRIGGER retention_recovery_checkpoint_immutable
    BEFORE UPDATE OR DELETE ON portal_projection.retention_recovery_checkpoints
    FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_retention_evidence_mutation();

-- Journal, snapshot and D4 failure evidence remains immutable during normal
-- application operation. DELETE is admitted only inside a transaction-scoped,
-- audited cleanup run for an already RETIRED epoch. The retained epoch shell,
-- recovery checkpoint and cleanup audit remain durable after compaction.
CREATE OR REPLACE FUNCTION portal_projection.reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    cleanup_run_text TEXT;
BEGIN
    IF TG_OP = 'DELETE'
       AND TG_TABLE_SCHEMA = 'portal_projection'
       AND TG_TABLE_NAME IN ('event_journal', 'event_journal_default', 'snapshots', 'd4_source_failures')
    THEN
        cleanup_run_text := current_setting('portal_projection.cleanup_run_id', true);
        IF cleanup_run_text IS NOT NULL
           AND cleanup_run_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           AND EXISTS (
             SELECT 1
             FROM portal_projection.retention_cleanup_runs AS cleanup
             JOIN portal_projection.epochs AS epoch USING (epoch_id)
             JOIN portal_projection.retention_recovery_checkpoints AS recovery
               ON recovery.checkpoint_id = cleanup.checkpoint_id
             WHERE cleanup.cleanup_run_id = cleanup_run_text::UUID
               AND cleanup.epoch_id = OLD.epoch_id
               AND cleanup.status = 'RUNNING'
               AND epoch.status = 'RETIRED'
               AND clock_timestamp() >= cleanup.cleanup_not_before
               AND recovery.restore_verified_at IS NOT NULL
           )
        THEN
            RETURN OLD;
        END IF;
    END IF;
    RAISE EXCEPTION 'immutable projection evidence cannot be changed';
END;
$$;

COMMENT ON TABLE portal_projection.retention_recovery_checkpoints IS
  'Immutable encrypted-archive and deterministic-restore proof required before retired epoch cleanup';
COMMENT ON TABLE portal_projection.retention_cleanup_runs IS
  'Audited, rollback-window-gated cleanup authorization; never deletes epoch/recovery/audit shells';
