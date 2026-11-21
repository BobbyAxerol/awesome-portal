-- UNMOUNTED forward upgrade for an existing checkpoint authority database.
-- The qualified helper owner must run this bounded transaction; it changes no
-- journal rows and does not itself grant reader/writer EXECUTE or authorize DR.
BEGIN;
SET LOCAL lock_timeout='1000ms';
SET LOCAL statement_timeout='3000ms';
-- Serialize function replacement with validation. This blocks function DDL
-- across the authority DB for this transaction and requires prior qualification.
LOCK TABLE pg_catalog.pg_proc IN SHARE ROW EXCLUSIVE MODE;
DO $upgrade$
DECLARE
  r record;
  normalized text;
  old_body constant text := 'BEGIN LOCK TABLE portal_restore_authority.checkpoints, portal_restore_authority.events, portal_restore_authority.closed_observations IN SHARE MODE; END';
  new_body constant text := 'BEGIN LOCK TABLE pg_catalog.pg_proc IN SHARE MODE; LOCK TABLE portal_restore_authority.checkpoints, portal_restore_authority.events, portal_restore_authority.closed_observations IN SHARE MODE; END';
  write_body constant text := 'BEGIN LOCK TABLE pg_catalog.pg_proc IN SHARE MODE; END';
BEGIN
  SELECT p.*,l.lanname INTO r FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure('portal_restore_authority.lock_journal_for_read()');
  IF NOT FOUND OR r.proowner <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
    OR r.lanname <> 'plpgsql' OR r.prokind <> 'f' OR r.pronargs <> 0
    OR r.prorettype <> 'pg_catalog.void'::regtype OR NOT r.prosecdef OR r.proleakproof
    OR r.provolatile <> 'v' OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
    OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(r.proacl,pg_catalog.acldefault('f',r.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'V2_CHECKPOINT_HELPER_UPGRADE_UNSAFE';
  END IF;
  normalized := btrim(regexp_replace(regexp_replace(r.prosrc, '--[^\n\r]*', '', 'g'), '[[:space:]]+', ' ', 'g'));
  IF normalized NOT IN (old_body,new_body) THEN RAISE EXCEPTION 'V2_CHECKPOINT_HELPER_UPGRADE_UNSAFE'; END IF;

  SELECT p.*,l.lanname INTO r FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure('portal_restore_authority.lock_guard_catalog_for_write()');
  IF FOUND THEN
    normalized := btrim(regexp_replace(regexp_replace(r.prosrc, '--[^\n\r]*', '', 'g'), '[[:space:]]+', ' ', 'g'));
    IF r.proowner <> (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
      OR r.lanname <> 'plpgsql' OR r.prokind <> 'f' OR r.pronargs <> 0
      OR r.prorettype <> 'pg_catalog.void'::regtype OR NOT r.prosecdef OR r.proleakproof
      OR r.provolatile <> 'v' OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
      OR normalized <> write_body
      OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(r.proacl,pg_catalog.acldefault('f',r.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'V2_CHECKPOINT_HELPER_UPGRADE_UNSAFE';
    END IF;
  ELSE
    EXECUTE $ddl$CREATE FUNCTION portal_restore_authority.lock_guard_catalog_for_write() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
      BEGIN LOCK TABLE pg_catalog.pg_proc IN SHARE MODE; END
      $body$$ddl$;
    REVOKE ALL ON FUNCTION portal_restore_authority.lock_guard_catalog_for_write() FROM PUBLIC;
  END IF;
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION portal_restore_authority.lock_journal_for_read() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
    BEGIN LOCK TABLE pg_catalog.pg_proc IN SHARE MODE;
      LOCK TABLE portal_restore_authority.checkpoints, portal_restore_authority.events,
        portal_restore_authority.closed_observations IN SHARE MODE; END
    $body$$ddl$;
END
$upgrade$;
COMMIT;
