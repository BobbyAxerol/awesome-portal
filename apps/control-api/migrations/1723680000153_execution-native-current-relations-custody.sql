-- Separate ordinary finite CURRENT READ custody; no accepted grant, HUMAN or
-- ROOT receipt is installed. No FK to the optional private candidate schema.
-- Up Migration
CREATE TABLE portal_native_current_read_obligations (
 lease_id uuid PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE, flight_id uuid NOT NULL,
 source_config_digest text NOT NULL CHECK(source_config_digest ~ '^sha256:[a-f0-9]{64}$'),
 base_digest text NOT NULL CHECK(base_digest ~ '^sha256:[a-f0-9]{64}$'),
 base_body text NOT NULL CHECK(octet_length(base_body) BETWEEN 1 AND 32768),
 authority_fingerprint text NOT NULL CHECK(authority_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
 phase text NOT NULL CHECK(phase IN ('PREPARED','ISSUE_REQUESTED','ISSUED','ENTERING','ENTERED','SENDING','UNKNOWN','SERVED','ABORTED','CANCELLED')),
 source_digest text CHECK(source_digest ~ '^[a-f0-9]{64}$'),
 source_fingerprint text CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'), source_expires_at text,
 body_digest text CHECK(body_digest ~ '^sha256:[a-f0-9]{64}$'),
 terminal_receipt_id uuid,terminal_receipt_digest text CHECK(terminal_receipt_digest ~ '^sha256:[a-f0-9]{64}$'),terminal_fact jsonb,
 source_settled boolean NOT NULL DEFAULT false,source_ack_digest text CHECK(source_ack_digest ~ '^sha256:[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((terminal_receipt_id IS NULL)=(terminal_receipt_digest IS NULL)),
 CHECK((terminal_fact IS NULL)=(terminal_receipt_id IS NULL)),
 CHECK((phase IN ('SERVED','ABORTED'))=(terminal_receipt_id IS NOT NULL)),
 CHECK(source_settled=(source_ack_digest IS NOT NULL)),
 CHECK(NOT source_settled OR phase IN ('CANCELLED','SERVED','ABORTED')),
 CHECK(terminal_fact IS NULL OR (jsonb_typeof(terminal_fact)='object' AND octet_length(terminal_fact::text)<=8192)),
 CHECK(phase NOT IN ('ISSUED','ENTERING','ENTERED','SENDING','SERVED','ABORTED') OR
  (source_digest IS NOT NULL AND source_fingerprint IS NOT NULL AND source_expires_at IS NOT NULL))
);
CREATE INDEX native_current_read_unresolved ON portal_native_current_read_obligations(created_at,lease_id) WHERE NOT source_settled;
CREATE FUNCTION portal_guard_native_current_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NATIVE_CURRENT_CUSTODY_DELETE_FORBIDDEN'; END IF;
 IF ROW(NEW.lease_id,NEW.attempt_id,NEW.flight_id,NEW.source_config_digest,NEW.base_digest,NEW.base_body,NEW.authority_fingerprint,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.lease_id,OLD.attempt_id,OLD.flight_id,OLD.source_config_digest,OLD.base_digest,OLD.base_body,OLD.authority_fingerprint,OLD.created_at)
 OR OLD.source_digest IS NOT NULL AND ROW(NEW.source_digest,NEW.source_fingerprint,NEW.source_expires_at)
 IS DISTINCT FROM ROW(OLD.source_digest,OLD.source_fingerprint,OLD.source_expires_at)
 OR OLD.body_digest IS NOT NULL AND NEW.body_digest IS DISTINCT FROM OLD.body_digest
 OR OLD.terminal_receipt_id IS NOT NULL AND ROW(NEW.terminal_receipt_id,NEW.terminal_receipt_digest,NEW.terminal_fact,NEW.phase)
 IS DISTINCT FROM ROW(OLD.terminal_receipt_id,OLD.terminal_receipt_digest,OLD.terminal_fact,OLD.phase)
 OR OLD.source_settled AND (NOT NEW.source_settled OR NEW.source_ack_digest IS DISTINCT FROM OLD.source_ack_digest)
 OR OLD.phase='CANCELLED' AND NEW.phase<>'CANCELLED'
 OR NEW.phase<>OLD.phase AND NOT (
  OLD.phase='PREPARED' AND NEW.phase IN ('ISSUE_REQUESTED','CANCELLED') OR
  OLD.phase='ISSUE_REQUESTED' AND NEW.phase IN ('ISSUED','CANCELLED') OR
  OLD.phase='ISSUED' AND NEW.phase IN ('ENTERING','CANCELLED') OR
  OLD.phase='ENTERING' AND NEW.phase IN ('ENTERED','UNKNOWN','ABORTED') OR
  OLD.phase='ENTERED' AND NEW.phase IN ('SENDING','UNKNOWN','ABORTED') OR
  OLD.phase='SENDING' AND NEW.phase IN ('UNKNOWN','SERVED','ABORTED') OR
  OLD.phase='UNKNOWN' AND NEW.phase IN ('SERVED','ABORTED'))
 THEN RAISE EXCEPTION 'NATIVE_CURRENT_ORIGINAL_OR_TERMINAL_CHANGED'; END IF;
 NEW.updated_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER guard_native_current_original BEFORE UPDATE OR DELETE ON portal_native_current_read_obligations
 FOR EACH ROW EXECUTE FUNCTION portal_guard_native_current_original();
CREATE FUNCTION portal_guard_native_current_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Keep harmless display/last-seen/lease extension updates outside authority.
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='portal_users' THEN
  IF (NEW.status,NEW.must_change_password,NEW.archived_at,NEW.role,NEW.session_version) IS NOT DISTINCT FROM
   (OLD.status,OLD.must_change_password,OLD.archived_at,OLD.role,OLD.session_version) THEN RETURN NEW; END IF;
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='auth_sessions' THEN
  IF NEW.idle_expires_at>=OLD.idle_expires_at AND (to_jsonb(NEW)-ARRAY['last_seen_at','idle_expires_at','updated_at'])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['last_seen_at','idle_expires_at','updated_at']) THEN RETURN NEW; END IF;
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='external_identity_bindings' THEN
  IF (to_jsonb(NEW)-'last_seen_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'last_seen_at') THEN RETURN NEW; END IF;
 ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='workspaces' THEN
  IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN RETURN NEW; END IF;
 ELSIF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW;
 END IF;
 -- Always serialize with acquisition, even when the pre-lock census is empty.
 -- Migration alone is inert without the private current-human candidate.
 IF to_regclass('elp210_candidate.authority') IS NOT NULL THEN
  EXECUTE 'SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE';
 END IF;
 IF TG_TABLE_NAME='portal_access_policy_events' AND TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM portal_access_policy_events WHERE workspace_id=NEW.workspace_id) THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM portal_native_current_read_obligations WHERE NOT source_settled) THEN
  RAISE EXCEPTION 'NATIVE_CURRENT_READ_DRAIN_REQUIRED';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
DO $$ DECLARE target text;BEGIN
 FOREACH target IN ARRAY ARRAY['portal_users','auth_sessions','external_identity_bindings','workspaces','workspace_members',
  'portal_owner_anchor','portal_access_policy_state','portal_access_grants_v2','portal_capability_grants','execution_retained_review_access','portal_access_policy_events'] LOOP
  EXECUTE format('CREATE TRIGGER native_current_authority_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION portal_guard_native_current_authority()',target);
 END LOOP;
END $$;
-- Down Migration
DO $$ DECLARE target text;BEGIN
 IF EXISTS(SELECT 1 FROM portal_native_current_read_obligations WHERE NOT source_settled) THEN RAISE EXCEPTION 'NATIVE_CURRENT_READ_DRAIN_REQUIRED'; END IF;
 FOREACH target IN ARRAY ARRAY['portal_users','auth_sessions','external_identity_bindings','workspaces','workspace_members',
  'portal_owner_anchor','portal_access_policy_state','portal_access_grants_v2','portal_capability_grants','execution_retained_review_access','portal_access_policy_events'] LOOP
  EXECUTE format('DROP TRIGGER native_current_authority_guard ON public.%I',target);
 END LOOP;
END $$;
DROP FUNCTION portal_guard_native_current_authority();
DROP TABLE portal_native_current_read_obligations;
DROP FUNCTION portal_guard_native_current_original();
