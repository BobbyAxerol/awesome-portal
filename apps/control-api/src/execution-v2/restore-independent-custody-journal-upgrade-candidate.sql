-- TEST/PREPARATION ONLY. Forward upgrade of the *old candidate custody*
-- schema, not a Portal migration, source ACK or a restore permit. Pin the
-- isolated target, stop old writers and independently verify history, source
-- proofs and ACLs. These requirements are NOT enforced by this SQL. Any error
-- aborts the transaction; ROLLBACK before reuse.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
LOCK TABLE portal_restore_original_custody.events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE portal_restore_original_custody.head IN SHARE MODE;
LOCK TABLE portal_restore_original_custody.source_proofs IN SHARE MODE;
DO $$
DECLARE actual text[];
BEGIN
  IF (SELECT relkind FROM pg_catalog.pg_class
      WHERE oid='portal_restore_original_custody.events'::regclass) <> 'r' OR
     (SELECT relkind FROM pg_catalog.pg_class
      WHERE oid='portal_restore_original_custody.head'::regclass) <> 'r' OR
     (SELECT relkind FROM pg_catalog.pg_class
      WHERE oid='portal_restore_original_custody.source_proofs'::regclass) <> 'r' THEN
    RAISE EXCEPTION 'RESTORE_CUSTODY_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  SELECT array_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                   ORDER BY a.attnum) INTO actual
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='portal_restore_original_custody.events'::regclass
     AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM ARRAY['custody_id:uuid','operation_id:uuid','generation:bigint',
      'kind:text','lease_id:text','body:jsonb','proof_hash:text','predecessor_hash:text','event_hash:text'] THEN
    RAISE EXCEPTION 'RESTORE_CUSTODY_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  SELECT array_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                   ORDER BY a.attnum) INTO actual
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='portal_restore_original_custody.head'::regclass
     AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM ARRAY['custody_id:uuid','source_system_identifier:text',
      'authority_system_identifier:text','generation:bigint','event_hash:text'] THEN
    RAISE EXCEPTION 'RESTORE_CUSTODY_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  SELECT array_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod)
                   ORDER BY a.attnum) INTO actual
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='portal_restore_original_custody.source_proofs'::regclass
     AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM ARRAY['custody_id:uuid','operation_id:uuid','envelope:jsonb'] THEN
    RAISE EXCEPTION 'RESTORE_CUSTODY_UPGRADE_SCHEMA_MISMATCH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='portal_restore_original_custody.source_proofs'::regclass
        AND tgname='source_proof_immutable' AND tgenabled IN ('O','A') AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'RESTORE_CUSTODY_UPGRADE_SOURCE_PROOF_GUARD_MISSING';
  END IF;
  IF pg_catalog.to_regprocedure('portal_restore_original_custody.immutable_event()') IS NOT NULL OR
     EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='portal_restore_original_custody.events'::regclass
         AND tgname='events_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'RESTORE_CUSTODY_UPGRADE_GUARD_ALREADY_EXISTS';
  END IF;
END $$;
CREATE FUNCTION portal_restore_original_custody.immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'RESTORE_CUSTODY_EVENT_IMMUTABLE'; END $$;
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_restore_original_custody.events
  FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_original_custody.immutable_event();
COMMIT;
