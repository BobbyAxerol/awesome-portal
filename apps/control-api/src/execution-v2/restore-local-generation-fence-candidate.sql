-- UNMOUNTED / TEST_ONLY PREPARATION. This is NOT a migration, external source
-- fence, physical old-database fence, HTTP/in-flight fence, or cutover permit.
-- Scope is EXACTLY the seven candidate tables listed below. Installer must run
-- as a trusted owner; writer credentials/roles must never be reused. A fresh
-- role is selected only through owner-controlled compare-and-swap rotation.
BEGIN;
DO $$
DECLARE found text[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO found
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='elp210_candidate' AND c.relkind IN ('r','p','f');
  IF found IS DISTINCT FROM ARRAY['authority','events','leases','mutation_events','mutations',
      'native_read_events','native_read_obligations']::text[] THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_COVERAGE_MISMATCH';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_candidate' AND c.relkind IN ('p','f')) THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_RELATION_KIND_INVALID';
  END IF;
END $$;
CREATE SCHEMA portal_local_write_fence;
REVOKE ALL ON SCHEMA portal_local_write_fence FROM PUBLIC;
CREATE TABLE portal_local_write_fence.head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), generation bigint NOT NULL CHECK(generation>=0),
  writer_oid oid, enabled boolean NOT NULL DEFAULT false,
  CHECK ((enabled AND writer_oid IS NOT NULL) OR (NOT enabled AND writer_oid IS NULL))
);
INSERT INTO portal_local_write_fence.head(singleton,generation,writer_oid,enabled) VALUES(true,0,NULL,false);
CREATE TABLE portal_local_write_fence.writer_history (
  generation bigint PRIMARY KEY CHECK(generation>0), writer_oid oid UNIQUE NOT NULL
);
-- A freeze is a local database drain, not proof that another database clone,
-- HTTP response, or the source has stopped. The caller reuses operation_id
-- after a lost response; it must never infer current state from a stale row.
CREATE TABLE portal_local_write_fence.freeze_history (
  operation_id uuid PRIMARY KEY, prior_generation bigint NOT NULL CHECK(prior_generation>0),
  prior_writer oid NOT NULL, frozen_generation bigint UNIQUE NOT NULL,
  CHECK(frozen_generation=prior_generation+1)
);
CREATE FUNCTION portal_local_write_fence.guard_freeze_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  -- SECURITY DEFINER stop_writes inserts as the trusted schema owner. A
  -- mistakenly granted direct writer privilege must not forge its receipt.
  IF TG_OP<>'INSERT' OR (current_user::regrole)::oid IS DISTINCT FROM
      (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='portal_local_write_fence') THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_FREEZE_HISTORY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER freeze_history_insert_guard BEFORE INSERT ON portal_local_write_fence.freeze_history
  FOR EACH ROW EXECUTE FUNCTION portal_local_write_fence.guard_freeze_history();
CREATE TRIGGER freeze_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_local_write_fence.freeze_history
  FOR EACH STATEMENT EXECUTE FUNCTION portal_local_write_fence.guard_freeze_history();
REVOKE ALL ON ALL TABLES IN SCHEMA portal_local_write_fence FROM PUBLIC;

-- OID bound to session_user, never a caller-set GUC/current_user (SET ROLE).
-- The installing owner, superusers, CREATEROLE, BYPASSRLS, table/schema owner
-- or an owner-member are outside the writer boundary and rejected.
CREATE FUNCTION portal_local_write_fence.writer_role_is_safe(writer oid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=writer
      AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND pg_catalog.pg_has_role(writer,r.oid,'MEMBER'))
    AND NOT pg_catalog.pg_has_role(writer, (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='elp210_candidate'), 'MEMBER')
    AND NOT pg_catalog.pg_has_role(writer, (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='portal_local_write_fence'), 'MEMBER')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_candidate' AND c.relkind='r' AND pg_catalog.pg_has_role(writer,c.relowner,'MEMBER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_candidate' AND c.relkind='r' AND pg_catalog.has_table_privilege(writer,c.oid,'TRIGGER'))
    AND NOT pg_catalog.has_schema_privilege(writer,'elp210_candidate','CREATE')
    AND NOT pg_catalog.has_schema_privilege(writer,'portal_local_write_fence','CREATE')
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
-- Admission still requires LOGIN. The separate safety predicate permits a
-- checkpoint observer to assess the exact same role after NOLOGIN without
-- ever making a disabled role eligible for rotation or a database write.
CREATE FUNCTION portal_local_write_fence.writer_is_safe(writer oid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=writer AND r.rolcanlogin)
    AND portal_local_write_fence.writer_role_is_safe(writer)
$$;
CREATE FUNCTION portal_local_write_fence.enforce() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE active boolean; writer oid;
BEGIN
  -- SHARE is held until the writer's *own* transaction ends. Rotation cannot
  -- commit until every previously admitted database write transaction drains.
  SELECT h.enabled,h.writer_oid INTO active,writer FROM portal_local_write_fence.head h WHERE h.singleton FOR SHARE;
  IF NOT FOUND OR active IS DISTINCT FROM true OR writer IS DISTINCT FROM (session_user::regrole)::oid
      OR NOT portal_local_write_fence.writer_is_safe(writer) THEN
    RAISE EXCEPTION 'V2_LOCAL_WRITE_FENCED';
  END IF;
  -- Also fail closed if trusted DDL later changes the frozen table set or
  -- disables/replaces a guard. This is bounded to the seven declared tables.
  IF (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_candidate' AND c.relkind IN ('r','p','f')) IS DISTINCT FROM
      ARRAY['authority','events','leases','mutation_events','mutations','native_read_events','native_read_obligations']::text[]
    OR (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='elp210_candidate'
      AND c.relkind='r' AND t.tgname='v2_local_generation_fence' AND t.tgenabled='O' AND NOT t.tgisinternal
      AND t.tgtype=62 AND t.tgqual IS NULL AND t.tgfoid='portal_local_write_fence.enforce()'::regprocedure) <> 7 THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_COVERAGE_MISMATCH';
  END IF;
  RETURN NULL; -- statement trigger; row values are not replaced
END $$;
CREATE FUNCTION portal_local_write_fence.rotate(expected bigint, next_writer oid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_generation bigint; current_writer oid; result bigint;
BEGIN
  SELECT generation,writer_oid INTO current_generation,current_writer FROM portal_local_write_fence.head WHERE singleton FOR UPDATE;
  IF NOT FOUND OR current_generation IS DISTINCT FROM expected OR expected<0 OR expected>=9223372036854775807
      OR current_writer=(session_user::regrole)::oid OR EXISTS (SELECT 1 FROM portal_local_write_fence.writer_history h
        WHERE h.writer_oid=(session_user::regrole)::oid OR
          (NOT (SELECT r.rolsuper FROM pg_catalog.pg_roles r WHERE r.oid=(session_user::regrole)::oid)
            AND pg_catalog.pg_has_role((session_user::regrole)::oid,h.writer_oid,'MEMBER')))
      OR next_writer IS NULL OR NOT portal_local_write_fence.writer_is_safe(next_writer) THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_ROTATION_DENIED';
  END IF;
  INSERT INTO portal_local_write_fence.writer_history(generation,writer_oid) VALUES(expected+1,next_writer);
  UPDATE portal_local_write_fence.head SET generation=expected+1,writer_oid=next_writer,enabled=true
    WHERE singleton AND generation=expected RETURNING generation INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'V2_LOCAL_FENCE_ROTATION_DENIED'; END IF;
  RETURN result;
END $$;
CREATE FUNCTION portal_local_write_fence.stop_writes(expected bigint, expected_writer oid, operation_id uuid)
RETURNS TABLE(frozen_generation bigint, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_generation bigint; current_writer oid; active boolean; previous record;
BEGIN
  -- This lock waits for every transaction admitted by enforce() to finish.
  SELECT h.generation,h.writer_oid,h.enabled INTO current_generation,current_writer,active
    FROM portal_local_write_fence.head h WHERE h.singleton FOR UPDATE;
  IF NOT FOUND OR operation_id IS NULL OR expected_writer IS NULL OR expected IS NULL OR
      expected<1 OR expected>=9223372036854775807 OR current_writer=(session_user::regrole)::oid OR
      EXISTS (SELECT 1 FROM portal_local_write_fence.writer_history h
        WHERE h.writer_oid=(session_user::regrole)::oid OR
          (NOT (SELECT r.rolsuper FROM pg_catalog.pg_roles r WHERE r.oid=(session_user::regrole)::oid)
            AND pg_catalog.pg_has_role((session_user::regrole)::oid,h.writer_oid,'MEMBER'))) THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_FREEZE_DENIED';
  END IF;
  SELECT f.prior_generation,f.prior_writer,f.frozen_generation INTO previous
    FROM portal_local_write_fence.freeze_history f WHERE f.operation_id=stop_writes.operation_id;
  IF FOUND THEN
    IF previous.prior_generation IS DISTINCT FROM expected OR previous.prior_writer IS DISTINCT FROM expected_writer OR
       current_generation IS DISTINCT FROM previous.frozen_generation OR active IS DISTINCT FROM false OR current_writer IS NOT NULL THEN
      RAISE EXCEPTION 'V2_LOCAL_FENCE_FREEZE_STALE_OR_MISMATCH';
    END IF;
    RETURN QUERY SELECT previous.frozen_generation,true;
    RETURN;
  END IF;
  IF current_generation IS DISTINCT FROM expected OR current_writer IS DISTINCT FROM expected_writer OR active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_FREEZE_DENIED';
  END IF;
  INSERT INTO portal_local_write_fence.freeze_history(operation_id,prior_generation,prior_writer,frozen_generation)
    VALUES(stop_writes.operation_id,expected,expected_writer,expected+1);
  UPDATE portal_local_write_fence.head SET generation=expected+1,writer_oid=NULL,enabled=false WHERE singleton;
  RETURN QUERY SELECT expected+1,false;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA portal_local_write_fence FROM PUBLIC;
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['authority','events','leases','mutation_events','mutations',
    'native_read_events','native_read_obligations'] LOOP
    EXECUTE format('CREATE TRIGGER v2_local_generation_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON elp210_candidate.%I FOR EACH STATEMENT EXECUTE FUNCTION portal_local_write_fence.enforce()',target);
  END LOOP;
END $$;
COMMENT ON SCHEMA portal_local_write_fence IS 'UNMOUNTED local seven-table transaction fence candidate; not restore/cutover authority';
COMMIT;
