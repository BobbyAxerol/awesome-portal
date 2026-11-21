-- G-26: canonical Journey product links and current presentation copy.
-- Append only; revisions 1-4 and their content hashes remain immutable.
-- The compiled descriptor is research/journey.descriptor.v5.ts.
INSERT INTO research.journey_descriptor_registry
  (descriptor_id, schema_version, revision, content_sha256)
VALUES
  ('quantbt_journey', 'research.journey.v1', 5,
   '7e408074d63ee35cf3074de84a70d98d5481472df31d38c8a6c3ab91da01c9be');

-- Registry history is intentionally retained on rollback.
SELECT 1;
