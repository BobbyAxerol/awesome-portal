-- Additive retained projection input. NULL preserves historical absence; no financial backfill.
-- Up Migration
ALTER TABLE execution_binding_projection ADD COLUMN list_figures jsonb
  CHECK (list_figures IS NULL OR (jsonb_typeof(list_figures) = 'object'
    AND octet_length(list_figures::text) <= 32768));

-- Down Migration
ALTER TABLE execution_binding_projection DROP COLUMN list_figures;
