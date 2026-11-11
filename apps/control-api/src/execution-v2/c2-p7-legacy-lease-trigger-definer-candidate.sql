-- UNMOUNTED CANDIDATE, not a migration or runtime authorization. The trusted
-- operator must provision separate NOLOGIN function owners, transfer only the
-- two named functions, and grant the exact reads/row-locks/event insert before
-- executing this file atomically. This script creates no roles or grants.
DO $$
DECLARE guard_oid oid; event_oid oid; owner_oid oid;
BEGIN
  SELECT proowner INTO guard_oid FROM pg_catalog.pg_proc
    WHERE oid='elp210_c2_fence_candidate.guard_lease()'::regprocedure
      AND prorettype='trigger'::regtype AND NOT prosecdef;
  SELECT proowner INTO event_oid FROM pg_catalog.pg_proc
    WHERE oid='elp210_candidate.lease_event()'::regprocedure
      AND prorettype='trigger'::regtype AND NOT prosecdef;
  IF guard_oid IS NULL OR event_oid IS NULL OR guard_oid=event_oid
    THEN RAISE EXCEPTION 'C2_P7_LEGACY_DEFINER_UNSAFE'; END IF;
  FOREACH owner_oid IN ARRAY ARRAY[guard_oid,event_oid] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=owner_oid
       AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreaterole
       AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls)
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE
        (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
        AND pg_catalog.pg_has_role(owner_oid,r.oid,'MEMBER'))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid<>owner_oid AND NOT r.rolsuper
        AND pg_catalog.pg_has_role(r.oid,owner_oid,'MEMBER'))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
        WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate')
          AND (pg_catalog.pg_has_role(owner_oid,n.nspowner,'MEMBER')
            OR pg_catalog.has_schema_privilege(owner_oid,n.oid,'CREATE')))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate')
          AND c.relkind IN ('r','p','f') AND (pg_catalog.pg_has_role(owner_oid,c.relowner,'MEMBER')
            OR pg_catalog.has_table_privilege(owner_oid,c.oid,'DELETE,TRUNCATE,TRIGGER')
            OR (pg_catalog.has_table_privilege(owner_oid,c.oid,'INSERT')
              AND NOT (owner_oid=event_oid AND c.oid='elp210_candidate.events'::regclass))))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
        WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate')
          AND c.relkind IN ('r','p','f') AND pg_catalog.has_column_privilege(owner_oid,c.oid,a.attnum,'UPDATE')
          AND NOT (c.oid='elp210_candidate.authority'::regclass
            AND ((owner_oid=guard_oid AND a.attname='drain_id') OR (owner_oid=event_oid AND a.attname='lease_epoch'))))
      OR pg_catalog.has_parameter_privilege(owner_oid,'session_replication_role','SET')
    THEN RAISE EXCEPTION 'C2_P7_LEGACY_DEFINER_UNSAFE'; END IF;
  END LOOP;
END $$;
ALTER FUNCTION elp210_c2_fence_candidate.guard_lease() SECURITY DEFINER SET search_path=pg_catalog;
ALTER FUNCTION elp210_candidate.lease_event() SECURITY DEFINER SET search_path=pg_catalog;
REVOKE ALL ON FUNCTION elp210_c2_fence_candidate.guard_lease() FROM PUBLIC;
REVOKE ALL ON FUNCTION elp210_candidate.lease_event() FROM PUBLIC;
