-- Up Migration
--
-- A4-1 · one owner, as a server-side fact.
--
-- §20.2 rule 1: "Bobby-only is a server fact." Until now the only ownership
-- signal was `portal_users.role = 'ADMIN'`, which is a coarse two-value product
-- role shared by every administrator (finding A4-F06). A username comparison, a
-- hidden nav item or an ADMIN badge must never authorize a write, so the owner
-- has to exist as its own row that authorization can read.
--
-- Cardinality is enforced by the schema, not by convention: `anchor_id` is
-- CHECK-constrained to a single legal value and is the primary key, so a second
-- owner row cannot be inserted at all. A campaign that needs two owners needs a
-- new migration and a new decision, not an accidental second INSERT.
--
-- This migration is deliberately EMPTY of data. §20.2 rule 8 forbids a
-- migration that alters an existing password hash, binding, role or status to
-- make the UI convenient, and claiming an owner is exactly the kind of decision
-- that must be an explicit operator action rather than a schema side effect.
-- The row is written by the protected bootstrap CLI (`--file` input on the
-- deploy host), never by a public API. Until it is claimed, owner-only
-- administration fails closed; ordinary login and existing ADMIN routes are
-- untouched, so an unclaimed anchor cannot lock anybody out of the Portal.
CREATE TABLE portal_owner_anchor (
    anchor_id   text PRIMARY KEY CHECK (anchor_id = 'PORTAL_OWNER'),
    user_id     text NOT NULL UNIQUE REFERENCES portal_users(user_id),
    claimed_at  timestamptz NOT NULL DEFAULT now(),
    claimed_by  text
);

COMMENT ON TABLE portal_owner_anchor IS
  'A4-1 singleton Portal owner principal; the only server-side source of owner authority. Claimed by the protected bootstrap CLI, never by an API.';
COMMENT ON COLUMN portal_owner_anchor.anchor_id IS
  'CHECK-constrained to one value so a second owner cannot be inserted.';
COMMENT ON COLUMN portal_owner_anchor.user_id IS
  'References an existing portal_users row. ON DELETE is intentionally omitted: the owner row must not disappear because of a cascade, and A4 forbids hard-deleting users at all.';

-- The capability-grant table is deliberately NOT created here.
--
-- A4-1 freezes the owner, capability, mutation-security and audit SEMANTICS;
-- A4-3 is the phase that adds Portal-owned governance grants and the owner-only
-- endpoints that write them. Creating the table a phase early would leave a
-- table the product reads and cannot write to — which the repository's own
-- `table-write-path` gate correctly rejects as a dead read, and which §20.3
-- makes unnecessary: in A4 every capability starts owner-only anyway.

-- Down Migration
-- Dropping the anchor removes only the Portal's record of who the owner is; it
-- restores the pre-A4 state in which `role = 'ADMIN'` is the coarse check. No
-- user, credential or binding is touched by this rollback.
DROP TABLE IF EXISTS portal_owner_anchor;
