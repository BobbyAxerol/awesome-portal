-- TEST ONLY. This is not an installed field authority, source or ACK.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^portal_restore_rls_[a-f0-9]{8}$' AND NOT (
    current_database() ~ '^portal_c2_p7_[a-f0-9]{8}$' AND
    coalesce(current_setting('portal.test_only_p7_delivery',true),'')='TEST_ONLY_C2_P7_DEDICATED_DATABASE'
  ) THEN RAISE EXCEPTION 'C2_FINANCIAL_READER_DISPOSABLE_DATABASE_REQUIRED'; END IF;
END $$;
CREATE FUNCTION elp210_c2_delivery_candidate.read_financial_candidate(
  p_context text,p_lease text,p_binding text,p_receiver text,p_request text,p_assertion text,
  p_issued bigint,p_expires bigint,p_revision bigint,p_workspace text,p_owner text,p_session text,
  p_session_revision bigint,p_workload text
) RETURNS TABLE(original_digest text,expires_at_ms bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller oid:=(session_user::regrole)::oid; definer oid:=(current_user::regrole)::oid;
BEGIN
  IF pg_catalog.pg_has_role(caller,definer,'MEMBER') OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_catalog.pg_has_role(caller,r.oid,'MEMBER') AND
      (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR
       pg_catalog.has_table_privilege(r.oid,'elp210_c2_financial_candidate.originals','SELECT') OR
       pg_catalog.has_any_column_privilege(r.oid,'elp210_c2_financial_candidate.originals','SELECT') OR
       pg_catalog.has_table_privilege(r.oid,'elp210_c2_financial_candidate.originals','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR
       pg_catalog.has_any_column_privilege(r.oid,'elp210_c2_financial_candidate.originals','INSERT,UPDATE') OR
       pg_catalog.has_table_privilege(r.oid,'elp210_candidate.leases','SELECT') OR
       pg_catalog.has_any_column_privilege(r.oid,'elp210_candidate.leases','SELECT'))
  ) OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='elp210_c2_financial_candidate' AND c.relname='originals' AND
        pg_catalog.pg_has_role(caller,c.relowner,'MEMBER')) OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='elp210_c2_financial_candidate' AND
      (pg_catalog.pg_has_role(caller,n.nspowner,'MEMBER') OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r
        WHERE pg_catalog.pg_has_role(caller,r.oid,'MEMBER') AND pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE'))))
  THEN RAISE EXCEPTION 'C2_FINANCIAL_READER_UNSAFE_CALLER'; END IF;
  RETURN QUERY SELECT o.context_digest,l.expires_at_ms FROM elp210_c2_financial_candidate.originals o
    JOIN elp210_candidate.leases l ON l.lease_id=o.lease_id AND l.c2_financial_context_digest=o.context_digest
    WHERE o.context_digest=p_context AND o.lease_id=p_lease AND o.binding_digest=p_binding AND o.receiver_id=p_receiver
      AND o.request_digest=p_request AND o.workspace_id=p_workspace AND o.subject_id=p_owner AND o.session_id=p_session
      AND o.session_revision=p_session_revision AND o.workload_id=p_workload AND o.expires_at_ms>=l.expires_at_ms
      AND l.human_assertion_digest=p_assertion AND l.issued_at_ms=p_issued AND l.expires_at_ms=p_expires
      AND l.authority_revision=p_revision AND l.workspace_id=p_workspace AND l.subject_id=p_owner AND l.session_id=p_session
      AND l.session_revision=p_session_revision AND l.workload_id=p_workload AND l.environment='paper'
      AND l.phase='ISSUED' AND l.request_digest=p_request AND l.c2_custody_binding_digest IS NOT NULL
      AND l.c2_p7_binding_digest IS NOT NULL AND l.c2_p7_owner_intent_id IS NOT NULL LIMIT 2;
END $$;
REVOKE ALL ON FUNCTION elp210_c2_delivery_candidate.read_financial_candidate(text,text,text,text,text,text,bigint,bigint,bigint,text,text,text,bigint,text) FROM PUBLIC;
DO $$
DECLARE suffix text:=pg_catalog.right(current_database(),8);
  definer text:='test_delivery_definer_'||suffix; caller text:='test_delivery_caller_'||suffix;
BEGIN
  EXECUTE pg_catalog.format('ALTER FUNCTION elp210_c2_delivery_candidate.read_financial_candidate(text,text,text,text,text,text,bigint,bigint,bigint,text,text,text,bigint,text) OWNER TO %I',definer);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION elp210_c2_delivery_candidate.read_financial_candidate(text,text,text,text,text,text,bigint,bigint,bigint,text,text,text,bigint,text) TO %I',caller);
END $$;
COMMIT;
