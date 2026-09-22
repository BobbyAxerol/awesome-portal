-- Research Loop P20 · bounded Portal-derived Compare projection cache.
--
-- This is intentionally not evidence, a selection ledger, an approval fact,
-- a source artifact mirror or a worker queue. It holds only short-lived,
-- content-addressed API projections derived from already immutable P08/P13/
-- P14/RS-02 rows. Deleting a cache row cannot delete or alter Research truth.

CREATE INDEX IF NOT EXISTS research_current_source_compare_observation_idx
  ON research.current_source_rows_v1
  (workspace_id, run_id, artifact_revision, occurred_at_utc_ms ASC)
  WHERE table_kind = 'OBSERVATION';

CREATE TABLE research.compare_projection_cache_v1 (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  alpha_id              text NOT NULL,
  mode                  text NOT NULL CHECK (mode IN ('attempts', 'markets', 'pair')),
  request_digest        text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  source_binding_digest text NOT NULL CHECK (source_binding_digest ~ '^[0-9a-f]{64}$'),
  projection_revision   text NOT NULL CHECK (projection_revision ~ '^p20r1_[0-9a-f]{64}$'),
  projection_digest     text NOT NULL CHECK (projection_digest ~ '^[0-9a-f]{64}$'),
  projection            jsonb NOT NULL CHECK (jsonb_typeof(projection) = 'object' AND octet_length(projection::text) <= 524288),
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, alpha_id, mode, request_digest, source_binding_digest),
  FOREIGN KEY (workspace_id, alpha_id)
    REFERENCES research.alphas(workspace_id, alpha_id),
  CHECK (expires_at > created_at)
);

CREATE INDEX research_compare_projection_cache_expiry_idx
  ON research.compare_projection_cache_v1 (workspace_id, expires_at ASC);

REVOKE ALL ON research.compare_projection_cache_v1 FROM PUBLIC;
-- Cache rows are created and expired only by the bounded P20 reader. The
-- runtime has no UPDATE privilege and no privilege to alter evidence/source
-- tables, attempts, runs, approval data or any execution relation.
GRANT SELECT, INSERT, DELETE ON research.compare_projection_cache_v1 TO portal_research_runtime;

COMMENT ON TABLE research.compare_projection_cache_v1 IS
  'P20 expiring Portal-derived Compare API cache keyed by scoped immutable source bindings; not evidence, selection, approval or source truth.';
COMMENT ON INDEX research.research_current_source_compare_observation_idx IS
  'P20 exact-timestamp outer-OOS correlation lookup only; no generic browser raw-series query is exposed.';

-- Down migration intentionally retains an expired/operational cache until a
-- controlled maintenance window. Route/flag rollback is sufficient and never
-- removes immutable Research evidence or retained source rows.
SELECT 1;
