-- Dedicated ordinary app authority. No legacy policy state/events are changed.
-- Up Migration
CREATE TABLE portal_ordinary_profile_authority (
 workspace_id text PRIMARY KEY REFERENCES workspaces(workspace_id),
 revision text NOT NULL,
 head_digest text NOT NULL CHECK(head_digest ~ '^sha256:[a-f0-9]{64}$'),
 head_fact jsonb NOT NULL CHECK(jsonb_typeof(head_fact)='object' AND octet_length(head_fact::text)<=1048576),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(head_fact->>'workspace_id' IS NOT DISTINCT FROM workspace_id),
 CHECK(head_fact->>'revision' IS NOT DISTINCT FROM revision)
);
CREATE TABLE portal_ordinary_profile_grants (
 grant_id text PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
 subject_user_id text NOT NULL REFERENCES portal_users(user_id),
 issued_by text NOT NULL REFERENCES portal_users(user_id),
 parent_grant_id text REFERENCES portal_ordinary_profile_grants(grant_id),
 revision text NOT NULL,
 grant_fact jsonb NOT NULL CHECK(jsonb_typeof(grant_fact)='object' AND octet_length(grant_fact::text)<=32768),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(grant_fact->>'grant_id' IS NOT DISTINCT FROM grant_id),
 CHECK(grant_fact->>'workspace_id' IS NOT DISTINCT FROM workspace_id),
 CHECK(grant_fact->>'subject_user_id' IS NOT DISTINCT FROM subject_user_id),
 CHECK(grant_fact->>'issued_by' IS NOT DISTINCT FROM issued_by),
 CHECK(grant_fact->>'revision' IS NOT DISTINCT FROM revision),
 CHECK(grant_fact->>'parent_grant_id' IS NOT DISTINCT FROM parent_grant_id)
);
CREATE INDEX ordinary_profile_grants_subject ON portal_ordinary_profile_grants(workspace_id,subject_user_id,grant_id);
CREATE TABLE portal_ordinary_profile_events (
 event_id text PRIMARY KEY,
 workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
 actor_user_id text REFERENCES portal_users(user_id),
 subject_user_id text REFERENCES portal_users(user_id),
 operation text NOT NULL CHECK(operation IN ('INSTALL','DELEGATE','REVOKE')),
 key_digest text NOT NULL CHECK(key_digest ~ '^sha256:[a-f0-9]{64}$'),
 request_digest text NOT NULL CHECK(request_digest ~ '^sha256:[a-f0-9]{64}$'),
 before_fact jsonb,
 after_fact jsonb NOT NULL CHECK(jsonb_typeof(after_fact)='object'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=131072),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,key_digest)
);
CREATE TRIGGER ordinary_profile_grants_immutable BEFORE UPDATE OR DELETE ON portal_ordinary_profile_grants
 FOR EACH ROW EXECUTE FUNCTION portal_access_immutable_event();
CREATE TRIGGER ordinary_profile_events_immutable BEFORE UPDATE OR DELETE ON portal_ordinary_profile_events
 FOR EACH ROW EXECUTE FUNCTION portal_access_immutable_event();
CREATE TRIGGER ordinary_profile_head_preserve BEFORE DELETE ON portal_ordinary_profile_authority
 FOR EACH ROW EXECUTE FUNCTION portal_access_immutable_event();
-- Companion fence without changing the frozen private Research schema bytes or
-- its registered trigger catalogue. App writes use its official coordinator;
-- raw SQL/cascades cannot bypass an unresolved source obligation either.
CREATE FUNCTION portal_ordinary_profile_authority_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE blocked boolean;
BEGIN
 IF to_regclass('elp210_candidate.authority') IS NOT NULL THEN
  EXECUTE 'SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE';
  IF current_setting('elp210_candidate.replay_only',true)='on' THEN
   RAISE EXCEPTION 'CURRENT_HUMAN_MUTATION_REPLAY_WRITE_FORBIDDEN';
  END IF;
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM elp210_candidate.authority a JOIN elp210_candidate.mutations m
    ON m.mutation_id=a.drain_id AND m.state=''PENDING'' WHERE a.singleton
    AND m.mutation_id IS DISTINCT FROM current_setting(''elp210_candidate.mutation_id'',true))' INTO blocked;
  IF blocked THEN RAISE EXCEPTION 'CURRENT_HUMAN_DRAIN_COORDINATOR_REQUIRED'; END IF;
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM elp210_candidate.obligations WHERE unresolved)' INTO blocked;
  IF blocked THEN RAISE EXCEPTION 'CURRENT_HUMAN_DRAIN_REQUIRED'; END IF;
  EXECUTE 'UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton';
 END IF;
 -- ROOT152 custody is independent of candidate leases and CURRENT153 reads.
 -- A terminal phase or expired source clock is not an authenticated settlement.
 IF EXISTS(SELECT 1 FROM portal_native_root_obligations WHERE NOT source_settled) THEN
  RAISE EXCEPTION 'NATIVE_ROOT_DRAIN_REQUIRED';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE FUNCTION portal_ordinary_profile_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Empty disposable schema cleanup is harmless. Once any ordinary authority
 -- or receipt exists, preserve the ENTIRE lineage even through CASCADE.
 IF EXISTS(SELECT 1 FROM portal_ordinary_profile_authority) OR EXISTS(SELECT 1 FROM portal_ordinary_profile_grants)
  OR EXISTS(SELECT 1 FROM portal_ordinary_profile_events) THEN
  RAISE EXCEPTION 'ORDINARY_AUTHORITY_HISTORY_PRESERVE_REQUIRED';
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['portal_ordinary_profile_authority','portal_ordinary_profile_grants','portal_ordinary_profile_events'] LOOP
  EXECUTE format('CREATE TRIGGER native_current_authority_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION portal_guard_native_current_authority()',target);
  EXECUTE format('CREATE TRIGGER ordinary_profile_authority_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION portal_ordinary_profile_authority_change()',target);
  EXECUTE format('CREATE TRIGGER ordinary_profile_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION portal_ordinary_profile_no_truncate()',target);
 END LOOP;
END $$;
COMMENT ON TABLE portal_ordinary_profile_authority IS 'Independent ordinary READ head; does not activate legacy SCOPED_V2, TS membership, STREAM or commands.';
COMMENT ON TABLE portal_ordinary_profile_grants IS 'Immutable app READ grant lineage; current ancestors, owner ceiling, DENYs and source qualification remain independently required.';
COMMENT ON TABLE portal_ordinary_profile_events IS 'Immutable ordinary receipts. Retain with identity/authority history; no automatic expiry deletion.';
-- Down Migration
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM portal_ordinary_profile_authority) OR EXISTS(SELECT 1 FROM portal_ordinary_profile_grants)
  OR EXISTS(SELECT 1 FROM portal_ordinary_profile_events) THEN
  RAISE EXCEPTION 'ORDINARY_AUTHORITY_HISTORY_PRESERVE_REQUIRED';
 END IF;
END $$;
DROP TABLE portal_ordinary_profile_events;
DROP TABLE portal_ordinary_profile_grants;
DROP TABLE portal_ordinary_profile_authority;
DROP FUNCTION portal_ordinary_profile_authority_change();
DROP FUNCTION portal_ordinary_profile_no_truncate();
