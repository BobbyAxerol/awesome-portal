-- Legacy workers cannot prove per-feed observations. NULL is UNKNOWN until a
-- fully validated worker atomically seals all feeds under the current lease.
ALTER TABLE portal_projection.manager_projection_heartbeats
  ADD COLUMN feed_observations JSONB
    CHECK (feed_observations IS NULL OR jsonb_typeof(feed_observations) = 'object');

COMMENT ON COLUMN portal_projection.manager_projection_heartbeats.feed_observations IS
  'Bounded successful source observations of the complete sealed Manager cycle, not an upstream health or event-replay claim';
