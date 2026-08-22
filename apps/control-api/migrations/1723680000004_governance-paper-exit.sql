-- Up Migration
-- PRE-IAM-02: Portal-owned Paper Exit Review.  These records never mutate the
-- Trading System and never imply that a sandbox activation was executed.

CREATE TABLE governance_paper_exit_reviews (
    review_id                    text PRIMARY KEY,
    workspace_id                 text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    gate                         text NOT NULL DEFAULT 'PAPER_EXIT' CHECK (gate = 'PAPER_EXIT'),
    deployment_id                text NOT NULL,
    portfolio_id                 text NOT NULL,
    venue                        text NOT NULL,
    promote_to                   text NOT NULL DEFAULT 'SANDBOX_VALIDATION'
                                 CHECK (promote_to = 'SANDBOX_VALIDATION'),
    artifact_digest              text NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
    r1_approval_id               text NOT NULL,
    r2_approval_id               text NOT NULL,
    observation_policy_id        text NOT NULL,
    observation_policy_version   text NOT NULL,
    observation_policy_digest    text NOT NULL CHECK (observation_policy_digest ~ '^sha256:[0-9a-f]{64}$'),
    evidence_pack_id             text NOT NULL,
    evidence_pack_digest         text NOT NULL CHECK (evidence_pack_digest ~ '^sha256:[0-9a-f]{64}$'),
    evaluation_policy_version    text NOT NULL,
    evaluation_formula_version   text NOT NULL,
    source_snapshot_hash         text NOT NULL CHECK (source_snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
    observation_summary          text NOT NULL,
    recommendation               text NOT NULL,
    review_state                 text NOT NULL DEFAULT 'PENDING'
                                 CHECK (review_state IN (
                                   'PENDING', 'EXTENDED', 'REJECTED_TO_PAPER_HELD',
                                   'PROMOTION_AUTHORIZED'
                                 )),
    extension_days               integer CHECK (extension_days IS NULL OR extension_days = 14),
    extended_until               timestamptz,
    review_version               integer NOT NULL DEFAULT 1 CHECK (review_version >= 1),
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (review_id, workspace_id, gate)
      REFERENCES governance_approval_requests(approval_id, workspace_id, gate)
      ON DELETE RESTRICT,
    CHECK (
      (review_state = 'EXTENDED' AND extension_days = 14 AND extended_until IS NOT NULL)
      OR
      (review_state <> 'EXTENDED' AND extension_days IS NULL AND extended_until IS NULL)
    )
);

CREATE INDEX governance_paper_exit_review_lookup_idx
  ON governance_paper_exit_reviews (workspace_id, deployment_id, review_id);

CREATE TABLE governance_paper_exit_lineage (
    lineage_id       text PRIMARY KEY,
    review_id        text NOT NULL REFERENCES governance_paper_exit_reviews(review_id) ON DELETE RESTRICT,
    ordinal          integer NOT NULL CHECK (ordinal >= 0),
    kind             text NOT NULL CHECK (kind IN (
                       'ARTIFACT', 'R1_APPROVAL', 'R2_APPROVAL',
                       'OBSERVATION_POLICY', 'EVIDENCE_PACK'
                     )),
    label            text NOT NULL,
    value            text NOT NULL,
    href             text,
    digest           text CHECK (digest IS NULL OR digest ~ '^sha256:[0-9a-f]{64}$'),
    source_authority text NOT NULL CHECK (source_authority IN ('RESEARCH', 'EXECUTION', 'BROKER', 'DERIVED', 'PORTAL')),
    required         boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (review_id, ordinal),
    UNIQUE (review_id, kind)
);

CREATE TABLE governance_paper_exit_panels (
    panel_id             text PRIMARY KEY,
    review_id            text NOT NULL REFERENCES governance_paper_exit_reviews(review_id) ON DELETE RESTRICT,
    ordinal              integer NOT NULL CHECK (ordinal >= 0),
    panel_kind           text NOT NULL CHECK (panel_kind IN (
                           'OBSERVATION_COVERAGE', 'DRIFT',
                           'LIMITS_HEALTH', 'PORTFOLIO_FIT'
                         )),
    title                text NOT NULL,
    source_authority     text NOT NULL CHECK (source_authority IN ('RESEARCH', 'EXECUTION', 'BROKER', 'DERIVED')),
    source_reference     text,
    source_href          text,
    panel_state          text NOT NULL CHECK (panel_state IN (
                           'OK', 'PARTIAL', 'STALE', 'UNAVAILABLE', 'ERROR'
                         )),
    reason               text,
    as_of                timestamptz,
    freshness_state      text NOT NULL CHECK (freshness_state IN ('OK', 'STALE', 'UNKNOWN')),
    source_completeness  text NOT NULL CHECK (source_completeness IN ('EVENT_SOURCED', 'POLL_BOUNDED', 'UNKNOWN')),
    poll_interval_ms     integer CHECK (poll_interval_ms IS NULL OR poll_interval_ms BETWEEN 100 AND 3600000),
    formula_version      text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (review_id, ordinal),
    UNIQUE (review_id, panel_kind),
    CHECK ((source_completeness = 'POLL_BOUNDED') = (poll_interval_ms IS NOT NULL)),
    CHECK ((panel_state = 'OK' AND reason IS NULL) OR (panel_state <> 'OK' AND reason IS NOT NULL)),
    CHECK ((freshness_state = 'OK' AND as_of IS NOT NULL) OR freshness_state <> 'OK')
);

CREATE TABLE governance_paper_exit_findings (
    finding_id       text PRIMARY KEY,
    review_id        text NOT NULL REFERENCES governance_paper_exit_reviews(review_id) ON DELETE RESTRICT,
    panel_id         text NOT NULL REFERENCES governance_paper_exit_panels(panel_id) ON DELETE RESTRICT,
    ordinal          integer NOT NULL CHECK (ordinal >= 0),
    metric_key       text NOT NULL,
    label            text NOT NULL,
    outcome          text NOT NULL CHECK (outcome IN ('PASS', 'WATCH', 'FAIL', 'INSUFFICIENT')),
    blocking         boolean NOT NULL,
    required         boolean NOT NULL DEFAULT true,
    carries_to       text,
    exact_value      text,
    unit             text,
    currency         text,
    threshold_value  text,
    source_label     text,
    source_href      text,
    evidence_hash    text CHECK (evidence_hash IS NULL OR evidence_hash ~ '^sha256:[0-9a-f]{64}$'),
    formula_version  text,
    as_of            timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (panel_id, ordinal),
    UNIQUE (review_id, metric_key),
    CHECK (NOT blocking OR outcome IN ('FAIL', 'INSUFFICIENT')),
    CHECK ((outcome = 'INSUFFICIENT' AND carries_to IS NOT NULL) OR outcome <> 'INSUFFICIENT')
);

CREATE TABLE governance_paper_exit_decision_plans (
    operation_id             text PRIMARY KEY,
    workspace_id             text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    review_id                text NOT NULL REFERENCES governance_paper_exit_reviews(review_id) ON DELETE RESTRICT,
    actor_user_id            text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    request_key              text NOT NULL,
    command_type             text NOT NULL CHECK (command_type = 'GOVERNANCE_PAPER_EXIT_DECISION'),
    command_version          integer NOT NULL CHECK (command_version = 1),
    payload_hash             text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
    decision                 text NOT NULL CHECK (decision IN ('PROMOTE', 'EXTEND_OBSERVATION', 'REJECT')),
    reason                   text NOT NULL,
    extension_days           integer,
    expected_review_version  integer NOT NULL CHECK (expected_review_version >= 1),
    evidence_set_hash        text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    source_snapshot_hash     text NOT NULL CHECK (source_snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
    evidence_hashes          text[] NOT NULL,
    evaluation_state         text NOT NULL CHECK (evaluation_state IN ('MET', 'UNMET', 'PARTIAL', 'STALE', 'UNAVAILABLE')),
    blocker_codes            text[] NOT NULL DEFAULT '{}',
    warning_codes            text[] NOT NULL DEFAULT '{}',
    apply_key_id             text NOT NULL,
    apply_token_hash         text NOT NULL CHECK (apply_token_hash ~ '^[0-9a-f]{64}$'),
    status                   text NOT NULL CHECK (status IN ('PLANNED', 'APPLIED', 'EXPIRED')),
    response_json            jsonb,
    expires_at               timestamptz NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    applied_at               timestamptz,
    UNIQUE (workspace_id, actor_user_id, request_key),
    CHECK (
      (decision = 'EXTEND_OBSERVATION' AND extension_days = 14)
      OR
      (decision <> 'EXTEND_OBSERVATION' AND extension_days IS NULL)
    ),
    CHECK (expires_at > created_at),
    CHECK ((status = 'APPLIED' AND applied_at IS NOT NULL) OR (status <> 'APPLIED' AND applied_at IS NULL))
);

CREATE INDEX governance_paper_exit_plans_review_idx
  ON governance_paper_exit_decision_plans (review_id, created_at DESC);

CREATE TABLE governance_paper_exit_decisions (
    decision_id           text PRIMARY KEY,
    operation_id          text NOT NULL UNIQUE REFERENCES governance_paper_exit_decision_plans(operation_id) ON DELETE RESTRICT,
    workspace_id          text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    review_id             text NOT NULL UNIQUE REFERENCES governance_paper_exit_reviews(review_id) ON DELETE RESTRICT,
    actor_user_id         text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    actor_username        text NOT NULL,
    decision              text NOT NULL CHECK (decision IN ('PROMOTE', 'EXTEND_OBSERVATION', 'REJECT')),
    reason                text NOT NULL,
    extension_days        integer,
    evidence_set_hash     text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    source_snapshot_hash  text NOT NULL CHECK (source_snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
    review_version_before integer NOT NULL CHECK (review_version_before >= 1),
    review_version_after  integer NOT NULL CHECK (review_version_after = review_version_before + 1),
    resulting_state       text NOT NULL CHECK (resulting_state IN (
                            'EXTENDED', 'REJECTED_TO_PAPER_HELD', 'PROMOTION_AUTHORIZED'
                          )),
    decided_at            timestamptz NOT NULL DEFAULT now(),
    CHECK (
      (decision = 'EXTEND_OBSERVATION' AND extension_days = 14 AND resulting_state = 'EXTENDED')
      OR
      (decision = 'PROMOTE' AND extension_days IS NULL AND resulting_state = 'PROMOTION_AUTHORIZED')
      OR
      (decision = 'REJECT' AND extension_days IS NULL AND resulting_state = 'REJECTED_TO_PAPER_HELD')
    )
);

CREATE TABLE governance_promotion_authority_grants (
    grant_id              text PRIMARY KEY,
    workspace_id          text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
    review_id             text NOT NULL UNIQUE REFERENCES governance_paper_exit_reviews(review_id) ON DELETE RESTRICT,
    deployment_id         text NOT NULL,
    target_stage          text NOT NULL CHECK (target_stage = 'SANDBOX_VALIDATION'),
    grant_state           text NOT NULL CHECK (grant_state = 'AVAILABLE'),
    evidence_set_hash     text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
    source_snapshot_hash  text NOT NULL CHECK (source_snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
    policy_version        text NOT NULL,
    created_by_user_id    text NOT NULL REFERENCES portal_users(user_id) ON DELETE RESTRICT,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER governance_paper_exit_lineage_immutable
BEFORE UPDATE OR DELETE ON governance_paper_exit_lineage
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE TRIGGER governance_paper_exit_panels_immutable
BEFORE UPDATE OR DELETE ON governance_paper_exit_panels
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE TRIGGER governance_paper_exit_findings_immutable
BEFORE UPDATE OR DELETE ON governance_paper_exit_findings
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE TRIGGER governance_paper_exit_decisions_immutable
BEFORE UPDATE OR DELETE ON governance_paper_exit_decisions
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

CREATE TRIGGER governance_promotion_grants_immutable
BEFORE UPDATE OR DELETE ON governance_promotion_authority_grants
FOR EACH ROW EXECUTE FUNCTION reject_governance_immutable_mutation();

-- Down Migration
DROP TRIGGER governance_promotion_grants_immutable ON governance_promotion_authority_grants;
DROP TRIGGER governance_paper_exit_decisions_immutable ON governance_paper_exit_decisions;
DROP TRIGGER governance_paper_exit_findings_immutable ON governance_paper_exit_findings;
DROP TRIGGER governance_paper_exit_panels_immutable ON governance_paper_exit_panels;
DROP TRIGGER governance_paper_exit_lineage_immutable ON governance_paper_exit_lineage;
DROP TABLE governance_promotion_authority_grants;
DROP TABLE governance_paper_exit_decisions;
DROP TABLE governance_paper_exit_decision_plans;
DROP TABLE governance_paper_exit_findings;
DROP TABLE governance_paper_exit_panels;
DROP TABLE governance_paper_exit_lineage;
DROP TABLE governance_paper_exit_reviews;
