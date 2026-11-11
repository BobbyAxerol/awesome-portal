-- TEST/PREPARATION ONLY. Forward upgrade of the *old candidate authority*
-- schema, not a Portal migration, independent trust or a restore permit.
-- The caller must provision and pin the isolated authority target and first
-- stop old writers and verify history, role/ACL and source identity under a
-- separately controlled procedure. These requirements are NOT enforced by
-- this SQL. Any error aborts the
-- transaction; reconnect/ROLLBACK before reuse. Never relax V2 DR fencing.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
LOCK TABLE portal_restore_authority.events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE portal_restore_authority.checkpoints IN SHARE MODE;
DO $$
DECLARE actual text[];
BEGIN
  IF (SELECT relkind FROM pg_catalog.pg_class
      WHERE oid = 'portal_restore_authority.events'::regclass) <> 'r' OR
     (SELECT relkind FROM pg_catalog.pg_class
      WHERE oid = 'portal_restore_authority.checkpoints'::regclass) <> 'r' THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  SELECT array_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                   ORDER BY a.attnum) INTO actual
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='portal_restore_authority.events'::regclass
     AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM ARRAY['checkpoint_id:uuid','operation_id:uuid',
      'expected_generation:bigint','generation:bigint','source_revision:bigint',
      'inventory_digest:text','capture_kind:text','predecessor_hash:text','event_hash:text'] THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  SELECT array_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                   ORDER BY a.attnum) INTO actual
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='portal_restore_authority.checkpoints'::regclass
     AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM ARRAY['checkpoint_id:uuid','source_system_identifier:text',
      'authority_system_identifier:text','generation:bigint','source_revision:bigint',
      'event_hash:text','event_count:bigint'] THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  IF pg_catalog.to_regprocedure('portal_restore_authority.immutable_event()') IS NOT NULL OR
     EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='portal_restore_authority.events'::regclass
             AND tgname='events_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_UPGRADE_GUARD_ALREADY_EXISTS';
  END IF;
END $$;
CREATE FUNCTION portal_restore_authority.immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'V2_CHECKPOINT_EVENT_IMMUTABLE'; END $$;
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_restore_authority.events
  FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_authority.immutable_event();
COMMIT;
