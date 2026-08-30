-- N26 publishes only complete N24/N25 cycles. Per-snapshot projection journal
-- rows can be visible before a cycle is sealed, so they must never be used as
-- the Manager realtime cursor. These immutable columns form one shared,
-- profile-scoped cycle journal without duplicating business rows.
ALTER TABLE portal_projection.manager_projection_cycles
  ADD COLUMN realtime_sequence BIGINT,
  ADD COLUMN realtime_observation JSONB,
  ADD CONSTRAINT manager_projection_cycles_realtime_pair_check CHECK (
    (realtime_sequence IS NULL AND realtime_observation IS NULL)
    OR
    (realtime_sequence > 0 AND realtime_observation IS NOT NULL)
  );

CREATE UNIQUE INDEX idx_manager_projection_cycles_realtime_sequence
  ON portal_projection.manager_projection_cycles (epoch_id, realtime_sequence)
  WHERE realtime_sequence IS NOT NULL;

COMMENT ON COLUMN portal_projection.manager_projection_cycles.realtime_sequence IS
  'N26 contiguous cursor assigned only when a complete Manager projection cycle is sealed';
COMMENT ON COLUMN portal_projection.manager_projection_cycles.realtime_observation IS
  'Bounded PORTAL_PROJECTION_DELTA cycle metadata; contains no retained business row';
