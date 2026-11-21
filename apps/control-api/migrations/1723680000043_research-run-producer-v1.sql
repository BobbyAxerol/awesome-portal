-- Research Loop P10 · browser New Run durable producer.
--
-- This table is the durable bridge between the P08 immutable preflight and
-- the existing `/api/runs` compatibility facade.  It stores only bounded,
-- server-validated metadata; it never stores a snapshot path, HMD rows,
-- worker secret, broker credential or an Execution-owned relation.

-- Imported source being ACTIVE proves its registry lifecycle, not that its
-- arbitrary Python can execute in the P06 child.  This small server-owned
-- allowlist is therefore the only place where a version can be mapped to a
-- real installed adapter.  P10 ships one row kind (`p04.delta-rsi.v1`); later
-- adapters are additive data-release work, never browser input.
CREATE TABLE research.execution_adapter_bindings (
  workspace_id             text NOT NULL REFERENCES workspaces(workspace_id),
  alpha_version_id         text NOT NULL,
  adapter_id               text NOT NULL CHECK (adapter_id = 'p04.delta-rsi.v1'),
  contract_digest          text NOT NULL CHECK (contract_digest ~ '^[0-9a-f]{64}$'),
  installed_by_user_id     text NOT NULL REFERENCES portal_users(user_id),
  installed_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, alpha_version_id),
  FOREIGN KEY (workspace_id, alpha_version_id)
    REFERENCES research.alpha_versions(workspace_id, alpha_version_id)
);

CREATE FUNCTION research.protect_execution_adapter_binding_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research execution adapter binding is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER research_execution_adapter_bindings_immutable_guard
BEFORE UPDATE OR DELETE ON research.execution_adapter_bindings
FOR EACH ROW EXECUTE FUNCTION research.protect_execution_adapter_binding_identity();

REVOKE ALL ON FUNCTION research.protect_execution_adapter_binding_identity() FROM PUBLIC;
-- P10 may insert only its reviewed, repository-validated immutable binding.
-- The role retains no UPDATE or DELETE ability, so neither a browser session
-- nor a future repository path can retarget an installed executable version.
GRANT SELECT, INSERT ON research.execution_adapter_bindings TO portal_research_runtime;

CREATE TABLE research.run_producers (
  workspace_id              text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                    text NOT NULL,
  attempt_id                text NOT NULL,
  job_id                    text NOT NULL,
  actor_user_id             text NOT NULL REFERENCES portal_users(user_id),
  client_intent_id          text NOT NULL
                            CHECK (client_intent_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$'),
  intent_kind               text NOT NULL
                            CHECK (intent_kind IN ('NEW', 'CLONE_FOR_EXPERIMENT',
                                                   'REPRODUCE_EXISTING', 'UPGRADE_ENGINE_EXPERIMENT')),
  preflight_token           text NOT NULL
                            CHECK (preflight_token ~ '^rpft_[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'),
  alpha_id                  text NOT NULL,
  alpha_version_id          text NOT NULL,
  execution_adapter_id      text NOT NULL
                            CHECK (execution_adapter_id = 'p04.delta-rsi.v1'),
  adapter_contract_digest   text NOT NULL CHECK (adapter_contract_digest ~ '^[0-9a-f]{64}$'),
  requested_spec_digest     text NOT NULL CHECK (requested_spec_digest ~ '^[0-9a-f]{64}$'),
  effective_spec_digest     text NOT NULL CHECK (effective_spec_digest ~ '^[0-9a-f]{64}$'),
  dataset_binding_digest    text NOT NULL CHECK (dataset_binding_digest ~ '^[0-9a-f]{64}$'),
  manifest_digest           text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  snapshot_id               text NOT NULL
                            CHECK (snapshot_id ~ '^dss_[0-9a-f]{32}$'),
  snapshot_content_hash     text NOT NULL CHECK (snapshot_content_hash ~ '^[0-9a-f]{64}$'),
  work_digest               text NOT NULL CHECK (work_digest ~ '^[0-9a-f]{64}$'),
  -- Exact bounded compatibility request. The Portal branch validates it
  -- again, but persistence gives an unknown transport retry its same intent.
  legacy_request            jsonb NOT NULL CHECK (jsonb_typeof(legacy_request) = 'object'),
  dispatch_state            text NOT NULL DEFAULT 'PENDING'
                            CHECK (dispatch_state IN ('PENDING', 'DISPATCHED')),
  worker_attempt_id         text,
  lease_epoch               bigint CHECK (lease_epoch IS NULL OR lease_epoch > 0),
  portal_receipt            jsonb CHECK (portal_receipt IS NULL OR jsonb_typeof(portal_receipt) = 'object'),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id),
  UNIQUE (workspace_id, client_intent_id),
  UNIQUE (workspace_id, attempt_id),
  UNIQUE (workspace_id, job_id),
  FOREIGN KEY (workspace_id, attempt_id)
    REFERENCES research.attempts(workspace_id, attempt_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  FOREIGN KEY (workspace_id, job_id)
    REFERENCES research.jobs(workspace_id, job_id),
  FOREIGN KEY (workspace_id, preflight_token, actor_user_id)
    REFERENCES research.preflight_manifests(workspace_id, preflight_token, actor_user_id),
  FOREIGN KEY (workspace_id, alpha_version_id)
    REFERENCES research.execution_adapter_bindings(workspace_id, alpha_version_id),
  CHECK (octet_length(legacy_request::text) <= 65536),
  CHECK (portal_receipt IS NULL OR octet_length(portal_receipt::text) <= 16384),
  CHECK ((worker_attempt_id IS NULL) = (lease_epoch IS NULL)),
  CHECK (dispatch_state <> 'DISPATCHED' OR portal_receipt IS NOT NULL)
);

CREATE INDEX research_run_producers_dispatch_idx
  ON research.run_producers (workspace_id, dispatch_state, created_at, run_id);

CREATE FUNCTION research.protect_run_producer_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.client_intent_id IS DISTINCT FROM OLD.client_intent_id
     OR NEW.intent_kind IS DISTINCT FROM OLD.intent_kind
     OR NEW.preflight_token IS DISTINCT FROM OLD.preflight_token
     OR NEW.alpha_id IS DISTINCT FROM OLD.alpha_id
     OR NEW.alpha_version_id IS DISTINCT FROM OLD.alpha_version_id
     OR NEW.execution_adapter_id IS DISTINCT FROM OLD.execution_adapter_id
     OR NEW.adapter_contract_digest IS DISTINCT FROM OLD.adapter_contract_digest
     OR NEW.requested_spec_digest IS DISTINCT FROM OLD.requested_spec_digest
     OR NEW.effective_spec_digest IS DISTINCT FROM OLD.effective_spec_digest
     OR NEW.dataset_binding_digest IS DISTINCT FROM OLD.dataset_binding_digest
     OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
     OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
     OR NEW.snapshot_content_hash IS DISTINCT FROM OLD.snapshot_content_hash
     OR NEW.work_digest IS DISTINCT FROM OLD.work_digest
     OR NEW.legacy_request IS DISTINCT FROM OLD.legacy_request THEN
    RAISE EXCEPTION 'research run producer identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_run_producers_identity_guard
BEFORE UPDATE ON research.run_producers
FOR EACH ROW EXECUTE FUNCTION research.protect_run_producer_identity();

REVOKE ALL ON FUNCTION research.protect_run_producer_identity() FROM PUBLIC;
GRANT SELECT, INSERT ON research.run_producers TO portal_research_runtime;
GRANT UPDATE (dispatch_state, worker_attempt_id, lease_epoch, portal_receipt, updated_at)
  ON research.run_producers TO portal_research_runtime;

COMMENT ON TABLE research.run_producers IS
  'P10 immutable browser-intent/preflight-to-facade bridge; no source paths, raw HMD, secrets or Execution authority.';

-- Down migration intentionally does not delete durable run evidence. Rolling
-- back a reader disables the producer feature flag and preserves retry/audit
-- identity for already-accepted requests.
SELECT 1;
