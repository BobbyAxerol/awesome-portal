-- SOURCE/TEST ONLY. Separate cluster is not necessarily a separate failure
-- domain. Never install this as a Portal migration, mint an ACK, or cut over.
CREATE SCHEMA portal_restore_original_custody;
REVOKE ALL ON SCHEMA portal_restore_original_custody FROM PUBLIC;
CREATE TABLE portal_restore_original_custody.head (
  custody_id uuid PRIMARY KEY, source_system_identifier text NOT NULL,
  authority_system_identifier text NOT NULL, generation bigint NOT NULL CHECK(generation>=0),
  event_hash text NOT NULL CHECK(event_hash ~ '^[0-9a-f]{64}$'),
  CHECK(source_system_identifier<>authority_system_identifier)
);
CREATE TABLE portal_restore_original_custody.events (
  custody_id uuid NOT NULL REFERENCES portal_restore_original_custody.head(custody_id),
  operation_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation>0),
  kind text NOT NULL CHECK(kind IN ('ISSUED_HUMAN_ASSERTION','SIGNED_SOURCE_ENTER','SIGNED_SOURCE_UNKNOWN','SIGNED_SOURCE_TERMINAL')),
  lease_id text NOT NULL, body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),
  proof_hash text NOT NULL CHECK(proof_hash ~ '^[0-9a-f]{64}$'),
  predecessor_hash text NOT NULL CHECK(predecessor_hash ~ '^[0-9a-f]{64}$'),
  event_hash text NOT NULL CHECK(event_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(custody_id,operation_id), UNIQUE(custody_id,generation), UNIQUE(custody_id,lease_id,kind)
);
CREATE FUNCTION portal_restore_original_custody.immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'RESTORE_CUSTODY_EVENT_IMMUTABLE'; END $$;
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_restore_original_custody.events
  FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_original_custody.immutable_event();
-- Ciphertext only; the key is provisioned separately and never stored here.
-- No human bearer is retained in this table. One row is inseparable from the
-- verified source-proof event in the same authority transaction.
CREATE TABLE portal_restore_original_custody.source_proofs (
  custody_id uuid NOT NULL, operation_id uuid NOT NULL,
  envelope jsonb NOT NULL CHECK(jsonb_typeof(envelope)='object' AND octet_length(envelope::text)<=16384),
  PRIMARY KEY(custody_id,operation_id),
  FOREIGN KEY(custody_id,operation_id) REFERENCES portal_restore_original_custody.events(custody_id,operation_id)
);
CREATE FUNCTION portal_restore_original_custody.immutable_source_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'RESTORE_CUSTODY_SOURCE_PROOF_IMMUTABLE'; END $$;
CREATE TRIGGER source_proof_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_restore_original_custody.source_proofs
  FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_original_custody.immutable_source_proof();
REVOKE ALL ON ALL TABLES IN SCHEMA portal_restore_original_custody FROM PUBLIC;
-- Candidate only: installed by a qualified authority-DB owner, never by the
-- application writer. The exact writer needs an explicit EXECUTE grant. The
-- catalog lock is DB-wide for function DDL and requires operational review.
CREATE FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN LOCK TABLE pg_catalog.pg_proc IN SHARE MODE; END $$;
REVOKE ALL ON FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write() FROM PUBLIC;
