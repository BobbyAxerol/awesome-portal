-- Research Loop P06 · durable scheduler authority.
--
-- This is deliberately additive to P03/P05. PostgreSQL owns logical job
-- identity, claim/lease fencing and the transactional outbox; a Python child
-- receives only a bounded launch receipt and never receives a database or
-- broker credential. No Execution-owned table, runtime or command is touched.

ALTER TABLE research.jobs
  ADD COLUMN IF NOT EXISTS logical_work_key text,
  -- P03 compatibility rows remain NULL. P06 admits only a new job whose
  -- producer supplies an exact canonical work digest; P10 owns converting the
  -- named browser producer rather than silently guessing old work identity.
  ADD COLUMN IF NOT EXISTS work_digest text
    CHECK (work_digest IS NULL OR work_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS readiness_class text NOT NULL DEFAULT 'MANDATORY'
    CHECK (readiness_class IN ('MANDATORY', 'OPTIONAL')),
  ADD COLUMN IF NOT EXISTS attempt_limit integer NOT NULL DEFAULT 3
    CHECK (attempt_limit BETWEEN 1 AND 8),
  ADD COLUMN IF NOT EXISTS retry_not_before timestamptz,
  ADD COLUMN IF NOT EXISTS current_worker_attempt_id text,
  ADD COLUMN IF NOT EXISTS current_lease_epoch bigint
    CHECK (current_lease_epoch IS NULL OR current_lease_epoch > 0),
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_reason text;

-- P03 rows predate P06 logical-work identity.  Their immutable command ID is
-- the only safe default; P06 never rewrites their payload or creates work.
UPDATE research.jobs
   SET logical_work_key = command_id
 WHERE logical_work_key IS NULL;

ALTER TABLE research.jobs
  ALTER COLUMN logical_work_key SET NOT NULL,
  ADD CONSTRAINT research_jobs_logical_work_key_check
    CHECK (length(trim(logical_work_key)) BETWEEN 1 AND 256);

ALTER TABLE research.jobs
  DROP CONSTRAINT IF EXISTS research_jobs_state_check,
  DROP CONSTRAINT IF EXISTS jobs_state_check,
  ADD CONSTRAINT research_jobs_state_check
    CHECK (state IN (
      'QUEUED', 'CLAIMED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED',
      'SUCCEEDED', 'FAILED', 'CANCELLED'
    ));

ALTER TABLE research.jobs
  ADD CONSTRAINT research_jobs_current_worker_attempt_fkey
  FOREIGN KEY (workspace_id, current_worker_attempt_id)
  REFERENCES research.worker_attempts(workspace_id, worker_attempt_id);

CREATE UNIQUE INDEX research_jobs_logical_work_idx
  ON research.jobs (workspace_id, run_id, logical_work_key);

CREATE INDEX research_jobs_p06_claim_idx
  ON research.jobs (
    workspace_id, state, queue_class, retry_not_before,
    created_at, requested_by_user_id, job_id
  )
  WHERE state IN ('QUEUED', 'RETRY_WAIT', 'CANCEL_REQUESTED');

CREATE TABLE research.scheduler_fairness (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  requested_by_user_id  text NOT NULL REFERENCES portal_users(user_id),
  last_claimed_at       timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  claim_count           bigint NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
  PRIMARY KEY (workspace_id, requested_by_user_id)
);

CREATE TABLE research.job_outbox (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  outbox_id             text NOT NULL,
  job_id                text NOT NULL,
  delivery_generation   integer NOT NULL DEFAULT 1 CHECK (delivery_generation > 0),
  event_type            text NOT NULL CHECK (event_type IN (
                         'RESEARCH_JOB_QUEUED', 'RESEARCH_JOB_RETRY_READY',
                         'RESEARCH_JOB_CANCELLED')),
  payload_digest        text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  payload               jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  -- `CLAIMED` is a short publisher lease, not a delivery acknowledgement.
  -- A crashed publisher becomes eligible again after claim_expires_at, so a
  -- NATS outage cannot strand the durable intent or require a second queue.
  state                 text NOT NULL CHECK (state IN ('PENDING', 'CLAIMED', 'DELIVERED', 'ABANDONED')),
  available_at          timestamptz NOT NULL DEFAULT now(),
  claim_token           text,
  claim_expires_at      timestamptz,
  delivered_at          timestamptz,
  delivery_attempts     integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, outbox_id),
  UNIQUE (workspace_id, job_id, event_type, delivery_generation),
  FOREIGN KEY (workspace_id, job_id)
    REFERENCES research.jobs(workspace_id, job_id),
  CHECK (octet_length(payload::text) <= 16384),
  CHECK ((state = 'DELIVERED') = (delivered_at IS NOT NULL)),
  CHECK ((state = 'CLAIMED') = (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)),
  CHECK (state <> 'CLAIMED' OR claim_expires_at > available_at)
);

CREATE INDEX research_job_outbox_pending_idx
  ON research.job_outbox (workspace_id, state, available_at, created_at, outbox_id)
  WHERE state = 'PENDING';

CREATE TABLE research.job_events (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  job_event_id          text NOT NULL,
  job_id                text NOT NULL,
  worker_attempt_id     text,
  event_type            text NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 160),
  event_payload         jsonb NOT NULL DEFAULT '{}'::jsonb
                         CHECK (jsonb_typeof(event_payload) = 'object'),
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, job_event_id),
  FOREIGN KEY (workspace_id, job_id)
    REFERENCES research.jobs(workspace_id, job_id),
  FOREIGN KEY (workspace_id, worker_attempt_id)
    REFERENCES research.worker_attempts(workspace_id, worker_attempt_id),
  CHECK (octet_length(event_payload::text) <= 16384)
);

CREATE INDEX research_job_events_job_idx
  ON research.job_events (workspace_id, job_id, occurred_at, job_event_id);

CREATE TRIGGER research_job_events_immutable_guard
BEFORE UPDATE OR DELETE ON research.job_events
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.prevent_immutable_log_mutation() FROM PUBLIC;

-- P06 needs only scheduler lifecycle columns.  It does not receive DELETE,
-- DDL, broad public-schema access, broker credentials or Execution authority.
GRANT SELECT, INSERT ON research.scheduler_fairness, research.job_outbox,
  research.job_events TO portal_research_runtime;
GRANT UPDATE (state, retry_not_before, current_worker_attempt_id,
  current_lease_epoch, cancellation_requested_at, cancel_version, terminal_reason, updated_at)
  ON research.jobs TO portal_research_runtime;
GRANT UPDATE (state, expires_at, exit_reason, measured_usage, staging_ref,
  updated_at) ON research.worker_attempts TO portal_research_runtime;
GRANT UPDATE (state, claim_token, claim_expires_at, delivered_at, delivery_attempts, updated_at)
  ON research.job_outbox TO portal_research_runtime;
GRANT UPDATE (last_claimed_at, claim_count)
  ON research.scheduler_fairness TO portal_research_runtime;
GRANT UPDATE (state, updated_at, state_version)
  ON research.runs TO portal_research_runtime;
GRANT UPDATE (state, updated_at)
  ON research.attempts TO portal_research_runtime;

COMMENT ON TABLE research.job_outbox IS
  'P06 transactional ID-only Research scheduler outbox; no request body, secret or execution input is published.';
COMMENT ON TABLE research.job_events IS
  'P06 immutable scheduler transition ledger; logical jobs and worker attempts remain distinct.';
COMMENT ON TABLE research.scheduler_fairness IS
  'P06 bounded per-workspace requester fairness cursor; it is scheduler metadata, not a user priority override.';
COMMENT ON COLUMN research.jobs.readiness_class IS
  'P06 explicit mandatory/optional evidence classification; P11 owns the later readiness aggregate.';
COMMENT ON COLUMN research.jobs.work_digest IS
  'P06 SHA-256 canonical work identity for new durable jobs; NULL only for pre-P06 compatibility rows.';

-- Down Migration
-- Intentionally no-op: P06 job/audit evidence and P05-compatible references
-- are retained for recovery; rollback pauses claims rather than deleting proof.
SELECT 1;
