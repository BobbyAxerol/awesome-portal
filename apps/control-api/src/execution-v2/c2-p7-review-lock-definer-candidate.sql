-- ISOLATED CANDIDATE. Run in a single trusted transaction AS the separate,
-- provisioned NOLOGIN function owner after independently reviewing grants.
-- It creates no roles/grants and is not a product migration or P7 authority.
DO $$
DECLARE owner_oid oid := (current_user::regrole)::oid;
  by_id oid := 'elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid)'::regprocedure::oid;
  by_proof oid := 'elp210_c2_p7_candidate.lock_owner_intent_by_proof(text)'::regprocedure::oid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid=owner_oid
       AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb
       AND NOT r.rolreplication AND NOT r.rolbypassrls)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE
       (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
       AND pg_catalog.pg_has_role(owner_oid,r.oid,'MEMBER'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid<>owner_oid AND NOT r.rolsuper
       AND pg_catalog.pg_has_role(r.oid,owner_oid,'MEMBER'))
    OR (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN (by_id,by_proof)
       AND p.proowner=owner_oid AND NOT p.prosecdef
       AND p.prorettype='elp210_c2_p7_candidate.owner_intents'::regtype AND p.proretset) <> 2
    -- Ownership and a familiar name do not prove the body or language.
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
       WHERE p.oid=by_id AND l.lanname='sql' AND p.provolatile='v'
       AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
       AND pg_catalog.regexp_replace(p.prosrc,'^[[:space:]]+|[[:space:]]+$','','g')=$body$SELECT i.* FROM elp210_c2_p7_candidate.owner_intents AS i
  WHERE i.intent_id=p_intent_id FOR UPDATE$body$)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
       WHERE p.oid=by_proof AND l.lanname='sql' AND p.provolatile='v'
       AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
       AND pg_catalog.regexp_replace(p.prosrc,'^[[:space:]]+|[[:space:]]+$','','g')=$body$SELECT i.* FROM elp210_c2_p7_candidate.owner_intents AS i
  WHERE p_proof_sha256 ~ '^[0-9a-f]{64}$' AND i.proof_sha256=p_proof_sha256 FOR UPDATE$body$)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN
       ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
       AND (pg_catalog.pg_has_role(owner_oid,n.nspowner,'MEMBER') OR
         pg_catalog.has_schema_privilege(owner_oid,n.oid,'CREATE')))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
       AND c.relkind IN ('r','p','f') AND (pg_catalog.pg_has_role(owner_oid,c.relowner,'MEMBER') OR
         pg_catalog.has_table_privilege(owner_oid,c.oid,'INSERT,DELETE,TRUNCATE,TRIGGER')))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
       WHERE n.nspname IN ('elp210_candidate','elp210_c2_fence_candidate','elp210_c2_p7_candidate','elp210_c2_delivery_candidate')
         AND c.relkind IN ('r','p','f') AND pg_catalog.has_column_privilege(owner_oid,c.oid,a.attnum,'UPDATE')
         AND NOT (c.oid='elp210_c2_p7_candidate.owner_intents'::regclass AND a.attname='action'))
    OR NOT pg_catalog.has_schema_privilege(owner_oid,'elp210_c2_p7_candidate','USAGE')
    OR NOT pg_catalog.has_table_privilege(owner_oid,'elp210_c2_p7_candidate.owner_intents','SELECT')
    OR NOT pg_catalog.has_column_privilege(owner_oid,'elp210_c2_p7_candidate.owner_intents','action','UPDATE')
    OR pg_catalog.has_parameter_privilege(owner_oid,'session_replication_role','SET')
  THEN RAISE EXCEPTION 'C2_P7_REVIEW_LOCK_DEFINER_UNSAFE'; END IF;
END $$;
ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) SECURITY DEFINER SET search_path=pg_catalog;
ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(text) SECURITY DEFINER SET search_path=pg_catalog;
REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(text) FROM PUBLIC;
