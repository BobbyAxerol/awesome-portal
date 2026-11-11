-- TEST ONLY. This restricted reader is not a production source, owner, or
-- field-authority qualification. Install only in a fresh disposable cell.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^portal_restore_rls_[a-f0-9]{8}$' AND NOT (
    current_database() ~ '^portal_c2_p7_[a-f0-9]{8}$' AND
    coalesce(current_setting('portal.test_only_p7_delivery',true),'')='TEST_ONLY_C2_P7_DEDICATED_DATABASE'
  ) THEN
    RAISE EXCEPTION 'C2_STATUS_READER_DISPOSABLE_DATABASE_REQUIRED';
  END IF;
END $$;

CREATE FUNCTION elp210_c2_delivery_candidate.read_status_candidate(
  p_context text,p_sequence integer,p_lease text,p_previous text,p_binding text,p_receiver text,
  p_request text,p_assertion text,p_issued bigint,p_expires bigint,p_revision bigint,
  p_workspace text,p_owner text,p_workload text
) RETURNS TABLE(original_digest text,expires_at_ms bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  caller oid := (session_user::regrole)::oid;
  definer oid := (current_user::regrole)::oid;
BEGIN
  IF pg_catalog.pg_has_role(caller,definer,'MEMBER') OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_catalog.pg_has_role(caller,r.oid,'MEMBER') AND
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR
        pg_catalog.has_table_privilege(r.oid,'public.execution_command_status_context_links','SELECT') OR
        pg_catalog.has_any_column_privilege(r.oid,'public.execution_command_status_context_links','SELECT') OR
        pg_catalog.has_table_privilege(r.oid,'elp210_candidate.leases','SELECT') OR
        pg_catalog.has_any_column_privilege(r.oid,'elp210_candidate.leases','SELECT'))) THEN
    RAISE EXCEPTION 'C2_STATUS_READER_UNSAFE_CALLER';
  END IF;
  RETURN QUERY SELECT c.original_digest,l.expires_at_ms
    FROM public.execution_command_status_context_links c
    JOIN elp210_candidate.leases l ON l.lease_id=c.lease_id
    WHERE c.context_digest=p_context AND c.delivery_sequence=p_sequence AND c.lease_id=p_lease
      AND c.previous_lease_id IS NOT DISTINCT FROM p_previous AND c.binding_digest=p_binding AND c.receiver_id=p_receiver
      AND c.request_digest=p_request AND c.assertion_digest=p_assertion AND c.assertion_digest=l.human_assertion_digest
      AND c.context_expires_at_ms>=l.expires_at_ms AND l.issued_at_ms=p_issued AND l.expires_at_ms=p_expires
      AND l.authority_revision=p_revision AND l.workspace_id=p_workspace AND l.subject_id=p_owner AND l.workload_id=p_workload
      AND l.environment='paper' AND l.phase='ISSUED' AND l.request_digest=p_request
      AND l.c2_custody_binding_digest IS NOT NULL AND l.c2_p7_binding_digest IS NOT NULL
      AND l.c2_p7_owner_intent_id IS NOT NULL LIMIT 2;
END $$;
REVOKE ALL ON FUNCTION elp210_c2_delivery_candidate.read_status_candidate(text,integer,text,text,text,text,text,text,bigint,bigint,bigint,text,text,text) FROM PUBLIC;
DO $$
DECLARE suffix text:=pg_catalog.right(current_database(),8);
  definer text:='test_delivery_definer_'||suffix; caller text:='test_delivery_caller_'||suffix;
BEGIN
  EXECUTE pg_catalog.format('ALTER FUNCTION elp210_c2_delivery_candidate.read_status_candidate(text,integer,text,text,text,text,text,text,bigint,bigint,bigint,text,text,text) OWNER TO %I',definer);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION elp210_c2_delivery_candidate.read_status_candidate(text,integer,text,text,text,text,text,text,bigint,bigint,bigint,text,text,text) TO %I',caller);
END $$;
COMMIT;
