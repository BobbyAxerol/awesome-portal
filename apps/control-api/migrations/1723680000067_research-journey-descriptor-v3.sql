-- E12 (HiFi audit 00-3): five mounted screens were still declared PLANNED, so
-- Screen 00 drew them as SOON. Revision 3 flips S4 Execute Replay, Attempt
-- Lineage, Compare, Release Candidate and Run Report to AVAILABLE.
--
-- CG-P09-04: the registry is immutable (the UPDATE/DELETE guard installed by
-- 1723680000042_research-foundation-v1.sql). A revision is therefore published
-- as a new row, never as an edit of revision 2, and the server refuses to serve
-- a descriptor whose checked-in SHA-256 does not match the newest row
-- (research/foundation.service.ts -> RESEARCH_FOUNDATION_DESCRIPTOR_MISMATCH).
--
-- The SHA-256 below is the canonicalised RESEARCH_JOURNEY_DESCRIPTOR of
-- research/journey.descriptor.v2.ts at revision 3. It is not hand-written:
-- it is RESEARCH_JOURNEY_DESCRIPTOR_SHA256 exported by that module.
INSERT INTO research.journey_descriptor_registry
  (descriptor_id, schema_version, revision, content_sha256)
VALUES
  ('quantbt_journey', 'research.journey.v1', 3,
   '7f42203c4f6b4f326e28e020398a530c2fe6268c05352eb9aab5b918e5cd548d');

-- Immutable registry rows are deliberately retained on rollback.
SELECT 1;
