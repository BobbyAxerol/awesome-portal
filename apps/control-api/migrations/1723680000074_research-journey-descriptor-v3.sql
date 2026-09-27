-- E12: publish mounted Research screens without mutating retained revisions 1/2.
INSERT INTO research.journey_descriptor_registry
  (descriptor_id, schema_version, revision, content_sha256)
VALUES
  ('quantbt_journey', 'research.journey.v1', 3,
   '7f42203c4f6b4f326e28e020398a530c2fe6268c05352eb9aab5b918e5cd548d');

-- Descriptor history is immutable. Rollback selects the prior application
-- revision; it never deletes this evidence row.
SELECT 1;
