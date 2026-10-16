-- Up Migration
-- Ephemeral consumer coordination, not identity/economic authority or history.
-- Retain the partition row on release: deleting it could reset a fencing token.
CREATE TABLE execution_manager_consumer_fences (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  holder_id uuid,
  fencing_token bigint NOT NULL CHECK (fencing_token > 0),
  lease_epoch uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  validation_id uuid NOT NULL,
  restore_receipt_ref text,
  PRIMARY KEY (workspace_id,environment,profile_id)
);
CREATE FUNCTION execution_manager_check_consumer_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A lease check at transaction entry alone permits expiry during a write.
  -- The deferred check runs at COMMIT, including callers using the parent
  -- projection transaction rather than the dedicated ACK wrapper.
  IF NOT EXISTS (
    SELECT 1 FROM execution_manager_consumer_fences f
    WHERE f.workspace_id=NEW.workspace_id AND f.environment=NEW.environment AND f.profile_id=NEW.profile_id
      AND f.holder_id=NEW.holder_id AND f.fencing_token=NEW.fencing_token
      AND f.lease_epoch=NEW.lease_epoch AND f.expires_at>clock_timestamp()
  ) THEN RAISE EXCEPTION 'MANAGER_LEASE_LOST'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER execution_manager_consumer_commit_fence
  AFTER UPDATE ON execution_manager_consumer_fences
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.validation_id IS DISTINCT FROM NEW.validation_id)
  EXECUTE FUNCTION execution_manager_check_consumer_fence();
COMMENT ON TABLE execution_manager_consumer_fences IS
  'Manager-only lease/epoch/fencing coordination; DB-clock expiry checked at COMMIT; retain row/token on release; restore requires quiesce and epoch reset receipt';

-- Down Migration
-- Disable the new consumer, preserve heads/revisions and fencing rows. Dropping
-- a live fence would permit stale writers; no destructive automated rollback.
