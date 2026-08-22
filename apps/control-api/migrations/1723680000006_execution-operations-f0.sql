-- Up Migration
-- EX-BE-05b/F0: Portal-owned, fail-closed execution operation plans and
-- canonical typed governance conditions. No relay/outbox/source side effect.

CREATE FUNCTION execution_typed_conditions_valid(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND jsonb_array_length(value) <= 16
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(value) AS item
      WHERE jsonb_typeof(item) <> 'object'
         OR NOT (item ?& ARRAY['text', 'owner', 'deadline', 'expires_at', 'blocking'])
         OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 5
         OR jsonb_typeof(item->'text') <> 'string'
         OR length(btrim(item->>'text')) NOT BETWEEN 8 AND 2000
         OR jsonb_typeof(item->'owner') <> 'string'
         OR length(btrim(item->>'owner')) NOT BETWEEN 1 AND 128
         OR jsonb_typeof(item->'blocking') <> 'boolean'
         OR jsonb_typeof(item->'deadline') NOT IN ('string', 'null')
         OR jsonb_typeof(item->'expires_at') NOT IN ('string', 'null')
         OR (jsonb_typeof(item->'deadline') = 'string' AND (item->>'deadline') !~ '^\d{4}-\d{2}-\d{2}$')
         OR (jsonb_typeof(item->'expires_at') = 'string' AND (item->>'expires_at') !~ '^\d{4}-\d{2}-\d{2}$')
         OR (
           jsonb_typeof(item->'deadline') = 'string'
           AND jsonb_typeof(item->'expires_at') = 'string'
           AND (item->>'expires_at') < (item->>'deadline')
         )
    )
    AND jsonb_array_length(value) = (
      SELECT count(DISTINCT item::text) FROM jsonb_array_elements(value) AS item
    );
$$;

ALTER TABLE governance_decision_plans
  ADD COLUMN conditions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE governance_approval_decisions
  ADD COLUMN conditions jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE governance_decision_plans
SET conditions = jsonb_build_array(jsonb_build_object(
  'text', condition,
  'owner', actor_user_id,
  'deadline', NULL,
  'expires_at', NULL,
  'blocking', true
))
WHERE condition IS NOT NULL;

UPDATE governance_approval_decisions
SET conditions = jsonb_build_array(jsonb_build_object(
  'text', condition,
  'owner', actor_user_id,
  'deadline', NULL,
  'expires_at', NULL,
  'blocking', true
))
WHERE condition IS NOT NULL;

ALTER TABLE governance_decision_plans
  ADD CONSTRAINT governance_decision_plans_conditions_valid
    CHECK (execution_typed_conditions_valid(conditions)),
  ADD CONSTRAINT governance_decision_plans_conditions_decision
    CHECK (
      (decision = 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) BETWEEN 1 AND 16)
      OR (decision <> 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) = 0)
    );

ALTER TABLE governance_approval_decisions
  ADD CONSTRAINT governance_approval_decisions_conditions_valid
    CHECK (execution_typed_conditions_valid(conditions)),
  ADD CONSTRAINT governance_approval_decisions_conditions_decision
    CHECK (
      (decision = 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) BETWEEN 1 AND 16)
      OR (decision <> 'APPROVE_WITH_CONDITION' AND jsonb_array_length(conditions) = 0)
    );

CREATE TABLE execution_command_plans_f0 (
    operation_id                 text PRIMARY KEY,
    workspace_id                 text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    actor_user_id                text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key                  text NOT NULL,
    command_type                 text NOT NULL DEFAULT 'EXECUTION_COMMAND' CHECK (command_type = 'EXECUTION_COMMAND'),
    command_version              integer NOT NULL DEFAULT 1 CHECK (command_version = 1),
    command_key                  text NOT NULL CHECK (command_key ~ '^[a-z0-9-]+/(<root>|[a-z0-9-]+)$'),
    environment                  text NOT NULL CHECK (environment IN ('PAPER', 'SANDBOX', 'LIVE')),
    target_type                  text NOT NULL CHECK (target_type IN ('ACCOUNT', 'BROKER_BINDING', 'DEPLOYMENT', 'ORDER', 'PORTFOLIO', 'SYSTEM')),
    target_id                    text NOT NULL,
    expected_target_version      integer NOT NULL CHECK (expected_target_version >= 1),
    payload_hash                 text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
    plan_digest                  text NOT NULL CHECK (plan_digest ~ '^sha256:[0-9a-f]{64}$'),
    payload_json                 jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
    conditions                   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (execution_typed_conditions_valid(conditions)),
    risk_tier                    text NOT NULL CHECK (risk_tier IN ('R0_READ', 'R1_PAPER_MUTATION', 'R2_SANDBOX', 'R3_LIVE_PROTECTIVE', 'R4_LIVE_RISK_INCREASING', 'UNCLASSIFIED', 'BLOCKED')),
    blocker_codes                text[] NOT NULL CHECK (cardinality(blocker_codes) >= 1 AND 'COMMAND_RELAY_DISABLED' = ANY(blocker_codes)),
    warning_codes                text[] NOT NULL DEFAULT '{}',
    status                       text NOT NULL DEFAULT 'BLOCKED' CHECK (status = 'BLOCKED'),
    relay_capability             text NOT NULL DEFAULT 'DISABLED' CHECK (relay_capability = 'DISABLED'),
    source_side_effect_requested boolean NOT NULL DEFAULT false CHECK (NOT source_side_effect_requested),
    expires_at                   timestamptz NOT NULL,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, actor_user_id, request_key),
    CHECK (expires_at > created_at)
);

CREATE INDEX execution_command_plans_f0_actor_idx
  ON execution_command_plans_f0 (workspace_id, actor_user_id, created_at DESC);

CREATE FUNCTION reject_execution_command_plan_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'execution F0 plans are immutable'
    USING ERRCODE = '55000';
  RETURN OLD;
END;
$$;

CREATE TRIGGER execution_command_plans_f0_immutable
BEFORE UPDATE OR DELETE ON execution_command_plans_f0
FOR EACH ROW EXECUTE FUNCTION reject_execution_command_plan_mutation();

-- Down Migration
DROP TRIGGER execution_command_plans_f0_immutable ON execution_command_plans_f0;
DROP FUNCTION reject_execution_command_plan_mutation();
DROP TABLE execution_command_plans_f0;
ALTER TABLE governance_approval_decisions
  DROP CONSTRAINT governance_approval_decisions_conditions_decision,
  DROP CONSTRAINT governance_approval_decisions_conditions_valid,
  DROP COLUMN conditions;
ALTER TABLE governance_decision_plans
  DROP CONSTRAINT governance_decision_plans_conditions_decision,
  DROP CONSTRAINT governance_decision_plans_conditions_valid,
  DROP COLUMN conditions;
DROP FUNCTION execution_typed_conditions_valid(jsonb);
