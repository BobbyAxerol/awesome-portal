-- RF-05 (P13, Claude): additive series kinds for engine OOS analytics.
--
-- ROLLING_SHARPE_63 carries QuantBT's rolling Sharpe over 63 UTC daily OOS
-- returns; ROLLING_BETA_63 is stored only as a typed absence until a
-- benchmark series is published.  Existing rows are untouched and remain
-- immutable; this only widens the accepted vocabulary.

ALTER TABLE research.run_evidence_series_v1
  DROP CONSTRAINT IF EXISTS run_evidence_series_v1_series_kind_check;

ALTER TABLE research.run_evidence_series_v1
  ADD CONSTRAINT run_evidence_series_v1_series_kind_check
  CHECK (series_kind IN (
    'EQUITY_OOS',
    'MONTHLY_RETURNS',
    'ROLLING_RETURNS_20',
    'RETURN_DISTRIBUTION',
    'ROLLING_SHARPE_63',
    'ROLLING_BETA_63'
  ));

COMMENT ON CONSTRAINT run_evidence_series_v1_series_kind_check
  ON research.run_evidence_series_v1 IS
  'RF-05 P13 series vocabulary. ROLLING_BETA_63 rows are typed NOT_PUBLISHED absences, never zero data.';

SELECT 1;
