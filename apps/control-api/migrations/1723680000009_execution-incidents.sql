-- Up Migration
ALTER TABLE execution_operation_queue_items
    ADD CONSTRAINT execution_operation_queue_workspace_operation_unique
    UNIQUE (workspace_id, operation_id);

CREATE TABLE execution_incidents (
    incident_id                     text PRIMARY KEY,
    workspace_id                    text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    title                           text NOT NULL CHECK (char_length(trim(title)) BETWEEN 8 AND 200),
    summary                         text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 8 AND 2000),
    severity                        text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    environment                     text NOT NULL CHECK (environment IN ('PAPER', 'SANDBOX', 'LIVE')),
    target_type                     text NOT NULL CHECK (
        target_type IN ('ACCOUNT', 'BROKER_BINDING', 'DEPLOYMENT', 'ORDER', 'PORTFOLIO', 'SYSTEM')
    ),
    target_id                       text NOT NULL,
    workflow_state                  text NOT NULL CHECK (workflow_state IN ('OPEN', 'MITIGATED', 'RESOLVED')),
    workflow_version                integer NOT NULL CHECK (workflow_version > 0),
    assigned_to_user_id             text REFERENCES portal_users(user_id),
    acknowledged_at                 timestamptz,
    acknowledged_by_user_id         text REFERENCES portal_users(user_id),
    mitigated_at                    timestamptz,
    mitigated_by_user_id            text REFERENCES portal_users(user_id),
    mitigation_evidence_hash        text,
    resolved_at                     timestamptz,
    resolved_by_user_id             text REFERENCES portal_users(user_id),
    resolution_reason               text,
    clean_dry_run_evidence_hash     text,
    opened_by_user_id               text NOT NULL REFERENCES portal_users(user_id),
    source_integration_state        text NOT NULL DEFAULT 'UNAVAILABLE'
        CHECK (source_integration_state = 'UNAVAILABLE'),
    source_side_effect_requested    boolean NOT NULL DEFAULT false
        CHECK (source_side_effect_requested = false),
    deployment_resume_requested     boolean NOT NULL DEFAULT false
        CHECK (deployment_resume_requested = false),
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, incident_id),
    CONSTRAINT execution_incident_workflow_shape CHECK (
        (workflow_state = 'OPEN'
            AND mitigated_at IS NULL AND mitigated_by_user_id IS NULL
            AND mitigation_evidence_hash IS NULL
            AND resolved_at IS NULL AND resolved_by_user_id IS NULL
            AND resolution_reason IS NULL AND clean_dry_run_evidence_hash IS NULL)
        OR
        (workflow_state = 'MITIGATED'
            AND acknowledged_at IS NOT NULL AND acknowledged_by_user_id IS NOT NULL
            AND assigned_to_user_id IS NOT NULL
            AND mitigated_at IS NOT NULL AND mitigated_by_user_id IS NOT NULL
            AND mitigation_evidence_hash ~ '^sha256:[0-9a-f]{64}$'
            AND resolved_at IS NULL AND resolved_by_user_id IS NULL
            AND resolution_reason IS NULL AND clean_dry_run_evidence_hash IS NULL)
        OR
        (workflow_state = 'RESOLVED'
            AND acknowledged_at IS NOT NULL AND acknowledged_by_user_id IS NOT NULL
            AND assigned_to_user_id IS NOT NULL
            AND mitigated_at IS NOT NULL AND mitigated_by_user_id IS NOT NULL
            AND mitigation_evidence_hash ~ '^sha256:[0-9a-f]{64}$'
            AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL
            AND char_length(trim(resolution_reason)) BETWEEN 8 AND 2000
            AND clean_dry_run_evidence_hash ~ '^sha256:[0-9a-f]{64}$')
    )
);

CREATE INDEX execution_incidents_workspace_state_idx
    ON execution_incidents (workspace_id, workflow_state, severity, created_at DESC, incident_id DESC);

CREATE TABLE execution_incident_operation_links (
    incident_id        text NOT NULL,
    workspace_id       text NOT NULL,
    operation_id       text NOT NULL,
    relationship       text NOT NULL CHECK (relationship IN ('TRIGGERED_BY', 'MITIGATES', 'RELATED')),
    linked_by_user_id  text NOT NULL REFERENCES portal_users(user_id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (incident_id, operation_id),
    FOREIGN KEY (workspace_id, incident_id)
        REFERENCES execution_incidents(workspace_id, incident_id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id, operation_id)
        REFERENCES execution_operation_queue_items(workspace_id, operation_id) ON DELETE RESTRICT
);

CREATE TABLE execution_incident_annotations (
    annotation_id      text PRIMARY KEY,
    incident_id        text NOT NULL,
    workspace_id       text NOT NULL,
    author_user_id     text NOT NULL REFERENCES portal_users(user_id),
    body                text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
    redaction_state     text NOT NULL CHECK (redaction_state = 'CLEAR'),
    created_at          timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, incident_id)
        REFERENCES execution_incidents(workspace_id, incident_id) ON DELETE CASCADE
);

CREATE INDEX execution_incident_annotations_timeline_idx
    ON execution_incident_annotations (workspace_id, incident_id, created_at, annotation_id);

CREATE TABLE execution_incident_evidence (
    evidence_id               text PRIMARY KEY,
    incident_id               text NOT NULL,
    workspace_id              text NOT NULL,
    evidence_kind             text NOT NULL CHECK (
        evidence_kind IN (
            'MITIGATION_ATTESTATION', 'CLEAN_DRY_RUN', 'SYNC_SNAPSHOT',
            'FINDING_REFERENCE', 'BLAST_RADIUS', 'PROBABLE_CAUSE', 'OTHER'
        )
    ),
    sha256                    text NOT NULL CHECK (sha256 ~ '^sha256:[0-9a-f]{64}$'),
    schema_version            text NOT NULL CHECK (char_length(schema_version) BETWEEN 1 AND 128),
    declared_source_authority text NOT NULL CHECK (
        declared_source_authority IN ('PORTAL', 'EXECUTION', 'BROKER', 'DERIVED')
    ),
    source_verification_state text NOT NULL CHECK (source_verification_state = 'UNAVAILABLE'),
    summary                   text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 8 AND 1000),
    captured_at               timestamptz NOT NULL,
    attached_by_user_id       text NOT NULL REFERENCES portal_users(user_id),
    created_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (incident_id, evidence_kind, sha256),
    FOREIGN KEY (workspace_id, incident_id)
        REFERENCES execution_incidents(workspace_id, incident_id) ON DELETE CASCADE
);

CREATE INDEX execution_incident_evidence_timeline_idx
    ON execution_incident_evidence (workspace_id, incident_id, captured_at, evidence_id);

CREATE TABLE execution_incident_events (
    event_id                 text PRIMARY KEY,
    incident_id              text NOT NULL,
    workspace_id             text NOT NULL,
    actor_user_id            text NOT NULL REFERENCES portal_users(user_id),
    request_key              text NOT NULL,
    request_digest           text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
    action                   text NOT NULL CHECK (
        action IN (
            'CREATE', 'ACKNOWLEDGE', 'ASSIGN', 'ANNOTATE', 'ATTACH_EVIDENCE',
            'CORRELATE_OPERATION', 'MITIGATE', 'RESOLVE'
        )
    ),
    workflow_version_before integer NOT NULL CHECK (workflow_version_before >= 0),
    workflow_version_after  integer NOT NULL CHECK (workflow_version_after = workflow_version_before + 1),
    metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT execution_incident_event_request_key_unique
        UNIQUE (workspace_id, actor_user_id, request_key),
    FOREIGN KEY (workspace_id, incident_id)
        REFERENCES execution_incidents(workspace_id, incident_id) ON DELETE CASCADE
);

CREATE INDEX execution_incident_events_timeline_idx
    ON execution_incident_events (workspace_id, incident_id, created_at, event_id);

CREATE OR REPLACE FUNCTION protect_execution_incident_authority() RETURNS trigger AS $$
BEGIN
    IF NEW.incident_id IS DISTINCT FROM OLD.incident_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.opened_by_user_id IS DISTINCT FROM OLD.opened_by_user_id
       OR NEW.source_integration_state IS DISTINCT FROM OLD.source_integration_state
       OR NEW.source_side_effect_requested IS DISTINCT FROM OLD.source_side_effect_requested
       OR NEW.deployment_resume_requested IS DISTINCT FROM OLD.deployment_resume_requested
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'execution incident identity/authority is immutable in F1b';
    END IF;
    IF NEW.workflow_version <> OLD.workflow_version + 1 THEN
        RAISE EXCEPTION 'execution incident workflow version must advance exactly once';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_incident_authority_immutable
BEFORE UPDATE ON execution_incidents
FOR EACH ROW EXECUTE FUNCTION protect_execution_incident_authority();

CREATE OR REPLACE FUNCTION reject_execution_incident_child_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'execution incident timeline records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_incident_annotations_append_only
BEFORE UPDATE OR DELETE ON execution_incident_annotations
FOR EACH ROW EXECUTE FUNCTION reject_execution_incident_child_mutation();
CREATE TRIGGER execution_incident_evidence_append_only
BEFORE UPDATE OR DELETE ON execution_incident_evidence
FOR EACH ROW EXECUTE FUNCTION reject_execution_incident_child_mutation();
CREATE TRIGGER execution_incident_events_append_only
BEFORE UPDATE OR DELETE ON execution_incident_events
FOR EACH ROW EXECUTE FUNCTION reject_execution_incident_child_mutation();
CREATE TRIGGER execution_incident_links_append_only
BEFORE UPDATE OR DELETE ON execution_incident_operation_links
FOR EACH ROW EXECUTE FUNCTION reject_execution_incident_child_mutation();

-- Down Migration
DROP TRIGGER execution_incident_links_append_only ON execution_incident_operation_links;
DROP TRIGGER execution_incident_events_append_only ON execution_incident_events;
DROP TRIGGER execution_incident_evidence_append_only ON execution_incident_evidence;
DROP TRIGGER execution_incident_annotations_append_only ON execution_incident_annotations;
DROP FUNCTION reject_execution_incident_child_mutation();
DROP TRIGGER execution_incident_authority_immutable ON execution_incidents;
DROP FUNCTION protect_execution_incident_authority();
DROP TABLE execution_incident_events;
DROP TABLE execution_incident_evidence;
DROP TABLE execution_incident_annotations;
DROP TABLE execution_incident_operation_links;
DROP TABLE execution_incidents;
ALTER TABLE execution_operation_queue_items
    DROP CONSTRAINT execution_operation_queue_workspace_operation_unique;
