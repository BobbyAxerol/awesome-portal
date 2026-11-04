-- Up Migration
-- Immutable correlation only: neither context nor original is an authority
-- grant and no token, source payload, terminal or Edge ACK is synthesized.
-- The writer inserts this in the same transaction as the original lease.
CREATE TABLE execution_command_status_context_links (
  context_digest text NOT NULL CHECK (context_digest ~ '^sha256:[0-9a-f]{64}$'),
  context_nonce text NOT NULL CHECK (context_nonce ~ '^[A-Za-z0-9_-]{43}$'),
  delivery_sequence integer NOT NULL CHECK (delivery_sequence BETWEEN 0 AND 63),
  lease_id text NOT NULL UNIQUE,
  previous_lease_id text,
  original_digest text NOT NULL CHECK (original_digest ~ '^sha256:[0-9a-f]{64}$'),
  call_digest text NOT NULL CHECK (call_digest ~ '^sha256:[0-9a-f]{64}$'),
  binding_digest text NOT NULL CHECK (binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  authority_fingerprint text NOT NULL CHECK (authority_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  assertion_digest text NOT NULL CHECK (assertion_digest ~ '^sha256:[0-9a-f]{64}$'),
  status_token_digest text NOT NULL CHECK (status_token_digest ~ '^sha256:[0-9a-f]{64}$'),
  status_request_digest text NOT NULL CHECK (status_request_digest ~ '^sha256:[0-9a-f]{64}$'),
  status_issued_at_ms bigint NOT NULL CHECK (status_issued_at_ms >= 0),
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  receiver_id text NOT NULL CHECK (length(receiver_id) BETWEEN 1 AND 256),
  context_expires_at_ms bigint NOT NULL CHECK (context_expires_at_ms > 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (context_digest, delivery_sequence),
  CHECK ((delivery_sequence = 0 AND previous_lease_id IS NULL) OR
    (delivery_sequence > 0 AND previous_lease_id IS NOT NULL)),
  CHECK (status_issued_at_ms < context_expires_at_ms)
);
CREATE FUNCTION execution_command_status_context_link_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMAND_STATUS_CONTEXT_LINK_IMMUTABLE';
END $$;
CREATE TRIGGER command_status_context_link_immutable BEFORE UPDATE OR DELETE
  ON execution_command_status_context_links FOR EACH ROW
  EXECUTE FUNCTION execution_command_status_context_link_immutable();
CREATE TRIGGER command_status_context_link_no_truncate BEFORE TRUNCATE
  ON execution_command_status_context_links FOR EACH STATEMENT
  EXECUTE FUNCTION execution_command_status_context_link_immutable();
COMMENT ON TABLE execution_command_status_context_links IS
  'Append-only STATUS context/original/lease digest correlation; not authority, an ACK or a source receipt.';

-- Down Migration
-- Never silently discard recovery correlation while an original may survive.
DO $$ BEGIN
  RAISE EXCEPTION 'COMMAND_STATUS_CONTEXT_DOWN_REQUIRES_APPROVED_ARCHIVE';
END $$;
