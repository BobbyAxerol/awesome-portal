-- UNMOUNTED candidate, not a numbered migration or grant of authority.
-- The operator must provision a dedicated NOLOGIN definer with narrowly scoped
-- privileges, SET LOCAL ROLE to it and arrange/revoke temporary schema CREATE
-- separately. The operator MUST execute this file in a single transaction.
-- This file creates no role, login, membership or EXECUTE grant.
-- The application must authenticate session possession and CSRF itself: a
-- session ID parameter is not proof of possession. Real authority/ACL,
-- source propagation and runtime commissioning remain separate gates.
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=current_user
    AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb
    AND NOT r.rolreplication AND NOT r.rolbypassrls)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE
      (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication)
      AND pg_catalog.pg_has_role(current_user,r.oid,'MEMBER'))
  THEN RAISE EXCEPTION 'C2_PROC_DEFINER_UNSAFE'; END IF;
END $$;

CREATE TABLE elp210_c2_fence_candidate.procedure_scope_pin (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  registration_key text NOT NULL,registration_sha256 text NOT NULL CHECK(registration_sha256 ~ '^[0-9a-f]{64}$'),
  workspace_id text NOT NULL,owner_user_id text NOT NULL
);
REVOKE ALL ON elp210_c2_fence_candidate.procedure_scope_pin FROM PUBLIC;
CREATE TRIGGER c2_procedure_pin_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON elp210_c2_fence_candidate.procedure_scope_pin FOR EACH STATEMENT
  EXECUTE FUNCTION elp210_c2_fence_candidate.no_delete();

CREATE FUNCTION elp210_c2_fence_candidate.revoke_registered_scope_candidate(
  p_registration_key text,p_registration_sha256 text,p_owner_user_id text,p_session_id text,
  p_session_generation bigint,p_workspace_id text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE registry_state text;scope_state text; lease_until timestamptz;
BEGIN
  -- A caller retaining SET on session_replication_role can suppress the
  -- audit and generation triggers; a previously set replica mode survives
  -- revocation of that parameter privilege. Reject both situations.
  IF pg_catalog.current_setting('session_replication_role')='replica' OR
     pg_catalog.has_parameter_privilege((session_user::regrole)::oid,'session_replication_role','SET') OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE
       pg_catalog.pg_has_role((session_user::regrole)::oid,r.oid,'MEMBER') AND
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR
        pg_catalog.has_parameter_privilege(r.oid,'session_replication_role','SET')))
  THEN RAISE EXCEPTION 'C2_PROC_UNSAFE_CALLER'; END IF;
  IF p_registration_key IS NULL OR p_registration_sha256 !~ '^[0-9a-f]{64}$' OR
     p_owner_user_id IS NULL OR p_session_id IS NULL OR p_workspace_id IS NULL OR
     p_session_generation IS NULL OR p_session_generation<0 OR
     pg_catalog.length(p_registration_key) NOT BETWEEN 1 AND 128 OR
     pg_catalog.length(p_owner_user_id) NOT BETWEEN 1 AND 128 OR
     pg_catalog.length(p_session_id) NOT BETWEEN 1 AND 128 OR
     pg_catalog.length(p_workspace_id) NOT BETWEEN 1 AND 128
  THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR
     pg_catalog.current_setting('transaction_read_only')<>'off'
  THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('portal-access-v2:'||p_workspace_id,0))
  THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  PERFORM 1 FROM public.portal_users WHERE user_id=p_owner_user_id AND status='ACTIVE'
    AND NOT must_change_password AND archived_at IS NULL AND session_version=p_session_generation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  SELECT least(idle_expires_at,absolute_expires_at) INTO lease_until FROM public.auth_sessions
    WHERE session_id=p_session_id AND user_id=p_owner_user_id AND session_version=p_session_generation AND state='ACTIVE'
      AND idle_expires_at>pg_catalog.clock_timestamp() AND absolute_expires_at>pg_catalog.clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  PERFORM 1 FROM public.portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' AND user_id=p_owner_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  PERFORM 1 FROM public.workspaces WHERE workspace_id=p_workspace_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM elp210_c2_fence_candidate.procedure_scope_pin WHERE singleton
    AND registration_key=p_registration_key AND registration_sha256=p_registration_sha256
    AND workspace_id=p_workspace_id AND owner_user_id=p_owner_user_id)
  THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  SELECT state INTO registry_state FROM elp210_c2_p7_candidate.registrations
    WHERE registration_key=p_registration_key AND registration_sha256=p_registration_sha256
      AND workspace_id=p_workspace_id AND owner_user_id=p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'REGISTRATION_ABSENT'; END IF;
  IF registry_state='ACTIVE' THEN
    UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key=p_registration_key;
  ELSIF registry_state<>'REVOKED' THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  SELECT state INTO scope_state FROM elp210_c2_fence_candidate.scopes WHERE registration_key=p_registration_key
    AND registration_sha256=p_registration_sha256 AND workspace_id=p_workspace_id AND owner_user_id=p_owner_user_id FOR UPDATE;
  IF FOUND AND scope_state='OPEN' THEN
    UPDATE elp210_c2_fence_candidate.scopes SET state='BLOCK_NEW' WHERE registration_key=p_registration_key;
    scope_state:='BLOCK_NEW';
  END IF;
  IF pg_catalog.clock_timestamp()>=lease_until THEN RAISE EXCEPTION 'C2_PROC_DENIED'; END IF;
  IF scope_state='BLOCK_NEW' THEN RETURN 'REGISTRATION_REVOKED_BLOCK_NEW'; END IF;
  RETURN 'REGISTRATION_REVOKED_FENCE_UNPROVISIONED';
END $$;
REVOKE ALL ON FUNCTION elp210_c2_fence_candidate.revoke_registered_scope_candidate(text,text,text,text,bigint,text) FROM PUBLIC;
