-- Up Migration
--
-- Research Loop P03 · durable, workspace-scoped metadata foundation.
--
-- This migration is deliberately additive.  It owns only the new `research`
-- schema plus a least-privilege runtime role for that schema.  It does not
-- alter, grant on, or reference any Execution-owned table for its write path.
-- Existing Portal users, credentials, sessions, workspace rows and Execution
-- rows therefore retain their exact v1.1.1 shape and values.

CREATE SCHEMA IF NOT EXISTS research;

REVOKE ALL ON SCHEMA research FROM PUBLIC;

-- The Control API connects as the migration owner today.  Research requests
-- deliberately drop to this NOLOGIN role inside each transaction, so a future
-- Research repository cannot accidentally inherit write authority over public
-- Execution tables merely because the bootstrap login owns them.  A deployment
-- whose migration login cannot create/grant this role fails closed instead of
-- silently running Research with broader authority.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_research_runtime') THEN
    CREATE ROLE portal_research_runtime
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT pg_has_role(current_user, 'portal_research_runtime', 'member') THEN
    EXECUTE format('GRANT portal_research_runtime TO %I', current_user);
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM portal_research_runtime;
GRANT USAGE ON SCHEMA public TO portal_research_runtime;
GRANT SELECT ON TABLE portal_users, workspaces, workspace_members TO portal_research_runtime;

-- ---------------------------------------------------------------- identity

CREATE TABLE research.alphas (
  workspace_id         text NOT NULL REFERENCES workspaces(workspace_id),
  alpha_id             text NOT NULL,
  name                 text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 240),
  owner_user_id        text NOT NULL REFERENCES portal_users(user_id),
  execution_subject_id text NOT NULL CHECK (length(trim(execution_subject_id)) BETWEEN 1 AND 240),
  active_version_id    text,
  revision             bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, alpha_id),
  UNIQUE (workspace_id, execution_subject_id)
);

CREATE TABLE research.alpha_versions (
  workspace_id        text NOT NULL,
  alpha_version_id    text NOT NULL,
  alpha_id            text NOT NULL,
  code_digest         text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  entrypoint          text NOT NULL CHECK (length(trim(entrypoint)) BETWEEN 1 AND 512),
  dependency_ref      text NOT NULL CHECK (length(trim(dependency_ref)) BETWEEN 1 AND 512),
  declared_contract   jsonb NOT NULL CHECK (jsonb_typeof(declared_contract) = 'object'),
  lifecycle_state     text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'ABANDONED')),
  registered_by_user_id text NOT NULL REFERENCES portal_users(user_id),
  registered_at       timestamptz NOT NULL DEFAULT now(),
  metadata_revision   bigint NOT NULL DEFAULT 1 CHECK (metadata_revision > 0),
  PRIMARY KEY (workspace_id, alpha_version_id),
  UNIQUE (workspace_id, alpha_id, alpha_version_id),
  UNIQUE (workspace_id, alpha_id, code_digest, entrypoint),
  FOREIGN KEY (workspace_id, alpha_id)
    REFERENCES research.alphas(workspace_id, alpha_id),
  CHECK (octet_length(declared_contract::text) <= 65536)
);

ALTER TABLE research.alphas
  ADD CONSTRAINT research_alphas_active_version_fkey
  FOREIGN KEY (workspace_id, alpha_id, active_version_id)
  REFERENCES research.alpha_versions(workspace_id, alpha_id, alpha_version_id);

CREATE TABLE research.import_sessions (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  import_session_id     text NOT NULL,
  actor_user_id         text NOT NULL REFERENCES portal_users(user_id),
  source_file_ref       text NOT NULL CHECK (source_file_ref !~ '^/' AND length(trim(source_file_ref)) BETWEEN 1 AND 1024),
  source_digest         text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  validation_version    text NOT NULL CHECK (length(trim(validation_version)) BETWEEN 1 AND 128),
  gate_results          jsonb NOT NULL CHECK (jsonb_typeof(gate_results) = 'object'),
  expires_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, import_session_id),
  CHECK (octet_length(gate_results::text) <= 32768)
);

-- ---------------------------------------------------------------- attempts

CREATE TABLE research.attempts (
  workspace_id           text NOT NULL REFERENCES workspaces(workspace_id),
  attempt_id             text NOT NULL,
  alpha_version_id       text,
  parent_attempt_id      text,
  client_intent_id       text NOT NULL CHECK (length(trim(client_intent_id)) BETWEEN 1 AND 256),
  request_payload_digest text NOT NULL CHECK (request_payload_digest ~ '^[0-9a-f]{64}$'),
  draft_revision         bigint NOT NULL DEFAULT 1 CHECK (draft_revision > 0),
  intent_kind            text NOT NULL CHECK (intent_kind IN ('NEW', 'CLONE_FOR_EXPERIMENT', 'REPRODUCE_EXISTING', 'UPGRADE_ENGINE_EXPERIMENT')),
  reason                 text,
  space_signature        text,
  exposure_summary_ref   text,
  state                  text NOT NULL CHECK (state IN (
                            'DRAFT', 'PREFLIGHT_VALID', 'QUEUED', 'CLAIMED', 'RUNNING',
                            'COMPUTE_DONE', 'SEALING', 'READY', 'CANCEL_REQUESTED',
                            'CANCELLED', 'FAILED', 'RECOVERY_REQUIRED', 'ABANDONED')),
  created_by_user_id     text NOT NULL REFERENCES portal_users(user_id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, attempt_id),
  UNIQUE (workspace_id, client_intent_id),
  FOREIGN KEY (workspace_id, alpha_version_id)
    REFERENCES research.alpha_versions(workspace_id, alpha_version_id),
  FOREIGN KEY (workspace_id, parent_attempt_id)
    REFERENCES research.attempts(workspace_id, attempt_id),
  CHECK (parent_attempt_id IS NULL OR parent_attempt_id <> attempt_id),
  CHECK (space_signature IS NULL OR space_signature ~ '^[0-9a-f]{64}$')
);

CREATE TABLE research.runs (
  workspace_id           text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                 text NOT NULL,
  attempt_id             text NOT NULL,
  run_kind               text NOT NULL CHECK (run_kind IN ('PRIMARY', 'AUDIT', 'DIAGNOSTIC', 'REPRODUCTION', 'EXPORT', 'VERIFY', 'PROJECTION')),
  relationship_kind      text NOT NULL CHECK (relationship_kind IN ('PRIMARY', 'AUDIT_OF_SELECTION', 'DIAGNOSTIC_OF_RUN', 'REPRODUCTION_OF_RUN', 'EXPORT_OF_RUN', 'VERIFY_OF_RUN', 'PROJECTION_OF_RUN')),
  logical_run_key        text NOT NULL CHECK (length(trim(logical_run_key)) BETWEEN 1 AND 256),
  parent_run_id          text,
  target_selection_id    text,
  request_spec_digest    text NOT NULL CHECK (request_spec_digest ~ '^[0-9a-f]{64}$'),
  effective_spec_digest  text NOT NULL CHECK (effective_spec_digest ~ '^[0-9a-f]{64}$'),
  engine_release_id      text NOT NULL CHECK (length(trim(engine_release_id)) BETWEEN 1 AND 256),
  dataset_binding_digest text NOT NULL CHECK (dataset_binding_digest ~ '^[0-9a-f]{64}$'),
  state                  text NOT NULL CHECK (state IN ('DRAFT', 'QUEUED', 'RUNNING', 'SEALING', 'READY', 'FAILED', 'CANCELLED', 'RECOVERY_REQUIRED')),
  state_version          bigint NOT NULL DEFAULT 1 CHECK (state_version > 0),
  artifact_revision      bigint NOT NULL DEFAULT 0 CHECK (artifact_revision >= 0),
  submitted_by_user_id   text NOT NULL REFERENCES portal_users(user_id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id),
  UNIQUE (workspace_id, attempt_id, logical_run_key),
  FOREIGN KEY (workspace_id, attempt_id)
    REFERENCES research.attempts(workspace_id, attempt_id),
  FOREIGN KEY (workspace_id, parent_run_id)
    REFERENCES research.runs(workspace_id, run_id),
  CHECK ((relationship_kind = 'PRIMARY') = (parent_run_id IS NULL))
);

CREATE INDEX research_runs_library_cursor_idx
  ON research.runs (workspace_id, created_at DESC, run_id DESC);

CREATE TABLE research.jobs (
  workspace_id    text NOT NULL REFERENCES workspaces(workspace_id),
  job_id          text NOT NULL,
  run_id          text NOT NULL,
  command_id      text NOT NULL CHECK (length(trim(command_id)) BETWEEN 1 AND 256),
  job_kind        text NOT NULL CHECK (job_kind IN ('PRIMARY', 'AUDIT', 'DIAGNOSTIC', 'EXPORT', 'VERIFY', 'PROJECTION')),
  queue_class     text NOT NULL CHECK (queue_class IN ('INTERACTIVE', 'HEAVY', 'BACKGROUND')),
  cost_estimate   jsonb NOT NULL CHECK (jsonb_typeof(cost_estimate) = 'object'),
  resource_class  text NOT NULL CHECK (length(trim(resource_class)) BETWEEN 1 AND 128),
  state           text NOT NULL CHECK (state IN ('QUEUED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  cancel_version  bigint NOT NULL DEFAULT 0 CHECK (cancel_version >= 0),
  requested_by_user_id text NOT NULL REFERENCES portal_users(user_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, job_id),
  UNIQUE (workspace_id, command_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  CHECK (octet_length(cost_estimate::text) <= 16384)
);

CREATE INDEX research_jobs_queue_idx
  ON research.jobs (workspace_id, state, queue_class, created_at, job_id);

CREATE TABLE research.worker_attempts (
  workspace_id        text NOT NULL REFERENCES workspaces(workspace_id),
  worker_attempt_id   text NOT NULL,
  job_id              text NOT NULL,
  ordinal             integer NOT NULL CHECK (ordinal > 0),
  worker_id           text NOT NULL CHECK (length(trim(worker_id)) BETWEEN 1 AND 256),
  lease_epoch         bigint NOT NULL CHECK (lease_epoch > 0),
  expires_at          timestamptz NOT NULL,
  exit_reason         text,
  measured_usage      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(measured_usage) = 'object'),
  staging_ref         text,
  state               text NOT NULL CHECK (state IN ('CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'LOST_LEASE', 'CANCELLED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, worker_attempt_id),
  UNIQUE (workspace_id, job_id, ordinal),
  UNIQUE (workspace_id, job_id, lease_epoch),
  FOREIGN KEY (workspace_id, job_id)
    REFERENCES research.jobs(workspace_id, job_id),
  CHECK (staging_ref IS NULL OR staging_ref !~ '^/'),
  CHECK (octet_length(measured_usage::text) <= 16384)
);

-- ---------------------------------------------------- source/evaluation graph

CREATE TABLE research.input_bindings (
  workspace_id           text NOT NULL REFERENCES workspaces(workspace_id),
  input_binding_id       text NOT NULL,
  run_id                 text NOT NULL,
  dataset_ref            text NOT NULL CHECK (length(trim(dataset_ref)) BETWEEN 1 AND 512),
  universe_ref           text,
  snapshot_digest        text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  timezone_name          text NOT NULL CHECK (length(trim(timezone_name)) BETWEEN 1 AND 128),
  calendar_policy_ref    text NOT NULL CHECK (length(trim(calendar_policy_ref)) BETWEEN 1 AND 512),
  range_start_utc        timestamptz NOT NULL,
  range_end_utc          timestamptz NOT NULL,
  quality_summary_ref    text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, input_binding_id),
  UNIQUE (workspace_id, run_id, snapshot_digest),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  CHECK (range_end_utc > range_start_utc)
);

CREATE TABLE research.studies (
  workspace_id       text NOT NULL REFERENCES workspaces(workspace_id),
  study_id           text NOT NULL,
  run_id             text NOT NULL,
  engine_study_key   text NOT NULL CHECK (length(trim(engine_study_key)) BETWEEN 1 AND 256),
  purpose            text NOT NULL CHECK (purpose IN ('SEARCH', 'SELECTION', 'AUDIT', 'DIAGNOSTIC')),
  fold_id            text,
  sampler_config_ref text,
  source_stage       text NOT NULL,
  source_schedule    text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, study_id),
  UNIQUE (workspace_id, run_id, engine_study_key),
  UNIQUE (workspace_id, study_id, run_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id)
);

CREATE TABLE research.trial_index (
  workspace_id              text NOT NULL REFERENCES workspaces(workspace_id),
  study_id                  text NOT NULL,
  run_id                    text NOT NULL,
  trial_id                  text NOT NULL,
  trial_ordinal             integer NOT NULL CHECK (trial_ordinal >= 0),
  execution_status          text NOT NULL CHECK (execution_status IN ('COMPLETE', 'PRUNED', 'FAILED', 'RUNNING', 'WAITING')),
  feasibility_state         text NOT NULL CHECK (feasibility_state IN ('FEASIBLE', 'INFEASIBLE', 'UNKNOWN')),
  effective_duplicate       boolean NOT NULL DEFAULT false,
  pool_member               boolean NOT NULL DEFAULT false,
  raw_best                  boolean NOT NULL DEFAULT false,
  params                    jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  objective_defined         boolean NOT NULL,
  objective_value           double precision,
  objective_definition_id   text,
  seed_scope                text,
  source_artifact_ref       text,
  source_revision           bigint NOT NULL DEFAULT 0 CHECK (source_revision >= 0),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, study_id, trial_id),
  UNIQUE (workspace_id, study_id, trial_ordinal),
  FOREIGN KEY (workspace_id, study_id, run_id)
    REFERENCES research.studies(workspace_id, study_id, run_id),
  CHECK (objective_defined = (objective_value IS NOT NULL)),
  -- PostgreSQL has no `isfinite(double precision)` overload.  Text is the
  -- stable server representation for its three non-finite float sentinels.
  CHECK (objective_value IS NULL OR objective_value::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  CHECK (octet_length(params::text) <= 65536)
);

CREATE INDEX research_trial_score_page_idx
  ON research.trial_index (workspace_id, run_id, study_id, execution_status, objective_value DESC NULLS LAST, trial_id);

CREATE TABLE research.selection_records (
  workspace_id            text NOT NULL REFERENCES workspaces(workspace_id),
  selection_id            text NOT NULL,
  run_id                  text NOT NULL,
  study_id                text NOT NULL,
  target_kind             text NOT NULL CHECK (target_kind IN ('SINGLE_PARAMETER_SET', 'PER_FOLD_SELECTION_SEQUENCE', 'COMPOSITE_POLICY', 'CENTROID')),
  selected_trial_id       text,
  parameter_bundle_digest text NOT NULL CHECK (parameter_bundle_digest ~ '^[0-9a-f]{64}$'),
  rationale_ref           text,
  refusal_reason          text,
  source_digest           text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, selection_id),
  -- This otherwise-redundant composite key lets evidence rows bind a
  -- selection to its owning run at the database boundary rather than merely
  -- trusting a repository-side lookup.
  UNIQUE (workspace_id, selection_id, run_id),
  FOREIGN KEY (workspace_id, study_id, run_id)
    REFERENCES research.studies(workspace_id, study_id, run_id),
  FOREIGN KEY (workspace_id, study_id, selected_trial_id)
    REFERENCES research.trial_index(workspace_id, study_id, trial_id),
  CHECK (selected_trial_id IS NOT NULL OR target_kind IN ('CENTROID', 'COMPOSITE_POLICY'))
);

ALTER TABLE research.runs
  ADD CONSTRAINT research_runs_target_selection_fkey
  FOREIGN KEY (workspace_id, target_selection_id)
  REFERENCES research.selection_records(workspace_id, selection_id);

CREATE TABLE research.evaluations (
  workspace_id            text NOT NULL REFERENCES workspaces(workspace_id),
  evaluation_id           text NOT NULL,
  run_id                  text NOT NULL,
  study_id                text,
  trial_id                text,
  data_role               text NOT NULL CHECK (data_role IN ('TRAIN', 'INNER_VALIDATION', 'SELECTION_INPUT', 'OUTER_OOS', 'HOLDOUT', 'RETROSPECTIVE', 'FULL_SAMPLE')),
  fold_id                 text,
  seed_scope              text,
  objective_definition_id text,
  source_artifact_ref     text,
  state                   text NOT NULL CHECK (state IN ('PENDING', 'COMPLETE', 'FAILED', 'NOT_APPLICABLE')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, evaluation_id),
  UNIQUE (workspace_id, evaluation_id, run_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, study_id, run_id)
    REFERENCES research.studies(workspace_id, study_id, run_id),
  FOREIGN KEY (workspace_id, study_id, trial_id)
    REFERENCES research.trial_index(workspace_id, study_id, trial_id),
  CHECK (trial_id IS NULL OR study_id IS NOT NULL)
);

-- --------------------------------------------------------- evidence/audit

CREATE TABLE research.artifacts (
  workspace_id         text NOT NULL REFERENCES workspaces(workspace_id),
  artifact_id          text NOT NULL,
  run_id               text NOT NULL,
  selection_id         text,
  table_kind           text NOT NULL CHECK (length(trim(table_kind)) BETWEEN 1 AND 128),
  schema_version       text NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 128),
  manifest_digest      text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  state                text NOT NULL CHECK (state IN ('PENDING', 'WRITING', 'SEALED', 'ABORTED', 'CORRUPT', 'MISSING')),
  retention_class      text NOT NULL CHECK (length(trim(retention_class)) BETWEEN 1 AND 128),
  storage_locator      text NOT NULL CHECK (storage_locator !~ '^/' AND length(trim(storage_locator)) BETWEEN 1 AND 1024),
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, artifact_id),
  UNIQUE (workspace_id, run_id, manifest_digest, table_kind),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, selection_id, run_id)
    REFERENCES research.selection_records(workspace_id, selection_id, run_id)
);

CREATE TABLE research.exposure_facts (
  workspace_id         text NOT NULL REFERENCES workspaces(workspace_id),
  exposure_id          text NOT NULL,
  run_id               text NOT NULL,
  evaluation_id        text,
  actor_user_id        text NOT NULL REFERENCES portal_users(user_id),
  snapshot_digest      text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  range_start_utc      timestamptz,
  range_end_utc        timestamptz,
  evaluation_role      text NOT NULL CHECK (evaluation_role IN ('QUALITY_SCAN', 'TRAIN', 'SELECTION_INPUT', 'OUTER_OOS', 'HOLDOUT', 'RETROSPECTIVE', 'UNKNOWN')),
  source_fact_ref      text NOT NULL CHECK (length(trim(source_fact_ref)) BETWEEN 1 AND 1024),
  source_as_of         timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, exposure_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, evaluation_id, run_id)
    REFERENCES research.evaluations(workspace_id, evaluation_id, run_id),
  CHECK ((range_start_utc IS NULL AND range_end_utc IS NULL) OR
         (range_start_utc IS NOT NULL AND range_end_utc IS NOT NULL AND range_end_utc > range_start_utc))
);

CREATE TABLE research.inspection_states (
  workspace_id           text NOT NULL REFERENCES workspaces(workspace_id),
  actor_user_id          text NOT NULL REFERENCES portal_users(user_id),
  run_id                 text NOT NULL,
  inspection_study_id    text,
  inspection_trial_id    text,
  inspection_cursor      text,
  inspection_revision    bigint NOT NULL DEFAULT 1 CHECK (inspection_revision > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, actor_user_id, run_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, inspection_study_id, inspection_trial_id)
    REFERENCES research.trial_index(workspace_id, study_id, trial_id),
  CHECK (inspection_trial_id IS NULL OR inspection_study_id IS NOT NULL),
  CHECK (inspection_cursor IS NULL OR length(inspection_cursor) <= 2048)
);

CREATE TABLE research.release_candidates (
  workspace_id            text NOT NULL REFERENCES workspaces(workspace_id),
  release_candidate_id    text NOT NULL,
  run_id                  text NOT NULL,
  selection_id            text,
  final_audit_run_id      text,
  manifest_digest         text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  schema_version          text NOT NULL CHECK (length(trim(schema_version)) BETWEEN 1 AND 128),
  lifecycle_state         text NOT NULL CHECK (lifecycle_state IN ('DRAFT', 'SEALED', 'DELIVERY_PENDING', 'ACKNOWLEDGED', 'REJECTED')),
  revision                bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, release_candidate_id),
  UNIQUE (workspace_id, manifest_digest),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, selection_id, run_id)
    REFERENCES research.selection_records(workspace_id, selection_id, run_id),
  FOREIGN KEY (workspace_id, final_audit_run_id)
    REFERENCES research.runs(workspace_id, run_id)
);

CREATE TABLE research.audit_log (
  workspace_id       text NOT NULL REFERENCES workspaces(workspace_id),
  audit_id           text NOT NULL,
  actor_user_id      text NOT NULL REFERENCES portal_users(user_id),
  action             text NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 160),
  subject_type       text NOT NULL CHECK (length(trim(subject_type)) BETWEEN 1 AND 160),
  subject_id         text NOT NULL CHECK (length(trim(subject_id)) BETWEEN 1 AND 256),
  reason_code        text,
  before_ref         text,
  after_ref          text,
  correlation_id     text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, audit_id),
  CHECK (octet_length(metadata::text) <= 16384)
);

CREATE INDEX research_audit_subject_idx
  ON research.audit_log (workspace_id, subject_type, subject_id, occurred_at DESC);

CREATE TABLE research.command_dedup (
  workspace_id         text NOT NULL REFERENCES workspaces(workspace_id),
  command_key          text NOT NULL CHECK (length(trim(command_key)) BETWEEN 1 AND 256),
  request_payload_hash text NOT NULL CHECK (request_payload_hash ~ '^[0-9a-f]{64}$'),
  response_ref         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, command_key)
);

-- -------------------------------------------------------- mutation guards

CREATE FUNCTION research.prevent_attempt_parent_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_attempt_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_attempt_id = NEW.attempt_id THEN
    RAISE EXCEPTION 'research attempt cannot parent itself' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(attempt_id, parent_attempt_id) AS (
      SELECT attempt_id, parent_attempt_id
        FROM research.attempts
       WHERE workspace_id = NEW.workspace_id
         AND attempt_id = NEW.parent_attempt_id
      UNION ALL
      SELECT candidate.attempt_id, candidate.parent_attempt_id
        FROM research.attempts candidate
        JOIN ancestors ancestor
          ON candidate.workspace_id = NEW.workspace_id
         AND candidate.attempt_id = ancestor.parent_attempt_id
       WHERE ancestor.parent_attempt_id IS NOT NULL
    )
    SELECT 1 FROM ancestors WHERE attempt_id = NEW.attempt_id
  ) THEN
    RAISE EXCEPTION 'research attempt parent cycle is forbidden' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_attempt_parent_cycle_guard
BEFORE INSERT OR UPDATE OF parent_attempt_id ON research.attempts
FOR EACH ROW EXECUTE FUNCTION research.prevent_attempt_parent_cycle();

CREATE FUNCTION research.protect_alpha_version_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id <> OLD.workspace_id
     OR NEW.alpha_version_id <> OLD.alpha_version_id
     OR NEW.alpha_id <> OLD.alpha_id
     OR NEW.code_digest <> OLD.code_digest
     OR NEW.entrypoint <> OLD.entrypoint
     OR NEW.dependency_ref <> OLD.dependency_ref
     OR NEW.declared_contract <> OLD.declared_contract THEN
    RAISE EXCEPTION 'alpha version identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_alpha_version_identity_guard
BEFORE UPDATE ON research.alpha_versions
FOR EACH ROW EXECUTE FUNCTION research.protect_alpha_version_identity();

CREATE FUNCTION research.prevent_immutable_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research immutable evidence cannot be changed or deleted' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER research_exposure_facts_immutable_guard
BEFORE UPDATE OR DELETE ON research.exposure_facts
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE TRIGGER research_audit_log_immutable_guard
BEFORE UPDATE OR DELETE ON research.audit_log
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.prevent_attempt_parent_cycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION research.protect_alpha_version_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION research.prevent_immutable_log_mutation() FROM PUBLIC;

GRANT USAGE ON SCHEMA research TO portal_research_runtime;
-- The runtime role is deliberately narrower than schema ownership: P03 only
-- needs inserts plus CAS updates to draft/inspection presentation state.  A
-- later phase that genuinely needs another mutable lifecycle transition must
-- add it explicitly in its own reviewed migration.
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA research TO portal_research_runtime;
GRANT UPDATE (draft_revision, updated_at) ON research.attempts TO portal_research_runtime;
GRANT UPDATE (
  inspection_study_id,
  inspection_trial_id,
  inspection_cursor,
  inspection_revision,
  updated_at
) ON research.inspection_states TO portal_research_runtime;
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA research GRANT SELECT, INSERT ON TABLES TO portal_research_runtime',
    current_user
  );
END
$$;

COMMENT ON SCHEMA research IS
  'Research Loop durable metadata. Additive-only; no Execution table is a Research write target.';
COMMENT ON ROLE portal_research_runtime IS
  'NOLOGIN least-privilege role for Control API Research transactions. It may read Portal identity/workspace membership and write only the research schema.';

-- Down Migration
--
-- Production rollback is reader/image rollback only.  Dropping research
-- metadata, audit lineage or a role that may be referenced by a later release
-- would be destructive, so the down path is intentionally a no-op.
SELECT 1;
