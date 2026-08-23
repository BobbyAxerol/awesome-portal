-- Up Migration
-- EX-BE-05b/F2: Portal-owned Sandbox Certification on the SGP control plane.
-- Source evidence is append-only and has no public write route in this slice.
-- No table in this migration can request a Trading System side effect.

CREATE TABLE governance_sandbox_certifications (
    certification_id              text PRIMARY KEY,
    workspace_id                  text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    deployment_id                 text NOT NULL,
    promotion_grant_id            text NOT NULL UNIQUE
                                  REFERENCES governance_promotion_authority_grants(grant_id) ON DELETE RESTRICT,
    paper_exit_review_id          text NOT NULL REFERENCES governance_paper_exit_reviews(review_id) ON DELETE RESTRICT,
    portfolio_id                  text NOT NULL,
    venue                         text NOT NULL,
    account_id                    text NOT NULL,
    external_account_ref          text NOT NULL,
    artifact_digest               text NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
    r1_approval_id                text NOT NULL,
    r2_approval_id                text NOT NULL,
    policy_version                text NOT NULL,
    formula_version               text NOT NULL,
    workflow_state                text NOT NULL DEFAULT 'DRAFT'
                                  CHECK (workflow_state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'DENIED')),
    workflow_version              integer NOT NULL DEFAULT 1 CHECK (workflow_version > 0),
    submitted_at                  timestamptz,
    submitted_by_user_id          text REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    submitted_evidence_set_hash   text CHECK (
                                    submitted_evidence_set_hash IS NULL
                                    OR submitted_evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'
                                  ),
    decided_at                    timestamptz,
    decided_by_user_id            text REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    decided_evidence_set_hash     text CHECK (
                                    decided_evidence_set_hash IS NULL
                                    OR decided_evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'
                                  ),
    decision_reason               text,
    source_integration_state      text NOT NULL DEFAULT 'UNAVAILABLE'
                                  CHECK (source_integration_state IN ('UNAVAILABLE', 'SHADOW')),
    delivery_profile              text NOT NULL DEFAULT 'fixture'
                                  CHECK (delivery_profile IN ('fixture', 'shadow')),
    source_side_effect_requested  boolean NOT NULL DEFAULT false
                                  CHECK (source_side_effect_requested = false),
    runtime_activation_requested  boolean NOT NULL DEFAULT false
                                  CHECK (runtime_activation_requested = false),
    promotion_execution_requested boolean NOT NULL DEFAULT false
                                  CHECK (promotion_execution_requested = false),
    created_by_user_id            text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, deployment_id),
    UNIQUE (workspace_id, certification_id),
    CONSTRAINT governance_sandbox_certification_state_shape CHECK (
      (workflow_state = 'DRAFT'
        AND submitted_at IS NULL AND submitted_by_user_id IS NULL
        AND submitted_evidence_set_hash IS NULL
        AND decided_at IS NULL AND decided_by_user_id IS NULL AND decision_reason IS NULL)
      OR
      (workflow_state = 'IN_REVIEW'
        AND submitted_at IS NOT NULL AND submitted_by_user_id IS NOT NULL
        AND submitted_evidence_set_hash IS NOT NULL
        AND decided_at IS NULL AND decided_by_user_id IS NULL AND decision_reason IS NULL)
      OR
      (workflow_state IN ('APPROVED', 'DENIED')
        AND submitted_at IS NOT NULL AND submitted_by_user_id IS NOT NULL
        AND submitted_evidence_set_hash IS NOT NULL
        AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL
        AND decided_evidence_set_hash IS NOT NULL
        AND char_length(trim(decision_reason)) BETWEEN 8 AND 2000)
    )
);

CREATE INDEX governance_sandbox_certifications_state_idx
  ON governance_sandbox_certifications (workspace_id, workflow_state, updated_at DESC, certification_id DESC);

CREATE TABLE governance_sandbox_step_evidence (
    evidence_id                text PRIMARY KEY,
    certification_id           text NOT NULL,
    workspace_id               text NOT NULL,
    step_key                   text NOT NULL CHECK (step_key IN (
                                 'CONNECT', 'SYNC', 'ORDER_TYPES', 'RECONCILIATION',
                                 'TIMEBOXED_RUN', 'CLEANUP', 'EXIT_REVIEW'
                               )),
    source_authority           text NOT NULL CHECK (source_authority IN ('PORTAL', 'EXECUTION', 'BROKER', 'DERIVED')),
    evaluation_state           text NOT NULL CHECK (evaluation_state IN ('PASS', 'FAIL', 'STALE', 'UNAVAILABLE')),
    evidence_hash              text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^sha256:[0-9a-f]{64}$'),
    evidence_schema_version    text NOT NULL,
    source_verification_state  text NOT NULL CHECK (source_verification_state IN ('VERIFIED', 'UNAVAILABLE')),
    summary                    text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 8 AND 1000),
    as_of                      timestamptz,
    expires_at                 timestamptz,
    capability_snapshot_id     text,
    source_cursor              text,
    projection_epoch           text,
    projection_sequence        bigint CHECK (projection_sequence IS NULL OR projection_sequence >= 0),
    created_at                 timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, certification_id)
      REFERENCES governance_sandbox_certifications(workspace_id, certification_id) ON DELETE RESTRICT,
    CHECK ((evaluation_state = 'UNAVAILABLE') = (source_verification_state = 'UNAVAILABLE')),
    CHECK (
      (evaluation_state = 'UNAVAILABLE' AND evidence_hash IS NULL AND as_of IS NULL AND expires_at IS NULL)
      OR
      (evaluation_state <> 'UNAVAILABLE' AND evidence_hash IS NOT NULL AND as_of IS NOT NULL
        AND expires_at IS NOT NULL AND expires_at > as_of)
    )
);

CREATE INDEX governance_sandbox_step_evidence_latest_idx
  ON governance_sandbox_step_evidence
  (workspace_id, certification_id, step_key, created_at DESC, evidence_id DESC);

CREATE TABLE governance_sandbox_findings (
    finding_id                 text PRIMARY KEY,
    certification_id          text NOT NULL,
    workspace_id              text NOT NULL,
    severity                   text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    source_authority           text NOT NULL CHECK (source_authority IN ('EXECUTION', 'BROKER', 'DERIVED')),
    finding_code               text NOT NULL,
    summary                    text NOT NULL CHECK (char_length(trim(summary)) BETWEEN 8 AND 1000),
    blocking                   boolean NOT NULL,
    evidence_hash              text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^sha256:[0-9a-f]{64}$'),
    as_of                      timestamptz,
    resolved_at                timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, certification_id)
      REFERENCES governance_sandbox_certifications(workspace_id, certification_id) ON DELETE RESTRICT,
    CHECK (NOT blocking OR severity IN ('ERROR', 'CRITICAL'))
);

CREATE INDEX governance_sandbox_findings_lookup_idx
  ON governance_sandbox_findings (workspace_id, certification_id, blocking, created_at, finding_id);

CREATE TABLE governance_sandbox_certification_events (
    event_id                   text PRIMARY KEY,
    certification_id          text NOT NULL,
    workspace_id              text NOT NULL,
    actor_user_id              text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key                text NOT NULL,
    request_digest             text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
    action                     text NOT NULL CHECK (action IN ('CREATE', 'SUBMIT', 'APPROVE', 'DENY', 'PLAN_PROMOTION')),
    workflow_version_before    integer NOT NULL CHECK (workflow_version_before >= 0),
    workflow_version_after     integer NOT NULL CHECK (
                                  workflow_version_after = workflow_version_before
                                  OR workflow_version_after = workflow_version_before + 1
                                ),
    metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT governance_sandbox_event_request_key_unique
      UNIQUE (workspace_id, actor_user_id, request_key),
    FOREIGN KEY (workspace_id, certification_id)
      REFERENCES governance_sandbox_certifications(workspace_id, certification_id) ON DELETE RESTRICT
);

CREATE INDEX governance_sandbox_certification_events_timeline_idx
  ON governance_sandbox_certification_events
  (workspace_id, certification_id, created_at, event_id);

CREATE TABLE governance_sandbox_promotion_plans (
    plan_id                     text PRIMARY KEY,
    certification_id           text NOT NULL,
    workspace_id               text NOT NULL,
    actor_user_id               text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key                 text NOT NULL,
    request_digest              text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
    expected_workflow_version   integer NOT NULL CHECK (expected_workflow_version > 0),
    target_stage                text NOT NULL CHECK (target_stage = 'CANARY'),
    evidence_set_hash           text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    status                      text NOT NULL CHECK (status = 'BLOCKED'),
    blocker_codes               text[] NOT NULL,
    source_side_effect_requested boolean NOT NULL DEFAULT false
                                   CHECK (source_side_effect_requested = false),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, actor_user_id, request_key),
    FOREIGN KEY (workspace_id, certification_id)
      REFERENCES governance_sandbox_certifications(workspace_id, certification_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION protect_governance_sandbox_certification() RETURNS trigger AS $$
BEGIN
  IF NEW.certification_id IS DISTINCT FROM OLD.certification_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.deployment_id IS DISTINCT FROM OLD.deployment_id
     OR NEW.promotion_grant_id IS DISTINCT FROM OLD.promotion_grant_id
     OR NEW.paper_exit_review_id IS DISTINCT FROM OLD.paper_exit_review_id
     OR NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id
     OR NEW.venue IS DISTINCT FROM OLD.venue
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.external_account_ref IS DISTINCT FROM OLD.external_account_ref
     OR NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest
     OR NEW.r1_approval_id IS DISTINCT FROM OLD.r1_approval_id
     OR NEW.r2_approval_id IS DISTINCT FROM OLD.r2_approval_id
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.formula_version IS DISTINCT FROM OLD.formula_version
     OR NEW.source_integration_state IS DISTINCT FROM OLD.source_integration_state
     OR NEW.delivery_profile IS DISTINCT FROM OLD.delivery_profile
     OR NEW.source_side_effect_requested IS DISTINCT FROM OLD.source_side_effect_requested
     OR NEW.runtime_activation_requested IS DISTINCT FROM OLD.runtime_activation_requested
     OR NEW.promotion_execution_requested IS DISTINCT FROM OLD.promotion_execution_requested
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'sandbox certification identity/authority is immutable in F2';
  END IF;
  IF NEW.workflow_version <> OLD.workflow_version + 1 THEN
    RAISE EXCEPTION 'sandbox certification workflow version must advance exactly once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governance_sandbox_certification_authority_immutable
BEFORE UPDATE ON governance_sandbox_certifications
FOR EACH ROW EXECUTE FUNCTION protect_governance_sandbox_certification();

CREATE TRIGGER governance_sandbox_step_evidence_append_only
BEFORE UPDATE OR DELETE ON governance_sandbox_step_evidence
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();
CREATE TRIGGER governance_sandbox_findings_append_only
BEFORE UPDATE OR DELETE ON governance_sandbox_findings
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();
CREATE TRIGGER governance_sandbox_events_append_only
BEFORE UPDATE OR DELETE ON governance_sandbox_certification_events
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();
CREATE TRIGGER governance_sandbox_promotion_plans_append_only
BEFORE UPDATE OR DELETE ON governance_sandbox_promotion_plans
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

-- Down Migration
DROP TRIGGER governance_sandbox_promotion_plans_append_only ON governance_sandbox_promotion_plans;
DROP TRIGGER governance_sandbox_events_append_only ON governance_sandbox_certification_events;
DROP TRIGGER governance_sandbox_findings_append_only ON governance_sandbox_findings;
DROP TRIGGER governance_sandbox_step_evidence_append_only ON governance_sandbox_step_evidence;
DROP TRIGGER governance_sandbox_certification_authority_immutable ON governance_sandbox_certifications;
DROP FUNCTION protect_governance_sandbox_certification();
DROP TABLE governance_sandbox_promotion_plans;
DROP TABLE governance_sandbox_certification_events;
DROP TABLE governance_sandbox_findings;
DROP TABLE governance_sandbox_step_evidence;
DROP TABLE governance_sandbox_certifications;
