-- DISPOSABLE CANDIDATE ONLY. NOT a migration, issuer mount, HTTP custody,
-- owner approval, source authority, token delivery ACK, or C2 recovery barrier.
-- Caller must independently authenticate owner/session, qualify the exact source
-- original binding and perform actual HTTP custody. No bearer is stored here.
-- Requires current-human-candidate.sql and c2-block-new-fence-candidate.sql.
BEGIN;
CREATE SCHEMA elp210_c2_delivery_candidate;
REVOKE ALL ON SCHEMA elp210_c2_delivery_candidate FROM PUBLIC;
CREATE TABLE elp210_c2_delivery_candidate.limits (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  maximum_retained integer NOT NULL CHECK(maximum_retained BETWEEN 1 AND 4096),
  maximum_active integer NOT NULL CHECK(maximum_active BETWEEN 1 AND 128 AND maximum_active<=maximum_retained)
);
CREATE TABLE elp210_c2_delivery_candidate.obligations (
  lease_id text PRIMARY KEY REFERENCES elp210_candidate.leases(lease_id),
  workspace_id text NOT NULL,owner_user_id text NOT NULL,workload_id text NOT NULL,
  request_digest text NOT NULL CHECK(request_digest ~ '^sha256:[a-f0-9]{64}$'),
  original_digest text NOT NULL CHECK(original_digest ~ '^sha256:[a-f0-9]{64}$'),
  payload_digest text NOT NULL CHECK(payload_digest ~ '^sha256:[a-f0-9]{64}$'),
  payload_bytes integer NOT NULL CHECK(payload_bytes BETWEEN 1 AND 32768),
  valid_until_ms bigint NOT NULL CHECK(valid_until_ms>0),
  state text NOT NULL CHECK(state IN ('RESERVED','SENDING','UNKNOWN')),
  sender_backend_pid integer,
  sender_token_sha256 text CHECK(sender_token_sha256 IS NULL OR sender_token_sha256 ~ '^[a-f0-9]{64}$'),
  sender_claim_xid xid8,
  CHECK ((sender_backend_pid IS NULL) = (sender_token_sha256 IS NULL)),
  CHECK ((sender_backend_pid IS NULL) = (sender_claim_xid IS NULL)),
  UNIQUE(workspace_id,workload_id,original_digest)
);
CREATE TABLE elp210_c2_delivery_candidate.events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lease_id text NOT NULL REFERENCES elp210_c2_delivery_candidate.obligations(lease_id),
  state text NOT NULL CHECK(state IN ('RESERVED','SENDING','UNKNOWN')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON ALL TABLES IN SCHEMA elp210_c2_delivery_candidate FROM PUBLIC;
CREATE FUNCTION elp210_c2_delivery_candidate.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'C2_DELIVERY_IMMUTABLE'; END $$;
CREATE TRIGGER limits_no_change BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_c2_delivery_candidate.limits
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_delivery_candidate.immutable();
CREATE TRIGGER obligations_no_delete BEFORE DELETE OR TRUNCATE ON elp210_c2_delivery_candidate.obligations
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_delivery_candidate.immutable();
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_c2_delivery_candidate.events
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_delivery_candidate.immutable();
CREATE FUNCTION elp210_c2_delivery_candidate.guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l elp210_candidate.leases%ROWTYPE; configured elp210_c2_delivery_candidate.limits%ROWTYPE;
  retained_count bigint;active_count bigint; now_ms bigint;
BEGIN
  -- Authority-first ordering. A physical tuple version fences stale REPEATABLE
  -- READ snapshots without incrementing revision/epoch or changing drain.
  UPDATE elp210_candidate.authority SET drain_id=drain_id WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_DELIVERY_AUTHORITY_MISSING'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (OLD.lease_id,OLD.workspace_id,OLD.owner_user_id,OLD.workload_id,OLD.request_digest,OLD.original_digest,
        OLD.payload_digest,OLD.payload_bytes,OLD.valid_until_ms) IS DISTINCT FROM
       (NEW.lease_id,NEW.workspace_id,NEW.owner_user_id,NEW.workload_id,NEW.request_digest,NEW.original_digest,
        NEW.payload_digest,NEW.payload_bytes,NEW.valid_until_ms) OR
       NOT ((OLD.state='RESERVED' AND NEW.state IN ('SENDING','UNKNOWN')) OR
            (OLD.state='SENDING' AND NEW.state IN ('SENDING','UNKNOWN'))) OR
       (OLD.state='RESERVED' AND NEW.state='SENDING' AND
        (OLD.sender_backend_pid IS NOT NULL OR NEW.sender_backend_pid IS DISTINCT FROM pg_backend_pid() OR
         NEW.sender_claim_xid IS DISTINCT FROM pg_current_xact_id() OR
         coalesce(current_setting('portal.c2_send_token',true),'') !~ '^[a-f0-9]{64}$' OR
         NEW.sender_token_sha256 IS DISTINCT FROM encode(sha256(convert_to(current_setting('portal.c2_send_token',true),'UTF8')),'hex'))) OR
       (NOT (OLD.state='RESERVED' AND NEW.state='SENDING') AND
        (NEW.sender_backend_pid,NEW.sender_token_sha256,NEW.sender_claim_xid) IS DISTINCT FROM
        (OLD.sender_backend_pid,OLD.sender_token_sha256,OLD.sender_claim_xid)) OR
       (OLD.state='SENDING' AND NEW.state='SENDING' AND
        (OLD.sender_backend_pid IS DISTINCT FROM pg_backend_pid() OR
         coalesce(current_setting('portal.c2_send_token',true),'') !~ '^[a-f0-9]{64}$' OR
         OLD.sender_token_sha256 IS DISTINCT FROM encode(sha256(convert_to(current_setting('portal.c2_send_token',true),'UTF8')),'hex')))
    THEN RAISE EXCEPTION 'C2_DELIVERY_TRANSITION_INVALID'; END IF;
    -- UNKNOWN records uncertainty; it is never proof of physical quiescence,
    -- delivery, ACK, timeout-based cleanup, or permission to issue again.
    IF NEW.state='UNKNOWN' THEN RETURN NEW; END IF;
  ELSE
    IF NEW.state<>'RESERVED' THEN RAISE EXCEPTION 'C2_DELIVERY_TRANSITION_INVALID'; END IF;
    SELECT * INTO configured FROM elp210_c2_delivery_candidate.limits WHERE singleton;
    IF NOT FOUND THEN RAISE EXCEPTION 'C2_DELIVERY_LIMITS_REQUIRED'; END IF;
    SELECT count(*),count(*) FILTER(WHERE state IN ('RESERVED','SENDING','UNKNOWN')) INTO retained_count,active_count
      FROM elp210_c2_delivery_candidate.obligations;
    IF retained_count>=configured.maximum_retained OR active_count>=configured.maximum_active
    THEN RAISE EXCEPTION 'C2_DELIVERY_CAPACITY'; END IF;
  END IF;
  SELECT * INTO l FROM elp210_candidate.leases WHERE lease_id=NEW.lease_id FOR SHARE;
  now_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF NOT FOUND OR l.phase<>'ISSUED' OR l.workspace_id<>NEW.workspace_id OR l.subject_id<>NEW.owner_user_id
    OR l.workload_id<>NEW.workload_id OR l.environment<>'paper' OR l.request_digest<>NEW.request_digest
    OR NEW.valid_until_ms>l.expires_at_ms OR NEW.valid_until_ms<=now_ms OR
    NOT EXISTS(SELECT 1 FROM elp210_c2_fence_candidate.scopes s
      JOIN elp210_c2_p7_candidate.registrations r ON r.registration_key=s.registration_key
        AND r.registration_sha256=s.registration_sha256 AND r.workspace_id=s.workspace_id
        AND r.owner_user_id=s.owner_user_id
      JOIN elp210_candidate.authority a ON a.singleton
      WHERE s.workspace_id=NEW.workspace_id AND s.owner_user_id=NEW.owner_user_id
        AND s.workload_id=NEW.workload_id AND s.state='OPEN' AND r.state='ACTIVE'
        AND r.expires_at_ms>now_ms AND NEW.valid_until_ms<=r.expires_at_ms
        AND r.authority_revision=l.authority_revision
        AND a.revision=l.authority_revision AND a.drain_id IS NULL)
  THEN RAISE EXCEPTION 'C2_DELIVERY_BINDING_OR_FENCE_INVALID'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER obligation_guard BEFORE INSERT OR UPDATE ON elp210_c2_delivery_candidate.obligations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_delivery_candidate.guard();
CREATE FUNCTION elp210_c2_delivery_candidate.record_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO elp210_c2_delivery_candidate.events(lease_id,state) VALUES(NEW.lease_id,NEW.state);RETURN NEW; END $$;
CREATE TRIGGER obligation_event AFTER INSERT OR UPDATE ON elp210_c2_delivery_candidate.obligations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_delivery_candidate.record_event();
COMMIT;
