-- CANDIDATE ONLY. Execute as a separate trusted NOLOGIN owner inside a
-- reviewed provisioning transaction. This creates no roles or grants.
DO $$
DECLARE owner_oid oid := (current_user::regrole)::oid;
  fn oid := 'elp210_c2_p7_candidate.lock_record_by_cycle(text)'::regprocedure::oid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=owner_oid
       AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb
       AND NOT r.rolreplication AND NOT r.rolbypassrls)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
       AND pg_catalog.pg_has_role(owner_oid,r.oid,'MEMBER'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid<>owner_oid AND NOT r.rolsuper
       AND pg_catalog.pg_has_role(r.oid,owner_oid,'MEMBER'))
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
       WHERE p.oid=fn AND p.proowner=owner_oid AND NOT p.prosecdef AND p.proretset
       AND p.prorettype='elp210_c2_p7_candidate.records'::regtype AND l.lanname='sql' AND p.provolatile='v'
       AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
       AND pg_catalog.regexp_replace(p.prosrc,'^[[:space:]]+|[[:space:]]+$','','g')=$body$SELECT r.* FROM elp210_c2_p7_candidate.records AS r
  WHERE p_cycle_sha256 ~ '^[0-9a-f]{64}$' AND r.cycle_sha256=p_cycle_sha256 FOR SHARE$body$)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN
       ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
       AND (pg_catalog.pg_has_role(owner_oid,n.nspowner,'MEMBER') OR pg_catalog.has_schema_privilege(owner_oid,n.oid,'CREATE')))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
       AND c.relkind IN ('r','p','f') AND (pg_catalog.pg_has_role(owner_oid,c.relowner,'MEMBER') OR
         pg_catalog.has_table_privilege(owner_oid,c.oid,'INSERT,DELETE,TRUNCATE,TRIGGER')))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
       AND c.relkind IN ('r','p','f') AND pg_catalog.has_column_privilege(owner_oid,c.oid,a.attnum,'UPDATE')
       AND NOT (c.oid='elp210_c2_p7_candidate.records'::regclass AND a.attname='binding_sha256'))
    OR NOT pg_catalog.has_schema_privilege(owner_oid,'elp210_c2_p7_candidate','USAGE')
    OR NOT pg_catalog.has_table_privilege(owner_oid,'elp210_c2_p7_candidate.records','SELECT')
    OR NOT pg_catalog.has_column_privilege(owner_oid,'elp210_c2_p7_candidate.records','binding_sha256','UPDATE')
    OR pg_catalog.has_parameter_privilege(owner_oid,'session_replication_role','SET')
  THEN RAISE EXCEPTION 'C2_P7_RECORD_LOCK_DEFINER_UNSAFE'; END IF;
END $$;
ALTER FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(text) SECURITY DEFINER SET search_path=pg_catalog;
REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(text) FROM PUBLIC;
