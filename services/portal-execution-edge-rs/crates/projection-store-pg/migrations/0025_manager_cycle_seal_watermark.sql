-- Existing heartbeats cannot prove whether an interrupted cycle modified the
-- active entities. NULL therefore remains unavailable until a complete cycle
-- has been checked and sealed by the updated worker.
ALTER TABLE portal_projection.manager_projection_heartbeats
  ADD COLUMN sealed_projection_sequence BIGINT
    CHECK (sealed_projection_sequence >= 0);

COMMENT ON COLUMN portal_projection.manager_projection_heartbeats.sealed_projection_sequence IS
  'Local projection sequence captured atomically with a complete Manager cycle; not a source event sequence';
