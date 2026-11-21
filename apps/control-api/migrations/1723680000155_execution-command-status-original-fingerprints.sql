-- Core's immutable comparison fingerprint, not source outcome custody or
-- command authority. Never retain status bytes, credentials or tokens here.
-- Up Migration
CREATE TABLE execution_command_status_original_fingerprints (
  command_id text PRIMARY KEY REFERENCES execution_trusted_commands(command_id),
  binding_digest text NOT NULL CHECK (binding_digest ~ '^sha256:[0-9a-f]{64}$'),
  original_digest text NOT NULL CHECK (original_digest ~ '^sha256:[0-9a-f]{64}$'),
  status_bytes_digest text NOT NULL CHECK (status_bytes_digest ~ '^sha256:[0-9a-f]{64}$'),
  pm_status_request_digest text NOT NULL CHECK (pm_status_request_digest ~ '^sha256:[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION execution_command_status_fingerprint_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'COMMAND_STATUS_FINGERPRINT_IMMUTABLE';
END $$;
CREATE TRIGGER command_status_fingerprint_immutable BEFORE UPDATE OR DELETE
  ON execution_command_status_original_fingerprints FOR EACH ROW
  EXECUTE FUNCTION execution_command_status_fingerprint_immutable();
COMMENT ON TABLE execution_command_status_original_fingerprints IS
  'Append-only comparison digests only; original bytes and outcomes remain in Edge custody. No automatic expiry or UNKNOWN deletion.';

-- Down Migration
-- Deliberately non-destructive: preserve comparison and UNKNOWN custody.
