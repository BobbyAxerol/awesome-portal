-- Health is separate from successful observations, which must remain available
-- for monotonicity checks and are not evidence of later poll outcomes.
-- CACHE 1 is required: ticket order is the database's issue order, not a clock.
CREATE SEQUENCE portal_projection.manager_source_health_order AS BIGINT CACHE 1;

CREATE TABLE portal_projection.manager_source_health (
    epoch_id UUID PRIMARY KEY REFERENCES portal_projection.epochs(epoch_id) ON DELETE CASCADE,
    last_failure_order BIGINT NOT NULL DEFAULT 0 CHECK (last_failure_order >= 0),
    cleared_by_attempt BIGINT NOT NULL DEFAULT 0 CHECK (cleared_by_attempt >= 0),
    sealed_observed_at TIMESTAMPTZ,
    sealed_sequence BIGINT CHECK (sealed_sequence >= 0),
    CHECK ((sealed_observed_at IS NULL) = (sealed_sequence IS NULL)),
    CHECK (cleared_by_attempt = 0 OR sealed_observed_at IS NOT NULL)
);

COMMENT ON TABLE portal_projection.manager_source_health IS
  'Bounded Manager poll-health order; not a business event sequence or source authority';
