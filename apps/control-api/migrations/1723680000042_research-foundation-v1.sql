-- Research Loop P09 · immutable Journey registry.
--
-- This is intentionally a tiny registry rather than a screen/content store:
-- it pins the exact descriptor identity, revision and canonical content digest
-- that a same-origin reader may expose.  It has no run, worker, queue,
-- Execution, market-data or mutation authority.

CREATE TABLE research.journey_descriptor_registry (
  descriptor_id  text NOT NULL
                 CHECK (descriptor_id = 'quantbt_journey'),
  schema_version text NOT NULL
                 CHECK (schema_version = 'research.journey.v1'),
  revision       bigint NOT NULL CHECK (revision > 0),
  content_sha256 text NOT NULL
                 CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  published_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (descriptor_id, revision)
);

INSERT INTO research.journey_descriptor_registry
  (descriptor_id, schema_version, revision, content_sha256)
VALUES
  ('quantbt_journey', 'research.journey.v1', 1,
   'ff0525afdc9cadf18881b760fab58a5c8e812768f1e9932fe80cc89091ededd1');

CREATE FUNCTION research.protect_journey_descriptor_registry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research journey descriptor registry is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER research_journey_descriptor_registry_immutable_guard
BEFORE UPDATE OR DELETE ON research.journey_descriptor_registry
FOR EACH ROW EXECUTE FUNCTION research.protect_journey_descriptor_registry();

REVOKE ALL ON FUNCTION research.protect_journey_descriptor_registry() FROM PUBLIC;
REVOKE ALL ON research.journey_descriptor_registry FROM portal_research_runtime;
GRANT SELECT ON research.journey_descriptor_registry TO portal_research_runtime;

CREATE INDEX research_journey_descriptor_registry_current_idx
  ON research.journey_descriptor_registry (descriptor_id, revision DESC);

COMMENT ON TABLE research.journey_descriptor_registry IS
  'P09 immutable descriptor revision/digest pin; it carries no run, worker, source or Execution authority.';

-- Down migration deliberately retains immutable evidence. Removing the P09
-- routes merely stops reads; no destructive down migration is permitted.
SELECT 1;
