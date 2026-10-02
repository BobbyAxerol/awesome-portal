-- B6 already bounds the immutable enrichment at 72 KiB. Keep the original
-- 64-KiB core limit independently, as migration 083 does for P04 passports.
-- No retained row/byte/digest, role, lease or immutable guard is rewritten.
DO $$
DECLARE old_name text;
BEGIN
  SELECT conname INTO STRICT old_name FROM pg_constraint
    WHERE conrelid='research.current_source_seals_v1'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%octet_length%'
      AND pg_get_constraintdef(oid) LIKE '%summary%65536%';
  EXECUTE format('ALTER TABLE research.current_source_seals_v1 DROP CONSTRAINT %I', old_name);
END $$;
ALTER TABLE research.current_source_seals_v1 ADD CONSTRAINT current_source_seals_v1_enrichment_budget
  CHECK (jsonb_typeof(summary)='object'
    AND octet_length((summary - 'enriched_analysis')::text) <= 65536
    AND (NOT (summary ? 'enriched_analysis') OR
      (jsonb_typeof(summary->'enriched_analysis')='object'
       AND octet_length((summary->'enriched_analysis')::text) <= 73728)));
COMMENT ON CONSTRAINT current_source_seals_v1_enrichment_budget ON research.current_source_seals_v1
  IS 'Immutable 64-KiB source core plus separately bounded 72-KiB B6 supplement; no loss of authority to fit display sampling.';
SELECT 1;
