-- Research Loop P19 · immutable attempt-lineage / promotion source facts.
--
-- This migration is additive.  It does not rewrite attempts, runs, worker
-- attempts, exposures, legacy metadata, QuantBT state, or any Execution
-- relation.  The new reader derives its graph from those existing immutable
-- records.  A promotion pick is deliberately a separate, source-attested
-- fact: the Portal must never select one from a metric, timestamp, lifecycle
-- label, or active Alpha version.

CREATE INDEX IF NOT EXISTS research_attempts_lineage_alpha_created_idx
  ON research.attempts (workspace_id, alpha_version_id, created_at ASC, attempt_id ASC);

CREATE INDEX IF NOT EXISTS research_runs_lineage_attempt_created_idx
  ON research.runs (workspace_id, attempt_id, created_at ASC, run_id ASC);

CREATE INDEX IF NOT EXISTS research_exposure_facts_lineage_run_created_idx
  ON research.exposure_facts (workspace_id, run_id, created_at ASC, exposure_id ASC);

-- A single immutable owner/source fact applies to one immutable Alpha version.
-- Corrections must be represented by a new immutable Alpha version or a
-- separately versioned source contract; overwriting a pick would destroy the
-- exact decision evidence that Screen 10 is intended to preserve.
CREATE TABLE research.attempt_promotion_pick_facts_v1 (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  alpha_version_id      text NOT NULL,
  attempt_id            text NOT NULL,
  run_id                text NOT NULL,
  source_fact_ref       text NOT NULL CHECK (length(trim(source_fact_ref)) BETWEEN 1 AND 512),
  source_contract_rev   text NOT NULL CHECK (length(trim(source_contract_rev)) BETWEEN 1 AND 160),
  source_digest         text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  source_as_of          timestamptz NOT NULL,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, alpha_version_id),
  UNIQUE (workspace_id, attempt_id),
  UNIQUE (workspace_id, run_id),
  FOREIGN KEY (workspace_id, alpha_version_id)
    REFERENCES research.alpha_versions(workspace_id, alpha_version_id),
  FOREIGN KEY (workspace_id, attempt_id)
    REFERENCES research.attempts(workspace_id, attempt_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id)
);

CREATE OR REPLACE FUNCTION research.validate_attempt_promotion_pick_fact_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, research
AS $$
DECLARE
  attempt_version_id text;
BEGIN
  SELECT alpha_version_id INTO attempt_version_id
    FROM research.attempts
   WHERE workspace_id = NEW.workspace_id
     AND attempt_id = NEW.attempt_id;

  IF NOT FOUND OR attempt_version_id IS DISTINCT FROM NEW.alpha_version_id THEN
    RAISE EXCEPTION 'promotion pick must bind an attempt from the same alpha version'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM research.runs
     WHERE workspace_id = NEW.workspace_id
       AND run_id = NEW.run_id
       AND attempt_id = NEW.attempt_id
  ) THEN
    RAISE EXCEPTION 'promotion pick run must belong to its selected attempt'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER research_attempt_promotion_pick_facts_v1_validate
BEFORE INSERT ON research.attempt_promotion_pick_facts_v1
FOR EACH ROW EXECUTE FUNCTION research.validate_attempt_promotion_pick_fact_v1();

CREATE TRIGGER research_attempt_promotion_pick_facts_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.attempt_promotion_pick_facts_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.validate_attempt_promotion_pick_fact_v1() FROM PUBLIC;

-- This browser-facing reader needs SELECT only.  A future reviewed source
-- adapter can be granted a dedicated insert identity; the generic Portal
-- runtime deliberately cannot manufacture a promotion fact.
REVOKE INSERT, UPDATE, DELETE ON research.attempt_promotion_pick_facts_v1 FROM portal_research_runtime;
GRANT SELECT ON research.attempt_promotion_pick_facts_v1 TO portal_research_runtime;

COMMENT ON TABLE research.attempt_promotion_pick_facts_v1 IS
  'P19 immutable source-attested promotion pick. Browser has no write path; absent row is a typed source gap, never a metric heuristic.';

-- Down Migration
-- Reader rollback is route/flag-only.  Keep immutable lineage/promotion facts
-- and supporting indexes so later releases can render their historical truth.
SELECT 1;
