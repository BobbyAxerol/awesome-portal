-- EDS-11R5: persist an explicit post-cutover EVENT_LOG_ANCHOR.
--
-- An event-log source can legitimately start at high-watermark zero while its
-- declared retention floor is one.  That is not an empty state snapshot and
-- must never be represented by a synthetic business event or an empty batch.
-- This additive migration records the source-owned semantics and permits the
-- exact zero checkpoint only for that meaning.

ALTER TABLE portal_projection.authoritative_event_generations
  ADD COLUMN IF NOT EXISTS snapshot_semantics TEXT NOT NULL DEFAULT 'STATE_BASELINE';

ALTER TABLE portal_projection.authoritative_event_generations
  ADD COLUMN IF NOT EXISTS anchor_digest TEXT;

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- 0017 used anonymous CHECK names. Remove only the two legacy constraints
  -- whose definitions prevent a valid zero event-log anchor; no other source
  -- or persistence invariant is widened.
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'portal_projection.authoritative_event_generations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%committed_source_sequence%^[1-9]%'
  LOOP
    EXECUTE format(
      'ALTER TABLE portal_projection.authoritative_event_generations DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'portal_projection.authoritative_event_generations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%high_watermark_sequence%retention_floor_sequence%'
  LOOP
    EXECUTE format(
      'ALTER TABLE portal_projection.authoritative_event_generations DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
END;
$$;

ALTER TABLE portal_projection.authoritative_event_generations
  ADD CONSTRAINT authoritative_event_generations_committed_sequence_v2_check
  CHECK (
    committed_source_sequence IS NULL
    OR committed_source_sequence ~ '^(0|[1-9][0-9]{0,19})$'
  );

ALTER TABLE portal_projection.authoritative_event_generations
  ADD CONSTRAINT authoritative_event_generations_snapshot_semantics_check
  CHECK (snapshot_semantics IN ('STATE_BASELINE', 'EVENT_LOG_ANCHOR'));

ALTER TABLE portal_projection.authoritative_event_generations
  ADD CONSTRAINT authoritative_event_generations_snapshot_boundary_v2_check
  CHECK (
    (snapshot_semantics = 'STATE_BASELINE'
      AND high_watermark_sequence::numeric >= retention_floor_sequence::numeric)
    OR
    (snapshot_semantics = 'EVENT_LOG_ANCHOR'
      AND high_watermark_sequence::numeric >= retention_floor_sequence::numeric - 1)
  );

ALTER TABLE portal_projection.authoritative_event_generations
  ADD CONSTRAINT authoritative_event_generations_event_log_anchor_check
  CHECK (
    snapshot_semantics <> 'EVENT_LOG_ANCHOR'
    OR (
      anchor_digest ~ '^sha256:[0-9a-f]{64}$'
      AND state IN ('TAIL_READY', 'RESNAPSHOT_REQUIRED')
      AND committed_source_sequence IS NOT NULL
      AND committed_revision >= 1
      AND committed_source_sequence::numeric >= high_watermark_sequence::numeric
    )
  );

COMMENT ON COLUMN portal_projection.authoritative_event_generations.snapshot_semantics IS
  'STATE_BASELINE reconstructs state; EVENT_LOG_ANCHOR is a durable no-backfill post-cutover boundary.';
COMMENT ON COLUMN portal_projection.authoritative_event_generations.anchor_digest IS
  'Canonical digest of the non-forgeable EVENT_LOG_ANCHOR boundary, never a business-event batch digest.';
