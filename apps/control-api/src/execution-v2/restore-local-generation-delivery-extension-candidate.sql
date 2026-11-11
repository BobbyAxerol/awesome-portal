-- UNMOUNTED TEST-ONLY extension of the exact 18-table local fence. This is
-- not an installable migration, a public-authority, old-clone, HTTP, Edge,
-- acknowledgement or restore/cutover fence. Run only on a disposable DB.
-- Rotation remains its own short transaction; it must never acquire authority
-- or application locks after rotating, avoiding a head/authority deadlock.
-- Requires the complete frozen delivery candidate and 18-table extension.
BEGIN;
DO $$
DECLARE actual text[];
BEGIN
  SELECT array_agg(n.nspname::text||'.'||c.relname::text ORDER BY n.nspname::text,c.relname::text)
    INTO actual FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
      'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate')
      AND c.relkind IN ('r','p','f');
  IF actual IS DISTINCT FROM ARRAY[
    'elp210_c2_delivery_candidate.events','elp210_c2_delivery_candidate.limits','elp210_c2_delivery_candidate.obligations',
    'elp210_c2_fence_candidate.events','elp210_c2_fence_candidate.procedure_scope_pin','elp210_c2_fence_candidate.scopes',
    'elp210_c2_p7_candidate.owner_intent_revocations','elp210_c2_p7_candidate.owner_intents',
    'elp210_c2_p7_candidate.records','elp210_c2_p7_candidate.registrations',
    'elp210_c2_preparation.b2_attempts','elp210_c2_revision_candidate.baseline',
    'elp210_c2_revision_candidate.events','elp210_c2_revision_candidate.overflow',
    'elp210_candidate.authority','elp210_candidate.events','elp210_candidate.leases',
    'elp210_candidate.mutation_events','elp210_candidate.mutations','elp210_candidate.native_read_events',
    'elp210_candidate.native_read_obligations']::text[] OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
        'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate') AND c.relkind IN ('p','f')) THEN
    RAISE EXCEPTION 'V2_C2_DELIVERY_FENCE_COVERAGE_MISMATCH';
  END IF;
  -- Refuse installation unless all 18 original guards already exist, enabled
  -- and targeting the expected function. Do not silently repair older fences.
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN
    ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_preparation','elp210_c2_revision_candidate')
    AND c.relkind='r' AND t.tgname='v2_local_generation_fence' AND t.tgenabled='O' AND NOT t.tgisinternal
    AND t.tgtype=62 AND t.tgqual IS NULL AND t.tgfoid='portal_local_write_fence.enforce()'::regprocedure) <> 18 THEN
    RAISE EXCEPTION 'V2_C2_DELIVERY_FENCE_COVERAGE_MISMATCH';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION portal_local_write_fence.writer_role_is_safe(writer oid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=writer
      AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND pg_catalog.pg_has_role(writer,r.oid,'MEMBER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN
      ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_preparation',
       'elp210_c2_revision_candidate','elp210_c2_delivery_candidate','portal_local_write_fence') AND
      (pg_catalog.pg_has_role(writer,n.nspowner,'MEMBER') OR pg_catalog.has_schema_privilege(writer,n.oid,'CREATE')))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
        'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate') AND c.relkind='r' AND
      (pg_catalog.pg_has_role(writer,c.relowner,'MEMBER') OR pg_catalog.has_table_privilege(writer,c.oid,'TRIGGER')))
    -- Check every reachable role, including NOINHERIT parents accessible via
    -- SET ROLE. Checking the login's effective rights alone misses them.
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles parent
      WHERE pg_catalog.pg_has_role(writer,parent.oid,'MEMBER') AND (
        EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
          WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
            'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate','portal_local_write_fence')
            AND pg_catalog.has_schema_privilege(parent.oid,n.oid,'CREATE'))
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
            'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate')
            AND c.relkind='r' AND pg_catalog.has_table_privilege(parent.oid,c.oid,'TRIGGER'))
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='portal_local_write_fence' AND c.relname IN ('head','writer_history','freeze_history') AND
            (pg_catalog.has_any_column_privilege(parent.oid,c.oid,'INSERT') OR
             pg_catalog.has_any_column_privilege(parent.oid,c.oid,'UPDATE') OR
             pg_catalog.has_table_privilege(parent.oid,c.oid,'DELETE') OR
             pg_catalog.has_table_privilege(parent.oid,c.oid,'TRUNCATE') OR
             pg_catalog.has_table_privilege(parent.oid,c.oid,'TRIGGER')))
        OR pg_catalog.has_function_privilege(parent.oid,'portal_local_write_fence.rotate(bigint,oid)','EXECUTE')
        OR pg_catalog.has_function_privilege(parent.oid,'portal_local_write_fence.stop_writes(bigint,oid,uuid)','EXECUTE')))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      WHERE pg_catalog.pg_has_role(writer,r.oid,'MEMBER')
        AND pg_catalog.has_parameter_privilege(r.oid,'session_replication_role','SET'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='portal_local_write_fence' AND c.relname IN ('head','writer_history','freeze_history') AND
      (pg_catalog.has_any_column_privilege(writer,c.oid,'INSERT') OR pg_catalog.has_any_column_privilege(writer,c.oid,'UPDATE') OR
       pg_catalog.has_table_privilege(writer,c.oid,'DELETE') OR pg_catalog.has_table_privilege(writer,c.oid,'TRUNCATE') OR
       pg_catalog.has_table_privilege(writer,c.oid,'TRIGGER')))
    AND NOT pg_catalog.has_function_privilege(writer,'portal_local_write_fence.rotate(bigint,oid)','EXECUTE')
    AND NOT pg_catalog.has_function_privilege(writer,'portal_local_write_fence.stop_writes(bigint,oid,uuid)','EXECUTE');
$$;

CREATE OR REPLACE FUNCTION portal_local_write_fence.enforce() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE active boolean; writer oid; actual text[];
BEGIN
  SELECT h.enabled,h.writer_oid INTO active,writer FROM portal_local_write_fence.head h WHERE h.singleton FOR SHARE;
  IF NOT FOUND OR active IS DISTINCT FROM true OR writer IS DISTINCT FROM (session_user::regrole)::oid
      OR NOT portal_local_write_fence.writer_is_safe(writer) THEN RAISE EXCEPTION 'V2_LOCAL_WRITE_FENCED'; END IF;
  SELECT array_agg(n.nspname::text||'.'||c.relname::text ORDER BY n.nspname::text,c.relname::text)
    INTO actual FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
      'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate') AND c.relkind IN ('r','p','f');
  IF actual IS DISTINCT FROM ARRAY[
    'elp210_c2_delivery_candidate.events','elp210_c2_delivery_candidate.limits','elp210_c2_delivery_candidate.obligations',
    'elp210_c2_fence_candidate.events','elp210_c2_fence_candidate.procedure_scope_pin','elp210_c2_fence_candidate.scopes',
    'elp210_c2_p7_candidate.owner_intent_revocations','elp210_c2_p7_candidate.owner_intents',
    'elp210_c2_p7_candidate.records','elp210_c2_p7_candidate.registrations',
    'elp210_c2_preparation.b2_attempts','elp210_c2_revision_candidate.baseline',
    'elp210_c2_revision_candidate.events','elp210_c2_revision_candidate.overflow',
    'elp210_candidate.authority','elp210_candidate.events','elp210_candidate.leases',
    'elp210_candidate.mutation_events','elp210_candidate.mutations','elp210_candidate.native_read_events',
    'elp210_candidate.native_read_obligations']::text[] OR
    (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN
      ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_preparation',
       'elp210_c2_revision_candidate','elp210_c2_delivery_candidate')
      AND c.relkind='r' AND t.tgname='v2_local_generation_fence' AND t.tgenabled='O' AND NOT t.tgisinternal
      AND t.tgtype=62 AND t.tgqual IS NULL AND t.tgfoid='portal_local_write_fence.enforce()'::regprocedure) <> 21 THEN
    RAISE EXCEPTION 'V2_C2_DELIVERY_FENCE_COVERAGE_MISMATCH';
  END IF;
  -- The delivery state machine is part of this candidate's assumptions: do
  -- not accept a live fence while a business guard is disabled or replaced.
  IF EXISTS (SELECT 1 FROM (VALUES
      ('limits','limits_no_change',58,'elp210_c2_delivery_candidate.immutable()'),
      ('obligations','obligations_no_delete',42,'elp210_c2_delivery_candidate.immutable()'),
      ('obligations','obligation_guard',23,'elp210_c2_delivery_candidate.guard()'),
      ('obligations','obligation_event',21,'elp210_c2_delivery_candidate.record_event()'),
      ('events','events_immutable',58,'elp210_c2_delivery_candidate.immutable()')
    ) AS expected(table_name,trigger_name,trigger_type,function_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_c2_delivery_candidate' AND c.relname=expected.table_name AND c.relkind='r'
        AND t.tgname=expected.trigger_name AND t.tgenabled='O' AND NOT t.tgisinternal
        AND t.tgtype=expected.trigger_type AND t.tgqual IS NULL
        AND t.tgfoid=pg_catalog.to_regprocedure(expected.function_name))) THEN
    RAISE EXCEPTION 'V2_C2_DELIVERY_FENCE_COVERAGE_MISMATCH';
  END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['events','limits','obligations'] LOOP
    EXECUTE format('CREATE TRIGGER v2_local_generation_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON elp210_c2_delivery_candidate.%I FOR EACH STATEMENT EXECUTE FUNCTION portal_local_write_fence.enforce()',target);
  END LOOP;
END $$;
COMMENT ON SCHEMA portal_local_write_fence IS 'UNMOUNTED local 21-table transaction fence candidate; no public authority, old-clone, HTTP or restore/cutover coverage';
COMMIT;
