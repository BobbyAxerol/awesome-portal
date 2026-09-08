-- Up Migration
-- N09: Portal-owned governance/workflow completion.
-- This migration does not grant or relay any Trading System command authority.

-- REQUEST_CHANGES closes one immutable approval attempt, but does not deny the
-- governed gate. Resubmission is a new trusted-intake request linked through
-- supersedes_approval_id; reviewers never rewrite the evidence of this attempt.
ALTER TABLE governance_approval_requests
  ADD COLUMN supersedes_approval_id text REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT;

ALTER TABLE governance_approval_requests
  DROP CONSTRAINT governance_approval_requests_status_check;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'governance_approval_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%decided_at%'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE governance_approval_requests DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE governance_approval_requests
  ADD CONSTRAINT governance_approval_requests_status_check
  CHECK (status IN (
    'PENDING', 'APPROVED', 'APPROVED_WITH_CONDITION', 'DENIED',
    'CHANGES_REQUESTED', 'EXPIRED'
  )),
  ADD CONSTRAINT governance_approval_requests_terminal_shape CHECK (
    (status = 'PENDING' AND decided_at IS NULL AND decided_by_user_id IS NULL)
    OR
    (status = 'EXPIRED' AND decided_at IS NOT NULL AND decided_by_user_id IS NULL)
    OR
    (status IN ('APPROVED', 'APPROVED_WITH_CONDITION', 'DENIED', 'CHANGES_REQUESTED')
      AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL)
  );

-- Extend both immutable plan and decision vocabularies. Conditions on
-- REQUEST_CHANGES are the concrete remediation request and therefore required.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'governance_decision_plans'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%APPROVE_WITH_CONDITION%'
  LOOP
    EXECUTE format('ALTER TABLE governance_decision_plans DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'governance_approval_decisions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%APPROVE_WITH_CONDITION%'
  LOOP
    EXECUTE format('ALTER TABLE governance_approval_decisions DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE governance_decision_plans
  ADD CONSTRAINT governance_decision_plans_decision_check
    CHECK (decision IN ('APPROVE', 'APPROVE_WITH_CONDITION', 'DENY', 'REQUEST_CHANGES')),
  ADD CONSTRAINT governance_decision_plans_conditions_shape CHECK (
    (decision IN ('APPROVE_WITH_CONDITION', 'REQUEST_CHANGES')
      AND jsonb_array_length(conditions) BETWEEN 1 AND 16
      AND condition IS NOT DISTINCT FROM (conditions->0->>'text'))
    OR
    (decision IN ('APPROVE', 'DENY')
      AND jsonb_array_length(conditions) = 0
      AND condition IS NULL)
  );

ALTER TABLE governance_approval_decisions
  ADD CONSTRAINT governance_approval_decisions_decision_check
    CHECK (decision IN ('APPROVE', 'APPROVE_WITH_CONDITION', 'DENY', 'REQUEST_CHANGES')),
  ADD CONSTRAINT governance_approval_decisions_conditions_shape CHECK (
    (decision IN ('APPROVE_WITH_CONDITION', 'REQUEST_CHANGES')
      AND jsonb_array_length(conditions) BETWEEN 1 AND 16
      AND condition IS NOT DISTINCT FROM (conditions->0->>'text'))
    OR
    (decision IN ('APPROVE', 'DENY')
      AND jsonb_array_length(conditions) = 0
      AND condition IS NULL)
  );

CREATE TABLE governance_approval_known_limitations (
    limitation_id      text PRIMARY KEY,
    approval_id        text NOT NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT,
    ordinal            integer NOT NULL CHECK (ordinal >= 0),
    kind               text NOT NULL CHECK (kind IN ('LINEAGE', 'WARNING', 'RESTRICTION', 'WAIVER')),
    label              text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 160),
    statement          text NOT NULL CHECK (char_length(trim(statement)) BETWEEN 8 AND 2000),
    expires_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (approval_id, ordinal)
);

CREATE INDEX governance_approval_limitations_idx
  ON governance_approval_known_limitations (approval_id, ordinal);

CREATE TRIGGER governance_approval_limitations_immutable
BEFORE UPDATE OR DELETE ON governance_approval_known_limitations
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE TABLE governance_r2_lineage (
    r2_approval_id           text PRIMARY KEY,
    workspace_id             text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    r2_gate                  text NOT NULL DEFAULT 'R2' CHECK (r2_gate = 'R2'),
    r1_approval_id           text NOT NULL,
    r1_gate                  text NOT NULL DEFAULT 'R1' CHECK (r1_gate = 'R1'),
    grant_id                 text NOT NULL CHECK (char_length(trim(grant_id)) BETWEEN 1 AND 191),
    grant_name               text NOT NULL CHECK (char_length(trim(grant_name)) BETWEEN 1 AND 191),
    approver_role            text NOT NULL CHECK (approver_role IN ('ADMIN')),
    plan_author_user_id      text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    plan_author_username     text NOT NULL CHECK (char_length(trim(plan_author_username)) BETWEEN 1 AND 128),
    created_at               timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (r2_approval_id, workspace_id, r2_gate)
      REFERENCES governance_approval_requests(approval_id, workspace_id, gate) ON DELETE RESTRICT,
    FOREIGN KEY (r1_approval_id, workspace_id, r1_gate)
      REFERENCES governance_approval_requests(approval_id, workspace_id, gate) ON DELETE RESTRICT
);

CREATE INDEX governance_r2_lineage_workspace_idx
  ON governance_r2_lineage (workspace_id, r2_approval_id);

CREATE TRIGGER governance_r2_lineage_immutable
BEFORE UPDATE OR DELETE ON governance_r2_lineage
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE VIEW governance_approval_history AS
SELECT decision.decision_id AS history_id,
       decision.workspace_id,
       request.approval_id,
       request.gate,
       request.subject_id,
       request.subject_label AS subject,
       CASE decision.decision
         WHEN 'APPROVE' THEN 'APPROVED'
         WHEN 'APPROVE_WITH_CONDITION' THEN 'APPROVED_WITH_CONDITION'
         WHEN 'DENY' THEN 'DENIED'
         ELSE 'CHANGES_REQUESTED'
       END AS outcome,
       decision.actor_user_id AS decided_by_user_id,
       decision.actor_username AS decided_by_username,
       decision.decided_at,
       request.policy_version,
       decision.evidence_set_hash AS evidence_digest,
       decision.approval_version_after
FROM governance_approval_decisions decision
JOIN governance_approval_requests request
  ON request.approval_id = decision.approval_id
 AND request.workspace_id = decision.workspace_id
WHERE decision.approval_version_after = request.approval_version
  AND request.status <> 'PENDING';

CREATE INDEX governance_approval_decisions_history_idx
  ON governance_approval_decisions (workspace_id, decided_at DESC, decision_id DESC);

-- Mine means explicitly assigned. Acknowledging an unassigned operation
-- atomically self-assigns it; creator/acknowledger/resolver are not aliases.
ALTER TABLE execution_operation_queue_items
  ADD COLUMN assigned_to_user_id text REFERENCES portal_users(user_id) ON DELETE RESTRICT,
  ADD COLUMN assigned_at timestamptz;

UPDATE execution_operation_queue_items
SET assigned_to_user_id = acknowledged_by_user_id,
    assigned_at = acknowledged_at
WHERE acknowledged_by_user_id IS NOT NULL;

ALTER TABLE execution_operation_queue_items
  ADD CONSTRAINT execution_operation_queue_assignment_shape CHECK (
    (assigned_to_user_id IS NULL AND assigned_at IS NULL)
    OR (assigned_to_user_id IS NOT NULL AND assigned_at IS NOT NULL)
  );

CREATE INDEX execution_operation_queue_assignee_idx
  ON execution_operation_queue_items
     (workspace_id, assigned_to_user_id, created_at DESC, operation_id DESC);

CREATE VIEW execution_operation_queue_read AS
SELECT queue.*,
       assignee.username AS assigned_to_username,
       incident.incident_id
FROM execution_operation_queue_items queue
LEFT JOIN portal_users assignee ON assignee.user_id = queue.assigned_to_user_id
LEFT JOIN LATERAL (
  SELECT link.incident_id
  FROM execution_incident_operation_links link
  WHERE link.workspace_id = queue.workspace_id
    AND link.operation_id = queue.operation_id
  ORDER BY link.created_at DESC, link.incident_id DESC
  LIMIT 1
) incident ON true;

-- A smoke plan is bounded Portal evidence. It cannot request a source/runtime
-- side effect and is never a substitute for a Sandbox execution authority.
CREATE TABLE governance_sandbox_smoke_plans (
    plan_id                       text PRIMARY KEY,
    certification_id              text NOT NULL,
    workspace_id                  text NOT NULL,
    qty                           numeric(38,18) NOT NULL CHECK (qty > 0),
    cap                           numeric(38,18) NOT NULL CHECK (cap >= qty),
    currency                      text NOT NULL CHECK (currency ~ '^[A-Z0-9]{2,12}$'),
    timebox_minutes               integer NOT NULL CHECK (timebox_minutes BETWEEN 5 AND 240),
    operator_user_id              text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    operator_username             text NOT NULL CHECK (char_length(trim(operator_username)) BETWEEN 1 AND 128),
    status                        text NOT NULL DEFAULT 'PLANNED'
                                  CHECK (status IN ('PLANNED', 'APPROVED', 'REJECTED')),
    approved_by_user_id           text REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    approved_by_username          text,
    approved_at                   timestamptz,
    source_side_effect_requested  boolean NOT NULL DEFAULT false
                                  CHECK (source_side_effect_requested = false),
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, certification_id),
    FOREIGN KEY (workspace_id, certification_id)
      REFERENCES governance_sandbox_certifications(workspace_id, certification_id) ON DELETE RESTRICT,
    CHECK (
      (status IN ('PLANNED', 'REJECTED')
        AND approved_by_user_id IS NULL AND approved_by_username IS NULL AND approved_at IS NULL)
      OR
      (status = 'APPROVED'
        AND approved_by_user_id IS NOT NULL AND approved_by_username IS NOT NULL AND approved_at IS NOT NULL)
    )
);

CREATE OR REPLACE FUNCTION protect_governance_sandbox_smoke_plan() RETURNS trigger AS $$
BEGIN
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.certification_id IS DISTINCT FROM OLD.certification_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.qty IS DISTINCT FROM OLD.qty
     OR NEW.cap IS DISTINCT FROM OLD.cap
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.timebox_minutes IS DISTINCT FROM OLD.timebox_minutes
     OR NEW.operator_user_id IS DISTINCT FROM OLD.operator_user_id
     OR NEW.operator_username IS DISTINCT FROM OLD.operator_username
     OR NEW.source_side_effect_requested IS DISTINCT FROM OLD.source_side_effect_requested
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'sandbox smoke-plan identity/bounds are immutable';
  END IF;
  IF OLD.status <> 'PLANNED' OR NEW.status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'sandbox smoke-plan status transition is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governance_sandbox_smoke_plan_guard
BEFORE UPDATE ON governance_sandbox_smoke_plans
FOR EACH ROW EXECUTE FUNCTION protect_governance_sandbox_smoke_plan();

CREATE TRIGGER governance_sandbox_smoke_plan_no_delete
BEFORE DELETE ON governance_sandbox_smoke_plans
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

-- Down Migration
DROP TRIGGER governance_sandbox_smoke_plan_no_delete ON governance_sandbox_smoke_plans;
DROP TRIGGER governance_sandbox_smoke_plan_guard ON governance_sandbox_smoke_plans;
DROP FUNCTION protect_governance_sandbox_smoke_plan();
DROP TABLE governance_sandbox_smoke_plans;
DROP VIEW execution_operation_queue_read;
DROP INDEX execution_operation_queue_assignee_idx;
ALTER TABLE execution_operation_queue_items
  DROP CONSTRAINT execution_operation_queue_assignment_shape,
  DROP COLUMN assigned_at,
  DROP COLUMN assigned_to_user_id;
DROP INDEX governance_approval_decisions_history_idx;
DROP VIEW governance_approval_history;
DROP TRIGGER governance_r2_lineage_immutable ON governance_r2_lineage;
DROP TABLE governance_r2_lineage;
DROP TRIGGER governance_approval_limitations_immutable ON governance_approval_known_limitations;
DROP TABLE governance_approval_known_limitations;
ALTER TABLE governance_approval_decisions
  DROP CONSTRAINT governance_approval_decisions_conditions_shape,
  DROP CONSTRAINT governance_approval_decisions_decision_check;
ALTER TABLE governance_decision_plans
  DROP CONSTRAINT governance_decision_plans_conditions_shape,
  DROP CONSTRAINT governance_decision_plans_decision_check;
ALTER TABLE governance_approval_requests
  DROP CONSTRAINT governance_approval_requests_terminal_shape,
  DROP CONSTRAINT governance_approval_requests_status_check,
  DROP COLUMN supersedes_approval_id;

ALTER TABLE governance_approval_requests
  ADD CONSTRAINT governance_approval_requests_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'APPROVED_WITH_CONDITION', 'DENIED', 'EXPIRED')),
  ADD CONSTRAINT governance_approval_requests_terminal_shape CHECK (
    (status = 'PENDING' AND decided_at IS NULL AND decided_by_user_id IS NULL)
    OR
    (status = 'EXPIRED' AND decided_at IS NOT NULL AND decided_by_user_id IS NULL)
    OR
    (status IN ('APPROVED', 'APPROVED_WITH_CONDITION', 'DENIED')
      AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL)
  );

ALTER TABLE governance_decision_plans
  ADD CONSTRAINT governance_decision_plans_decision_check
    CHECK (decision IN ('APPROVE', 'APPROVE_WITH_CONDITION', 'DENY')),
  ADD CONSTRAINT governance_decision_plans_conditions_decision CHECK (
    (decision = 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) BETWEEN 1 AND 16)
    OR (decision <> 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) = 0)
  ),
  ADD CONSTRAINT governance_decision_plans_condition_alias_shape CHECK (
    (decision = 'APPROVE_WITH_CONDITION'
      AND condition IS NOT DISTINCT FROM (conditions->0->>'text'))
    OR (decision <> 'APPROVE_WITH_CONDITION' AND condition IS NULL)
  );

ALTER TABLE governance_approval_decisions
  ADD CONSTRAINT governance_approval_decisions_decision_check
    CHECK (decision IN ('APPROVE', 'APPROVE_WITH_CONDITION', 'DENY')),
  ADD CONSTRAINT governance_approval_decisions_conditions_decision CHECK (
    (decision = 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) BETWEEN 1 AND 16)
    OR (decision <> 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) = 0)
  ),
  ADD CONSTRAINT governance_approval_decisions_condition_alias_shape CHECK (
    (decision = 'APPROVE_WITH_CONDITION'
      AND condition IS NOT DISTINCT FROM (conditions->0->>'text'))
    OR (decision <> 'APPROVE_WITH_CONDITION' AND condition IS NULL)
  );
