-- Up Migration
CREATE TABLE governance_approval_requests (
    approval_id              text PRIMARY KEY,
    workspace_id             text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    gate                     text NOT NULL CHECK (gate IN ('R1', 'R2', 'PAPER_EXIT', 'SANDBOX_EXIT', 'LIVE_GATE')),
    subject_type             text NOT NULL CHECK (subject_type IN ('ALPHA_VERSION', 'DEPLOYMENT', 'EXIT_REVIEW')),
    subject_id               text NOT NULL,
    subject_label            text NOT NULL,
    release_candidate        text,
    environment              text NOT NULL CHECK (environment IN ('RESEARCH', 'PAPER', 'SANDBOX', 'LIVE')),
    target_label             text NOT NULL,
    requester_user_id        text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    requester_username       text NOT NULL,
    artifact_creator_user_id text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    artifact_creator_username text NOT NULL,
    status                   text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'APPROVED_WITH_CONDITION', 'DENIED', 'EXPIRED')),
    policy_version           text NOT NULL,
    quorum_required          integer NOT NULL CHECK (quorum_required BETWEEN 1 AND 8),
    quorum_met               integer NOT NULL DEFAULT 0 CHECK (quorum_met >= 0 AND quorum_met <= 8),
    decision_actor_ids       text[] NOT NULL DEFAULT '{}',
    approval_version         integer NOT NULL DEFAULT 1 CHECK (approval_version >= 1),
    evidence_set_hash        text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    evidence_complete        boolean NOT NULL,
    blocker_count            integer NOT NULL DEFAULT 0 CHECK (blocker_count >= 0),
    blocker_summary          text,
    sla_due_at               timestamptz NOT NULL,
    expires_at               timestamptz NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    decided_at               timestamptz,
    decided_by_user_id       text REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    CHECK (quorum_met <= quorum_required),
    CHECK ((blocker_count = 0 AND blocker_summary IS NULL) OR (blocker_count > 0 AND blocker_summary IS NOT NULL)),
    CHECK (sla_due_at > created_at AND expires_at > sla_due_at),
    CHECK (
      (status = 'PENDING' AND decided_at IS NULL AND decided_by_user_id IS NULL)
      OR
      (status = 'EXPIRED' AND decided_at IS NOT NULL AND decided_by_user_id IS NULL)
      OR
      (status IN ('APPROVED', 'APPROVED_WITH_CONDITION', 'DENIED')
       AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL)
    )
);

CREATE INDEX governance_approval_inbox_order_idx
    ON governance_approval_requests (workspace_id, sla_due_at, approval_id);
CREATE INDEX governance_approval_inbox_filter_idx
    ON governance_approval_requests
       (workspace_id, status, gate, environment, evidence_complete, sla_due_at, approval_id);
CREATE INDEX governance_approval_subject_idx
    ON governance_approval_requests (workspace_id, subject_type, subject_id);

CREATE VIEW governance_approval_inbox AS
SELECT request.*,
       CASE
         WHEN request.status = 'PENDING' AND request.expires_at <= now() THEN 'EXPIRED'
         ELSE request.status
       END AS effective_status,
       CASE
         WHEN request.status = 'EXPIRED'
           OR (request.status = 'PENDING' AND request.expires_at <= now()) THEN 'EXPIRED'
         WHEN request.status = 'PENDING' AND request.sla_due_at <= now() THEN 'OVERDUE'
         WHEN request.status = 'PENDING' AND request.sla_due_at <= now() + interval '8 hours' THEN 'DUE_SOON'
         ELSE 'ON_TRACK'
       END AS sla_state
FROM governance_approval_requests request;

CREATE TABLE governance_approval_evidence (
    evidence_id         text PRIMARY KEY,
    approval_id         text NOT NULL REFERENCES governance_approval_requests(approval_id) ON DELETE CASCADE,
    ordinal             integer NOT NULL CHECK (ordinal >= 0),
    kind                text NOT NULL,
    label               text NOT NULL,
    display_value       text NOT NULL,
    note                text,
    verification        text,
    artifact_id         text,
    sha256              text NOT NULL CHECK (sha256 ~ '^sha256:[0-9a-f]{64}$'),
    size_bytes          bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
    media_type          text,
    schema_version      text NOT NULL,
    source_authority    text NOT NULL CHECK (source_authority IN ('RESEARCH', 'EXECUTION', 'BROKER', 'DERIVED')),
    source_reference    text,
    required            boolean NOT NULL DEFAULT true,
    captured_at         timestamptz NOT NULL,
    retention_class     text NOT NULL,
    access_policy       text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (approval_id, ordinal),
    UNIQUE (approval_id, evidence_id)
);

CREATE INDEX governance_approval_evidence_approval_idx
    ON governance_approval_evidence (approval_id, ordinal);

CREATE TABLE governance_approval_findings (
    finding_id          text PRIMARY KEY,
    approval_id         text NOT NULL REFERENCES governance_approval_requests(approval_id) ON DELETE CASCADE,
    ordinal             integer NOT NULL CHECK (ordinal >= 0),
    label               text NOT NULL,
    outcome             text NOT NULL CHECK (outcome IN ('PASS', 'WATCH', 'FAIL', 'INSUFFICIENT')),
    suggestion          text,
    blocking            boolean NOT NULL,
    policy_version      text NOT NULL,
    formula_version     text,
    basis_hashes        text[] NOT NULL DEFAULT '{}',
    evaluated_at        timestamptz NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (approval_id, ordinal),
    CHECK (NOT blocking OR outcome IN ('FAIL', 'INSUFFICIENT'))
);

CREATE INDEX governance_approval_findings_approval_idx
    ON governance_approval_findings (approval_id, ordinal);

CREATE TABLE governance_decision_plans (
    operation_id                text PRIMARY KEY,
    workspace_id                text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    approval_id                 text NOT NULL REFERENCES governance_approval_requests(approval_id) ON DELETE CASCADE,
    actor_user_id               text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key                 text NOT NULL,
    command_type                text NOT NULL CHECK (command_type = 'GOVERNANCE_R1_DECISION'),
    command_version             integer NOT NULL CHECK (command_version = 1),
    payload_hash                text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
    decision                    text NOT NULL CHECK (decision IN ('APPROVE', 'APPROVE_WITH_CONDITION', 'DENY')),
    reason                      text NOT NULL,
    condition                   text,
    expected_approval_version   integer NOT NULL CHECK (expected_approval_version >= 1),
    quorum_required             integer NOT NULL CHECK (quorum_required BETWEEN 1 AND 8),
    evidence_set_hash           text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    evidence_hashes             text[] NOT NULL,
    blocker_codes               text[] NOT NULL DEFAULT '{}',
    warning_codes               text[] NOT NULL DEFAULT '{}',
    apply_key_id                text NOT NULL,
    apply_token_hash            text NOT NULL CHECK (apply_token_hash ~ '^[0-9a-f]{64}$'),
    status                      text NOT NULL CHECK (status IN ('PLANNED', 'APPLIED', 'EXPIRED')),
    response_json               jsonb,
    expires_at                  timestamptz NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    applied_at                  timestamptz,
    UNIQUE (workspace_id, actor_user_id, request_key),
    CHECK ((decision = 'APPROVE_WITH_CONDITION' AND condition IS NOT NULL) OR decision <> 'APPROVE_WITH_CONDITION'),
    CHECK (expires_at > created_at),
    CHECK ((status = 'APPLIED' AND applied_at IS NOT NULL) OR (status <> 'APPLIED' AND applied_at IS NULL))
);

CREATE INDEX governance_decision_plans_approval_idx
    ON governance_decision_plans (approval_id, created_at DESC);

CREATE TABLE governance_approval_decisions (
    decision_id             text PRIMARY KEY,
    operation_id            text NOT NULL UNIQUE REFERENCES governance_decision_plans(operation_id) ON DELETE RESTRICT,
    workspace_id            text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    approval_id             text NOT NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT,
    actor_user_id           text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    actor_username          text NOT NULL,
    decision                text NOT NULL CHECK (decision IN ('APPROVE', 'APPROVE_WITH_CONDITION', 'DENY')),
    reason                  text NOT NULL,
    condition               text,
    evidence_set_hash       text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    approval_version_before integer NOT NULL CHECK (approval_version_before >= 1),
    approval_version_after  integer NOT NULL CHECK (approval_version_after = approval_version_before + 1),
    decided_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (approval_id, actor_user_id),
    CHECK ((decision = 'APPROVE_WITH_CONDITION' AND condition IS NOT NULL) OR decision <> 'APPROVE_WITH_CONDITION')
);

CREATE INDEX governance_approval_decisions_approval_idx
    ON governance_approval_decisions (approval_id, decided_at, decision_id);

CREATE FUNCTION reject_governance_immutable_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'governance evidence and decisions are append-only'
    USING ERRCODE = '55000';
  RETURN OLD;
END;
$$;

CREATE TRIGGER governance_evidence_immutable
BEFORE UPDATE OR DELETE ON governance_approval_evidence
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE TRIGGER governance_findings_immutable
BEFORE UPDATE OR DELETE ON governance_approval_findings
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE TRIGGER governance_decisions_immutable
BEFORE UPDATE OR DELETE ON governance_approval_decisions
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

-- Down Migration
DROP TRIGGER governance_decisions_immutable ON governance_approval_decisions;
DROP TRIGGER governance_findings_immutable ON governance_approval_findings;
DROP TRIGGER governance_evidence_immutable ON governance_approval_evidence;
DROP FUNCTION reject_governance_immutable_mutation();
DROP TABLE governance_approval_decisions;
DROP TABLE governance_decision_plans;
DROP TABLE governance_approval_findings;
DROP TABLE governance_approval_evidence;
DROP VIEW governance_approval_inbox;
DROP TABLE governance_approval_requests;
