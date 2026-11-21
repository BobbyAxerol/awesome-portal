-- E16-R1 (P13/P17, Claude): bound the retained OHLC overview in storage.
-- Integration 2026-09-27: incoming 068 was never applied to a deployed cell.
-- Assign append-only 075 after the current 070-074 baseline; do not repair or
-- reorder an existing migration ledger to make this new source apply.
--
-- Screen 08's P04 hub lane had no price context because the P10 producer
-- deletes the derived tape before the artifact bundle is written
-- (`research_run_producer` -> `finally: shutil.rmtree`), so no run artifact
-- could ever be re-read for bars. The P06 child now summarises the OOS window
-- while it still holds the tape and carries that summary in its bounded P13
-- receipt; the projection keeps it verbatim under `candle_overview`.
--
-- This is deliberately NOT a widening of the P13 store into an OHLCV lane.
-- The table comment installed by 1723680000046 stays true: what is kept is one
-- bounded summary per run -- at most 48 buckets whose high/low are the true
-- extremes of the bars they cover -- and never a bar, a tick or a tape. No
-- historical row is touched and nothing is backfilled: a run sealed before
-- this change has no bars left to summarise and reads as a typed absence.
--
-- Cost per run, measured on the committed RF-05 four-month BTCUSDT 1h receipt:
-- +10.4 KiB in `projection` (48 buckets, ~216 B each) against the 32 KiB row
-- CHECK, and the same bytes in `run_evidence_sources_v1.source_payload`. The
-- child shrinks the bucket count (48 -> 24 -> 12 -> 8) until the whole receipt
-- fits its 24 KiB budget, and publishes a typed absence below the floor, so a
-- long run can make the overview coarser but never the row larger.

ALTER TABLE research.run_evidence_projections_v1
  ADD CONSTRAINT run_evidence_projections_v1_candle_overview_bound_check
  CHECK (
    projection -> 'candle_overview' IS NULL
    OR (
      jsonb_typeof(projection -> 'candle_overview') = 'object'
      AND jsonb_typeof(projection -> 'candle_overview' -> 'values') = 'array'
      AND jsonb_array_length(projection -> 'candle_overview' -> 'values') <= 48
    )
  );

COMMENT ON CONSTRAINT run_evidence_projections_v1_candle_overview_bound_check
  ON research.run_evidence_projections_v1 IS
  'E16-R1: the retained OHLC overview is a bounded per-run summary (<= 48 true-extrema buckets), never a raw OHLCV or tick store.';

COMMENT ON TABLE research.run_evidence_projections_v1 IS
  'P13 immutable Portal evidence projection revision; rollback changes the read namespace, never stored source evidence. E16-R1 adds one bounded OHLC overview of the OOS window per run: a summary with true bucket extrema, not a bar ledger.';

-- Down migration intentionally retains evidence. A rollback drops only the
-- bound; it must never delete a historical Research fact.
SELECT 1;
