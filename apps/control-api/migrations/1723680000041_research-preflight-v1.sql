-- Research Loop P08 · immutable data snapshot / effective-spec manifest.
--
-- PostgreSQL records only opaque token + bounded metadata.  The shared
-- content-addressed OHLCV snapshot remains private to the Portal API snapshot
-- store; this table never contains candles, a source path, a holdout value,
-- a worker reservation, command, broker or Execution-owned relation.

CREATE TABLE research.preflight_manifests (
  workspace_id            text NOT NULL REFERENCES workspaces(workspace_id),
  preflight_token         text NOT NULL
                         CHECK (preflight_token ~ '^rpft_[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'),
  actor_user_id           text NOT NULL REFERENCES portal_users(user_id),
  requested_spec_digest   text NOT NULL CHECK (requested_spec_digest ~ '^[0-9a-f]{64}$'),
  effective_spec_digest   text NOT NULL CHECK (effective_spec_digest ~ '^[0-9a-f]{64}$'),
  dataset_binding_digest  text NOT NULL CHECK (dataset_binding_digest ~ '^[0-9a-f]{64}$'),
  manifest_digest         text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  requested_spec          jsonb NOT NULL CHECK (jsonb_typeof(requested_spec) = 'object'),
  effective_spec          jsonb NOT NULL CHECK (jsonb_typeof(effective_spec) = 'object'),
  dataset_binding         jsonb NOT NULL CHECK (jsonb_typeof(dataset_binding) = 'object'),
  topology                jsonb NOT NULL CHECK (jsonb_typeof(topology) = 'object'),
  resource_estimate       jsonb NOT NULL CHECK (jsonb_typeof(resource_estimate) = 'object'),
  snapshot                jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  expires_at              timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, preflight_token),
  UNIQUE (workspace_id, preflight_token, actor_user_id),
  CHECK (expires_at > created_at),
  CHECK (octet_length(requested_spec::text) <= 65536),
  CHECK (octet_length(effective_spec::text) <= 65536),
  CHECK (octet_length(dataset_binding::text) <= 65536),
  CHECK (octet_length(topology::text) <= 65536),
  CHECK (octet_length(resource_estimate::text) <= 65536),
  CHECK (octet_length(snapshot::text) <= 65536),
  CHECK (snapshot ? 'snapshot_id'),
  CHECK (snapshot ? 'snapshot_content_hash'),
  CHECK (snapshot ? 'source_manifest_digest')
);

CREATE INDEX research_preflight_manifests_actor_expiry_idx
  ON research.preflight_manifests (workspace_id, actor_user_id, expires_at, preflight_token);

CREATE FUNCTION research.protect_preflight_manifest_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research preflight manifest is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER research_preflight_manifests_immutable_guard
BEFORE UPDATE ON research.preflight_manifests
FOR EACH ROW EXECUTE FUNCTION research.protect_preflight_manifest_identity();

REVOKE ALL ON FUNCTION research.protect_preflight_manifest_identity() FROM PUBLIC;

-- Explicit grant rather than relying on default privileges makes the P08
-- runtime footprint reviewable. DELETE is only used by the fixed actor-scoped
-- expiry query; shared snapshot data cannot be deleted by this role.
GRANT SELECT, INSERT, DELETE ON research.preflight_manifests TO portal_research_runtime;

COMMENT ON TABLE research.preflight_manifests IS
  'P08 immutable actor-scoped requested/effective/data manifest metadata; never raw HMD rows, source paths or sealed-holdout values.';

-- Down Migration
-- A reader/image rollback only removes this route.  Durable P08 audit facts
-- remain evidence; no destructive down migration is permitted.
SELECT 1;
