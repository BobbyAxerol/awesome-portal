-- UNMOUNTED CANDIDATE. Requires the P7 bound-lease fence and delivery schema.
-- Not an HTTP send fence, source acceptance, migration or permission to issue.
-- An uncertain original must remain recordable after authority is revoked.
CREATE FUNCTION elp210_c2_delivery_candidate.guard_p7_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE valid_intent uuid; now_ms bigint;
BEGIN
  IF TG_OP='UPDATE' AND NEW.state='UNKNOWN' THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation')<>'read committed'
    THEN RAISE EXCEPTION 'C2_P7_DELIVERY_READ_COMMITTED_REQUIRED'; END IF;
  -- The revoke trigger physically updates the same singleton; serializing
  -- here and reading intent in the next statement gives a fresh RC snapshot.
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_P7_DELIVERY_AUTHORITY_MISSING'; END IF;
  SELECT i.intent_id INTO valid_intent
    FROM elp210_candidate.leases l
    JOIN elp210_c2_fence_candidate.scopes s ON s.workspace_id=l.workspace_id
      AND s.owner_user_id=l.subject_id AND s.workload_id=l.workload_id
    JOIN elp210_c2_p7_candidate.owner_intents i ON i.intent_id=l.c2_p7_owner_intent_id
    JOIN elp210_c2_p7_candidate.records p ON p.owner_intent_id=i.intent_id
    JOIN elp210_c2_p7_candidate.registrations r ON r.registration_key=i.registration_key
    WHERE l.lease_id=NEW.lease_id AND l.environment='paper' AND l.phase='ISSUED'
      AND l.c2_p7_binding_digest IS NOT NULL AND i.action='REGISTER' AND s.state='OPEN'
      AND i.workspace_id=l.workspace_id AND i.owner_user_id=l.subject_id
      AND i.session_id=l.session_id AND i.session_generation=l.session_revision
      AND i.authority_revision=l.authority_revision AND i.registration_key=s.registration_key
      AND i.registration_sha256=s.registration_sha256 AND i.b1_sha256=p.b1_sha256
      AND r.registration_sha256=s.registration_sha256 AND r.workspace_id=l.workspace_id
      AND r.owner_user_id=l.subject_id AND r.authority_revision=l.authority_revision
      AND r.state='ACTIVE' AND p.confirmation_sha256 IS NOT NULL
    FOR UPDATE OF i FOR SHARE OF p,r;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF valid_intent IS NULL OR EXISTS (SELECT 1 FROM elp210_c2_p7_candidate.owner_intent_revocations
      WHERE intent_id=valid_intent) OR NOT EXISTS (
      SELECT 1 FROM elp210_c2_p7_candidate.owner_intents i
      JOIN elp210_c2_p7_candidate.registrations r ON r.registration_key=i.registration_key
      WHERE i.intent_id=valid_intent AND i.expires_at_ms>now_ms AND r.expires_at_ms>now_ms
        AND NEW.valid_until_ms<=i.expires_at_ms AND NEW.valid_until_ms<=r.expires_at_ms)
    THEN RAISE EXCEPTION 'C2_P7_DELIVERY_INTENT_NOT_CURRENT'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c2_p7_delivery_guard BEFORE INSERT OR UPDATE ON elp210_c2_delivery_candidate.obligations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_delivery_candidate.guard_p7_delivery();
