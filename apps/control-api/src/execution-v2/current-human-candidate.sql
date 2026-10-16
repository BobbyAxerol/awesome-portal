-- ELP2-10 UNMOUNTED candidate installer. NOT a numbered production migration.
-- Apply only to an isolated, explicitly allocated Core correctness database.
-- Existing identity/policy tables remain the SSOT. No credentials or rights seed.
BEGIN;
CREATE SCHEMA elp210_candidate;
REVOKE ALL ON SCHEMA elp210_candidate FROM PUBLIC;
CREATE TABLE elp210_candidate.authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  lease_epoch bigint NOT NULL DEFAULT 0 CHECK (lease_epoch BETWEEN 0 AND 9007199254740991),
  drain_id text CHECK (drain_id IS NULL OR length(drain_id) BETWEEN 1 AND 128)
);
INSERT INTO elp210_candidate.authority(singleton) VALUES(true);
CREATE TABLE elp210_candidate.leases (
  lease_id text PRIMARY KEY,
  authority_revision bigint NOT NULL,
  subject_id text NOT NULL,
  session_id text NOT NULL,
  session_revision bigint NOT NULL,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  workload_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[a-f0-9]{64}$'),
  authority_fingerprint text NOT NULL,
  issued_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=60000),
  phase text NOT NULL DEFAULT 'ISSUED' CHECK (phase IN ('ISSUED','ENTERED','UNKNOWN','COMMITTED','ROLLED_BACK','RETIRED')),
  attempt_id text,
  terminal_receipt_digest text,
  CHECK ((phase='ISSUED' AND attempt_id IS NULL AND terminal_receipt_digest IS NULL)
    OR (phase IN ('ENTERED','UNKNOWN') AND attempt_id IS NOT NULL AND terminal_receipt_digest IS NULL)
    OR (phase IN ('COMMITTED','ROLLED_BACK') AND attempt_id IS NOT NULL AND terminal_receipt_digest IS NOT NULL)
    OR (phase='RETIRED' AND attempt_id IS NULL AND terminal_receipt_digest IS NULL))
);
CREATE INDEX leases_unresolved ON elp210_candidate.leases(phase,expires_at_ms)
  WHERE phase IN ('ISSUED','ENTERED','UNKNOWN');
CREATE TABLE elp210_candidate.events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lease_id text NOT NULL REFERENCES elp210_candidate.leases(lease_id),
  phase text NOT NULL,
  attempt_id text,
  terminal_receipt_digest text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION elp210_candidate.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CURRENT_HUMAN_HISTORY_IMMUTABLE'; END $$;
CREATE TRIGGER preserve_events BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_candidate.events
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_leases BEFORE DELETE OR TRUNCATE ON elp210_candidate.leases
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_revision BEFORE DELETE OR TRUNCATE ON elp210_candidate.authority
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE FUNCTION elp210_candidate.lease_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A physical singleton version change is required, not just FOR UPDATE:
  -- a legacy REPEATABLE READ writer whose snapshot predates this lease must
  -- fail 40001 rather than count an invisible new ENTERED/ISSUED lease as zero.
  -- This is NOT the signed authority revision; only real authority changes
  -- increment that revision. The caller already holds the same barrier lock.
  UPDATE elp210_candidate.authority SET lease_epoch=lease_epoch+1 WHERE singleton;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['phase','attempt_id','terminal_receipt_digest']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['phase','attempt_id','terminal_receipt_digest'])
      OR NOT ((OLD.phase='ISSUED' AND NEW.phase IN ('ENTERED','RETIRED'))
        OR (OLD.phase='ENTERED' AND NEW.phase IN ('UNKNOWN','COMMITTED','ROLLED_BACK'))
        OR (OLD.phase='UNKNOWN' AND NEW.phase IN ('COMMITTED','ROLLED_BACK')))
      OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id)
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_TRANSITION_INVALID'; END IF;
  END IF;
  INSERT INTO elp210_candidate.events(lease_id,phase,attempt_id,terminal_receipt_digest)
    VALUES(NEW.lease_id,NEW.phase,NEW.attempt_id,NEW.terminal_receipt_digest);
  RETURN NEW;
END $$;
CREATE TRIGGER lease_events AFTER INSERT OR UPDATE ON elp210_candidate.leases
  FOR EACH ROW EXECUTE FUNCTION elp210_candidate.lease_event();

-- Conservative global barrier covers owner/ancestor/cross-workspace authority.
-- No network operation holds this lock. These triggers cover raw SQL/cascades,
-- not just one new repository method. Unknown leases NEVER expire themselves.
CREATE FUNCTION elp210_candidate.authority_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='portal_users' THEN
    IF (NEW.status,NEW.must_change_password,NEW.archived_at,NEW.role,NEW.session_version)
      IS NOT DISTINCT FROM (OLD.status,OLD.must_change_password,OLD.archived_at,OLD.role,OLD.session_version)
    THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='auth_sessions' THEN
    IF NEW.idle_expires_at>=OLD.idle_expires_at
      AND (to_jsonb(NEW)-ARRAY['last_seen_at','idle_expires_at','updated_at']) IS NOT DISTINCT FROM
          (to_jsonb(OLD)-ARRAY['last_seen_at','idle_expires_at','updated_at'])
    THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='external_identity_bindings' THEN
    IF (to_jsonb(NEW)-'last_seen_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'last_seen_at') THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='workspaces' THEN
    IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW;
  END IF;
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  -- First immutable event disables legacy fallback (read-scope.policy_seen).
  -- Subsequent audit/denial events do not themselves change an entitlement.
  -- Separate statements are essential here: PostgreSQL may plan every AND
  -- operand, including a NEW field absent from another guarded table.
  IF TG_TABLE_NAME='portal_access_policy_events' AND TG_OP='INSERT' THEN
    IF EXISTS(SELECT 1 FROM public.portal_access_policy_events WHERE workspace_id=NEW.workspace_id)
    THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM elp210_candidate.leases WHERE phase IN ('ISSUED','ENTERED','UNKNOWN'))
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_DRAIN_REQUIRED'; END IF;
  UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['portal_users','auth_sessions','external_identity_bindings',
    'workspaces','workspace_members','portal_owner_anchor','portal_access_policy_state',
    'portal_access_grants_v2','portal_capability_grants','execution_retained_review_access','portal_access_policy_events']
  LOOP
    IF to_regclass('public.'||target) IS NULL THEN RAISE EXCEPTION 'CURRENT_HUMAN_DEPENDENCY_MISSING: %',target; END IF;
    EXECUTE format('CREATE TRIGGER elp210_authority_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION elp210_candidate.authority_change()',target);
    EXECUTE format('CREATE TRIGGER elp210_no_truncate BEFORE TRUNCATE ON public.%I
      FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable()',target);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA elp210_candidate FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA elp210_candidate FROM PUBLIC;
COMMENT ON SCHEMA elp210_candidate IS 'Uncommissioned current-human correctness candidate; no runtime imports, credentials, TS business rights or production installation.';
COMMIT;
