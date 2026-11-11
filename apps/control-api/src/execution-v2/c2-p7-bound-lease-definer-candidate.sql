-- UNMOUNTED CANDIDATE. Run inside a trusted operator's single transaction
-- after transferring only guard_p7_bound_lease() to the provisioned NOLOGIN
-- role and granting its narrowly reviewed read/row-lock privileges. This file
-- creates no role, member or grant. It is NOT an authorization, migration or
-- assertion that other legacy triggers have safe ownership/ACL.
DO $$
DECLARE owner_oid oid := (current_user::regrole)::oid; target_oid oid;
BEGIN
  target_oid := 'elp210_c2_fence_candidate.guard_p7_bound_lease()'::regprocedure::oid;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=owner_oid
       AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb
       AND NOT r.rolreplication AND NOT r.rolbypassrls)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
       AND pg_catalog.pg_has_role(owner_oid,r.oid,'MEMBER'))
     -- A runtime login (or intermediary non-superuser role) must not be able
     -- to assume the privileged row-lock role. Superusers are operationally
     -- outside this candidate's trust boundary and must be isolated separately.
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
       WHERE r.oid<>owner_oid AND NOT r.rolsuper
         AND pg_catalog.pg_has_role(r.oid,owner_oid,'MEMBER'))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=target_oid AND p.proowner=owner_oid
       AND p.prorettype='trigger'::regtype AND NOT p.prosecdef)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate')
       AND (pg_catalog.pg_has_role(owner_oid,n.nspowner,'MEMBER') OR
            pg_catalog.has_schema_privilege(owner_oid,n.oid,'CREATE')))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate')
       AND c.relkind IN ('r','p','f') AND (pg_catalog.pg_has_role(owner_oid,c.relowner,'MEMBER')
         OR pg_catalog.has_table_privilege(owner_oid,c.oid,'INSERT,DELETE,TRUNCATE,TRIGGER')))
     OR pg_catalog.has_parameter_privilege(owner_oid,'session_replication_role','SET')
  THEN RAISE EXCEPTION 'C2_P7_DB_DEFINER_UNSAFE'; END IF;
END $$;
ALTER FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease() SECURITY DEFINER SET search_path=pg_catalog;
REVOKE ALL ON FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease() FROM PUBLIC;
