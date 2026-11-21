-- SOURCE/TEST ONLY: bounded forward preparation for an existing candidate
-- custody schema. This does not grant a writer, install runtime or permit DR.
-- A separately qualified authority owner must check database-wide DDL impact.
BEGIN;
SET LOCAL lock_timeout='1000ms';
SET LOCAL statement_timeout='3000ms';
SET LOCAL search_path=pg_catalog;
LOCK TABLE pg_catalog.pg_proc IN SHARE ROW EXCLUSIVE MODE;
DO $upgrade$
DECLARE r record; expected_owner oid;
BEGIN
  SELECT oid INTO expected_owner FROM pg_catalog.pg_roles WHERE rolname=current_user;
  IF expected_owner IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='portal_restore_original_custody'
      AND n.nspowner=expected_owner
  ) OR EXISTS (
    SELECT 1 FROM (VALUES ('head'),('events'),('source_proofs')) AS required(name)
    LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('portal_restore_original_custody.'||required.name)
    WHERE c.oid IS NULL OR c.relkind<>'r' OR c.relowner<>expected_owner
  ) THEN RAISE EXCEPTION 'RESTORE_CUSTODY_HELPER_UPGRADE_UNSAFE'; END IF;

  SELECT p.*,l.lanname INTO r FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE p.oid=pg_catalog.to_regprocedure('portal_restore_original_custody.lock_guard_catalog_for_write()');
  IF FOUND THEN
    IF r.proowner<>expected_owner OR r.lanname<>'plpgsql' OR r.prokind<>'f' OR r.pronargs<>0
      OR r.prorettype<>'pg_catalog.void'::regtype OR NOT r.prosecdef OR r.proleakproof
      OR r.provolatile<>'v' OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
      OR pg_catalog.btrim(pg_catalog.regexp_replace(r.prosrc,'[[:space:]]+',' ','g'))<>
        'BEGIN LOCK TABLE pg_catalog.pg_proc IN SHARE MODE; END'
      OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(r.proacl,pg_catalog.acldefault('f',r.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'RESTORE_CUSTODY_HELPER_UPGRADE_UNSAFE';
    END IF;
  ELSE
    EXECUTE $ddl$CREATE FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
      BEGIN LOCK TABLE pg_catalog.pg_proc IN SHARE MODE; END
      $body$$ddl$;
    REVOKE ALL ON FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write() FROM PUBLIC;
  END IF;
END
$upgrade$;
COMMIT;
