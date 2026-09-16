-- Up Migration
--
-- A4-3 · delegated Governance, as Portal-owned state.
--
-- A4-1 deliberately did NOT create this table. It froze the capability
-- namespace and left every capability owner-only, because a table the product
-- reads and cannot write is a dead read — the repository's own
-- `table-write-path` gate says so, and correctly. This is the phase that adds
-- the writer, so this is the phase that adds the table.
--
-- What it is for, in one sentence: Bobby can say that Stan may READ the R2 gate
-- without being able to DECIDE it, and the server — not a hidden menu item —
-- enforces that on every request.
--
-- §20.2 rule 8 again: additive only. No existing user, role, status, binding or
-- credential is touched.

-- ------------------------------------------------------------------ grants
--
-- One row per thing a person may do. Deliberately NOT one row per person with a
-- list of capabilities: a list is edited by rewriting it, and rewriting is how
-- a revoke and a grant issued seconds apart end up with one silently undoing
-- the other. A row per capability means revoking one is a change to one row.
CREATE TABLE portal_capability_grants (
    grant_id        text PRIMARY KEY,
    grantee_user_id text NOT NULL REFERENCES portal_users(user_id),
    -- Mirrors PORTAL_CAPABILITIES in src/repos/owner-access.ts. The CHECK is
    -- here as well as there because a namespace enforced only in TypeScript is
    -- enforced only until something writes to the database another way.
    capability      text NOT NULL CHECK (capability IN (
                        'administration.users.manage',
                        'administration.profile_access.manage',
                        'governance.r1.read',
                        'governance.r1.decide',
                        'governance.r2.read',
                        'governance.r2.decide',
                        'governance.canary.read',
                        'governance.canary.decide',
                        'governance.live.read',
                        'governance.live.decide')),
    -- NULL means "wherever this person is already a workspace member". A grant
    -- never widens workspace membership; it only says what they may do inside
    -- one they can already reach.
    workspace_id    text,
    state           text NOT NULL CHECK (state IN ('ACTIVE', 'REVOKED')),
    -- Pinned by every update, the same way an account revision is in A4-2.
    grant_revision  integer NOT NULL DEFAULT 1,
    issued_by       text NOT NULL REFERENCES portal_users(user_id),
    issued_at       timestamptz NOT NULL DEFAULT now(),
    revoked_by      text REFERENCES portal_users(user_id),
    revoked_at      timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- At most one LIVE grant of a capability to a person in a scope.
--
-- Partial on `state = 'ACTIVE'` so a revoked grant stays in the table as
-- lineage — §20.2 rule 6 forbids hard deletion — while a second active grant of
-- the same thing is impossible. `coalesce` folds the NULL scope into a sentinel
-- because NULL is never equal to NULL in a unique index, and without it "every
-- workspace" could be granted twice.
CREATE UNIQUE INDEX portal_capability_grants_active_idx
    ON portal_capability_grants (grantee_user_id, capability, coalesce(workspace_id, '*'))
    WHERE state = 'ACTIVE';

CREATE INDEX portal_capability_grants_grantee_idx
    ON portal_capability_grants (grantee_user_id, state);

COMMENT ON TABLE portal_capability_grants IS
  'A4-3 Portal-owned Governance delegation. One row per capability a person holds. Revoked rows are retained as lineage and never deleted.';
COMMENT ON COLUMN portal_capability_grants.workspace_id IS
  'Optional scope. NULL means every workspace the grantee is already a member of; a grant never confers membership.';

-- ---------------------------------------------------------- grant lineage
--
-- The immutable half. Every grant, update and revoke — and every refusal —
-- lands here with what was asked, what changed and why it did not.
CREATE TABLE portal_capability_grant_events (
    event_id           text PRIMARY KEY,
    idempotency_key    text NOT NULL UNIQUE,
    grant_id           text,
    grantee_user_id    text NOT NULL REFERENCES portal_users(user_id),
    capability         text NOT NULL,
    action             text NOT NULL CHECK (action IN ('GRANT', 'REVOKE')),
    actor_user_id      text NOT NULL REFERENCES portal_users(user_id),
    expected_revision  integer NOT NULL,
    resulting_revision integer,
    request_fingerprint text NOT NULL,
    outcome            text NOT NULL CHECK (outcome IN (
                          'APPLIED', 'REPLAYED', 'CONFLICT', 'DENIED')),
    reason_code        text,
    state_before       jsonb,
    state_after        jsonb,
    request_id         text,
    step_up_used       boolean NOT NULL DEFAULT false,
    occurred_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX portal_capability_grant_events_grantee_idx
    ON portal_capability_grant_events (grantee_user_id, occurred_at DESC);

COMMENT ON TABLE portal_capability_grant_events IS
  'A4-3 immutable lineage for every Governance delegation decision, including refusals. Never contains a credential.';

-- Down Migration
--
-- Drops only what this migration added. Every capability returns to owner-only,
-- which is exactly the A4-1 state: no account, decision or evidence row is
-- touched by the rollback.
DROP TABLE IF EXISTS portal_capability_grant_events;
DROP TABLE IF EXISTS portal_capability_grants;
