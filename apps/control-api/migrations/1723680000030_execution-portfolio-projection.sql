-- Up Migration
--
-- PHASE 7 (round 2): the portfolio list was the last browser read that called
-- the source on the request path.
--
-- `alphas` and `broker-bindings` are served from a committed local projection;
-- `portfolios` drained live, two relations across three environments, on every
-- page load. Measured on dev: p50 334 ms and p95 433 ms for a 1,214-byte
-- response — the time is a round trip to the Execution Cell, not the payload.
-- It also broke Phase 7's central invariant directly: a browser refresh must
-- not add an Edge request, because the local projection exists so the cell
-- sees worker cadence and nothing else.
--
-- This mirrors `execution_binding_projection` exactly: rows keyed by scope,
-- replaced inside one advisory-locked transaction, with the snapshot row
-- carrying freshness and completeness.
CREATE TABLE execution_portfolio_projection (
    scope_id                 text NOT NULL,
    workspace_id             text NOT NULL,
    environment              text NOT NULL,
    portfolio_id             text NOT NULL,
    name                     text NOT NULL,
    owner                    text,
    state                    text NOT NULL,
    base_currency            text NOT NULL,
    -- Which source environments published this identity. A portfolio can be
    -- named by more than one, and the list says which rather than picking one.
    environments             jsonb NOT NULL DEFAULT '[]'::jsonb,
    allocation_count         integer NOT NULL,
    deployment_count         integer NOT NULL,
    -- Exact decimal strings per currency, never a float and never summed
    -- across currencies.
    allocated_by_currency    jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at               timestamptz NOT NULL,
    source_as_of             timestamptz,
    projection_refreshed_at  timestamptz NOT NULL,
    PRIMARY KEY (scope_id, portfolio_id)
);

CREATE INDEX execution_portfolio_projection_scope_idx
    ON execution_portfolio_projection (scope_id, portfolio_id);

-- The snapshot row for this projection needs its kind admitted. The original
-- CHECK listed exactly the two kinds that existed, which is the right way to
-- write it — a new kind should have to say so here rather than slipping in as
-- free text. The backend suite caught the omission on the first run.
ALTER TABLE execution_manager_projection_snapshots
    DROP CONSTRAINT execution_manager_projection_snapshots_projection_kind_check;

ALTER TABLE execution_manager_projection_snapshots
    ADD CONSTRAINT execution_manager_projection_snapshots_projection_kind_check
    CHECK (projection_kind IN ('ALPHA_FLEET', 'BINDINGS', 'PORTFOLIOS'));

-- Down Migration
DELETE FROM execution_manager_projection_snapshots WHERE projection_kind = 'PORTFOLIOS';

ALTER TABLE execution_manager_projection_snapshots
    DROP CONSTRAINT execution_manager_projection_snapshots_projection_kind_check;

ALTER TABLE execution_manager_projection_snapshots
    ADD CONSTRAINT execution_manager_projection_snapshots_projection_kind_check
    CHECK (projection_kind IN ('ALPHA_FLEET', 'BINDINGS'));

DROP TABLE IF EXISTS execution_portfolio_projection;
