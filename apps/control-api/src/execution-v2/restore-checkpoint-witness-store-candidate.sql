-- TEST/PREPARATION ONLY: dedicated witness cluster, never a Portal migration.
-- The operator must independently provision roles, storage, transport and key
-- custody. A PostgreSQL administrator or restored old cluster can still roll
-- this table back: it is NOT a qualified monotonic authority or cutover fence.
CREATE SCHEMA portal_restore_witness_candidate;
REVOKE ALL ON SCHEMA portal_restore_witness_candidate FROM PUBLIC;
CREATE TABLE portal_restore_witness_candidate.heads (
  checkpoint_id uuid PRIMARY KEY,
  source_system_identifier text NOT NULL CHECK (source_system_identifier ~ '^[0-9]{1,20}$'),
  authority_system_identifier text NOT NULL CHECK (authority_system_identifier ~ '^[0-9]{1,20}$'),
  witness_system_identifier text NOT NULL CHECK (witness_system_identifier ~ '^[0-9]{1,20}$'),
  generation bigint NOT NULL CHECK (generation > 0),
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  operation_id uuid NOT NULL,
  CHECK (source_system_identifier <> authority_system_identifier AND
         source_system_identifier <> witness_system_identifier AND
         authority_system_identifier <> witness_system_identifier)
);
REVOKE ALL ON ALL TABLES IN SCHEMA portal_restore_witness_candidate FROM PUBLIC;
