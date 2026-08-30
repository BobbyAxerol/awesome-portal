ALTER TABLE portal_projection.entities
  DROP CONSTRAINT entities_entity_kind_check;
ALTER TABLE portal_projection.entities
  ADD CONSTRAINT entities_entity_kind_check CHECK (entity_kind IN (
    'ORDER', 'FILL', 'POSITION', 'EVENT', 'RUNTIME', 'ACCOUNT',
    'BROKER_BINDING', 'RECONCILIATION', 'PERFORMANCE', 'OPERATION'
  ));

CREATE TABLE portal_projection.manager_projection_leases (
    workspace_id TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
    source_scope_id TEXT NOT NULL CHECK (source_scope_id = 'MANAGER_V2'),
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    lease_id UUID NOT NULL UNIQUE,
    owner_digest TEXT NOT NULL CHECK (owner_digest ~ '^sha256:[0-9a-f]{64}$'),
    fencing_token BIGINT NOT NULL CHECK (fencing_token > 0),
    acquired_at TIMESTAMPTZ NOT NULL,
    renewed_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (workspace_id, environment, source_scope_id),
    CHECK (expires_at > acquired_at),
    CHECK (renewed_at >= acquired_at),
    CHECK (updated_at >= acquired_at)
);
CREATE INDEX idx_manager_projection_lease_expiry
  ON portal_projection.manager_projection_leases (expires_at);

CREATE TABLE portal_projection.manager_projection_commits (
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL,
    cycle_id TEXT NOT NULL,
    profile_id TEXT NOT NULL CHECK (profile_id IN (
      'PAPER_BINANCE_USDM', 'SANDBOX_BINANCE_USDM', 'LIVE_BINANCE_USDM'
    )),
    entity_kind TEXT NOT NULL CHECK (entity_kind IN (
      'ORDER', 'FILL', 'POSITION', 'EVENT', 'RUNTIME', 'ACCOUNT',
      'RECONCILIATION', 'PERFORMANCE'
    )),
    source_input_digest TEXT NOT NULL CHECK (source_input_digest ~ '^sha256:[0-9a-f]{64}$'),
    catalogue_digest TEXT NOT NULL CHECK (catalogue_digest ~ '^sha256:[0-9a-f]{64}$'),
    fencing_token BIGINT NOT NULL CHECK (fencing_token > 0),
    expected_count BIGINT NOT NULL CHECK (expected_count >= 0),
    applied_count BIGINT NOT NULL CHECK (applied_count >= 0),
    removed_count BIGINT NOT NULL CHECK (removed_count >= 0),
    source_read_at TIMESTAMPTZ NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL,
    state_digest TEXT NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
    PRIMARY KEY (epoch_id, snapshot_id)
);
CREATE INDEX idx_manager_projection_commits_cycle
  ON portal_projection.manager_projection_commits (epoch_id, cycle_id, entity_kind);

CREATE TABLE portal_projection.manager_projection_cycles (
    epoch_id UUID NOT NULL REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    cycle_id TEXT NOT NULL,
    profile_id TEXT NOT NULL CHECK (profile_id IN (
      'PAPER_BINANCE_USDM', 'SANDBOX_BINANCE_USDM', 'LIVE_BINANCE_USDM'
    )),
    catalogue_digest TEXT NOT NULL CHECK (catalogue_digest ~ '^sha256:[0-9a-f]{64}$'),
    source_input_digest TEXT NOT NULL CHECK (source_input_digest ~ '^sha256:[0-9a-f]{64}$'),
    feed_count INTEGER NOT NULL CHECK (feed_count = 12),
    snapshot_count INTEGER NOT NULL CHECK (snapshot_count = 8),
    record_count BIGINT NOT NULL CHECK (record_count >= 0 AND record_count <= 80000),
    source_read_at TIMESTAMPTZ NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL,
    state_digest TEXT NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
    PRIMARY KEY (epoch_id, cycle_id)
);
CREATE INDEX idx_manager_projection_cycles_latest
  ON portal_projection.manager_projection_cycles (epoch_id, committed_at DESC);

COMMENT ON TABLE portal_projection.manager_projection_leases IS
  'N24 singleton Manager-v2 projection lease for Paper, Sandbox and Live; database time and fencing are authoritative';
COMMENT ON TABLE portal_projection.manager_projection_commits IS
  'Immutable per-entity-kind N24 snapshot commit evidence; source opaque keys and credentials are forbidden';
COMMENT ON TABLE portal_projection.manager_projection_cycles IS
  'Immutable complete N24 cycle receipt used for parity cutover, restart and restore evidence';

-- Extend the N05 audited cleanup aperture to N24 immutable evidence. Normal
-- UPDATE/DELETE remains forbidden; only a running, restore-verified cleanup
-- for a RETIRED epoch may compact these rows.
CREATE OR REPLACE FUNCTION portal_projection.reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    cleanup_run_text TEXT;
BEGIN
    IF TG_OP = 'DELETE'
       AND TG_TABLE_SCHEMA = 'portal_projection'
       AND TG_TABLE_NAME IN (
         'event_journal', 'event_journal_default', 'snapshots',
         'd4_source_failures', 'manager_projection_commits',
         'manager_projection_cycles'
       )
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

CREATE TRIGGER manager_projection_commits_immutable
  BEFORE UPDATE OR DELETE ON portal_projection.manager_projection_commits
  FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_immutable_change();
CREATE TRIGGER manager_projection_cycles_immutable
  BEFORE UPDATE OR DELETE ON portal_projection.manager_projection_cycles
  FOR EACH ROW EXECUTE FUNCTION portal_projection.reject_immutable_change();
