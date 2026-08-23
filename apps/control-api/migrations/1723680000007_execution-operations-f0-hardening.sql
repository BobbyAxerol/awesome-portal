-- EX-BE-05b/F0 hardening: command intent keeps only its digest. Raw command
-- payloads can contain credentials or excessive position detail and are not a
-- durable Portal record while the relay is disabled.

-- Up Migration

DROP TRIGGER execution_command_plans_f0_immutable ON execution_command_plans_f0;

UPDATE execution_command_plans_f0
SET payload_json = '{}'::jsonb;

ALTER TABLE execution_command_plans_f0
  ADD COLUMN payload_storage_policy text NOT NULL DEFAULT 'HASH_ONLY_NO_RAW'
    CHECK (payload_storage_policy = 'HASH_ONLY_NO_RAW'),
  ADD CONSTRAINT execution_command_plans_f0_payload_hash_only
    CHECK (payload_json = '{}'::jsonb);

CREATE TRIGGER execution_command_plans_f0_immutable
BEFORE UPDATE OR DELETE ON execution_command_plans_f0
FOR EACH ROW EXECUTE FUNCTION reject_execution_command_plan_mutation();

-- Down Migration
DROP TRIGGER execution_command_plans_f0_immutable ON execution_command_plans_f0;
ALTER TABLE execution_command_plans_f0
  DROP CONSTRAINT execution_command_plans_f0_payload_hash_only,
  DROP COLUMN payload_storage_policy;
CREATE TRIGGER execution_command_plans_f0_immutable
BEFORE UPDATE OR DELETE ON execution_command_plans_f0
FOR EACH ROW EXECUTE FUNCTION reject_execution_command_plan_mutation();
