-- Up Migration
-- N29: close the two commissioned Portal-governance product gaps. These
-- additions are Portal-owned and do not grant Trading System authority.

ALTER TABLE run_read_models
  ADD COLUMN artifact_sha256 text CHECK (
    artifact_sha256 IS NULL OR artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD COLUMN artifact_schema_version text,
  ADD COLUMN artifact_creator_user_id text REFERENCES portal_users(user_id) ON DELETE RESTRICT,
  ADD COLUMN methodology_claim_ids text[] NOT NULL DEFAULT '{}';

ALTER TABLE run_read_models
  ADD CONSTRAINT run_read_models_artifact_shape CHECK (
    (artifact_sha256 IS NULL
      AND artifact_schema_version IS NULL
      AND artifact_creator_user_id IS NULL
      AND cardinality(methodology_claim_ids) = 0)
    OR
    (artifact_sha256 IS NOT NULL
      AND char_length(trim(artifact_schema_version)) BETWEEN 1 AND 128
      AND artifact_creator_user_id IS NOT NULL
      AND cardinality(methodology_claim_ids) BETWEEN 1 AND 64)
  );

ALTER TABLE governance_approval_requests
  ADD COLUMN source_run_id text,
  ADD COLUMN methodology_claim_id text,
  ADD COLUMN request_summary text,
  ADD COLUMN request_key text,
  ADD COLUMN request_payload_hash text CHECK (
    request_payload_hash IS NULL OR request_payload_hash ~ '^sha256:[0-9a-f]{64}$'
  );

ALTER TABLE governance_approval_requests
  ADD CONSTRAINT governance_approval_request_source_shape CHECK (
    (source_run_id IS NULL AND methodology_claim_id IS NULL AND request_summary IS NULL
      AND request_key IS NULL AND request_payload_hash IS NULL)
    OR
    (gate = 'R1'
      AND source_run_id IS NOT NULL
      AND methodology_claim_id IS NOT NULL
      AND char_length(trim(request_key)) BETWEEN 1 AND 192
      AND request_payload_hash IS NOT NULL
      AND char_length(trim(request_summary)) BETWEEN 8 AND 2000)
  );

CREATE UNIQUE INDEX governance_approval_open_alpha_run_idx
  ON governance_approval_requests (workspace_id, subject_id, source_run_id)
  WHERE status = 'PENDING' AND source_run_id IS NOT NULL;

CREATE UNIQUE INDEX governance_approval_request_key_idx
  ON governance_approval_requests (workspace_id, requester_user_id, request_key)
  WHERE request_key IS NOT NULL;

CREATE INDEX governance_approval_limitations_expiry_idx
  ON governance_approval_known_limitations (expires_at, approval_id)
  WHERE expires_at IS NOT NULL;

CREATE VIEW governance_conditions_register AS
SELECT limitation.limitation_id AS condition_id,
       request.workspace_id,
       request.approval_id,
       request.gate,
       request.subject_id,
       request.subject_label,
       request.environment,
       limitation.kind,
       limitation.label,
       limitation.statement,
       CASE
         WHEN limitation.expires_at IS NOT NULL AND limitation.expires_at <= now() THEN 'LAPSED'
         WHEN limitation.expires_at IS NOT NULL AND limitation.expires_at <= now() + interval '7 days' THEN 'EXPIRING'
         WHEN limitation.kind = 'WAIVER' THEN 'WAIVED'
         ELSE 'OPEN'
       END AS condition_state,
       request.requester_user_id AS owner_user_id,
       request.requester_username AS owner_username,
       limitation.expires_at AS due_at,
       limitation.created_at,
       GREATEST(limitation.created_at, request.updated_at) AS updated_at,
       request.policy_version
FROM governance_approval_known_limitations limitation
JOIN governance_approval_requests request
  ON request.approval_id = limitation.approval_id;

-- Down Migration
DROP VIEW governance_conditions_register;
DROP INDEX governance_approval_limitations_expiry_idx;
DROP INDEX governance_approval_request_key_idx;
DROP INDEX governance_approval_open_alpha_run_idx;
ALTER TABLE governance_approval_requests
  DROP CONSTRAINT governance_approval_request_source_shape,
  DROP COLUMN request_payload_hash,
  DROP COLUMN request_key,
  DROP COLUMN request_summary,
  DROP COLUMN methodology_claim_id,
  DROP COLUMN source_run_id;
ALTER TABLE run_read_models
  DROP CONSTRAINT run_read_models_artifact_shape,
  DROP COLUMN methodology_claim_ids,
  DROP COLUMN artifact_creator_user_id,
  DROP COLUMN artifact_schema_version,
  DROP COLUMN artifact_sha256;
