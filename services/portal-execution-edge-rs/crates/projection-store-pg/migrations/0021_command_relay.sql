-- Portal-owned delivery/correlation, NEVER a TS economic command ledger.
-- Additive: existing F0 BLOCKED plans and read projections are untouched.
CREATE TABLE portal_projection.command_relay_limits (
    ledger_id text PRIMARY KEY CHECK (length(ledger_id) BETWEEN 1 AND 128),
    max_commands bigint NOT NULL CHECK (max_commands BETWEEN 1 AND 1000000),
    command_count bigint NOT NULL DEFAULT 0 CHECK (command_count >= 0 AND command_count <= max_commands)
);
CREATE TABLE portal_projection.command_relay (
    command_id uuid PRIMARY KEY,
    ledger_id text NOT NULL REFERENCES portal_projection.command_relay_limits(ledger_id),
    workspace_id text NOT NULL,
    environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
    profile_id text NOT NULL,
    authority_scope_id text NOT NULL,
    actor_id text NOT NULL,
    workload_id text NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb NOT NULL CHECK (octet_length(payload::text) <= 131072),
    payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[a-f0-9]{64}$'),
    request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[a-f0-9]{64}$'),
    delivery text NOT NULL CHECK (delivery IN
        ('PREPARED','SENDING','ACKNOWLEDGED','DELIVERY_UNKNOWN','FAILED_BEFORE_SEND')),
    dispatch_token uuid,
    source_ref text,
    source_revision bigint CHECK (source_revision >= 0),
    business_state text,
    receipt jsonb CHECK (octet_length(receipt::text) <= 2097152),
    receipt_digest text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (ledger_id,workspace_id,environment,profile_id,authority_scope_id,operation,idempotency_key),
    UNIQUE (ledger_id,request_digest),
    CHECK ((source_ref IS NULL AND source_revision IS NULL AND business_state IS NULL
            AND receipt IS NULL AND receipt_digest IS NULL)
        OR (source_ref IS NOT NULL AND source_revision IS NOT NULL AND business_state IS NOT NULL
            AND receipt IS NOT NULL AND receipt_digest IS NOT NULL
            AND receipt_digest ~ '^sha256:[a-f0-9]{64}$')),
    CHECK ((delivery = 'PREPARED' AND dispatch_token IS NULL)
        OR (delivery <> 'PREPARED' AND dispatch_token IS NOT NULL))
);
CREATE INDEX command_relay_status ON portal_projection.command_relay
    (ledger_id,delivery,updated_at,command_id);
-- No automatic DELETE/TTL: unresolved intent/key/receipt survives a rollback or
-- source-retention outage. A finite shared quota fails new admission closed;
-- operators must supply a qualified retention/compaction policy before growth.
