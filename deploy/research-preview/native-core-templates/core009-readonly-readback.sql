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
ROLLBACK;
