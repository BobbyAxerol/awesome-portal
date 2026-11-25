-- DR-30: additive, per-grant environment scope for read-only default-execution-workspace grants.
-- Existing rows keep execution_environments = '{}' and their exact 30-day retained-review meaning.
-- Rows with a non-empty scope only count when FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS=true (inert otherwise,
-- also for the retained-review reader). No data is rewritten and no access-policy table is touched.
-- Up Migration
ALTER TABLE execution_retained_review_access
  ADD COLUMN execution_environments text[] NOT NULL DEFAULT '{}'
    CHECK (execution_environments <@ ARRAY['paper','sandbox','live']::text[]),
  ADD COLUMN term_started_at timestamptz NOT NULL DEFAULT now();
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='execution_retained_review_access'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%30 days%' LOOP
    EXECUTE format('ALTER TABLE execution_retained_review_access DROP CONSTRAINT %I',c);
  END LOOP;
END $$;
ALTER TABLE execution_retained_review_access ADD CONSTRAINT execution_retained_review_access_term CHECK (
  (cardinality(execution_environments) = 0 AND expires_at > created_at AND expires_at <= created_at + interval '30 days')
  OR (cardinality(execution_environments) > 0 AND expires_at > term_started_at
    AND expires_at <= term_started_at + interval '366 days'));
COMMENT ON COLUMN execution_retained_review_access.execution_environments IS
  'DR-30: non-empty = read-only default execution workspace grant limited to these environments (GET only, 12 month renewable term). Empty = legacy 30-day retained-review grant.';
-- Down Migration
-- Scoped grants cannot satisfy the original 30-day check: they are removed on rollback (legacy rows are untouched).
DELETE FROM execution_retained_review_access WHERE cardinality(execution_environments) > 0;
ALTER TABLE execution_retained_review_access DROP CONSTRAINT execution_retained_review_access_term;
ALTER TABLE execution_retained_review_access DROP COLUMN term_started_at, DROP COLUMN execution_environments;
ALTER TABLE execution_retained_review_access ADD CONSTRAINT execution_retained_review_access_check
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days');
