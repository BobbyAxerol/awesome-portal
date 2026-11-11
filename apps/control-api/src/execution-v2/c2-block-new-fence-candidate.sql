-- DISPOSABLE CANDIDATE ONLY: NOT a migration, grant, P5/TS invalidation or
-- owner approval. Install under independent review/ACL. Scope facts supplied
-- here are only test/provisioning input; this file does not authenticate them.
-- Requires current-human-candidate.sql + P7 candidate schema/table.
BEGIN;
CREATE SCHEMA elp210_c2_fence_candidate;
REVOKE ALL ON SCHEMA elp210_c2_fence_candidate FROM PUBLIC;
CREATE TABLE elp210_c2_fence_candidate.scopes (
  registration_key text PRIMARY KEY REFERENCES elp210_c2_p7_candidate.registrations(registration_key),
  registration_sha256 text NOT NULL CHECK(registration_sha256 ~ '^[0-9a-f]{64}$'),
  workspace_id text NOT NULL,owner_user_id text NOT NULL,workload_id text NOT NULL,
  state text NOT NULL CHECK(state IN ('OPEN','BLOCK_NEW')),
  UNIQUE(workspace_id,owner_user_id,workload_id)
);
CREATE TABLE elp210_c2_fence_candidate.events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registration_key text NOT NULL, state text NOT NULL CHECK(state IN ('OPEN','BLOCK_NEW')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON ALL TABLES IN SCHEMA elp210_c2_fence_candidate FROM PUBLIC;
CREATE FUNCTION elp210_c2_fence_candidate.scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' AND TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'C2_FENCE_IMMUTABLE'; END IF;
  -- Physical tuple change fences old REPEATABLE READ snapshots as well as
  -- READ COMMITTED; no revision/lease-epoch increment and drain is unchanged.
  UPDATE elp210_candidate.authority SET drain_id=drain_id WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_FENCE_AUTHORITY_MISSING'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'OPEN' OR NOT EXISTS(SELECT 1 FROM elp210_c2_p7_candidate.registrations r
      WHERE r.registration_key=NEW.registration_key AND r.registration_sha256=NEW.registration_sha256
        AND r.workspace_id=NEW.workspace_id AND r.owner_user_id=NEW.owner_user_id AND r.state='ACTIVE')
    THEN RAISE EXCEPTION 'C2_FENCE_REGISTRATION_INVALID'; END IF;
    -- Cannot infer which legacy leases were C2. Installation refuses to mark
    -- a scope clean while any matching pre-existing attempt is unresolved.
    IF EXISTS(SELECT 1 FROM elp210_candidate.leases l WHERE l.workspace_id=NEW.workspace_id
      AND l.subject_id=NEW.owner_user_id AND l.workload_id=NEW.workload_id AND l.environment='paper'
      AND l.phase IN ('ISSUED','ENTERED','UNKNOWN'))
    THEN RAISE EXCEPTION 'C2_FENCE_LEGACY_UNCLASSIFIED'; END IF;
  ELSE
    IF OLD.state<>'OPEN' OR NEW.state<>'BLOCK_NEW' OR
      (OLD.registration_key,OLD.registration_sha256,OLD.workspace_id,OLD.owner_user_id,OLD.workload_id)
       IS DISTINCT FROM (NEW.registration_key,NEW.registration_sha256,NEW.workspace_id,NEW.owner_user_id,NEW.workload_id)
    THEN RAISE EXCEPTION 'C2_FENCE_IMMUTABLE'; END IF;
  END IF;
  INSERT INTO elp210_c2_fence_candidate.events(registration_key,state) VALUES(NEW.registration_key,NEW.state);
  RETURN NEW;
END $$;
CREATE TRIGGER c2_scope_insert_update BEFORE INSERT OR UPDATE ON elp210_c2_fence_candidate.scopes
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_fence_candidate.scope_guard();
CREATE FUNCTION elp210_c2_fence_candidate.no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'C2_FENCE_IMMUTABLE'; END $$;
CREATE TRIGGER c2_scope_delete BEFORE DELETE OR TRUNCATE ON elp210_c2_fence_candidate.scopes
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_fence_candidate.no_delete();
CREATE TRIGGER c2_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_c2_fence_candidate.events
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_fence_candidate.no_delete();
CREATE FUNCTION elp210_c2_fence_candidate.block_on_revoke() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='ACTIVE' AND NEW.state='REVOKED' THEN
    PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'C2_FENCE_AUTHORITY_MISSING'; END IF;
    UPDATE elp210_c2_fence_candidate.scopes SET state='BLOCK_NEW'
      WHERE registration_key=NEW.registration_key AND state='OPEN';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c2_registry_revoked AFTER UPDATE ON elp210_c2_p7_candidate.registrations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_fence_candidate.block_on_revoke();
CREATE FUNCTION elp210_c2_fence_candidate.guard_lease() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NOT(OLD.phase='ISSUED' AND NEW.phase='ENTERED') THEN RETURN NEW; END IF;
  END IF;
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_FENCE_AUTHORITY_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM elp210_c2_fence_candidate.scopes s WHERE s.workspace_id=NEW.workspace_id
    AND s.owner_user_id=NEW.subject_id AND s.workload_id=NEW.workload_id AND NEW.environment='paper'
    AND (s.state<>'OPEN' OR NOT EXISTS(SELECT 1 FROM elp210_candidate.authority a
      WHERE a.singleton AND a.drain_id IS NULL AND a.revision=NEW.authority_revision)
      OR NOT EXISTS(SELECT 1 FROM elp210_c2_p7_candidate.registrations r
      WHERE r.registration_key=s.registration_key AND r.registration_sha256=s.registration_sha256
        AND r.workspace_id=s.workspace_id AND r.owner_user_id=s.owner_user_id AND r.state='ACTIVE'
        AND r.authority_revision=NEW.authority_revision
        AND r.expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000)::bigint)))
  THEN RAISE EXCEPTION 'C2_FENCE_BLOCK_NEW'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c2_guard_lease BEFORE INSERT OR UPDATE ON elp210_candidate.leases
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_fence_candidate.guard_lease();
COMMIT;
