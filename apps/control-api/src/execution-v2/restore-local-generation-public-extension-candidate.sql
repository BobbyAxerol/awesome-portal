-- UNMOUNTED TEST-ONLY candidate. This is NOT an installable migration,
-- source/old-clone/HTTP fence, independent authority or restore permit.
-- Extends the same single-login local generation to the fixed public tables
-- in the current diagnostic inventory. Other public relations and privileged
-- owners/admins remain outside this boundary. A production installation needs
-- a complete write-path/role census and independently administered fencing.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('portal_local_write_fence.enforce()') IS NULL OR
    (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
        'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate')
      AND c.relkind='r' AND t.tgname='v2_local_generation_fence' AND t.tgenabled='O' AND NOT t.tgisinternal
      AND t.tgtype=62 AND t.tgqual IS NULL AND t.tgfoid='portal_local_write_fence.enforce()'::regprocedure)<>21 THEN
    RAISE EXCEPTION 'V2_PUBLIC_FENCE_BASE_MISMATCH';
  END IF;
END $$;

CREATE FUNCTION portal_local_write_fence.public_targets() RETURNS text[]
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT ARRAY['portal_users','password_credentials','activation_credentials','auth_sessions',
    'auth_audit_events','account_lifecycle_operations','owner_step_up_grants','external_identity_bindings',
    'portal_owner_anchor','workspaces','workspace_members','portal_capability_grants',
    'portal_capability_grant_events','governance_promotion_authority_grants','portal_access_policy_state',
    'portal_access_grants_v2','portal_access_proposals','portal_access_policy_events',
    'portal_native_root_obligations','portal_native_current_read_obligations','execution_retained_review_access',
    'execution_manager_consumer_fences','execution_trusted_commands','execution_trusted_command_events',
    'execution_command_status_preparations','execution_command_status_context_links',
    'execution_command_status_original_fingerprints','execution_command_status_delivery_acks']::text[]
$$;

CREATE FUNCTION portal_local_write_fence.public_coverage_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(portal_local_write_fence.public_targets()) target(name)
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=target.name AND c.relkind='r'
    WHERE c.oid IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=c.oid AND t.tgname='v2_public_generation_fence' AND t.tgenabled='O' AND NOT t.tgisinternal
        AND t.tgtype=62 AND t.tgqual IS NULL
        AND t.tgfoid=pg_catalog.to_regprocedure('portal_local_write_fence.enforce_public()')))
$$;

-- A stopped head is not sufficient if a C2 guard or the delivery state
-- machine was disabled before the stop. Verify the exact fixed candidate
-- relation set and the business triggers as well as the public guards.
CREATE FUNCTION portal_local_write_fence.candidate_coverage_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH expected(name) AS (SELECT unnest(ARRAY[
    'elp210_c2_delivery_candidate.events','elp210_c2_delivery_candidate.limits','elp210_c2_delivery_candidate.obligations',
    'elp210_c2_fence_candidate.events','elp210_c2_fence_candidate.procedure_scope_pin','elp210_c2_fence_candidate.scopes',
    'elp210_c2_p7_candidate.owner_intent_revocations','elp210_c2_p7_candidate.owner_intents',
    'elp210_c2_p7_candidate.records','elp210_c2_p7_candidate.registrations','elp210_c2_preparation.b2_attempts',
    'elp210_c2_revision_candidate.baseline','elp210_c2_revision_candidate.events','elp210_c2_revision_candidate.overflow',
    'elp210_candidate.authority','elp210_candidate.events','elp210_candidate.leases','elp210_candidate.mutation_events',
    'elp210_candidate.mutations','elp210_candidate.native_read_events','elp210_candidate.native_read_obligations']::text[])),
  actual AS (SELECT n.nspname::text||'.'||c.relname::text AS name,c.oid,c.relkind
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate',
      'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_delivery_candidate') AND c.relkind IN ('r','p','f'))
  SELECT (SELECT count(*) FROM actual)=21
    AND NOT EXISTS (SELECT 1 FROM expected e LEFT JOIN actual a ON a.name=e.name
      WHERE a.oid IS NULL OR a.relkind<>'r' OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid=a.oid AND t.tgname='v2_local_generation_fence' AND t.tgenabled='O' AND NOT t.tgisinternal
          AND t.tgtype=62 AND t.tgqual IS NULL AND t.tgfoid=pg_catalog.to_regprocedure('portal_local_write_fence.enforce()')))
    AND NOT EXISTS (SELECT 1 FROM (VALUES
      ('limits','limits_no_change',58,'elp210_c2_delivery_candidate.immutable()'),
      ('obligations','obligations_no_delete',42,'elp210_c2_delivery_candidate.immutable()'),
      ('obligations','obligation_guard',23,'elp210_c2_delivery_candidate.guard()'),
      ('obligations','obligation_event',21,'elp210_c2_delivery_candidate.record_event()'),
      ('events','events_immutable',58,'elp210_c2_delivery_candidate.immutable()')
    ) AS expected_guard(table_name,trigger_name,trigger_type,function_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_c2_delivery_candidate' AND c.relname=expected_guard.table_name AND c.relkind='r'
        AND t.tgname=expected_guard.trigger_name AND t.tgenabled='O' AND NOT t.tgisinternal
        AND t.tgtype=expected_guard.trigger_type AND t.tgqual IS NULL
        AND t.tgfoid=pg_catalog.to_regprocedure(expected_guard.function_name)))
    AND NOT EXISTS (SELECT 1 FROM (VALUES
      ('records','p7_immutable_rows',27,'elp210_c2_p7_candidate.immutable()'),
      ('records','p7_immutable_truncate',34,'elp210_c2_p7_candidate.immutable()'),
      ('registrations','p7_registration_update_delete',27,'elp210_c2_p7_candidate.registration_monotonic()'),
      ('registrations','p7_registration_truncate',34,'elp210_c2_p7_candidate.registration_monotonic()'),
      ('owner_intents','owner_intents_immutable',27,'elp210_c2_p7_candidate.owner_intent_immutable()'),
      ('owner_intents','owner_intents_no_truncate',34,'elp210_c2_p7_candidate.owner_intent_immutable()'),
      ('owner_intent_revocations','owner_intent_revocations_immutable',27,'elp210_c2_p7_candidate.owner_intent_immutable()'),
      ('owner_intent_revocations','owner_intent_revocations_no_truncate',34,'elp210_c2_p7_candidate.owner_intent_immutable()')
    ) AS expected_guard(table_name,trigger_name,trigger_type,function_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_c2_p7_candidate' AND c.relname=expected_guard.table_name AND c.relkind='r'
        AND t.tgname=expected_guard.trigger_name AND t.tgenabled='O' AND NOT t.tgisinternal
        AND t.tgtype=expected_guard.trigger_type AND t.tgqual IS NULL
        AND t.tgfoid=pg_catalog.to_regprocedure(expected_guard.function_name)))
$$;

CREATE FUNCTION portal_local_write_fence.public_writer_role_is_safe(writer oid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT portal_local_write_fence.writer_role_is_safe(writer)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles parent
      WHERE pg_catalog.pg_has_role(writer,parent.oid,'MEMBER') AND (
        EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='public'
          AND pg_catalog.has_schema_privilege(parent.oid,n.oid,'CREATE')) OR
        EXISTS (SELECT 1 FROM unnest(portal_local_write_fence.public_targets()) target(name)
          JOIN pg_catalog.pg_namespace n ON n.nspname='public'
          JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=target.name AND c.relkind='r'
          WHERE pg_catalog.has_table_privilege(parent.oid,c.oid,'TRIGGER'))))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='public' AND
      (pg_catalog.pg_has_role(writer,n.nspowner,'MEMBER') OR pg_catalog.has_schema_privilege(writer,n.oid,'CREATE')))
    AND NOT EXISTS (SELECT 1 FROM unnest(portal_local_write_fence.public_targets()) target(name)
      JOIN pg_catalog.pg_namespace n ON n.nspname='public'
      JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=target.name AND c.relkind='r'
      WHERE pg_catalog.pg_has_role(writer,c.relowner,'MEMBER') OR pg_catalog.has_table_privilege(writer,c.oid,'TRIGGER'))
$$;

CREATE FUNCTION portal_local_write_fence.public_writer_is_safe(writer oid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=writer AND r.rolcanlogin)
    AND portal_local_write_fence.public_writer_role_is_safe(writer)
$$;

CREATE FUNCTION portal_local_write_fence.enforce_public() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE active boolean; writer oid;
BEGIN
  SELECT h.enabled,h.writer_oid INTO active,writer FROM portal_local_write_fence.head h WHERE h.singleton FOR SHARE;
  IF NOT FOUND OR active IS DISTINCT FROM true OR writer IS DISTINCT FROM (session_user::regrole)::oid
      OR NOT portal_local_write_fence.public_writer_is_safe(writer) THEN
    RAISE EXCEPTION 'V2_LOCAL_WRITE_FENCED';
  END IF;
  IF NOT portal_local_write_fence.public_coverage_valid() OR NOT portal_local_write_fence.candidate_coverage_valid() THEN
    RAISE EXCEPTION 'V2_PUBLIC_FENCE_COVERAGE_MISMATCH';
  END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE target text; actual integer;
BEGIN
  SELECT count(*) INTO actual FROM unnest(portal_local_write_fence.public_targets()) target(name)
    JOIN pg_catalog.pg_namespace n ON n.nspname='public'
    JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=target.name AND c.relkind='r';
  IF actual<>cardinality(portal_local_write_fence.public_targets()) THEN
    RAISE EXCEPTION 'V2_PUBLIC_FENCE_TARGET_MISMATCH';
  END IF;
  FOREACH target IN ARRAY portal_local_write_fence.public_targets() LOOP
    EXECUTE format('CREATE TRIGGER v2_public_generation_fence BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION portal_local_write_fence.enforce_public()',target);
  END LOOP;
END $$;

-- Once public authority is in scope, selecting a writer and *all* candidate
-- writes must enforce the same complete boundary. Otherwise a writer with
-- public CREATE/TRIGGER could be admitted and mutate C2 state despite being
-- rejected only when it happened to touch a public table.
CREATE OR REPLACE FUNCTION portal_local_write_fence.rotate(expected bigint, next_writer oid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_generation bigint; current_writer oid; result bigint;
BEGIN
  SELECT generation,writer_oid INTO current_generation,current_writer FROM portal_local_write_fence.head WHERE singleton FOR UPDATE;
  IF NOT FOUND OR current_generation IS DISTINCT FROM expected OR expected<0 OR expected>=9223372036854775807
      OR current_writer=(session_user::regrole)::oid OR EXISTS (SELECT 1 FROM portal_local_write_fence.writer_history h
        WHERE h.writer_oid=(session_user::regrole)::oid OR
          (NOT (SELECT r.rolsuper FROM pg_catalog.pg_roles r WHERE r.oid=(session_user::regrole)::oid)
            AND pg_catalog.pg_has_role((session_user::regrole)::oid,h.writer_oid,'MEMBER')))
      OR next_writer IS NULL OR NOT portal_local_write_fence.public_writer_is_safe(next_writer)
      OR NOT portal_local_write_fence.public_coverage_valid()
      OR NOT portal_local_write_fence.candidate_coverage_valid() THEN
    RAISE EXCEPTION 'V2_LOCAL_FENCE_ROTATION_DENIED';
  END IF;
  INSERT INTO portal_local_write_fence.writer_history(generation,writer_oid) VALUES(expected+1,next_writer);
  UPDATE portal_local_write_fence.head SET generation=expected+1,writer_oid=next_writer,enabled=true
    WHERE singleton AND generation=expected RETURNING generation INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'V2_LOCAL_FENCE_ROTATION_DENIED'; END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION portal_local_write_fence.enforce() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE active boolean; writer oid;
BEGIN
  SELECT h.enabled,h.writer_oid INTO active,writer FROM portal_local_write_fence.head h WHERE h.singleton FOR SHARE;
  IF NOT FOUND OR active IS DISTINCT FROM true OR writer IS DISTINCT FROM (session_user::regrole)::oid
      OR NOT portal_local_write_fence.public_writer_is_safe(writer) THEN
    RAISE EXCEPTION 'V2_LOCAL_WRITE_FENCED';
  END IF;
  IF NOT portal_local_write_fence.public_coverage_valid() OR NOT portal_local_write_fence.candidate_coverage_valid() THEN
    RAISE EXCEPTION 'V2_PUBLIC_FENCE_COVERAGE_MISMATCH';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION portal_local_write_fence.public_targets(),
  portal_local_write_fence.public_coverage_valid(),portal_local_write_fence.candidate_coverage_valid(),
  portal_local_write_fence.public_writer_is_safe(oid),portal_local_write_fence.public_writer_role_is_safe(oid),
  portal_local_write_fence.enforce_public() FROM PUBLIC;
COMMENT ON FUNCTION portal_local_write_fence.enforce_public() IS
  'UNMOUNTED local fixed-table fence candidate; no complete authority or old-holder fencing claim';
COMMIT;
