-- Up Migration
--
-- A4-2 · the owner account lifecycle, as server-side state.
--
-- A4-2 turns /administration/users from a table that edits rows into a control
-- plane with named operations. Three things have to exist before an operation
-- can be exact: a revision the caller can pin, a record of what each operation
-- changed and how to undo it, and a short-lived proof that the owner
-- re-authenticated for a destructive one.
--
-- §20.2 rule 8 is the constraint this migration is written against: it may add
-- Portal-owned authorization state, and it may NOT alter an existing password
-- hash, Cloudflare binding, role, status or user record to make a screen
-- convenient. Every statement below is additive. There is no UPDATE, no DELETE
-- and no change to an existing CHECK, so the Bobby / Stan / Thanhvuong rows and
-- the v1.0.1 data behind them are untouched by construction, not by promise.

-- ---------------------------------------------------------------- revision
--
-- Optimistic concurrency for account writes. Every lifecycle operation names
-- the revision it believes it is acting on, and the guarded UPDATE applies only
-- if that is still true — so two owners (or two tabs) cannot interleave a reset
-- and a disable and each believe they won.
--
-- Deliberately NOT bumped by a failed login, a session-version bump or a
-- last-seen touch. Those change the row but not the account as the owner sees
-- it, and folding them in would make the owner's screen go stale every time
-- somebody mistyped a password.
ALTER TABLE portal_users
    ADD COLUMN account_revision integer NOT NULL DEFAULT 1;

-- ----------------------------------------------------------------- archive
--
-- §20.2 rule 6: "Delete" in the product means archived access. A marker rather
-- than a new status value, for two reasons: widening the status CHECK would
-- touch a constraint every existing code path already reads, and archive is
-- genuinely disable PLUS a lineage decision rather than a fourth independent
-- state. An archived account is DISABLED with `archived_at` set; the DTO
-- publishes ARCHIVED as the account state so the product language stays true.
--
-- Physical deletion is not exposed anywhere. Enable clears this and starts a
-- fresh activation journey — it never revives an old password.
ALTER TABLE portal_users
    ADD COLUMN archived_at timestamptz;

COMMENT ON COLUMN portal_users.account_revision IS
  'A4-2 optimistic-concurrency token for owner lifecycle operations. Bumped only by an account-lifecycle write, never by login bookkeeping.';
COMMENT ON COLUMN portal_users.archived_at IS
  'A4-2 archived-access marker. Archived = DISABLED + this timestamp; audit and evidence lineage are retained and no row is ever deleted.';

-- ----------------------------------------------------------------- step-up
--
-- A destructive account operation requires the owner to have re-authenticated
-- recently, not merely to hold a live session. Scoped to the session rather
-- than the user so a step-up performed in one browser does not silently
-- authorize another, and cascaded with the session so that revoking sessions
-- revokes the step-up with them.
--
-- A window rather than a single use: the owner reissuing three activations in
-- a row should re-enter a password once, not three times, and a single-use
-- token would make the third action fail for a reason that reads like a bug.
CREATE TABLE owner_step_up_grants (
    step_up_id  text PRIMARY KEY,
    session_id  text NOT NULL REFERENCES auth_sessions(session_id) ON DELETE CASCADE,
    user_id     text NOT NULL REFERENCES portal_users(user_id),
    granted_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz
);

CREATE INDEX owner_step_up_grants_session_idx
    ON owner_step_up_grants (session_id, expires_at DESC);

COMMENT ON TABLE owner_step_up_grants IS
  'A4-2 short-lived proof that the owner re-authenticated in THIS session before a destructive account operation. Never contains a credential.';

-- ------------------------------------------------- lifecycle operation log
--
-- §20.5 item 5 requires every action to carry a pre/post state record and a
-- rollback description; item 2 requires idempotency keys and a request
-- fingerprint. This table is both, and it is the reason a replay can be
-- answered truthfully instead of re-executed.
--
-- `state_before` and `state_after` hold a SANITIZED projection of the account —
-- username, display name, role, status, archived, must_change_password,
-- revision. §20.2 rule 7 forbids a password hash, an activation value, a
-- Cloudflare subject or a session id from ever reaching an audit row, and the
-- repository that writes this builds the projection explicitly rather than
-- serialising whatever it was handed.
CREATE TABLE account_lifecycle_operations (
    operation_id         text PRIMARY KEY,
    idempotency_key      text NOT NULL UNIQUE,
    action               text NOT NULL CHECK (action IN (
                             'CREATE_INVITED',
                             'UPDATE_PROFILE',
                             'ISSUE_ACTIVATION',
                             'REVOKE_SESSIONS',
                             'DISABLE',
                             'ENABLE',
                             'ARCHIVE')),
    target_user_id       text NOT NULL REFERENCES portal_users(user_id),
    actor_user_id        text NOT NULL REFERENCES portal_users(user_id),
    expected_revision    integer NOT NULL,
    resulting_revision   integer,
    -- A digest of the request payload. A replayed idempotency key carrying a
    -- DIFFERENT payload is a caller bug, not a retry, and must be refused
    -- rather than answered with the first request's result.
    request_fingerprint  text NOT NULL,
    outcome              text NOT NULL CHECK (outcome IN (
                             'APPLIED', 'REPLAYED', 'CONFLICT', 'DENIED')),
    reason_code          text,
    state_before         jsonb NOT NULL,
    state_after          jsonb,
    -- Written in the imperative, for a human reading the log during an
    -- incident: "re-enable the account and issue a fresh activation".
    rollback_description text NOT NULL,
    request_id           text,
    step_up_used         boolean NOT NULL DEFAULT false,
    occurred_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_lifecycle_operations_target_idx
    ON account_lifecycle_operations (target_user_id, occurred_at DESC);

COMMENT ON TABLE account_lifecycle_operations IS
  'A4-2 immutable owner record of every account lifecycle operation: what was asked, what it was applied to, what changed, and how to undo it. Never contains a secret.';

-- Down Migration
--
-- Reverses only what this migration added. No user, credential, binding or
-- audit row is touched, so a rollback returns the Portal to the pre-A4-2
-- control plane with every account exactly as it stands.
DROP TABLE IF EXISTS account_lifecycle_operations;
DROP TABLE IF EXISTS owner_step_up_grants;
ALTER TABLE portal_users DROP COLUMN IF EXISTS archived_at;
ALTER TABLE portal_users DROP COLUMN IF EXISTS account_revision;
