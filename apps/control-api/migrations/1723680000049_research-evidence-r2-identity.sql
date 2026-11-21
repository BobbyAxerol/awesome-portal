-- RS-01: additive compatibility for corrected P13 source receipts.  Old R1
-- rows remain immutable and readable; this only permits R2's explicitly
-- labelled retained-series sampling vocabulary.

ALTER TABLE research.run_evidence_series_v1
  DROP CONSTRAINT IF EXISTS run_evidence_series_v1_sampling_check;

ALTER TABLE research.run_evidence_series_v1
  ADD CONSTRAINT run_evidence_series_v1_sampling_check
  CHECK (sampling IN (
    'FULL',
    'EXTREMA_BUCKET_V1',
    'TAIL_WINDOW_V1',
    'FULL_RETURN_HISTOGRAM_V2'
  ));

ALTER TABLE research.run_evidence_series_v1
  DROP CONSTRAINT IF EXISTS run_evidence_series_v1_source_observation_count_check;

ALTER TABLE research.run_evidence_series_v1
  ADD CONSTRAINT run_evidence_series_v1_source_observation_count_check
  CHECK (source_observation_count IS NULL OR source_observation_count >= 0);

COMMENT ON CONSTRAINT run_evidence_series_v1_sampling_check
  ON research.run_evidence_series_v1 IS
  'RS-01 corrected receipt sampling. TAIL_WINDOW_V1 and FULL_RETURN_HISTOGRAM_V2 are explicit coverage labels, not inferred on read.';

SELECT 1;
