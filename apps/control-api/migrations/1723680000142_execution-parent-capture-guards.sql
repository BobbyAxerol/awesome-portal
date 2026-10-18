-- Up Migration
-- Protect captured identity/policy/evidence independently of mutable decision
-- state. This is a forward invariant, not historical attestation or permission.
-- No legacy row, hash, timestamp, manifest, receipt or audit is rewritten.
-- Genuine Paper Exit capture must insert its FINAL source hash once, after
-- preallocating its exact children, before this migration is introduced.
CREATE OR REPLACE FUNCTION protect_execution_parent_capture() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'execution parent capture is retained and cannot be deleted'
      USING ERRCODE = '55000';
  END IF;
  -- Each trigger supplies only the existing writer's lifecycle columns.
  -- Null-safe JSON equality also protects new columns by default: adding a
  -- mutable captured field requires an explicit migration/policy review.
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION 'execution parent capture identity and evidence are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER governance_approval_capture_immutable
BEFORE UPDATE OR DELETE ON governance_approval_requests
FOR EACH ROW EXECUTE FUNCTION protect_execution_parent_capture(
  'status', 'quorum_met', 'decision_actor_ids', 'approval_version',
  'updated_at', 'decided_at', 'decided_by_user_id'
);

CREATE OR REPLACE TRIGGER governance_decision_plan_capture_immutable
BEFORE UPDATE OR DELETE ON governance_decision_plans
FOR EACH ROW EXECUTE FUNCTION protect_execution_parent_capture(
  'status', 'applied_at', 'response_json'
);

CREATE OR REPLACE TRIGGER governance_paper_exit_capture_immutable
BEFORE UPDATE OR DELETE ON governance_paper_exit_reviews
FOR EACH ROW EXECUTE FUNCTION protect_execution_parent_capture(
  'review_state', 'extension_days', 'extended_until', 'review_version', 'updated_at'
);

CREATE OR REPLACE TRIGGER governance_paper_exit_plan_capture_immutable
BEFORE UPDATE OR DELETE ON governance_paper_exit_decision_plans
FOR EACH ROW EXECUTE FUNCTION protect_execution_parent_capture(
  'status', 'applied_at', 'response_json'
);

CREATE OR REPLACE TRIGGER execution_activation_plan_capture_immutable
BEFORE UPDATE OR DELETE ON execution_activation_plans
FOR EACH ROW EXECUTE FUNCTION protect_execution_parent_capture(
  'status', 'plan_version', 'applied_at', 'verified_at',
  'resulting_capability_version', 'updated_at'
);

-- The capability is a current mutable head, not append-only history. Preserve
-- rollback/apply writes while protecting its workspace/key/creation identity.
-- Existing fixture/source-dark/kill-switch CHECK constraints remain unchanged.
CREATE OR REPLACE TRIGGER execution_activation_capability_identity_immutable
BEFORE UPDATE OR DELETE ON execution_activation_capabilities
FOR EACH ROW EXECUTE FUNCTION protect_execution_parent_capture(
  'effective_profile', 'desired_profile', 'capability_version', 'source_enabled',
  'runtime_enabled', 'kill_switch_engaged', 'last_plan_id', 'updated_by_user_id', 'updated_at'
);

-- Lifecycle allowlists do not replace existing RBAC/CAS, decision/receipt
-- correlation, state transitions or immutable child/event guards. A later
-- evidence INSERT still changes the cohort and must fail manifest validation;
-- children are not globally closed at root INSERT (creation is transactional).
-- Root DELETE rejection deliberately also prevents workspace hard-delete from
-- silently cascading captured history. No retention/decommission bypass here.

-- Down Migration
-- Deliberately retain the forward capture guards and all business rows.
-- Application rollback must not reopen target reparenting/evidence resealing.
-- CREATE OR REPLACE TRIGGER permits a later forward reapply without disabling
-- guards; any future removal requires its own explicitly reviewed migration.
