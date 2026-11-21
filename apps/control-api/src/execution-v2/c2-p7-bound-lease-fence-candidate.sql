-- ISOLATED CANDIDATE ONLY: neither migration nor permission to commission.
-- Install only with the reviewed P7/source/role graph. Existing unresolved
-- scoped leases must be classified and drained before installing this fence.
-- This protects the exact local intent against stale compliant DB holders; it
-- does not defend a table owner/superuser who can disable triggers or forge
-- source, approval or registry rows. Those roles require separate isolation.
BEGIN;
-- Close the install-versus-old-writer race. Installing over any unresolved
-- scoped lease would otherwise silently classify its historical authority.
LOCK TABLE elp210_candidate.leases IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE elp210_c2_fence_candidate.scopes IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM elp210_candidate.leases l
    JOIN elp210_c2_fence_candidate.scopes s ON s.workspace_id=l.workspace_id
      AND s.owner_user_id=l.subject_id AND s.workload_id=l.workload_id
    WHERE l.environment='paper' AND l.phase IN ('ISSUED','ENTERED','UNKNOWN'))
  THEN RAISE EXCEPTION 'C2_P7_DB_UNCLASSIFIED_LEGACY'; END IF;
END $$;
CREATE FUNCTION elp210_c2_fence_candidate.p7_revocation_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A physical tuple update fences snapshots, without requiring the revoker
  -- to possess UPDATE on the lease epoch or changing the signed revision.
  -- The bounded emergency role already has UPDATE(drain_id) for its lock.
  UPDATE elp210_candidate.authority SET drain_id=drain_id WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_P7_DB_AUTHORITY_MISSING'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c2_p7_revocation_epoch AFTER INSERT ON elp210_c2_p7_candidate.owner_intent_revocations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_fence_candidate.p7_revocation_epoch();

CREATE FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_key text; selected_sha text; valid_intent uuid; now_ms bigint;
BEGIN
  -- Never interfere with resolution of an already-entered exact original.
  IF TG_OP='UPDATE' AND NOT (OLD.phase='ISSUED' AND NEW.phase='ENTERED') THEN RETURN NEW; END IF;
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_P7_DB_AUTHORITY_MISSING'; END IF;
  SELECT registration_key,registration_sha256 INTO selected_key,selected_sha
    FROM elp210_c2_fence_candidate.scopes
    WHERE workspace_id=NEW.workspace_id AND owner_user_id=NEW.subject_id
      AND workload_id=NEW.workload_id AND NEW.environment='paper' AND state='OPEN'
    FOR SHARE;
  IF selected_key IS NULL THEN
    -- Existing base scope fence rejects BLOCK_NEW. A P7-bound lease without an
    -- OPEN scope must also fail rather than falling through as unrelated.
    IF NEW.c2_p7_binding_digest IS NOT NULL OR NEW.c2_p7_owner_intent_id IS NOT NULL
      THEN RAISE EXCEPTION 'C2_P7_DB_SCOPE_REQUIRED'; END IF;
    RETURN NEW;
  END IF;
  -- Old code cannot issue or enter an unbound lease in this scoped candidate.
  IF current_setting('transaction_isolation') <> 'read committed' OR
     NEW.c2_p7_binding_digest IS NULL OR NEW.c2_p7_owner_intent_id IS NULL
    THEN RAISE EXCEPTION 'C2_P7_DB_BOUND_INTENT_REQUIRED'; END IF;
  IF TG_OP='INSERT' AND NEW.phase<>'ISSUED' THEN RAISE EXCEPTION 'C2_P7_DB_INITIAL_PHASE_REQUIRED'; END IF;
  SELECT i.intent_id INTO valid_intent
    FROM elp210_c2_p7_candidate.owner_intents i
    JOIN elp210_c2_p7_candidate.records p ON p.owner_intent_id=i.intent_id
    JOIN elp210_c2_p7_candidate.registrations r ON r.registration_key=i.registration_key
    WHERE i.intent_id=NEW.c2_p7_owner_intent_id AND i.action='REGISTER'
      AND i.workspace_id=NEW.workspace_id AND i.owner_user_id=NEW.subject_id
      AND i.session_id=NEW.session_id AND i.session_generation=NEW.session_revision
      AND i.authority_revision=NEW.authority_revision AND i.registration_key=selected_key
      AND i.registration_sha256=selected_sha AND i.b1_sha256=p.b1_sha256
      AND r.registration_sha256=selected_sha AND r.workspace_id=NEW.workspace_id
      AND r.owner_user_id=NEW.subject_id AND r.authority_revision=NEW.authority_revision
      AND r.state='ACTIVE' AND p.confirmation_sha256 IS NOT NULL
    FOR UPDATE OF i FOR SHARE OF p,r;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF valid_intent IS NULL OR EXISTS (SELECT 1 FROM elp210_c2_p7_candidate.owner_intent_revocations
      WHERE intent_id=valid_intent) OR NOT EXISTS (
      SELECT 1 FROM elp210_c2_p7_candidate.owner_intents i
        JOIN elp210_c2_p7_candidate.registrations r ON r.registration_key=i.registration_key
      WHERE i.intent_id=valid_intent AND i.expires_at_ms>now_ms AND r.expires_at_ms>now_ms
        AND NEW.expires_at_ms<=i.expires_at_ms AND NEW.expires_at_ms<=r.expires_at_ms)
    THEN RAISE EXCEPTION 'C2_P7_DB_INTENT_NOT_CURRENT'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c2_guard_p7_bound_lease BEFORE INSERT OR UPDATE OF phase ON elp210_candidate.leases
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease();
COMMIT;
