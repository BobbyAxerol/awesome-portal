-- UNMOUNTED CANDIDATE. Provision an isolated NOLOGIN owner and review its
-- narrow row-lock grants before running this in one trusted transaction as
-- that owner. No role, grant, source authority or runtime is installed here.
DO $$
DECLARE owner_oid oid := (current_user::regrole)::oid; target_oid oid;
BEGIN
  target_oid := 'elp210_c2_delivery_candidate.guard_p7_delivery()'::regprocedure::oid;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=owner_oid
       AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb
       AND NOT r.rolreplication AND NOT r.rolbypassrls)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
       AND pg_catalog.pg_has_role(owner_oid,r.oid,'MEMBER'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid<>owner_oid AND NOT r.rolsuper
       AND pg_catalog.pg_has_role(r.oid,owner_oid,'MEMBER'))
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=target_oid AND p.proowner=owner_oid
       AND p.prorettype='trigger'::regtype AND NOT p.prosecdef)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN
       ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
       AND (pg_catalog.pg_has_role(owner_oid,n.nspowner,'MEMBER') OR
         pg_catalog.has_schema_privilege(owner_oid,n.oid,'CREATE')))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
         AND c.relkind IN ('r','p','f') AND (pg_catalog.pg_has_role(owner_oid,c.relowner,'MEMBER') OR
           pg_catalog.has_table_privilege(owner_oid,c.oid,'INSERT,DELETE,TRUNCATE,TRIGGER')))
     -- PostgreSQL requires column UPDATE for row locks. Permit only the
     -- minimal, separately reviewed lock columns; a table-wide grant fails.
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
         AND c.relkind IN ('r','p','f') AND pg_catalog.has_column_privilege(owner_oid,c.oid,a.attnum,'UPDATE')
         AND NOT ((c.oid='elp210_candidate.authority'::regclass AND a.attname='drain_id')
           OR (c.oid='elp210_c2_p7_candidate.owner_intents'::regclass AND a.attname='action')
           OR (c.oid='elp210_c2_p7_candidate.records'::regclass AND a.attname='confirmation_sha256')
           OR (c.oid='elp210_c2_p7_candidate.registrations'::regclass AND a.attname='state')))
     OR pg_catalog.has_parameter_privilege(owner_oid,'session_replication_role','SET')
  THEN RAISE EXCEPTION 'C2_P7_DELIVERY_DEFINER_UNSAFE'; END IF;
END $$;
ALTER FUNCTION elp210_c2_delivery_candidate.guard_p7_delivery() SECURITY DEFINER SET search_path=pg_catalog;
REVOKE ALL ON FUNCTION elp210_c2_delivery_candidate.guard_p7_delivery() FROM PUBLIC;
