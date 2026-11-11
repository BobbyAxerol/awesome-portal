-- TEST/PREPARATION ONLY. Never apply to a shared DB without separately
-- qualifying its identity, authority, journal, ACL and operational window.
-- Existing closed observations without preimages cannot be reconstructed.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='5s';
LOCK TABLE portal_restore_authority.events IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE existed boolean; attributes text[]; definitions text[]; expected text[]; fk_valid boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid='portal_restore_authority.events'::regclass AND t.tgname='events_immutable'
      AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=58 AND t.tgqual IS NULL
      AND t.tgfoid=pg_catalog.to_regprocedure('portal_restore_authority.immutable_event()')) THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_OBSERVATION_UPGRADE_GUARD_MISSING';
  END IF;
  -- Refuse rather than synthesize evidence for an older committed event.
  IF EXISTS(SELECT 1 FROM portal_restore_authority.events WHERE capture_kind='FROZEN_CLOSED_DB_OBSERVATION') THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_OBSERVATION_UPGRADE_HISTORY_REQUIRES_RECONCILIATION';
  END IF;
  existed := to_regclass('portal_restore_authority.closed_observations') IS NOT NULL;
  IF NOT existed THEN
    CREATE TABLE portal_restore_authority.closed_observations (
      checkpoint_id uuid NOT NULL,
      operation_id uuid NOT NULL,
      observation text NOT NULL CHECK (octet_length(observation) BETWEEN 2 AND 8192),
      PRIMARY KEY(checkpoint_id,operation_id),
      FOREIGN KEY(checkpoint_id,operation_id) REFERENCES portal_restore_authority.events(checkpoint_id,operation_id)
    );
    CREATE TRIGGER closed_observations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_restore_authority.closed_observations
      FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_authority.immutable_event();
    REVOKE ALL ON portal_restore_authority.closed_observations FROM PUBLIC;
  END IF;
  LOCK TABLE portal_restore_authority.closed_observations IN ACCESS EXCLUSIVE MODE;
  CREATE TEMP TABLE v2_expected_closed_observation (
    checkpoint_id uuid NOT NULL, operation_id uuid NOT NULL,
    observation text NOT NULL CHECK (octet_length(observation) BETWEEN 2 AND 8192),
    PRIMARY KEY(checkpoint_id,operation_id)) ON COMMIT DROP;
  SELECT array_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text ORDER BY a.attnum)
    INTO attributes FROM pg_catalog.pg_attribute a WHERE a.attrelid='portal_restore_authority.closed_observations'::regclass
      AND a.attnum>0 AND NOT a.attisdropped;
  SELECT array_agg(pg_catalog.pg_get_constraintdef(c.oid) ORDER BY pg_catalog.pg_get_constraintdef(c.oid)) INTO definitions
    FROM pg_catalog.pg_constraint c WHERE c.conrelid='portal_restore_authority.closed_observations'::regclass AND c.contype IN ('p','c');
  SELECT array_agg(pg_catalog.pg_get_constraintdef(c.oid) ORDER BY pg_catalog.pg_get_constraintdef(c.oid)) INTO expected
    FROM pg_catalog.pg_constraint c WHERE c.conrelid='pg_temp.v2_expected_closed_observation'::regclass AND c.contype IN ('p','c');
  SELECT count(*)=1 AND bool_and(c.convalidated AND NOT c.condeferrable AND c.confrelid='portal_restore_authority.events'::regclass AND
    pg_catalog.pg_get_constraintdef(c.oid)='FOREIGN KEY (checkpoint_id, operation_id) REFERENCES portal_restore_authority.events(checkpoint_id, operation_id)')
    INTO fk_valid FROM pg_catalog.pg_constraint c WHERE c.conrelid='portal_restore_authority.closed_observations'::regclass AND c.contype='f';
  IF attributes IS DISTINCT FROM ARRAY['checkpoint_id:uuid:true','operation_id:uuid:true','observation:text:true'] OR
    definitions IS DISTINCT FROM expected OR fk_valid IS DISTINCT FROM true OR
    (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='portal_restore_authority.closed_observations'::regclass)<>3 OR
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid='portal_restore_authority.closed_observations'::regclass
      AND t.tgname='closed_observations_immutable' AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=58 AND t.tgqual IS NULL
      AND t.tgfoid=pg_catalog.to_regprocedure('portal_restore_authority.immutable_event()')) OR
    EXISTS(SELECT 1 FROM portal_restore_authority.closed_observations) THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_OBSERVATION_UPGRADE_SCHEMA_MISMATCH';
  END IF;
END $$;
COMMIT;
