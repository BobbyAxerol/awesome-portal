-- TEST_ONLY against a disposable, separately isolated restore DB. This script
-- does NOT authorize restore/cutover, fence an old DB, preserve post-snapshot
-- grants or stop in-flight HTTP. Real use would invalidate all login sessions
-- and requires an independently verified authority boundary and approval.
-- Caller MUST COMMIT or ROLLBACK; do not expose this DB until independently
-- reconciled. Fixed small cap is a test safety limit, NOT a production budget.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '5s';
DO $$ BEGIN
  IF current_database() !~ '^portal_restore_rls_[a-f0-9]{8}$' THEN
    RAISE EXCEPTION 'TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED'; END IF;
END $$;
LOCK TABLE public.auth_sessions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.auth_sessions WHERE state='ACTIVE') > 100 THEN
    RAISE EXCEPTION 'TEST_ONLY_SESSION_LIMIT'; END IF;
END $$;
UPDATE public.auth_sessions SET state='REVOKED', revoked_at=clock_timestamp(),
  revoke_reason='TEST_ONLY_RESTORE_QUARANTINE' WHERE state='ACTIVE';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.auth_sessions WHERE state='ACTIVE') THEN
    RAISE EXCEPTION 'TEST_ONLY_ACTIVE_SESSION_REMAINS'; END IF;
END $$;
