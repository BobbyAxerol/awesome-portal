-- Up Migration
-- N13A is deliberately source-dark. A later, separately reviewed N13B
-- migration must remove these database constraints before any source/runtime
-- capability can become effective.
CREATE TABLE execution_activation_capabilities (
    workspace_id             text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    capability_key           text NOT NULL CHECK (capability_key IN (
                               'PROJECTION', 'QUERY', 'SSE',
                               'COMMAND_R1', 'COMMAND_R2', 'COMMAND_R3', 'COMMAND_R4'
                             )),
    effective_profile        text NOT NULL DEFAULT 'fixture' CHECK (effective_profile = 'fixture'),
    desired_profile          text NOT NULL DEFAULT 'fixture' CHECK (desired_profile IN (
                               'fixture', 'shadow', 'paper', 'sandbox', 'live_canary', 'live_full'
                             )),
    capability_version       integer NOT NULL DEFAULT 1 CHECK (capability_version >= 1),
    source_enabled           boolean NOT NULL DEFAULT false CHECK (source_enabled = false),
    runtime_enabled          boolean NOT NULL DEFAULT false CHECK (runtime_enabled = false),
    kill_switch_engaged      boolean NOT NULL DEFAULT true CHECK (kill_switch_engaged = true),
    last_plan_id             text,
    updated_by_user_id       text REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, capability_key)
);

CREATE TABLE execution_activation_plans (
    plan_id                   text PRIMARY KEY,
    workspace_id              text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    capability_key            text NOT NULL CHECK (capability_key IN (
                                'PROJECTION', 'QUERY', 'SSE',
                                'COMMAND_R1', 'COMMAND_R2', 'COMMAND_R3', 'COMMAND_R4'
                              )),
    actor_user_id             text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    actor_username            text NOT NULL,
    request_key               text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'),
    request_digest            text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
    action                    text NOT NULL CHECK (action IN ('PROMOTE', 'ROLLBACK')),
    from_profile              text NOT NULL CHECK (from_profile IN (
                                'fixture', 'shadow', 'paper', 'sandbox', 'live_canary', 'live_full'
                              )),
    target_profile            text NOT NULL CHECK (target_profile IN (
                                'fixture', 'shadow', 'paper', 'sandbox', 'live_canary', 'live_full'
                              )),
    expected_capability_version integer NOT NULL CHECK (expected_capability_version >= 1),
    plan_version              integer NOT NULL DEFAULT 1 CHECK (plan_version >= 1),
    status                    text NOT NULL CHECK (status IN (
                                'READY', 'BLOCKED', 'DENIED', 'APPLIED', 'VERIFIED'
                              )),
    blocker_codes             text[] NOT NULL DEFAULT '{}',
    evidence_set_hash         text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    compatibility_set_hash    text NOT NULL CHECK (compatibility_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    reason                    text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 8 AND 2000),
    source_side_effect_requested boolean NOT NULL DEFAULT false CHECK (source_side_effect_requested = false),
    runtime_activation_requested boolean NOT NULL DEFAULT false CHECK (runtime_activation_requested = false),
    owner_artifact_imported   boolean NOT NULL DEFAULT false CHECK (owner_artifact_imported = false),
    expires_at                timestamptz NOT NULL,
    applied_at                timestamptz,
    verified_at               timestamptz,
    resulting_capability_version integer,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT execution_activation_plan_request_unique UNIQUE (workspace_id, actor_user_id, request_key),
    CONSTRAINT execution_activation_plan_terminal_shape CHECK (
      (status IN ('READY', 'BLOCKED', 'DENIED') AND applied_at IS NULL AND verified_at IS NULL
        AND resulting_capability_version IS NULL)
      OR
      (status = 'APPLIED' AND applied_at IS NOT NULL AND verified_at IS NULL
        AND resulting_capability_version IS NOT NULL)
      OR
      (status = 'VERIFIED' AND applied_at IS NOT NULL AND verified_at IS NOT NULL
        AND resulting_capability_version IS NOT NULL)
    )
);

ALTER TABLE execution_activation_capabilities
  ADD CONSTRAINT execution_activation_capability_last_plan_fk
  FOREIGN KEY (last_plan_id) REFERENCES execution_activation_plans(plan_id) ON DELETE RESTRICT;

CREATE INDEX execution_activation_plans_workspace_idx
  ON execution_activation_plans (workspace_id, created_at DESC, plan_id DESC);

CREATE TABLE execution_activation_evidence_refs (
    plan_id                   text NOT NULL REFERENCES execution_activation_plans(plan_id) ON DELETE RESTRICT,
    ordinal                   integer NOT NULL CHECK (ordinal >= 0),
    evidence_kind             text NOT NULL CHECK (evidence_kind IN (
                                'CONTRACT', 'IMAGE', 'SCHEMA', 'QUALIFICATION', 'ROLLBACK'
                              )),
    reference_id              text NOT NULL CHECK (
                               reference_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$'
                               AND char_length(reference_id) BETWEEN 1 AND 512
                             ),
    artifact_digest           text NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
    schema_version            text NOT NULL CHECK (schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    signer_fingerprint        text NOT NULL CHECK (signer_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
    detached_signature       text NOT NULL CHECK (
                               detached_signature ~ '^[A-Za-z0-9_-]+$'
                               AND char_length(detached_signature) BETWEEN 43 AND 4096
                             ),
    compatibility_revision   text NOT NULL CHECK (compatibility_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    expires_at                timestamptz NOT NULL,
    structure_valid          boolean NOT NULL DEFAULT true CHECK (structure_valid = true),
    owner_accepted            boolean NOT NULL DEFAULT false CHECK (owner_accepted = false),
    trusted_for_activation    boolean NOT NULL DEFAULT false CHECK (trusted_for_activation = false),
    created_at                timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, ordinal),
    UNIQUE (plan_id, reference_id)
);

CREATE TABLE execution_activation_compatibility_requirements (
    plan_id                   text NOT NULL REFERENCES execution_activation_plans(plan_id) ON DELETE RESTRICT,
    ordinal                   integer NOT NULL CHECK (ordinal >= 0),
    requirement_kind         text NOT NULL CHECK (requirement_kind IN (
                                'CONTRACT', 'IMAGE', 'SCHEMA', 'CAPABILITY'
                              )),
    component                 text NOT NULL CHECK (component ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    exact_revision           text NOT NULL CHECK (exact_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$'),
    expected_digest          text NOT NULL CHECK (expected_digest ~ '^sha256:[0-9a-f]{64}$'),
    created_at               timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, ordinal),
    UNIQUE (plan_id, requirement_kind, component)
);

CREATE TABLE execution_activation_events (
    event_id                  text PRIMARY KEY,
    plan_id                   text NOT NULL REFERENCES execution_activation_plans(plan_id) ON DELETE RESTRICT,
    workspace_id              text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    capability_key            text NOT NULL,
    actor_user_id             text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key               text NOT NULL,
    action                    text NOT NULL CHECK (action IN ('PLAN', 'APPLY', 'VERIFY')),
    plan_version_before       integer NOT NULL CHECK (plan_version_before >= 0),
    plan_version_after        integer NOT NULL CHECK (plan_version_after >= 1),
    capability_version_before integer NOT NULL CHECK (capability_version_before >= 1),
    capability_version_after integer NOT NULL CHECK (capability_version_after >= 1),
    result                    text NOT NULL CHECK (result IN ('READY', 'BLOCKED', 'DENIED', 'APPLIED', 'VERIFIED')),
    blocker_codes             text[] NOT NULL DEFAULT '{}',
    created_at                timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT execution_activation_event_request_unique UNIQUE (workspace_id, actor_user_id, request_key),
    CHECK (plan_version_after >= plan_version_before),
    CHECK (capability_version_after >= capability_version_before)
);

CREATE OR REPLACE FUNCTION reject_execution_activation_immutable_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'execution activation evidence/event rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_activation_evidence_immutable
BEFORE UPDATE OR DELETE ON execution_activation_evidence_refs
FOR EACH ROW EXECUTE FUNCTION reject_execution_activation_immutable_mutation();

CREATE TRIGGER execution_activation_requirement_immutable
BEFORE UPDATE OR DELETE ON execution_activation_compatibility_requirements
FOR EACH ROW EXECUTE FUNCTION reject_execution_activation_immutable_mutation();

CREATE TRIGGER execution_activation_event_immutable
BEFORE UPDATE OR DELETE ON execution_activation_events
FOR EACH ROW EXECUTE FUNCTION reject_execution_activation_immutable_mutation();

-- Down Migration
DROP TRIGGER execution_activation_event_immutable ON execution_activation_events;
DROP TRIGGER execution_activation_requirement_immutable ON execution_activation_compatibility_requirements;
DROP TRIGGER execution_activation_evidence_immutable ON execution_activation_evidence_refs;
DROP FUNCTION reject_execution_activation_immutable_mutation();
DROP TABLE execution_activation_events;
DROP TABLE execution_activation_compatibility_requirements;
DROP TABLE execution_activation_evidence_refs;
ALTER TABLE execution_activation_capabilities DROP CONSTRAINT execution_activation_capability_last_plan_fk;
DROP TABLE execution_activation_plans;
DROP TABLE execution_activation_capabilities;
