CREATE TABLE IF NOT EXISTS portal_projection.shadow_screen_activations (
    activation_id UUID PRIMARY KEY,
    epoch_id UUID NOT NULL UNIQUE REFERENCES portal_projection.epochs(epoch_id),
    workspace_id TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment = 'paper'),
    screen_id TEXT NOT NULL CHECK (screen_id = 'EXECUTION_PAPER_WORKBENCH_SCREEN'),
    delivery_profile TEXT NOT NULL CHECK (delivery_profile = 'shadow'),
    manifest_digest TEXT NOT NULL UNIQUE CHECK (
        manifest_digest ~ '^sha256:[0-9a-f]{64}$'
        AND manifest_digest <> ('sha256:' || repeat('0', 64))
    ),
    manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
    owner_id TEXT NOT NULL CHECK (owner_id <> '' AND owner_id = btrim(owner_id)),
    owner_approved_at TIMESTAMPTZ NOT NULL,
    activated_at TIMESTAMPTZ NOT NULL,
    CHECK (workspace_id <> '' AND workspace_id = btrim(workspace_id))
);

CREATE INDEX IF NOT EXISTS idx_shadow_screen_activation_scope
    ON portal_projection.shadow_screen_activations
    (workspace_id, environment, screen_id, activated_at DESC);
