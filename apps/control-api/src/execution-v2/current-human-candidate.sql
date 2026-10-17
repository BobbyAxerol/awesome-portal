-- ELP2-10 UNMOUNTED candidate installer. NOT a numbered production migration.
-- Apply only to an isolated, explicitly allocated Core correctness database.
-- Existing identity/policy tables remain the SSOT. No credentials or rights seed.
BEGIN;
CREATE SCHEMA elp210_candidate;
REVOKE ALL ON SCHEMA elp210_candidate FROM PUBLIC;
CREATE TABLE elp210_candidate.authority (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  lease_epoch bigint NOT NULL DEFAULT 0 CHECK (lease_epoch BETWEEN 0 AND 9007199254740991),
  drain_id text CHECK (drain_id IS NULL OR length(drain_id) BETWEEN 1 AND 128)
);
INSERT INTO elp210_candidate.authority(singleton) VALUES(true);
CREATE TABLE elp210_candidate.leases (
  lease_id text PRIMARY KEY,
  authority_revision bigint NOT NULL,
  subject_id text NOT NULL,
  session_id text NOT NULL,
  session_revision bigint NOT NULL,
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  workload_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[a-f0-9]{64}$'),
  authority_fingerprint text NOT NULL,
  issued_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=60000),
  phase text NOT NULL DEFAULT 'ISSUED' CHECK (phase IN ('ISSUED','ENTERED','UNKNOWN','COMMITTED','ROLLED_BACK','RETIRED')),
  attempt_id text,
  terminal_receipt_digest text,
  CHECK ((phase='ISSUED' AND attempt_id IS NULL AND terminal_receipt_digest IS NULL)
    OR (phase IN ('ENTERED','UNKNOWN') AND attempt_id IS NOT NULL AND terminal_receipt_digest IS NULL)
    OR (phase IN ('COMMITTED','ROLLED_BACK') AND attempt_id IS NOT NULL AND terminal_receipt_digest IS NOT NULL)
    OR (phase='RETIRED' AND attempt_id IS NULL AND terminal_receipt_digest IS NULL))
);
CREATE INDEX leases_unresolved ON elp210_candidate.leases(phase,expires_at_ms)
  WHERE phase IN ('ISSUED','ENTERED','UNKNOWN');
-- NC-01: fresh DISPOSABLE candidate schema only, not a production migration.
-- A native ISSUE can commit before ENTER. Every native row blocks drain from
-- admission onward. Default CUSTODY_ONLY remains nonreleasable; opt-in
-- MANAGER_HTTP releases only after actual authenticated native ACK is durable.
CREATE TABLE elp210_candidate.native_read_obligations (
  lease_id text PRIMARY KEY CHECK (lease_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  attempt_id text UNIQUE NOT NULL CHECK (attempt_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  authority_revision bigint NOT NULL CHECK (authority_revision BETWEEN 0 AND 9007199254740991),
  subject_id text NOT NULL, session_id text NOT NULL,
  session_revision bigint NOT NULL CHECK (session_revision BETWEEN 0 AND 9007199254740991),
  workspace_id text NOT NULL, environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  workload_id text NOT NULL,
  request_digest text NOT NULL CHECK (length(request_digest)=64 AND request_digest ~ '^[a-f0-9]{64}$'),
  authority_fingerprint text NOT NULL CHECK (length(authority_fingerprint)=71 AND authority_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  source_identity_digest text NOT NULL CHECK (length(source_identity_digest)=71 AND source_identity_digest ~ '^sha256:[a-f0-9]{64}$'),
  base_body text NOT NULL CHECK (octet_length(base_body) BETWEEN 1 AND 32768),
  stable_core_digest text NOT NULL CHECK (length(stable_core_digest)=64 AND stable_core_digest ~ '^[a-f0-9]{64}$'),
  binding_digest text NOT NULL CHECK (length(binding_digest)=64 AND binding_digest ~ '^[a-f0-9]{64}$'),
  deadline text NOT NULL CHECK (deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+]00:00)$'),
  issued_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=60000),
  CHECK (expires_at_ms=floor(extract(epoch FROM deadline::timestamptz)*1000)::bigint),

  lifecycle_kind text NOT NULL DEFAULT 'CUSTODY_ONLY' CHECK(lifecycle_kind IN('CUSTODY_ONLY','MANAGER_HTTP')),
  sender_id text CHECK(length(sender_id)=36 AND sender_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  scope_digest text CHECK(length(scope_digest)=71 AND scope_digest ~ '^sha256:[a-f0-9]{64}$'),
  no_send_fenced boolean NOT NULL DEFAULT false,
  native_source_digest text CHECK(length(native_source_digest)=64 AND native_source_digest ~ '^[a-f0-9]{64}$'),
  native_source_fingerprint text CHECK(length(native_source_fingerprint)=64 AND native_source_fingerprint ~ '^[a-f0-9]{64}$'),
  native_valid_until_ms bigint CHECK(native_valid_until_ms>=0 AND native_valid_until_ms<=expires_at_ms),
  issue_response_digest text CHECK(length(issue_response_digest)=71 AND issue_response_digest ~ '^sha256:[a-f0-9]{64}$'),
  enter_response_digest text CHECK(length(enter_response_digest)=71 AND enter_response_digest ~ '^sha256:[a-f0-9]{64}$'),
  status_response_digest text CHECK(length(status_response_digest)=71 AND status_response_digest ~ '^sha256:[a-f0-9]{64}$'),
  body_digest text CHECK(length(body_digest)=71 AND body_digest ~ '^sha256:[a-f0-9]{64}$'),
  receipt_id text CHECK(length(receipt_id)=36 AND receipt_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  receipt_digest text CHECK(length(receipt_digest)=71 AND receipt_digest ~ '^sha256:[a-f0-9]{64}$'),
  terminal_reason text CHECK(octet_length(terminal_reason) BETWEEN 1 AND 128),
  source_reconciled boolean NOT NULL DEFAULT false,
  source_ack_action text CHECK(source_ack_action IN('cancel-unentered','resolve')),
  source_ack_digest text CHECK(length(source_ack_digest)=71 AND source_ack_digest ~ '^sha256:[a-f0-9]{64}$'),
  phase text NOT NULL DEFAULT 'ADMITTED',
  CHECK(
    (lifecycle_kind='CUSTODY_ONLY' AND phase IN('ADMITTED','UNKNOWN')
      AND sender_id IS NULL AND scope_digest IS NULL AND NOT no_send_fenced
      AND native_source_digest IS NULL AND native_source_fingerprint IS NULL AND native_valid_until_ms IS NULL
      AND issue_response_digest IS NULL AND enter_response_digest IS NULL AND status_response_digest IS NULL
      AND body_digest IS NULL AND receipt_id IS NULL AND receipt_digest IS NULL AND terminal_reason IS NULL
      AND NOT source_reconciled AND source_ack_action IS NULL AND source_ack_digest IS NULL)
    OR
    (lifecycle_kind='MANAGER_HTTP' AND sender_id IS NOT NULL AND scope_digest IS NOT NULL
      AND phase IN('ADMITTED','SENDING','UNKNOWN','SERVED','ABORTED','CANCELLED')
      AND (native_source_digest IS NULL AND native_source_fingerprint IS NULL AND native_valid_until_ms IS NULL
        AND issue_response_digest IS NULL AND enter_response_digest IS NULL AND status_response_digest IS NULL
        OR native_source_digest IS NOT NULL AND (
          issue_response_digest IS NOT NULL AND native_source_fingerprint IS NOT NULL AND native_valid_until_ms IS NOT NULL
          OR status_response_digest IS NOT NULL AND no_send_fenced AND body_digest IS NULL))
      AND (NOT source_reconciled AND source_ack_action IS NULL AND source_ack_digest IS NULL
        OR source_reconciled AND source_ack_action IS NOT NULL AND source_ack_digest IS NOT NULL
          AND (phase='SERVED' AND source_ack_action='resolve'
            OR phase='ABORTED' AND source_ack_action IN('resolve','cancel-unentered')
            OR phase='CANCELLED' AND source_ack_action='cancel-unentered'))
      AND (
        phase IN('ADMITTED','UNKNOWN') AND body_digest IS NULL AND receipt_id IS NULL AND receipt_digest IS NULL
          AND terminal_reason IS NULL AND NOT source_reconciled
        OR phase IN('SENDING','UNKNOWN') AND body_digest IS NOT NULL AND NOT no_send_fenced
          AND native_source_digest IS NOT NULL AND native_source_fingerprint IS NOT NULL
          AND issue_response_digest IS NOT NULL AND enter_response_digest IS NOT NULL
          AND receipt_id IS NULL AND receipt_digest IS NULL AND terminal_reason IS NULL AND NOT source_reconciled
        OR phase='SERVED' AND body_digest IS NOT NULL AND NOT no_send_fenced
          AND native_source_digest IS NOT NULL AND native_source_fingerprint IS NOT NULL
          AND issue_response_digest IS NOT NULL AND enter_response_digest IS NOT NULL
          AND receipt_id IS NOT NULL AND receipt_digest IS NOT NULL AND terminal_reason IS NOT NULL
        OR phase='ABORTED' AND body_digest IS NOT NULL AND native_source_digest IS NOT NULL
          AND native_source_fingerprint IS NOT NULL AND issue_response_digest IS NOT NULL AND enter_response_digest IS NOT NULL
          AND receipt_id IS NOT NULL AND receipt_digest IS NOT NULL AND terminal_reason IS NOT NULL
        OR phase='CANCELLED' AND body_digest IS NULL AND no_send_fenced AND source_reconciled
          AND receipt_id IS NULL AND receipt_digest IS NULL AND terminal_reason IS NULL
      )
    )
  ),
  CHECK (stable_core_digest=encode(sha256(convert_to(base_body,'UTF8')),'hex')),
  CHECK (((base_body::jsonb#>>'{binding,lease_id}')=lease_id
    AND (base_body::jsonb#>>'{binding,attempt_id}')=attempt_id
    AND (base_body::jsonb#>>'{binding,subject}')=subject_id
    AND (base_body::jsonb#>>'{binding,workspace_id}')=workspace_id
    AND (base_body::jsonb#>>'{binding,environment}')=environment
    AND (base_body::jsonb#>>'{binding,workload_id}')=workload_id
    AND (base_body::jsonb#>>'{binding,request_digest}')=request_digest
    AND (base_body::jsonb->>'deadline')=deadline) IS TRUE)
);
CREATE TABLE elp210_candidate.native_read_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lease_id text NOT NULL REFERENCES elp210_candidate.native_read_obligations(lease_id),
  phase text NOT NULL CHECK(phase IN('ADMITTED','SENDING','UNKNOWN','SERVED','ABORTED','CANCELLED')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- One bounded accounting/pending surface. Family disambiguates raw native
-- Manager request_digest versus the legacy prefixed provider digest.
CREATE VIEW elp210_candidate.obligations AS
  SELECT 'REVERSE_HUMAN'::text AS family, lease_id,attempt_id,authority_revision,
    subject_id,session_id,session_revision,workspace_id,environment,workload_id,
    request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,phase,
    phase IN ('ISSUED','ENTERED','UNKNOWN') AS unresolved,
    NULL::text AS base_body,NULL::text AS stable_core_digest,NULL::text AS binding_digest,
    NULL::text AS source_identity_digest,NULL::text AS lifecycle_kind
    FROM elp210_candidate.leases
  UNION ALL
  SELECT 'NATIVE_READ',lease_id,attempt_id,authority_revision,
    subject_id,session_id,session_revision,workspace_id,environment,workload_id,
    request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,phase,NOT source_reconciled,
    base_body,stable_core_digest,binding_digest,source_identity_digest,lifecycle_kind
    FROM elp210_candidate.native_read_obligations;
CREATE TABLE elp210_candidate.events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lease_id text NOT NULL REFERENCES elp210_candidate.leases(lease_id),
  phase text NOT NULL,
  attempt_id text,
  terminal_receipt_digest text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Request metadata only: no passwords, activation credentials, signed tokens,
-- source payloads or replayable authority mutations. Existing services remain
-- the only writers and retain their original operation/idempotency receipts.
CREATE TABLE elp210_candidate.mutations (
  mutation_id text PRIMARY KEY,
  key_digest text UNIQUE NOT NULL CHECK (key_digest ~ '^sha256:[a-f0-9]{64}$'),
  binding_digest text NOT NULL CHECK (binding_digest ~ '^sha256:[a-f0-9]{64}$'),
  replay_digest text NOT NULL CHECK (replay_digest ~ '^sha256:[a-f0-9]{64}$'),
  family text NOT NULL CHECK (family IN ('ACCOUNT_LIFECYCLE','GOVERNANCE_GRANT','EXECUTION_ACCESS','AUTH_SESSION','WORKSPACE_PROVISIONING',
    'REVIEWED_POLICY','QUALIFIED_ROOT_RECEIPT','QUALIFIED_DELEGATED_RECEIPT','VERIFIED_AUTH_ISSUANCE')),
  actor_id text,
  session_id text,
  session_revision bigint,
  CHECK ((family IN ('REVIEWED_POLICY','QUALIFIED_ROOT_RECEIPT','QUALIFIED_DELEGATED_RECEIPT','VERIFIED_AUTH_ISSUANCE') AND actor_id IS NULL AND session_id IS NULL AND session_revision IS NULL)
    OR (family NOT IN ('REVIEWED_POLICY','QUALIFIED_ROOT_RECEIPT','QUALIFIED_DELEGATED_RECEIPT','VERIFIED_AUTH_ISSUANCE') AND actor_id IS NOT NULL AND session_id IS NOT NULL
      AND session_revision IS NOT NULL AND session_revision BETWEEN 0 AND 9007199254740991)),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','FINISHED','REFUSED')),
  terminal_digest text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  CHECK ((state='PENDING' AND terminal_digest IS NULL AND finished_at IS NULL)
    OR (state IN ('FINISHED','REFUSED') AND terminal_digest IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE TABLE elp210_candidate.mutation_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mutation_id text NOT NULL REFERENCES elp210_candidate.mutations(mutation_id),
  state text NOT NULL,
  terminal_digest text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION elp210_candidate.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CURRENT_HUMAN_HISTORY_IMMUTABLE'; END $$;
CREATE TRIGGER preserve_events BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_candidate.events
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_leases BEFORE DELETE OR TRUNCATE ON elp210_candidate.leases
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_revision BEFORE DELETE OR TRUNCATE ON elp210_candidate.authority
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_mutations BEFORE DELETE OR TRUNCATE ON elp210_candidate.mutations
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_mutation_events BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_candidate.mutation_events
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_native_read BEFORE DELETE OR TRUNCATE ON elp210_candidate.native_read_obligations
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE TRIGGER preserve_native_read_events BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_candidate.native_read_events
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable();
CREATE FUNCTION elp210_candidate.native_read_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  IF TG_OP='INSERT' THEN
    IF NEW.phase<>'ADMITTED'
      OR(NEW.lifecycle_kind='MANAGER_HTTP' AND(NEW.no_send_fenced OR NEW.native_source_digest IS NOT NULL
        OR NEW.native_source_fingerprint IS NOT NULL OR NEW.native_valid_until_ms IS NOT NULL OR NEW.issue_response_digest IS NOT NULL
        OR NEW.enter_response_digest IS NOT NULL OR NEW.status_response_digest IS NOT NULL
        OR NEW.body_digest IS NOT NULL OR NEW.receipt_id IS NOT NULL OR NEW.receipt_digest IS NOT NULL
        OR NEW.terminal_reason IS NOT NULL OR NEW.source_reconciled OR NEW.source_ack_action IS NOT NULL OR NEW.source_ack_digest IS NOT NULL))
      OR NOT EXISTS(SELECT 1 FROM elp210_candidate.authority WHERE singleton
        AND drain_id IS NULL AND revision=NEW.authority_revision)
      OR EXISTS(SELECT 1 FROM elp210_candidate.leases WHERE lease_id=NEW.lease_id)
      OR NEW.issued_at_ms>floor(extract(epoch FROM clock_timestamp())*1000)::bigint
      OR NEW.expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint
      OR NOT EXISTS(SELECT 1 FROM public.portal_users u JOIN public.auth_sessions s ON s.user_id=u.user_id
        WHERE u.user_id=NEW.subject_id AND u.status='ACTIVE' AND NOT u.must_change_password
          AND u.archived_at IS NULL AND u.session_version=NEW.session_revision
          AND s.session_id=NEW.session_id AND s.session_version=u.session_version AND s.state='ACTIVE'
          AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
          AND NEW.deadline::timestamptz<=least(s.idle_expires_at,s.absolute_expires_at)
          AND EXISTS(SELECT 1 FROM public.workspaces w WHERE w.workspace_id=NEW.workspace_id)
          AND (EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=NEW.workspace_id AND m.user_id=u.user_id)
            OR EXISTS(SELECT 1 FROM public.portal_owner_anchor a WHERE a.anchor_id='PORTAL_OWNER' AND a.user_id=u.user_id)))
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_NATIVE_ADMISSION_REFUSED'; END IF;

  ELSIF OLD.lifecycle_kind='CUSTODY_ONLY' THEN
    IF OLD.phase<>'ADMITTED' OR NEW.phase<>'UNKNOWN'
      OR(to_jsonb(NEW)-'phase') IS DISTINCT FROM(to_jsonb(OLD)-'phase')
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_NATIVE_TRANSITION_INVALID'; END IF;
  ELSE
    IF(to_jsonb(NEW)-ARRAY['phase','no_send_fenced','native_source_digest','native_source_fingerprint','native_valid_until_ms',
      'issue_response_digest','enter_response_digest','status_response_digest','body_digest',
      'receipt_id','receipt_digest','terminal_reason','source_reconciled','source_ack_action','source_ack_digest'])
      IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['phase','no_send_fenced','native_source_digest','native_source_fingerprint','native_valid_until_ms',
      'issue_response_digest','enter_response_digest','status_response_digest','body_digest',
      'receipt_id','receipt_digest','terminal_reason','source_reconciled','source_ack_action','source_ack_digest'])
      OR(OLD.no_send_fenced AND NOT NEW.no_send_fenced)
      OR(OLD.source_reconciled AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
      OR(OLD.native_source_digest IS NOT NULL AND NEW.native_source_digest IS DISTINCT FROM OLD.native_source_digest)
      OR(OLD.native_source_fingerprint IS NOT NULL AND NEW.native_source_fingerprint IS DISTINCT FROM OLD.native_source_fingerprint)
      OR(OLD.native_valid_until_ms IS NOT NULL AND NEW.native_valid_until_ms IS DISTINCT FROM OLD.native_valid_until_ms)
      OR(OLD.issue_response_digest IS NOT NULL AND NEW.issue_response_digest IS DISTINCT FROM OLD.issue_response_digest)
      OR(OLD.enter_response_digest IS NOT NULL AND NEW.enter_response_digest IS DISTINCT FROM OLD.enter_response_digest)
      OR(OLD.status_response_digest IS NOT NULL AND NEW.status_response_digest IS DISTINCT FROM OLD.status_response_digest)
      OR(OLD.body_digest IS NOT NULL AND NEW.body_digest IS DISTINCT FROM OLD.body_digest)
      OR(OLD.receipt_id IS NOT NULL AND NEW.receipt_id IS DISTINCT FROM OLD.receipt_id)
      OR(OLD.receipt_digest IS NOT NULL AND NEW.receipt_digest IS DISTINCT FROM OLD.receipt_digest)
      OR(OLD.terminal_reason IS NOT NULL AND NEW.terminal_reason IS DISTINCT FROM OLD.terminal_reason)
      OR(OLD.source_ack_action IS NOT NULL AND NEW.source_ack_action IS DISTINCT FROM OLD.source_ack_action)
      OR(OLD.source_ack_digest IS NOT NULL AND NEW.source_ack_digest IS DISTINCT FROM OLD.source_ack_digest)
      OR NOT(
        OLD.phase='ADMITTED' AND NEW.phase IN('ADMITTED','UNKNOWN','SENDING','ABORTED','CANCELLED')
        OR OLD.phase='SENDING' AND NEW.phase IN('UNKNOWN','SERVED','ABORTED')
        OR OLD.phase='UNKNOWN' AND NEW.phase IN('UNKNOWN','SERVED','ABORTED','CANCELLED')
        OR OLD.phase IN('SERVED','ABORTED','CANCELLED') AND NEW.phase=OLD.phase)
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_NATIVE_TRANSITION_INVALID'; END IF;
  END IF;
  UPDATE elp210_candidate.authority SET lease_epoch=lease_epoch+1 WHERE singleton;
  INSERT INTO elp210_candidate.native_read_events(lease_id,phase) VALUES(NEW.lease_id,NEW.phase);
  RETURN NEW;
END $$;
CREATE TRIGGER native_read_events AFTER INSERT OR UPDATE ON elp210_candidate.native_read_obligations
  FOR EACH ROW EXECUTE FUNCTION elp210_candidate.native_read_event();
CREATE FUNCTION elp210_candidate.mutation_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.state<>'PENDING' OR NEW.state NOT IN ('FINISHED','REFUSED') OR
      (to_jsonb(NEW)-ARRAY['state','terminal_digest','finished_at']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['state','terminal_digest','finished_at'])
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_MUTATION_TRANSITION_INVALID'; END IF;
  END IF;
  INSERT INTO elp210_candidate.mutation_events(mutation_id,state,terminal_digest)
    VALUES(NEW.mutation_id,NEW.state,NEW.terminal_digest);
  RETURN NEW;
END $$;
CREATE TRIGGER mutation_events AFTER INSERT OR UPDATE ON elp210_candidate.mutations
  FOR EACH ROW EXECUTE FUNCTION elp210_candidate.mutation_event();
CREATE FUNCTION elp210_candidate.lease_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A physical singleton version change is required, not just FOR UPDATE:
  -- a legacy REPEATABLE READ writer whose snapshot predates this lease must
  -- fail 40001 rather than count an invisible new ENTERED/ISSUED lease as zero.
  -- This is NOT the signed authority revision; only real authority changes
  -- increment that revision. The caller already holds the same barrier lock.
  UPDATE elp210_candidate.authority SET lease_epoch=lease_epoch+1 WHERE singleton;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM elp210_candidate.native_read_obligations WHERE lease_id=NEW.lease_id)
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_CROSS_FAMILY_ID_CONFLICT'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['phase','attempt_id','terminal_receipt_digest']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['phase','attempt_id','terminal_receipt_digest'])
      OR NOT ((OLD.phase='ISSUED' AND NEW.phase IN ('ENTERED','RETIRED'))
        OR (OLD.phase='ENTERED' AND NEW.phase IN ('UNKNOWN','COMMITTED','ROLLED_BACK'))
        OR (OLD.phase='UNKNOWN' AND NEW.phase IN ('COMMITTED','ROLLED_BACK')))
      OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id)
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_TRANSITION_INVALID'; END IF;
  END IF;
  INSERT INTO elp210_candidate.events(lease_id,phase,attempt_id,terminal_receipt_digest)
    VALUES(NEW.lease_id,NEW.phase,NEW.attempt_id,NEW.terminal_receipt_digest);
  RETURN NEW;
END $$;
CREATE TRIGGER lease_events AFTER INSERT OR UPDATE ON elp210_candidate.leases
  FOR EACH ROW EXECUTE FUNCTION elp210_candidate.lease_event();

-- Conservative global barrier covers owner/ancestor/cross-workspace authority.
-- No network operation holds this lock. These triggers cover raw SQL/cascades,
-- not just one new repository method. Unknown leases NEVER expire themselves.
CREATE FUNCTION elp210_candidate.authority_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='portal_users' THEN
    IF (NEW.status,NEW.must_change_password,NEW.archived_at,NEW.role,NEW.session_version)
      IS NOT DISTINCT FROM (OLD.status,OLD.must_change_password,OLD.archived_at,OLD.role,OLD.session_version)
    THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='auth_sessions' THEN
    IF NEW.idle_expires_at>=OLD.idle_expires_at
      AND (to_jsonb(NEW)-ARRAY['last_seen_at','idle_expires_at','updated_at']) IS NOT DISTINCT FROM
          (to_jsonb(OLD)-ARRAY['last_seen_at','idle_expires_at','updated_at'])
    THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='external_identity_bindings' THEN
    IF (to_jsonb(NEW)-'last_seen_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'last_seen_at') THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND TG_TABLE_NAME='workspaces' THEN
    IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW;
  END IF;
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  -- First immutable event disables legacy fallback (read-scope.policy_seen).
  -- Subsequent audit/denial events do not themselves change an entitlement.
  -- Separate statements are essential here: PostgreSQL may plan every AND
  -- operand, including a NEW field absent from another guarded table.
  IF TG_TABLE_NAME='portal_access_policy_events' AND TG_OP='INSERT' THEN
    IF EXISTS(SELECT 1 FROM public.portal_access_policy_events WHERE workspace_id=NEW.workspace_id)
    THEN RETURN NEW; END IF;
  END IF;
  -- Audit after policy_seen is immutable evidence, not an entitlement change;
  -- a pending drain must not erase the refusal trail of subsequent requests.
  IF current_setting('elp210_candidate.replay_only',true)='on'
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_MUTATION_REPLAY_WRITE_FORBIDDEN'; END IF;
  IF EXISTS(SELECT 1 FROM elp210_candidate.authority a JOIN elp210_candidate.mutations m
      ON m.mutation_id=a.drain_id AND m.state='PENDING' WHERE a.singleton
      AND m.mutation_id IS DISTINCT FROM current_setting('elp210_candidate.mutation_id',true))
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_DRAIN_COORDINATOR_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM elp210_candidate.obligations WHERE unresolved)
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_DRAIN_REQUIRED'; END IF;
  UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['portal_users','auth_sessions','external_identity_bindings',
    'workspaces','workspace_members','portal_owner_anchor','portal_access_policy_state',
    'portal_access_grants_v2','portal_capability_grants','execution_retained_review_access','portal_access_policy_events']
  LOOP
    IF to_regclass('public.'||target) IS NULL THEN RAISE EXCEPTION 'CURRENT_HUMAN_DEPENDENCY_MISSING: %',target; END IF;
    EXECUTE format('CREATE TRIGGER elp210_authority_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION elp210_candidate.authority_change()',target);
    EXECUTE format('CREATE TRIGGER elp210_no_truncate BEFORE TRUNCATE ON public.%I
      FOR EACH STATEMENT EXECUTE FUNCTION elp210_candidate.immutable()',target);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA elp210_candidate FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA elp210_candidate FROM PUBLIC;
COMMENT ON SCHEMA elp210_candidate IS 'Uncommissioned current-human correctness candidate; no runtime imports, credentials, TS business rights or production installation.';
COMMIT;
