-- Up Migration
CREATE TABLE portal_users (
    user_id             text PRIMARY KEY,
    username            text NOT NULL UNIQUE,
    display_name        text NOT NULL,
    role                text NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    status              text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'DISABLED')),
    must_change_password boolean NOT NULL DEFAULT true,
    failed_login_count  integer NOT NULL DEFAULT 0,
    locked_until        timestamptz,
    session_version     integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    disabled_at         timestamptz
);

CREATE TABLE external_identity_bindings (
    binding_id      text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES portal_users(user_id) ON DELETE CASCADE,
    provider        text NOT NULL CHECK (provider IN ('cloudflare_access')),
    issuer          text NOT NULL,
    subject         text NOT NULL,
    normalized_email text NOT NULL,
    email_verified  boolean NOT NULL DEFAULT true,
    bound_at        timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz,
    UNIQUE (provider, issuer, subject),
    UNIQUE (provider, issuer, normalized_email)
);

CREATE TABLE password_credentials (
    credential_id   text PRIMARY KEY,
    user_id         text NOT NULL UNIQUE REFERENCES portal_users(user_id) ON DELETE CASCADE,
    password_hash   text NOT NULL,
    algorithm       text NOT NULL CHECK (algorithm = 'argon2id'),
    parameters_json jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    changed_at      timestamptz,
    compromised_at  timestamptz
);

CREATE TABLE activation_credentials (
    activation_id   text PRIMARY KEY,
    user_id         text NOT NULL REFERENCES portal_users(user_id) ON DELETE CASCADE,
    token_hash      text NOT NULL UNIQUE,
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    revoked_at      timestamptz,
    created_by      text
);

CREATE TABLE auth_sessions (
    session_id          text PRIMARY KEY,
    session_token_hash  text NOT NULL UNIQUE,
    user_id             text NOT NULL REFERENCES portal_users(user_id) ON DELETE CASCADE,
    access_subject      text,
    access_token_expires_at timestamptz,
    state               text NOT NULL CHECK (state IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    csrf_secret_hash    text NOT NULL,
    session_version     integer NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    idle_expires_at     timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    revoked_at          timestamptz,
    revoke_reason       text
);

CREATE TABLE auth_audit_events (
    event_id        text PRIMARY KEY,
    event_type      text NOT NULL,
    actor_user_id   text,
    target_user_id  text,
    access_subject  text,
    request_id      text,
    source_ip       text,
    user_agent_hash text,
    result          text NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED')),
    reason_code     text,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    metadata_json   jsonb
);

CREATE INDEX auth_audit_occurred_at_idx ON auth_audit_events (occurred_at DESC);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX activation_credentials_user_idx ON activation_credentials (user_id);

-- Down Migration
DROP TABLE auth_audit_events;
DROP TABLE auth_sessions;
DROP TABLE activation_credentials;
DROP TABLE password_credentials;
DROP TABLE external_identity_bindings;
DROP TABLE portal_users;
