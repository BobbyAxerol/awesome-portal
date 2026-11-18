-- Pending source attempts are operational health evidence, not business
-- events. Expiry means the attempt is unproven, not that it failed.
CREATE TABLE portal_projection.manager_source_attempts (
    attempt_order BIGINT PRIMARY KEY CHECK (attempt_order > 0),
    workspace_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    deadline TIMESTAMPTZ NOT NULL
);

CREATE INDEX manager_source_attempts_scope_deadline
    ON portal_projection.manager_source_attempts (workspace_id, environment, deadline);

-- Compact expired pending rows without forgetting the newest unproven ticket.
CREATE TABLE portal_projection.manager_source_attempt_watermarks (
    workspace_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    expired_order BIGINT NOT NULL CHECK (expired_order > 0),
    PRIMARY KEY (workspace_id, environment)
);

COMMENT ON TABLE portal_projection.manager_source_attempts IS
  'Pending Manager source health attempts; expired is unknown, never a business event';
