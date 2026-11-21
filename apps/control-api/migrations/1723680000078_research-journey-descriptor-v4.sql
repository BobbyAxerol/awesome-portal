-- CG-S00-AV-01: the shipped Alpha Version card requires an alpha selection,
-- not a run. Keep revisions 1–3 immutable; this digest is exported by
-- research/journey.descriptor.v4.ts.
INSERT INTO research.journey_descriptor_registry
  (descriptor_id, schema_version, revision, content_sha256)
VALUES
  ('quantbt_journey', 'research.journey.v1', 4,
   '376acce59fa25435aebcf3ce225117d169415b6a1164617e5da11e68a82d5ab8');

-- The immutable registry rows are intentionally retained on rollback.
SELECT 1;
