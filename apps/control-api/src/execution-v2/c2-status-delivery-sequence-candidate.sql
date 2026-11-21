-- UNMOUNTED CANDIDATE ONLY. This does not install a qualified caller, HTTP
-- writer, source proof, Edge ACK, or restore authority. The existing generic
-- one-original fence remains in force; STATUS may add a later delivery only
-- for its exact immutable context after the previous terminal and ACK.
BEGIN;
DO $$
DECLARE old_constraint text; found_count integer;
BEGIN
  SELECT count(*),min(c.conname) INTO found_count,old_constraint
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid='elp210_c2_delivery_candidate.obligations'::regclass AND c.contype='u'
      AND c.conkey=ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.conrelid AND attname='workspace_id'),
        (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.conrelid AND attname='workload_id'),
        (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.conrelid AND attname='original_digest')
      ]::smallint[];
  IF found_count<>1 THEN RAISE EXCEPTION 'C2_STATUS_DELIVERY_SCHEMA_UNEXPECTED'; END IF;
  EXECUTE pg_catalog.format('ALTER TABLE elp210_c2_delivery_candidate.obligations DROP CONSTRAINT %I',old_constraint);
END $$;
ALTER TABLE elp210_c2_delivery_candidate.obligations
  ADD COLUMN status_context_digest text,
  ADD COLUMN status_delivery_sequence integer,
  ADD CONSTRAINT c2_status_delivery_shape CHECK (
    (status_context_digest IS NULL AND status_delivery_sequence IS NULL) OR
    (status_context_digest IS NOT NULL AND status_delivery_sequence IS NOT NULL AND
      status_context_digest ~ '^sha256:[0-9a-f]{64}$' AND status_delivery_sequence BETWEEN 0 AND 63)),
  ADD CONSTRAINT c2_status_delivery_context_fk FOREIGN KEY(status_context_digest,status_delivery_sequence)
    REFERENCES public.execution_command_status_context_links(context_digest,delivery_sequence);
CREATE UNIQUE INDEX c2_delivery_generic_original ON elp210_c2_delivery_candidate.obligations
  (workspace_id,workload_id,original_digest) WHERE status_context_digest IS NULL;
CREATE UNIQUE INDEX c2_delivery_status_context_sequence ON elp210_c2_delivery_candidate.obligations
  (status_context_digest,status_delivery_sequence) WHERE status_context_digest IS NOT NULL;

CREATE FUNCTION elp210_c2_delivery_candidate.guard_status_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked public.execution_command_status_context_links%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.status_context_digest,NEW.status_delivery_sequence) IS DISTINCT FROM
       (OLD.status_context_digest,OLD.status_delivery_sequence)
      THEN RAISE EXCEPTION 'C2_STATUS_DELIVERY_IMMUTABLE'; END IF;
    RETURN NEW;
  END IF;
  -- An existing restricted reservation procedure knows the lease but has no
  -- STATUS-specific arguments. Derive the context from the immutable linked
  -- lease rather than trusting new caller-supplied authority. Generic leases
  -- without such a link retain NULL fields and the old uniqueness rule.
  IF NEW.status_context_digest IS NULL AND NEW.status_delivery_sequence IS NULL THEN
    SELECT c.context_digest,c.delivery_sequence INTO NEW.status_context_digest,NEW.status_delivery_sequence
      FROM public.execution_command_status_context_links c WHERE c.lease_id=NEW.lease_id;
  END IF;
  -- Earlier guards lock authority before this trigger. Thus competing
  -- original/context insertions cannot both pass this check.
  IF EXISTS(SELECT 1 FROM elp210_c2_delivery_candidate.obligations o
    WHERE o.workspace_id=NEW.workspace_id AND o.workload_id=NEW.workload_id AND o.original_digest=NEW.original_digest
      AND (NEW.status_context_digest IS NULL OR o.status_context_digest IS DISTINCT FROM NEW.status_context_digest))
    THEN RAISE EXCEPTION 'C2_STATUS_DELIVERY_ORIGINAL_MISMATCH'; END IF;
  IF NEW.status_context_digest IS NULL THEN RETURN NEW; END IF;
  SELECT c.* INTO linked FROM public.execution_command_status_context_links c
    JOIN elp210_candidate.leases current_lease ON current_lease.lease_id=c.lease_id
    WHERE c.context_digest=NEW.status_context_digest AND c.delivery_sequence=NEW.status_delivery_sequence
      AND c.lease_id=NEW.lease_id AND c.original_digest=NEW.original_digest AND c.request_digest=NEW.request_digest
      AND c.assertion_digest=current_lease.human_assertion_digest AND current_lease.c2_custody_binding_digest IS NOT NULL
      AND current_lease.c2_p7_binding_digest IS NOT NULL AND current_lease.c2_p7_owner_intent_id IS NOT NULL
      AND NEW.valid_until_ms<=c.context_expires_at_ms;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_STATUS_DELIVERY_LINK_MISMATCH'; END IF;
  IF linked.delivery_sequence>0 AND NOT EXISTS (
    SELECT 1 FROM public.execution_command_status_context_links p
    JOIN elp210_c2_delivery_candidate.obligations o ON o.lease_id=p.lease_id
    JOIN elp210_candidate.leases l ON l.lease_id=p.lease_id
    JOIN elp210_candidate.leases current_lease ON current_lease.lease_id=NEW.lease_id
    JOIN public.execution_command_status_delivery_acks a ON a.lease_id=l.lease_id
    WHERE p.context_digest=linked.context_digest AND p.delivery_sequence=linked.delivery_sequence-1
      AND p.lease_id=linked.previous_lease_id AND p.original_digest=linked.original_digest
      AND p.call_digest=linked.call_digest AND p.binding_digest=linked.binding_digest
      AND p.authority_fingerprint=linked.authority_fingerprint AND p.context_nonce=linked.context_nonce
      AND p.status_token_digest=linked.status_token_digest AND p.status_request_digest=linked.status_request_digest
      AND p.status_issued_at_ms=linked.status_issued_at_ms AND p.context_expires_at_ms=linked.context_expires_at_ms
      AND p.receiver_id=linked.receiver_id
      AND p.request_digest=linked.request_digest AND o.state='UNKNOWN'
      AND o.status_context_digest=p.context_digest AND o.status_delivery_sequence=p.delivery_sequence
      AND o.original_digest=p.original_digest AND o.workspace_id=NEW.workspace_id AND o.workload_id=NEW.workload_id
      AND l.workspace_id=NEW.workspace_id AND l.subject_id=NEW.owner_user_id AND l.workload_id=NEW.workload_id
      AND l.environment='paper' AND l.request_digest=NEW.request_digest AND l.phase IN ('COMMITTED','ROLLED_BACK')
      AND l.subject_id=current_lease.subject_id AND l.session_id=current_lease.session_id
      AND l.session_revision=current_lease.session_revision AND l.authority_revision=current_lease.authority_revision
      AND l.c2_custody_binding_digest=current_lease.c2_custody_binding_digest
      AND l.c2_p7_binding_digest=current_lease.c2_p7_binding_digest
      AND l.c2_p7_owner_intent_id=current_lease.c2_p7_owner_intent_id
      AND l.human_issuer=current_lease.human_issuer AND l.human_signing_key_digest=current_lease.human_signing_key_digest
      AND l.source_trust_digest=current_lease.source_trust_digest AND l.human_assertion_digest=p.assertion_digest
      AND l.attempt_id IS NOT NULL AND l.terminal_receipt_digest=a.terminal_receipt_digest
      AND a.workspace_id=l.workspace_id AND a.subject_id=l.subject_id AND a.session_id=l.session_id
      AND a.session_revision=l.session_revision AND a.environment=l.environment AND a.workload_id=l.workload_id
      AND a.request_digest=l.request_digest
  ) THEN RAISE EXCEPTION 'C2_STATUS_DELIVERY_PREVIOUS_NOT_ACKNOWLEDGED'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION elp210_c2_delivery_candidate.guard_status_sequence() FROM PUBLIC;
CREATE TRIGGER zz_c2_status_delivery_guard BEFORE INSERT OR UPDATE ON elp210_c2_delivery_candidate.obligations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_delivery_candidate.guard_status_sequence();
COMMIT;
