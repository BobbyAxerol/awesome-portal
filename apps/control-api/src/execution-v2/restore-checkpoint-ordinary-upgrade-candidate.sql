-- UNMOUNTED authority-cluster preparation only, NEVER a Portal migration.
-- The independent operator must first stop old checkpoint writers and qualify
-- target identity, immutable history, roles/ACLs and catalog-lock helpers.
-- This adds one explicit profile kind, never changes an old event/hash, and
-- grants no rights or restore/cutover authority. Old readers must still refuse.
BEGIN;
SET LOCAL lock_timeout='1000ms';
SET LOCAL statement_timeout='5000ms';
LOCK TABLE portal_restore_authority.events IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE ordinary_restore_expected_kind(capture_kind text CHECK(capture_kind IN
 ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE',
  'FROZEN_NOLOGIN_SOURCE_OBSERVATION','FROZEN_CLOSED_DB_OBSERVATION'))) ON COMMIT DROP;
DO $$ BEGIN
 IF (SELECT relkind FROM pg_class WHERE oid='portal_restore_authority.events'::regclass) IS DISTINCT FROM 'r'
 OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='portal_restore_authority.events'::regclass
      AND conname='events_capture_kind_check' AND contype='c' AND convalidated) IS DISTINCT FROM
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='ordinary_restore_expected_kind'::regclass
      AND contype='c') THEN
  RAISE EXCEPTION 'ORDINARY_RESTORE_UPGRADE_SCHEMA_INVALID';
 END IF;
END $$;
ALTER TABLE portal_restore_authority.events DROP CONSTRAINT events_capture_kind_check;
ALTER TABLE portal_restore_authority.events ADD CONSTRAINT events_capture_kind_check CHECK(capture_kind IN
 ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE',
  'FROZEN_NOLOGIN_SOURCE_OBSERVATION','FROZEN_CLOSED_DB_OBSERVATION','LOCKED_ORDINARY_SOURCE_CAPTURE'));
COMMIT;
