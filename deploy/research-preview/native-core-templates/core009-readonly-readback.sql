-- Core009 read-only readback. Run by an approved OPERATOR, never by CI or an agent.
-- One short READ ONLY transaction, rolled back; no writes, no DDL, no session or
-- grant creation, no secret column. Public ids only:
--   psql -X -v ON_ERROR_STOP=1 -v ws=ws_06G19F61YB8CFR7TEWMS7HQ660 \
--        -v owner=usr_5a38d5dfb08b44748f5776fbe04a1434 -f core009-readonly-readback.sql
-- Compare each block with the expectation in CORE009_OPERATOR_RUNBOOK_2026-10-20.md.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

-- A. Physical target: must equal the target block of both private files.
SELECT current_database() AS database_name, current_user AS role_name, session_user AS login_name,
       (pg_control_system()).system_identifier::text AS database_system_identifier;

-- B. Core custody before ANY replacement: all must be zero / null / terminal.
SELECT revision, lease_epoch, drain_id FROM elp210_candidate.authority WHERE singleton;
SELECT phase, count(*)::int AS n FROM elp210_candidate.leases GROUP BY phase ORDER BY phase;
SELECT count(*)::int AS unresolved_obligations FROM elp210_candidate.obligations WHERE unresolved;
SELECT count(*)::int AS native_read_obligations FROM elp210_candidate.native_read_obligations;
SELECT family, state, count(*)::int AS n FROM elp210_candidate.mutations GROUP BY family, state ORDER BY family, state;
SELECT count(*)::int AS mutation_intents_used FROM elp210_candidate.mutations;

-- C. Policy and grants for the exact workspace (expected EMPTY before install,
--    exactly the reviewed artifact afterwards).
SELECT workspace_id, revision FROM portal_access_policy_state WHERE workspace_id = :'ws';
SELECT grant_fact->>'action' AS action, grant_fact->>'effect' AS effect, grant_fact->>'environment' AS environment,
       count(*)::int AS n
  FROM portal_access_grants_v2 WHERE workspace_id = :'ws' GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SELECT operation, policy_revision, count(*)::int AS n
  FROM portal_access_policy_events WHERE workspace_id = :'ws' GROUP BY 1, 2 ORDER BY 1, 2;

-- D. Protected owner and membership (must stay ACTIVE, no must-change, not archived).
SELECT user_id, status, must_change_password, archived_at IS NOT NULL AS archived
  FROM portal_users WHERE user_id = :'owner';
SELECT count(*)::int AS owner_is_member
  FROM workspace_members WHERE workspace_id = :'ws' AND user_id = :'owner';

-- E. Plan B grant windows and revocation state (public ids/numbers only). Expected after install: exactly two
--    ALLOW grants (business.read_all and stream.subscribe), distinct ids, window_minutes <= 120 each, valid_until
--    <= the renewed trust end, revoked_at_ms null. After an official revoke: revoked_at_ms set (or valid_until
--    shortened) and a new revision for exactly the named grant.
SELECT grant_fact->>'grant_id' AS grant_id, grant_fact->>'action' AS action, grant_fact->>'effect' AS effect,
       (grant_fact->>'valid_from_ms')::bigint AS valid_from_ms, (grant_fact->>'valid_until_ms')::bigint AS valid_until_ms,
       ((grant_fact->>'valid_until_ms')::bigint - (grant_fact->>'valid_from_ms')::bigint) / 60000 AS window_minutes,
       grant_fact->>'revoked_at_ms' AS revoked_at_ms, revision
  FROM portal_access_grants_v2 WHERE workspace_id = :'ws' AND grant_fact ? 'schema_version' ORDER BY action, grant_id;
-- Immutable audit of official manager-domain revokes (one row per named grant; the receipt carries the outcome).
SELECT event_id, grant_id, receipt->>'outcome' AS receipt_outcome, receipt->>'reason_code' AS outcome, occurred_at
  FROM portal_access_policy_events WHERE workspace_id = :'ws' AND operation = 'REVOKE'
   AND source = 'portal.private-owner-manager-revoke.v1' ORDER BY occurred_at, event_id;

-- F. Research acceptance session of the protected owner (expected: none before issue; exactly one ACTIVE between
--    issue and revoke; REVOKED with reason research_acceptance_revoked afterwards). Never selects a token or hash.
SELECT session_id, state, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason
  FROM auth_sessions WHERE user_id = :'owner' AND access_subject = 'research-acceptance:v1' ORDER BY created_at;
-- The owner's NORMAL sessions must be unaffected by issue and revoke.
SELECT state, count(*)::int AS n FROM auth_sessions
 WHERE user_id = :'owner' AND access_subject IS DISTINCT FROM 'research-acceptance:v1' GROUP BY state ORDER BY state;
SELECT event_type, reason_code, occurred_at FROM auth_audit_events
 WHERE target_user_id = :'owner' AND event_type IN ('research_acceptance_session_issued', 'research_acceptance_session_revoked')
 ORDER BY occurred_at;
ROLLBACK;
