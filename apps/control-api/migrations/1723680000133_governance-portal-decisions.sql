-- Up Migration
-- Portal-local review commands only. These records never activate Execution.
ALTER TABLE governance_decision_plans
  DROP CONSTRAINT governance_decision_plans_command_type_check,
  ADD CONSTRAINT governance_decision_plans_command_type_check CHECK
    (command_type IN ('GOVERNANCE_R1_DECISION', 'GOVERNANCE_R2_DECISION', 'GOVERNANCE_LIVE_DECISION')),
  ADD COLUMN policy_version text,
  ADD COLUMN parent_approval_id text,
  ADD COLUMN parent_approval_version integer CHECK (parent_approval_version IS NULL OR parent_approval_version >= 1),
  ADD COLUMN parent_evidence_set_hash text CHECK
    (parent_evidence_set_hash IS NULL OR parent_evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT governance_decision_parent_pin_complete CHECK
    ((parent_approval_id IS NULL AND parent_approval_version IS NULL AND parent_evidence_set_hash IS NULL)
      OR (parent_approval_id IS NOT NULL AND parent_approval_version IS NOT NULL AND parent_evidence_set_hash IS NOT NULL));

-- No backfill: old plans did not record these policy/lineage facts. A pending
-- historical plan without policy pins must be replanned; applied receipts stay.

-- Keep the established view's column ordering frozen. Later migrations added
-- request columns; expanding request.* again would rename its projected fields.
CREATE VIEW governance_approval_decision_inbox AS
SELECT request.*,
       EXISTS (SELECT 1 FROM governance_r2_lineage lineage
         JOIN governance_approval_requests parent ON parent.approval_id = lineage.r1_approval_id
           AND parent.workspace_id = lineage.workspace_id AND parent.gate = 'R1'
         WHERE lineage.r2_approval_id = request.approval_id AND lineage.workspace_id = request.workspace_id
           AND parent.status IN ('APPROVED', 'APPROVED_WITH_CONDITION')
           AND parent.evidence_complete AND parent.expires_at > now()) AS r2_parent_ready,
       (SELECT lineage.plan_author_user_id FROM governance_r2_lineage lineage
         WHERE lineage.r2_approval_id = request.approval_id AND lineage.workspace_id = request.workspace_id) AS r2_plan_author_user_id
FROM governance_approval_inbox request;

-- Down Migration
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM governance_decision_plans WHERE command_type <> 'GOVERNANCE_R1_DECISION') THEN
    RAISE EXCEPTION 'Forward-only governance decisions exist; downgrade would discard command identity';
  END IF;
END $$;
DROP VIEW governance_approval_decision_inbox;
ALTER TABLE governance_decision_plans
  DROP CONSTRAINT governance_decision_parent_pin_complete,
  DROP COLUMN parent_evidence_set_hash,
  DROP COLUMN parent_approval_version,
  DROP COLUMN parent_approval_id,
  DROP COLUMN policy_version,
  DROP CONSTRAINT governance_decision_plans_command_type_check,
  ADD CONSTRAINT governance_decision_plans_command_type_check CHECK (command_type = 'GOVERNANCE_R1_DECISION');
