-- Additive historical projection, never overwrite an artifact or old report.
CREATE TABLE research.native_read_models_v1 (
  workspace_id text NOT NULL,
  run_id text NOT NULL,
  artifact_id text NOT NULL,
  artifact_revision bigint NOT NULL CHECK (artifact_revision > 0),
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  projection_digest text NOT NULL CHECK (projection_digest ~ '^[a-f0-9]{64}$'),
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection)='object' AND octet_length(projection::text)<=262144),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,run_id,artifact_revision),
  FOREIGN KEY(workspace_id,run_id) REFERENCES research.runs(workspace_id,run_id),
  FOREIGN KEY(workspace_id,artifact_id) REFERENCES research.artifacts(workspace_id,artifact_id)
);
CREATE FUNCTION research.guard_native_read_model_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'native projection is immutable' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM research.artifacts a JOIN research.run_producers p
      ON (p.workspace_id,p.run_id,p.worker_attempt_id,p.lease_epoch)=(a.workspace_id,a.run_id,a.worker_attempt_id,a.lease_epoch)
    WHERE (a.workspace_id,a.run_id,a.artifact_id,a.artifact_revision,a.manifest_digest)
      =(NEW.workspace_id,NEW.run_id,NEW.artifact_id,NEW.artifact_revision,NEW.manifest_digest)
      AND a.state='SEALED'
      AND p.execution_profile_id=NEW.projection->>'execution_profile_id'
      AND p.execution_profile_digest=NEW.projection->>'execution_profile_digest'
      AND p.requested_spec_digest=NEW.projection->>'requested_spec_digest'
      AND p.effective_spec_digest=NEW.projection->>'effective_spec_digest'
      AND p.dataset_binding_digest=NEW.projection->>'dataset_binding_digest'
      AND (NEW.projection->>'artifact_revision')::bigint=NEW.artifact_revision
      AND NEW.projection->>'artifact_id'=NEW.artifact_id
      AND NEW.projection->>'workspace_id'=NEW.workspace_id
      AND NEW.projection->>'run_id'=NEW.run_id
      AND NEW.projection->>'manifest_digest'=NEW.manifest_digest
  ) THEN RAISE EXCEPTION 'native projection must match exact fenced P05 artifact' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_native_read_model_v1 BEFORE INSERT OR UPDATE OR DELETE ON research.native_read_models_v1
  FOR EACH ROW EXECUTE FUNCTION research.guard_native_read_model_v1();
ALTER TABLE research.native_read_models_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE research.native_read_models_v1 FORCE ROW LEVEL SECURITY;
CREATE POLICY native_read_model_workspace_v1 ON research.native_read_models_v1
  USING (workspace_id=current_setting('research.workspace_id',true))
  WITH CHECK (workspace_id=current_setting('research.workspace_id',true));
REVOKE ALL ON research.native_read_models_v1 FROM PUBLIC;
GRANT SELECT,INSERT ON research.native_read_models_v1 TO portal_research_runtime;

-- Down Migration
-- Immutable evidence must not be removed by rollback. Roll back the source
-- image only; retain this additive table and its forward migration ledger.
SELECT 1;
