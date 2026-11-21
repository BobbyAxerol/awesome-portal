-- Preserve every immutable projection when its source-owned transform advances.
ALTER TABLE research.native_read_models_v1 ADD COLUMN projection_version integer NOT NULL DEFAULT 1 CHECK(projection_version BETWEEN 1 AND 2);
ALTER TABLE research.native_read_models_v1 DROP CONSTRAINT native_read_models_v1_pkey;
ALTER TABLE research.native_read_models_v1 ADD PRIMARY KEY(workspace_id,run_id,artifact_revision,projection_version);
ALTER TABLE research.native_read_models_v1 ADD CONSTRAINT native_read_model_schema_matches_version
  CHECK(projection->>'schema_version' = 'research.native-read-custody.v' || projection_version::text);

-- Down Migration
-- A code rollback retains historical transforms and evidence; no row deletion.
SELECT 1;
