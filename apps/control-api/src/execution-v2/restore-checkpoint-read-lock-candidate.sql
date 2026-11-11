-- TEST/PREPARATION ONLY. Provision separately on the authority database by
-- its qualified owner; this is not a Portal migration or restore permission.
-- The owner must be able to lock exactly these relations. Grant EXECUTE only
-- to the separately qualified verifier role; never grant it table writes.
CREATE FUNCTION portal_restore_authority.lock_journal_for_read() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  -- A table lock blocks trigger DDL, but CREATE OR REPLACE FUNCTION can keep
  -- the trigger OID while changing its body. Hold this authority database's
  -- function catalog stable through the same bounded read transaction. This
  -- is database-wide DDL coordination, not protection against a superuser who
  -- can terminate sessions; its contention and definer ownership must be
  -- qualified before any installation.
  LOCK TABLE pg_catalog.pg_proc IN SHARE MODE;
  LOCK TABLE portal_restore_authority.checkpoints,
    portal_restore_authority.events,
    portal_restore_authority.closed_observations IN SHARE MODE;
END
$$;
REVOKE ALL ON FUNCTION portal_restore_authority.lock_journal_for_read() FROM PUBLIC;

-- The authority writer cannot take SHARE on its own journal tables without
-- serializing all writers; it needs only the same catalog fence before it
-- checks guards and writes under its existing journal/row locks. Grant this
-- separately to the qualified writer, never PUBLIC.
CREATE FUNCTION portal_restore_authority.lock_guard_catalog_for_write() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  LOCK TABLE pg_catalog.pg_proc IN SHARE MODE;
END
$$;
REVOKE ALL ON FUNCTION portal_restore_authority.lock_guard_catalog_for_write() FROM PUBLIC;
