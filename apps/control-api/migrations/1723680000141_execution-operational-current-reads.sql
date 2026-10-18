-- Up Migration
-- Finite presentation of the SAME Portal queue. No users/incidents/source
-- joins and no family/provenance invented for historical rows. Invalid visible
-- scalars become NULL and cause the strict reader to refuse, never truncate.
CREATE VIEW execution_operation_queue_v2 AS SELECT
  CASE WHEN octet_length(operation_id) BETWEEN 1 AND 191 THEN operation_id END AS operation_id,
  workspace_id, operation_kind,
  CASE WHEN octet_length(command_key) BETWEEN 3 AND 128 THEN command_key END AS command_key,
  environment, target_type,
  CASE WHEN octet_length(target_id) BETWEEN 1 AND 191 THEN target_id END AS target_id,
  CASE WHEN octet_length(risk_tier) BETWEEN 1 AND 64 THEN risk_tier END AS risk_tier,
  severity, source_authority, source_status, verification_result, triage_state, workflow_version,
  CASE WHEN acknowledged_at >= '1970-01-01 UTC'::timestamptz AND acknowledged_at < '10000-01-01 UTC'::timestamptz
    THEN to_char(acknowledged_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS acknowledged_at,
  CASE WHEN resolved_at >= '1970-01-01 UTC'::timestamptz AND resolved_at < '10000-01-01 UTC'::timestamptz
    THEN to_char(resolved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS resolved_at,
  CASE WHEN created_at >= '1970-01-01 UTC'::timestamptz AND created_at < '10000-01-01 UTC'::timestamptz
    THEN to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS created_at,
  CASE WHEN updated_at >= '1970-01-01 UTC'::timestamptz AND updated_at < '10000-01-01 UTC'::timestamptz
    THEN to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS updated_at
FROM execution_operation_queue_items;

-- Forward invariant only. This does NOT attest the original target of old
-- annotations, evidence, links or events. No old row or child is rewritten.
CREATE OR REPLACE FUNCTION protect_execution_incident_authority() RETURNS trigger AS $$
BEGIN
  IF NEW.incident_id IS DISTINCT FROM OLD.incident_id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.target_type IS DISTINCT FROM OLD.target_type
     OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.environment IS DISTINCT FROM OLD.environment
     OR NEW.opened_by_user_id IS DISTINCT FROM OLD.opened_by_user_id
     OR NEW.source_integration_state IS DISTINCT FROM OLD.source_integration_state
     OR NEW.source_side_effect_requested IS DISTINCT FROM OLD.source_side_effect_requested
     OR NEW.deployment_resume_requested IS DISTINCT FROM OLD.deployment_resume_requested
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'execution incident identity/authority is immutable';
  END IF;
  IF NEW.workflow_version <> OLD.workflow_version + 1 THEN
    RAISE EXCEPTION 'execution incident workflow version must advance exactly once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration
DROP VIEW execution_operation_queue_v2;
-- Deliberately retain the stronger forward target/authority guard. Rolling
-- code back must not reopen target reparenting or erase historical evidence.
