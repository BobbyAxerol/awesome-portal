-- RF-03 / CG-P09-03/04: publish exact HiFi Journey v2 without mutating v1 evidence.
INSERT INTO research.journey_descriptor_registry
  (descriptor_id, schema_version, revision, content_sha256)
VALUES
  ('quantbt_journey', 'research.journey.v1', 2,
   '07d0ed3e7b4cf6fd7ad614a39d646656a931a84ef3aa8ee800cdeddf093071b1');

-- Immutable registry rows are deliberately retained on rollback.
SELECT 1;
