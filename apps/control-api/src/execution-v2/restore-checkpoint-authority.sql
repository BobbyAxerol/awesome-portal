-- TEST/PREPARATION ONLY: install in an explicitly provisioned PostgreSQL
-- authority cluster, NEVER as a migration of the Portal source database.
-- The installation principal must separate operator bootstrap, app writer,
-- read-only recovery verifier and DB administration. No grants are inferred.
-- This schema is an audit checkpoint; by itself it is NOT a cutover fence.
CREATE SCHEMA portal_restore_authority;
REVOKE ALL ON SCHEMA portal_restore_authority FROM PUBLIC;

CREATE TABLE portal_restore_authority.checkpoints (
  checkpoint_id uuid PRIMARY KEY,
  source_system_identifier text NOT NULL CHECK (source_system_identifier ~ '^[0-9]{1,20}$'),
  authority_system_identifier text NOT NULL CHECK (authority_system_identifier ~ '^[0-9]{1,20}$'),
  generation bigint NOT NULL CHECK (generation >= 0),
  source_revision bigint NOT NULL CHECK (source_revision >= 0),
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  event_count bigint NOT NULL CHECK (event_count >= 0),
  CHECK (source_system_identifier <> authority_system_identifier),
  CHECK ((generation = 0 AND event_count = 0 AND event_hash = repeat('0',64)) OR
         (generation > 0 AND event_count = generation))
);
CREATE TABLE portal_restore_authority.events (
  checkpoint_id uuid NOT NULL REFERENCES portal_restore_authority.checkpoints(checkpoint_id),
  operation_id uuid NOT NULL,
  expected_generation bigint NOT NULL CHECK (expected_generation >= 0),
  generation bigint NOT NULL CHECK (generation > 0 AND generation = expected_generation + 1),
  source_revision bigint NOT NULL CHECK (source_revision >= 0),
  inventory_digest text NOT NULL CHECK (inventory_digest ~ '^[0-9a-f]{64}$'),
  capture_kind text NOT NULL CHECK (capture_kind IN ('CALLER_CLAIM','DRAIN_BOUND_CLAIM','LOCKED_SOURCE_CAPTURE','FROZEN_SOURCE_CAPTURE','FROZEN_NOLOGIN_SOURCE_OBSERVATION','FROZEN_CLOSED_DB_OBSERVATION')),
  predecessor_hash text NOT NULL CHECK (predecessor_hash ~ '^[0-9a-f]{64}$'),
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (checkpoint_id,operation_id),
  UNIQUE (checkpoint_id,generation)
);
-- Accidental or compromised application-writer UPDATE/DELETE/TRUNCATE must
-- not silently rewrite the checkpoint journal. Privileged DDL owners remain
-- outside this candidate boundary and require independent qualification.
CREATE FUNCTION portal_restore_authority.immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'V2_CHECKPOINT_EVENT_IMMUTABLE'; END $$;
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_restore_authority.events
  FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_authority.immutable_event();
-- The closed-DB digest alone is not independently inspectable. Preserve its
-- exact non-secret preimage beside the event in the same authority transaction.
-- This is an observation, not independent operator authority or a restore permit.
CREATE TABLE portal_restore_authority.closed_observations (
  checkpoint_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  observation text NOT NULL CHECK (octet_length(observation) BETWEEN 2 AND 8192),
  PRIMARY KEY (checkpoint_id,operation_id),
  FOREIGN KEY (checkpoint_id,operation_id) REFERENCES portal_restore_authority.events(checkpoint_id,operation_id)
);
CREATE TRIGGER closed_observations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON portal_restore_authority.closed_observations
  FOR EACH STATEMENT EXECUTE FUNCTION portal_restore_authority.immutable_event();
REVOKE ALL ON ALL TABLES IN SCHEMA portal_restore_authority FROM PUBLIC;
