-- Add an explicit full-sample calibration role; immutable historical facts
-- keep their original scope. This is not untouched OOS or holdout exposure.
ALTER TABLE research.exposure_facts
 DROP CONSTRAINT exposure_facts_evaluation_role_check;
ALTER TABLE research.exposure_facts
 ADD CONSTRAINT exposure_facts_evaluation_role_check CHECK(evaluation_role IN (
  'QUALITY_SCAN', 'TRAIN', 'SELECTION_INPUT', 'OUTER_OOS', 'HOLDOUT',
  'RETROSPECTIVE', 'UNKNOWN', 'FULL_SAMPLE_CALIBRATION'
 ));
