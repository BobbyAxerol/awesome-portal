-- Up Migration
CREATE TABLE workspaces (
    workspace_id    text PRIMARY KEY,
    name            text NOT NULL,
    owner_user_id   text NOT NULL REFERENCES portal_users(user_id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
    workspace_id    text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    user_id         text NOT NULL REFERENCES portal_users(user_id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE run_read_models (
    run_id          text PRIMARY KEY,
    workspace_id    text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    owner_user_id   text NOT NULL REFERENCES portal_users(user_id) ON DELETE CASCADE,
    status          text NOT NULL,
    protocol        text,
    strategy_id     text,
    dataset_id      text,
    source_cursor   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX run_read_models_workspace_idx ON run_read_models (workspace_id);

CREATE TABLE product_audit_events (
    event_id        text PRIMARY KEY,
    event_type      text NOT NULL,
    actor_user_id   text,
    workspace_id    text,
    request_id      text,
    idempotency_key text,
    aggregate_type  text,
    aggregate_id    text,
    aggregate_version integer,
    result          text NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED', 'CONFLICT')),
    reason_code     text,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    metadata_json   jsonb
);

CREATE INDEX product_audit_occurred_at_idx ON product_audit_events (occurred_at DESC);

CREATE TABLE outbox_messages (
    message_id      text PRIMARY KEY,
    idempotency_key text NOT NULL UNIQUE,
    aggregate_type  text NOT NULL,
    aggregate_id    text,
    event_type      text NOT NULL,
    actor_user_id   text NOT NULL,
    workspace_id    text NOT NULL,
    request_id      text,
    payload_json    jsonb NOT NULL,
    response_json   jsonb,
    response_status integer,
    state           text NOT NULL CHECK (state IN ('PENDING', 'PUBLISHED', 'REPLAYED')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz
);

-- Down Migration
DROP TABLE outbox_messages;
DROP TABLE product_audit_events;
DROP TABLE run_read_models;
DROP TABLE workspace_members;
DROP TABLE workspaces;
