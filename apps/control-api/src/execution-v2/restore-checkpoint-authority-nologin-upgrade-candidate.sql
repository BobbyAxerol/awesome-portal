-- TEST/PREPARATION ONLY. This is not a Portal migration or restore permit.
-- The operator must independently pin the authority cluster and validate its
-- journal, role/ACL and source identity, and quiesce writers before using a
-- reviewed upgrade. This script does not prove those external prerequisites.
-- A lock timeout, unexpected old CHECK or missing immutable guard rolls back
-- the entire change. Exact reapplication is safe after a lost response.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='5s';
LOCK TABLE portal_restore_authority.events IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE v2_upgrade_expected_old (capture_kind text NOT NULL CHECK
  (capture_kind IN ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE'))) ON COMMIT DROP;
CREATE TEMP TABLE v2_upgrade_expected_new (capture_kind text NOT NULL CHECK
  (capture_kind IN ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE','FROZEN_NOLOGIN_SOURCE_OBSERVATION','FROZEN_CLOSED_DB_OBSERVATION'))) ON COMMIT DROP;
CREATE TEMP TABLE v2_upgrade_expected_intermediate (capture_kind text NOT NULL CHECK
  (capture_kind IN ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE','FROZEN_NOLOGIN_SOURCE_OBSERVATION'))) ON COMMIT DROP;
DO $$
DECLARE current_check text; old_check text; intermediate_check text; new_check text; check_name name; checks integer; checks_valid boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='portal_restore_authority.events'::regclass AND relkind='r') OR
    NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='portal_restore_authority.events'::regclass AND t.tgname='events_immutable'
        AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=58 AND t.tgqual IS NULL
        AND t.tgfoid=pg_catalog.to_regprocedure('portal_restore_authority.immutable_event()')) THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_NOLOGIN_UPGRADE_GUARD_MISSING';
  END IF;
  SELECT count(*),min(c.conname),min(pg_catalog.pg_get_constraintdef(c.oid)),bool_and(c.convalidated AND NOT c.connoinherit)
    INTO checks,check_name,current_check,checks_valid
    FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_attribute a
      ON a.attrelid=c.conrelid AND a.attname='capture_kind' AND NOT a.attisdropped
    WHERE c.conrelid='portal_restore_authority.events'::regclass AND c.contype='c'
      AND a.attnum=ANY(c.conkey);
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO old_check FROM pg_catalog.pg_constraint
    WHERE conrelid='pg_temp.v2_upgrade_expected_old'::regclass AND contype='c';
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO new_check FROM pg_catalog.pg_constraint
    WHERE conrelid='pg_temp.v2_upgrade_expected_new'::regclass AND contype='c';
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO intermediate_check FROM pg_catalog.pg_constraint
    WHERE conrelid='pg_temp.v2_upgrade_expected_intermediate'::regclass AND contype='c';
  IF checks<>1 OR checks_valid IS DISTINCT FROM true OR check_name IS DISTINCT FROM 'events_capture_kind_check' OR
      current_check IS DISTINCT FROM old_check AND current_check IS DISTINCT FROM intermediate_check AND current_check IS DISTINCT FROM new_check THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_NOLOGIN_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  IF current_check=old_check OR current_check=intermediate_check THEN
    ALTER TABLE portal_restore_authority.events DROP CONSTRAINT events_capture_kind_check;
    ALTER TABLE portal_restore_authority.events ADD CONSTRAINT events_capture_kind_check CHECK
      (capture_kind IN ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE','FROZEN_NOLOGIN_SOURCE_OBSERVATION','FROZEN_CLOSED_DB_OBSERVATION'));
  END IF;
END $$;
COMMIT;
