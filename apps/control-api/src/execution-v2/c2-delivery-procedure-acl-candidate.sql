-- TEST ONLY on a disposable cluster, not an authority, source, HTTP or ACK.
-- A qualified caller must independently authenticate the human and verify the
-- exact source original. This routine cannot establish either proposition.
-- No production ACL, application mount, automatic retry, or live command.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^portal_restore_rls_[a-f0-9]{8}$' AND NOT (
    current_database() ~ '^portal_c2_p7_[a-f0-9]{8}$' AND
    coalesce(current_setting('portal.test_only_p7_delivery',true),'')='TEST_ONLY_C2_P7_DEDICATED_DATABASE'
  ) THEN
    RAISE EXCEPTION 'C2_DELIVERY_PROC_DISPOSABLE_DATABASE_REQUIRED';
  END IF;
END $$;

CREATE FUNCTION elp210_c2_delivery_candidate.apply_candidate(
  p_action text,p_lease text,p_workspace text,p_owner text,p_workload text,
  p_request text,p_original text,p_payload text,p_bytes integer,p_valid_until bigint,
  p_registration text,p_registration_sha256 text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  caller oid := (session_user::regrole)::oid;
  definer oid := (current_user::regrole)::oid;
  stored text; claim_xid xid8;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation')<>'read committed' OR
     pg_catalog.current_setting('transaction_read_only')<>'off' OR
     p_action IS NULL OR p_action NOT IN ('RESERVE','SENDING','HOLD','UNKNOWN') OR
     p_lease IS NULL OR p_workspace IS NULL OR p_owner IS NULL OR p_workload IS NULL OR
     p_request IS NULL OR p_original IS NULL OR p_payload IS NULL OR p_bytes IS NULL OR p_valid_until IS NULL OR
     p_registration IS NULL OR p_registration_sha256 IS NULL OR
     pg_catalog.length(p_lease) NOT BETWEEN 1 AND 128 OR pg_catalog.length(p_workspace) NOT BETWEEN 1 AND 128 OR
     pg_catalog.length(p_owner) NOT BETWEEN 1 AND 128 OR pg_catalog.length(p_workload) NOT BETWEEN 1 AND 128 OR
     pg_catalog.length(p_registration) NOT BETWEEN 1 AND 128 OR
     p_request !~ '^sha256:[a-f0-9]{64}$' OR p_original !~ '^sha256:[a-f0-9]{64}$' OR
     p_payload !~ '^sha256:[a-f0-9]{64}$' OR p_registration_sha256 !~ '^[a-f0-9]{64}$' OR
     p_bytes NOT BETWEEN 1 AND 32768 OR p_valid_until<=0 THEN
    RAISE EXCEPTION 'C2_DELIVERY_PROC_DENIED';
  END IF;
  -- No direct DML or owner/definer membership via login role, even where a
  -- caller is later granted an unsafe role. Never rely on REVOKE from PUBLIC
  -- alone. Old or privileged roles are not suitable callers.
  IF pg_catalog.current_setting('session_replication_role')='replica' OR
     pg_catalog.has_parameter_privilege(caller,'session_replication_role','SET') OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE
       pg_catalog.pg_has_role(caller,r.oid,'MEMBER') AND
       pg_catalog.has_parameter_privilege(r.oid,'session_replication_role','SET')) OR
     pg_catalog.pg_has_role(caller,definer,'MEMBER') OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=caller AND
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)) OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls) AND
       pg_catalog.pg_has_role(caller,r.oid,'MEMBER')) OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE (n.nspname IN ('elp210_candidate','elp210_c2_p7_candidate','elp210_c2_preparation',
           'elp210_c2_revision_candidate','elp210_c2_fence_candidate','elp210_c2_delivery_candidate',
           'elp210_c2_financial_candidate') OR
         (n.nspname='public' AND c.relname IN ('portal_users','auth_sessions','portal_owner_anchor','workspaces','workspace_members',
           'execution_command_status_context_links','execution_command_status_delivery_acks')))
       AND c.relkind='r' AND
         (pg_catalog.pg_has_role(caller,c.relowner,'MEMBER') OR
          EXISTS(SELECT 1 FROM pg_catalog.pg_roles parent WHERE pg_catalog.pg_has_role(caller,parent.oid,'MEMBER') AND
            (pg_catalog.has_table_privilege(parent.oid,c.oid,'INSERT') OR pg_catalog.has_table_privilege(parent.oid,c.oid,'UPDATE') OR
             pg_catalog.has_any_column_privilege(parent.oid,c.oid,'INSERT') OR pg_catalog.has_any_column_privilege(parent.oid,c.oid,'UPDATE') OR
             pg_catalog.has_table_privilege(parent.oid,c.oid,'DELETE') OR pg_catalog.has_table_privilege(parent.oid,c.oid,'TRUNCATE') OR
             pg_catalog.has_table_privilege(parent.oid,c.oid,'TRIGGER'))))) OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('elp210_candidate','elp210_c2_p7_candidate',
       'elp210_c2_preparation','elp210_c2_revision_candidate','elp210_c2_fence_candidate','elp210_c2_delivery_candidate',
       'elp210_c2_financial_candidate') AND
       (pg_catalog.pg_has_role(caller,n.nspowner,'MEMBER') OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles parent
         WHERE pg_catalog.pg_has_role(caller,parent.oid,'MEMBER') AND pg_catalog.has_schema_privilege(parent.oid,n.oid,'CREATE')))) THEN
    RAISE EXCEPTION 'C2_DELIVERY_PROC_UNSAFE_CALLER';
  END IF;

  -- Crucial order: authority row before the obligation row. A trigger alone
  -- cannot guarantee this ordering because PostgreSQL locks a row before a
  -- BEFORE ROW UPDATE trigger runs. Rotation must remain head-only.
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_DENIED'; END IF;
  -- The obligation schema does not yet retain the registration ID. Do not
  -- permit the caller to substitute a different same-owner/workload scope:
  -- require a single immutable historical scope and match its registration
  -- even for UNKNOWN. Multiple scopes deliberately fail closed.
  IF (SELECT count(*) FROM elp210_c2_fence_candidate.scopes s
      WHERE s.workspace_id=p_workspace AND s.owner_user_id=p_owner AND s.workload_id=p_workload)<>1 OR
     NOT EXISTS(SELECT 1 FROM elp210_c2_fence_candidate.scopes s
       JOIN elp210_c2_p7_candidate.registrations r USING(registration_key)
       WHERE s.registration_key=p_registration AND s.registration_sha256=p_registration_sha256
         AND s.workspace_id=p_workspace AND s.owner_user_id=p_owner AND s.workload_id=p_workload
         AND r.registration_sha256=p_registration_sha256 AND r.workspace_id=p_workspace AND r.owner_user_id=p_owner)
  THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_DENIED'; END IF;
  IF p_action<>'UNKNOWN' AND NOT EXISTS(
    SELECT 1 FROM elp210_c2_fence_candidate.scopes s
    JOIN elp210_c2_p7_candidate.registrations r USING(registration_key)
    WHERE s.registration_key=p_registration AND s.registration_sha256=p_registration_sha256
      AND s.workspace_id=p_workspace AND s.owner_user_id=p_owner AND s.workload_id=p_workload AND s.state='OPEN'
      AND r.registration_sha256=p_registration_sha256 AND r.workspace_id=p_workspace AND r.owner_user_id=p_owner
      AND r.state='ACTIVE' AND r.expires_at_ms>floor(extract(epoch FROM pg_catalog.clock_timestamp())*1000)::bigint
  ) THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_DENIED'; END IF;

  IF p_action='RESERVE' THEN
    INSERT INTO elp210_c2_delivery_candidate.obligations
      (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,valid_until_ms,state)
      VALUES(p_lease,p_workspace,p_owner,p_workload,p_request,p_original,p_payload,p_bytes,p_valid_until,'RESERVED');
    RETURN 'RESERVED_NOT_DELIVERED';
  END IF;
  IF p_action='UNKNOWN' THEN
    -- Lost-response replay is only a read of the already-recorded exact
    -- obligation. It is not permission to ISSUE or SEND, an acknowledgement,
    -- or a new event. Authority was acquired before this row lock. This
    -- read-only path does not exercise the local generation WRITE fence.
    SELECT state INTO stored FROM elp210_c2_delivery_candidate.obligations
      WHERE lease_id=p_lease AND workspace_id=p_workspace AND owner_user_id=p_owner AND workload_id=p_workload
        AND request_digest=p_request AND original_digest=p_original AND payload_digest=p_payload
        AND payload_bytes=p_bytes AND valid_until_ms=p_valid_until FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_BINDING_MISMATCH'; END IF;
    IF stored='UNKNOWN' THEN RETURN 'UNKNOWN_NOT_ACKNOWLEDGED'; END IF;
  END IF;
  IF p_action='SENDING' THEN
    SELECT state INTO stored FROM elp210_c2_delivery_candidate.obligations
      WHERE lease_id=p_lease AND workspace_id=p_workspace AND owner_user_id=p_owner AND workload_id=p_workload
        AND request_digest=p_request AND original_digest=p_original AND payload_digest=p_payload
        AND payload_bytes=p_bytes AND valid_until_ms=p_valid_until FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_BINDING_MISMATCH'; END IF;
    IF stored<>'RESERVED' THEN RAISE EXCEPTION 'C2_DELIVERY_TRANSITION_INVALID'; END IF;
  END IF;
  IF p_action='HOLD' THEN
    SELECT sender_claim_xid INTO claim_xid FROM elp210_c2_delivery_candidate.obligations
      WHERE lease_id=p_lease AND workspace_id=p_workspace AND owner_user_id=p_owner AND workload_id=p_workload
        AND request_digest=p_request AND original_digest=p_original AND payload_digest=p_payload
        AND payload_bytes=p_bytes AND valid_until_ms=p_valid_until AND state='SENDING'
        AND sender_backend_pid=pg_catalog.pg_backend_pid()
        AND sender_token_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.current_setting('portal.c2_send_token',true),'UTF8')),'hex') FOR UPDATE;
    IF NOT FOUND OR claim_xid IS NULL THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_BINDING_MISMATCH'; END IF;
    -- MVCC excludes an uncommitted claim made by another transaction; this
    -- check excludes the current transaction (including its savepoints).
    IF claim_xid=pg_catalog.pg_current_xact_id() THEN RAISE EXCEPTION 'C2_DELIVERY_CLAIM_NOT_COMMITTED'; END IF;
  END IF;
  -- HOLD revalidates and locks the committed SENDING claim for the original
  -- backend session until HTTP finishes. A different PostgreSQL backend may
  -- not take it over after process/connection loss. HOLD requires a distinct
  -- transaction, but cannot force an unqualified caller to use HOLD at all.
  -- The application must discard its connection after an uncertain outcome.
  UPDATE elp210_c2_delivery_candidate.obligations SET
      state=CASE WHEN p_action='HOLD' THEN 'SENDING' ELSE p_action END,
      sender_backend_pid=CASE WHEN p_action='SENDING' THEN pg_catalog.pg_backend_pid() ELSE sender_backend_pid END,
      sender_claim_xid=CASE WHEN p_action='SENDING' THEN pg_catalog.pg_current_xact_id() ELSE sender_claim_xid END,
      sender_token_sha256=CASE WHEN p_action='SENDING' THEN
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.current_setting('portal.c2_send_token',true),'UTF8')),'hex') ELSE sender_token_sha256 END
    WHERE lease_id=p_lease AND workspace_id=p_workspace AND owner_user_id=p_owner AND workload_id=p_workload
      AND request_digest=p_request AND original_digest=p_original AND payload_digest=p_payload
      AND payload_bytes=p_bytes AND valid_until_ms=p_valid_until
      AND (p_action<>'HOLD' OR (state='SENDING' AND sender_backend_pid=pg_catalog.pg_backend_pid() AND
        sender_token_sha256=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.current_setting('portal.c2_send_token',true),'UTF8')),'hex')))
    RETURNING state INTO stored;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_BINDING_MISMATCH'; END IF;
  IF stored='SENDING' THEN RETURN 'SENDING_NOT_ACKNOWLEDGED'; END IF;
  RETURN 'UNKNOWN_NOT_ACKNOWLEDGED';
END $$;
REVOKE ALL ON FUNCTION elp210_c2_delivery_candidate.apply_candidate(text,text,text,text,text,text,text,text,integer,bigint,text,text) FROM PUBLIC;

DO $$
DECLARE suffix text:=pg_catalog.right(current_database(),8);
  definer text:='test_delivery_definer_'||suffix; caller text:='test_delivery_caller_'||suffix;
BEGIN
  IF suffix !~ '^[a-f0-9]{8}$' THEN RAISE EXCEPTION 'C2_DELIVERY_PROC_DISPOSABLE_DATABASE_REQUIRED'; END IF;
  EXECUTE pg_catalog.format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION',definer);
  EXECUTE pg_catalog.format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION',caller);
  EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA elp210_candidate,elp210_c2_p7_candidate,elp210_c2_fence_candidate,elp210_c2_delivery_candidate TO %I',definer);
  EXECUTE pg_catalog.format('GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO %I',definer);
  -- The obligation trigger reads the exact lease FOR SHARE; PostgreSQL
  -- requires UPDATE privilege on at least one column for that row lock.
  -- Only the NOLOGIN definer receives it; the routine does not update leases.
  EXECUTE pg_catalog.format('GRANT SELECT,UPDATE(phase) ON elp210_candidate.leases TO %I',definer);
  EXECUTE pg_catalog.format('GRANT SELECT ON elp210_c2_p7_candidate.registrations,elp210_c2_fence_candidate.scopes,elp210_c2_delivery_candidate.limits TO %I',definer);
  EXECUTE pg_catalog.format('GRANT SELECT,INSERT,UPDATE(state,sender_backend_pid,sender_token_sha256,sender_claim_xid) ON elp210_c2_delivery_candidate.obligations TO %I',definer);
  EXECUTE pg_catalog.format('GRANT INSERT ON elp210_c2_delivery_candidate.events TO %I',definer);
  EXECUTE pg_catalog.format('GRANT USAGE ON SEQUENCE elp210_c2_delivery_candidate.events_event_id_seq TO %I',definer);
  EXECUTE pg_catalog.format('ALTER FUNCTION elp210_c2_delivery_candidate.apply_candidate(text,text,text,text,text,text,text,text,integer,bigint,text,text) OWNER TO %I',definer);
  EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA elp210_c2_delivery_candidate TO %I',caller);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION elp210_c2_delivery_candidate.apply_candidate(text,text,text,text,text,text,text,text,integer,bigint,text,text) TO %I',caller);
END $$;
COMMIT;
