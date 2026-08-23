-- Up Migration
-- EX-BE-05b/F3: Portal-owned Canary envelope planning on the SGP control plane.
-- This slice is source-dark and cannot activate runtime or execute commands.

CREATE TABLE governance_canary_envelopes (
    envelope_id                          text PRIMARY KEY,
    workspace_id                        text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    deployment_id                       text NOT NULL,
    certification_id                    text NOT NULL REFERENCES governance_sandbox_certifications(certification_id) ON DELETE RESTRICT,
    promotion_plan_id                   text NOT NULL REFERENCES governance_sandbox_promotion_plans(plan_id) ON DELETE RESTRICT,
    revision                            integer NOT NULL CHECK (revision > 0),
    previous_envelope_id                text REFERENCES governance_canary_envelopes(envelope_id) ON DELETE RESTRICT,
    base_risk_profile_revision          text NOT NULL CHECK (char_length(trim(base_risk_profile_revision)) BETWEEN 1 AND 191),
    currency                            text NOT NULL CHECK (currency ~ '^[A-Z0-9]{2,12}$'),
    capital_cap                         numeric(38,18) NOT NULL CHECK (capital_cap > 0),
    gross_notional_cap                  numeric(38,18) NOT NULL CHECK (gross_notional_cap > 0),
    daily_loss_cap                      numeric(38,18) NOT NULL CHECK (daily_loss_cap > 0 AND daily_loss_cap <= capital_cap),
    max_open_orders                     integer NOT NULL CHECK (max_open_orders BETWEEN 1 AND 1000000),
    duration_days                       integer NOT NULL CHECK (duration_days BETWEEN 1 AND 90),
    status                              text NOT NULL DEFAULT 'DRAFT' CHECK (status = 'DRAFT'),
    blocker_codes                       text[] NOT NULL DEFAULT ARRAY[
                                           'PRODUCTION_COMMAND_INACTIVE',
                                           'CANARY_OWNER_GATE_REQUIRED',
                                           'LIVE_SOURCE_UNAVAILABLE',
                                           'BASE_RISK_PROFILE_UNVERIFIED'
                                         ]::text[] CHECK (
                                           blocker_codes @> ARRAY[
                                             'PRODUCTION_COMMAND_INACTIVE',
                                             'CANARY_OWNER_GATE_REQUIRED',
                                             'LIVE_SOURCE_UNAVAILABLE',
                                             'BASE_RISK_PROFILE_UNVERIFIED'
                                           ]::text[]
                                         ),
    delivery_profile                    text NOT NULL DEFAULT 'fixture' CHECK (delivery_profile = 'fixture'),
    source_integration_state            text NOT NULL DEFAULT 'UNAVAILABLE' CHECK (source_integration_state = 'UNAVAILABLE'),
    source_side_effect_requested        boolean NOT NULL DEFAULT false CHECK (source_side_effect_requested = false),
    runtime_activation_requested        boolean NOT NULL DEFAULT false CHECK (runtime_activation_requested = false),
    promotion_execution_requested       boolean NOT NULL DEFAULT false CHECK (promotion_execution_requested = false),
    production_command_active           boolean NOT NULL DEFAULT false CHECK (production_command_active = false),
    actor_user_id                       text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key                         text NOT NULL,
    request_digest                      text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
    expected_certification_version      integer NOT NULL CHECK (expected_certification_version > 0),
    evidence_set_hash                   text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    reason                              text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 8 AND 2000),
    created_at                          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT governance_canary_revision_unique UNIQUE (workspace_id, deployment_id, revision),
    CONSTRAINT governance_canary_request_key_unique UNIQUE (workspace_id, actor_user_id, request_key),
    UNIQUE (workspace_id, envelope_id)
);

CREATE INDEX governance_canary_envelopes_latest_idx
  ON governance_canary_envelopes (workspace_id, deployment_id, revision DESC, envelope_id DESC);

CREATE OR REPLACE FUNCTION enforce_governance_canary_envelope_insert() RETURNS trigger AS $$
DECLARE
  certification governance_sandbox_certifications%ROWTYPE;
  promotion governance_sandbox_promotion_plans%ROWTYPE;
  latest governance_canary_envelopes%ROWTYPE;
BEGIN
  SELECT * INTO certification
  FROM governance_sandbox_certifications
  WHERE workspace_id = NEW.workspace_id AND certification_id = NEW.certification_id
  FOR UPDATE;
  IF NOT FOUND
     OR certification.deployment_id <> NEW.deployment_id
     OR certification.workflow_state <> 'APPROVED'
     OR certification.workflow_version <> NEW.expected_certification_version
     OR certification.decided_evidence_set_hash IS DISTINCT FROM NEW.evidence_set_hash THEN
    RAISE EXCEPTION 'canary envelope certification lineage is not approved/current';
  END IF;

  SELECT * INTO promotion
  FROM governance_sandbox_promotion_plans
  WHERE plan_id = NEW.promotion_plan_id
    AND workspace_id = NEW.workspace_id
    AND certification_id = NEW.certification_id;
  IF NOT FOUND
     OR promotion.target_stage <> 'CANARY'
     OR promotion.status <> 'BLOCKED'
     OR promotion.evidence_set_hash <> NEW.evidence_set_hash THEN
    RAISE EXCEPTION 'canary envelope promotion lineage is invalid';
  END IF;

  SELECT * INTO latest
  FROM governance_canary_envelopes
  WHERE workspace_id = NEW.workspace_id AND deployment_id = NEW.deployment_id
  ORDER BY revision DESC, envelope_id DESC
  LIMIT 1;
  IF FOUND THEN
    IF NEW.revision <> latest.revision + 1
       OR NEW.previous_envelope_id IS DISTINCT FROM latest.envelope_id THEN
      RAISE EXCEPTION 'canary envelope revision/predecessor drift';
    END IF;
  ELSIF NEW.revision <> 1 OR NEW.previous_envelope_id IS NOT NULL THEN
    RAISE EXCEPTION 'first canary envelope revision must be one without predecessor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governance_canary_envelope_lineage_guard
BEFORE INSERT ON governance_canary_envelopes
FOR EACH ROW EXECUTE FUNCTION enforce_governance_canary_envelope_insert();

CREATE TRIGGER governance_canary_envelopes_append_only
BEFORE UPDATE OR DELETE ON governance_canary_envelopes
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

-- Down Migration
DROP TRIGGER governance_canary_envelopes_append_only ON governance_canary_envelopes;
DROP TRIGGER governance_canary_envelope_lineage_guard ON governance_canary_envelopes;
DROP FUNCTION enforce_governance_canary_envelope_insert();
DROP TABLE governance_canary_envelopes;
