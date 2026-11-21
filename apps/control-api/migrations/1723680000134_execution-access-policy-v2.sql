-- Up Migration
-- Additive Portal application policy only. No user/grant/config seed, no TS ledger.
CREATE TABLE portal_access_policy_state (
  workspace_id text PRIMARY KEY REFERENCES workspaces(workspace_id),
  revision text NOT NULL,
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy)='object'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (policy->>'workspace_id'=workspace_id AND policy->>'revision'=revision)
);
CREATE TABLE portal_access_grants_v2 (
  grant_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  subject_user_id text NOT NULL REFERENCES portal_users(user_id),
  issued_by text NOT NULL REFERENCES portal_users(user_id),
  parent_grant_id text REFERENCES portal_access_grants_v2(grant_id),
  revision text NOT NULL,
  grant_fact jsonb NOT NULL CHECK (jsonb_typeof(grant_fact)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (grant_fact->>'grant_id'=grant_id AND grant_fact->>'workspace_id'=workspace_id
    AND grant_fact->>'subject_user_id'=subject_user_id AND grant_fact->>'issued_by'=issued_by
    AND grant_fact->>'revision'=revision),
  CHECK (octet_length(grant_fact::text)<=65536)
);
CREATE INDEX portal_access_grants_v2_subject ON portal_access_grants_v2(workspace_id,subject_user_id,grant_id);
CREATE INDEX portal_access_grants_v2_parent ON portal_access_grants_v2(parent_grant_id);
CREATE TABLE portal_access_proposals (
  proposal_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  idempotency_digest text NOT NULL,
  actor_user_id text NOT NULL REFERENCES portal_users(user_id),
  subject_user_id text NOT NULL REFERENCES portal_users(user_id),
  grant_id text REFERENCES portal_access_grants_v2(grant_id),
  request_digest text NOT NULL,
  change jsonb NOT NULL CHECK (jsonb_typeof(change)='object'),
  state text NOT NULL CHECK (state IN ('APP_APPLIED','TS_PENDING','TS_APPLIED','TS_REJECTED','TS_UNKNOWN','REVOKED')),
  submission_receipt jsonb NOT NULL CHECK (jsonb_typeof(submission_receipt)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id,idempotency_digest),
  CHECK (octet_length(change::text)<=65536 AND octet_length(submission_receipt::text)<=131072)
);
CREATE INDEX portal_access_proposals_subject ON portal_access_proposals(workspace_id,subject_user_id,created_at DESC,proposal_id);
CREATE TABLE portal_access_policy_events (
  event_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(workspace_id),
  actor_user_id text REFERENCES portal_users(user_id),
  subject_user_id text REFERENCES portal_users(user_id),
  operation text NOT NULL CHECK (operation IN ('POLICY_INSTALL','PROPOSE','REVOKE','TS_RECEIPT','DENIED','STEP_UP')),
  key_digest text,
  request_digest text NOT NULL,
  policy_revision text,
  grant_id text,
  proposal_id text,
  source text,
  source_receipt_id text,
  before_fact jsonb,
  after_fact jsonb,
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id,key_digest),
  UNIQUE (source,source_receipt_id),
  CHECK (octet_length(receipt::text)<=131072)
);
CREATE INDEX portal_access_policy_events_subject ON portal_access_policy_events(workspace_id,subject_user_id,occurred_at DESC,event_id DESC);
CREATE FUNCTION portal_access_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Portal access audit receipts are immutable'; END $$;
CREATE TRIGGER portal_access_policy_events_immutable BEFORE UPDATE OR DELETE ON portal_access_policy_events
  FOR EACH ROW EXECUTE FUNCTION portal_access_immutable_event();
CREATE FUNCTION portal_access_preserve_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.proposal_id,NEW.workspace_id,NEW.idempotency_digest,NEW.actor_user_id,NEW.subject_user_id,
      NEW.grant_id,NEW.request_digest,NEW.change,NEW.submission_receipt,NEW.created_at)
     IS DISTINCT FROM
     (OLD.proposal_id,OLD.workspace_id,OLD.idempotency_digest,OLD.actor_user_id,OLD.subject_user_id,
      OLD.grant_id,OLD.request_digest,OLD.change,OLD.submission_receipt,OLD.created_at)
  THEN RAISE EXCEPTION 'Portal access submission receipts are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER portal_access_proposal_preserve BEFORE UPDATE ON portal_access_proposals
  FOR EACH ROW EXECUTE FUNCTION portal_access_preserve_proposal();
COMMENT ON TABLE portal_access_policy_events IS 'Portal workflow immutable receipts; no credentials; retained with authority history, no automatic TTL deletion.';
COMMENT ON TABLE portal_access_grants_v2 IS 'Portal scoped policy, not Trading System economic/membership authority; TS-dependent grants fail closed until verified receipt.';

-- Down Migration
-- Application rollback must disable new writes; destructive down is not an operational rollback.
DROP TRIGGER portal_access_proposal_preserve ON portal_access_proposals;
DROP FUNCTION portal_access_preserve_proposal();
DROP TRIGGER portal_access_policy_events_immutable ON portal_access_policy_events;
DROP FUNCTION portal_access_immutable_event();
DROP TABLE portal_access_policy_events;
DROP TABLE portal_access_proposals;
DROP TABLE portal_access_grants_v2;
DROP TABLE portal_access_policy_state;
