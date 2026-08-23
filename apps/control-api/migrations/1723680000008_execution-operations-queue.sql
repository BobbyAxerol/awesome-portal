-- Up Migration
CREATE TABLE execution_operation_queue_items (
    operation_id            text PRIMARY KEY,
    workspace_id            text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    operation_kind          text NOT NULL CHECK (operation_kind IN ('EXECUTION_COMMAND')),
    command_key             text NOT NULL,
    environment             text NOT NULL CHECK (environment IN ('PAPER', 'SANDBOX', 'LIVE')),
    target_type             text NOT NULL,
    target_id               text NOT NULL,
    risk_tier               text NOT NULL,
    severity                text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    source_authority        text NOT NULL CHECK (source_authority IN ('PORTAL', 'EXECUTION', 'BROKER')),
    source_status           text NOT NULL CHECK (
        source_status IN ('BLOCKED', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'UNCERTAIN')
    ),
    verification_result     text NOT NULL CHECK (
        verification_result IN ('NOT_STARTED', 'PENDING', 'SUCCEEDED', 'FAILED', 'PARTIAL', 'UNCERTAIN', 'DENIED', 'EXPIRED')
    ),
    triage_state            text NOT NULL CHECK (triage_state IN ('UNACKNOWLEDGED', 'ACKNOWLEDGED', 'RESOLVED')),
    workflow_version        integer NOT NULL CHECK (workflow_version > 0),
    acknowledged_at         timestamptz,
    acknowledged_by_user_id text REFERENCES portal_users(user_id),
    resolved_at             timestamptz,
    resolved_by_user_id     text REFERENCES portal_users(user_id),
    resolution_reason       text,
    resolution_evidence_hash text,
    created_at              timestamptz NOT NULL,
    updated_at              timestamptz NOT NULL,
    CONSTRAINT execution_operation_queue_ack_shape CHECK (
        (triage_state = 'UNACKNOWLEDGED'
            AND acknowledged_at IS NULL AND acknowledged_by_user_id IS NULL
            AND resolved_at IS NULL AND resolved_by_user_id IS NULL
            AND resolution_reason IS NULL AND resolution_evidence_hash IS NULL)
        OR
        (triage_state = 'ACKNOWLEDGED'
            AND acknowledged_at IS NOT NULL AND acknowledged_by_user_id IS NOT NULL
            AND resolved_at IS NULL AND resolved_by_user_id IS NULL
            AND resolution_reason IS NULL AND resolution_evidence_hash IS NULL)
        OR
        (triage_state = 'RESOLVED'
            AND acknowledged_at IS NOT NULL AND acknowledged_by_user_id IS NOT NULL
            AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL
            AND char_length(trim(resolution_reason)) BETWEEN 8 AND 2000
            AND resolution_evidence_hash ~ '^sha256:[0-9a-f]{64}$')
    )
);

CREATE INDEX execution_operation_queue_workspace_created_idx
    ON execution_operation_queue_items (workspace_id, created_at DESC, operation_id DESC);
CREATE INDEX execution_operation_queue_workspace_triage_idx
    ON execution_operation_queue_items (workspace_id, triage_state, created_at DESC, operation_id DESC);

CREATE TABLE execution_operation_workflow_events (
    event_id                 text PRIMARY KEY,
    operation_id             text NOT NULL REFERENCES execution_operation_queue_items(operation_id) ON DELETE CASCADE,
    workspace_id             text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    actor_user_id            text NOT NULL REFERENCES portal_users(user_id),
    request_key              text NOT NULL,
    action                   text NOT NULL CHECK (action IN ('ACKNOWLEDGE', 'RESOLVE')),
    workflow_version_before  integer NOT NULL CHECK (workflow_version_before > 0),
    workflow_version_after   integer NOT NULL CHECK (workflow_version_after = workflow_version_before + 1),
    reason                   text,
    evidence_hash            text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, actor_user_id, request_key),
    CONSTRAINT execution_operation_event_resolution_shape CHECK (
        (action = 'ACKNOWLEDGE' AND reason IS NULL AND evidence_hash IS NULL)
        OR
        (action = 'RESOLVE'
            AND char_length(trim(reason)) BETWEEN 8 AND 2000
            AND evidence_hash ~ '^sha256:[0-9a-f]{64}$')
    )
);

CREATE OR REPLACE FUNCTION protect_execution_operation_identity() RETURNS trigger AS $$
BEGIN
    IF NEW.operation_id IS DISTINCT FROM OLD.operation_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
       OR NEW.command_key IS DISTINCT FROM OLD.command_key
       OR NEW.environment IS DISTINCT FROM OLD.environment
       OR NEW.target_type IS DISTINCT FROM OLD.target_type
       OR NEW.target_id IS DISTINCT FROM OLD.target_id
       OR NEW.risk_tier IS DISTINCT FROM OLD.risk_tier
       OR NEW.severity IS DISTINCT FROM OLD.severity
       OR NEW.source_authority IS DISTINCT FROM OLD.source_authority
       OR NEW.source_status IS DISTINCT FROM OLD.source_status
       OR NEW.verification_result IS DISTINCT FROM OLD.verification_result
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'execution operation source identity/result is immutable in F1a';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_operation_identity_immutable
BEFORE UPDATE ON execution_operation_queue_items
FOR EACH ROW EXECUTE FUNCTION protect_execution_operation_identity();

INSERT INTO execution_operation_queue_items (
    operation_id, workspace_id, operation_kind, command_key, environment,
    target_type, target_id, risk_tier, severity, source_authority,
    source_status, verification_result, triage_state, workflow_version,
    created_at, updated_at
)
SELECT
    operation_id, workspace_id, 'EXECUTION_COMMAND', command_key, environment,
    target_type, target_id, risk_tier, 'WARNING', 'PORTAL',
    'BLOCKED', 'NOT_STARTED', 'UNACKNOWLEDGED', 1, created_at, updated_at
FROM execution_command_plans_f0
ON CONFLICT (operation_id) DO NOTHING;

-- Down Migration
DROP TRIGGER execution_operation_identity_immutable ON execution_operation_queue_items;
DROP FUNCTION protect_execution_operation_identity();
DROP TABLE execution_operation_workflow_events;
DROP TABLE execution_operation_queue_items;
