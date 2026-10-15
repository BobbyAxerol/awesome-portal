-- TEST_ONLY disposable portal_control_test, after API tests and before dump.
-- No identity binding, password, active policy or effective grant is created.
-- Guaranteed nonempty inputs make the four-store restore comparison meaningful
-- even when the final Vitest file happened to truncate the scoped-policy tables.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'portal_control_test' THEN
    RAISE EXCEPTION 'Scoped access restore fixture is test-database-only';
  END IF;
END $$;
INSERT INTO portal_users(user_id,username,display_name,role,status)
VALUES('elp2_restore_TEST_ONLY_user','elp2_restore_TEST_ONLY_user','TEST_ONLY restore fixture','USER','INVITED');
INSERT INTO workspaces(workspace_id,name,owner_user_id)
VALUES('elp2_restore_TEST_ONLY_workspace','TEST_ONLY restore fixture','elp2_restore_TEST_ONLY_user');
INSERT INTO portal_access_policy_state(workspace_id,revision,policy)
VALUES('elp2_restore_TEST_ONLY_workspace','TEST_ONLY_pending',
  '{"workspace_id":"elp2_restore_TEST_ONLY_workspace","revision":"TEST_ONLY_pending","state":"PENDING","qualification":"UNQUALIFIED","TEST_ONLY":true}');
INSERT INTO portal_access_grants_v2(grant_id,workspace_id,subject_user_id,issued_by,revision,grant_fact)
VALUES('elp2_restore_TEST_ONLY_grant','elp2_restore_TEST_ONLY_workspace','elp2_restore_TEST_ONLY_user',
  'elp2_restore_TEST_ONLY_user','TEST_ONLY_revoked',
  '{"grant_id":"elp2_restore_TEST_ONLY_grant","workspace_id":"elp2_restore_TEST_ONLY_workspace","subject_user_id":"elp2_restore_TEST_ONLY_user","issued_by":"elp2_restore_TEST_ONLY_user","revision":"TEST_ONLY_revoked","revoked_at_ms":0,"effect":"DENY","TEST_ONLY":true}');
INSERT INTO portal_access_proposals(proposal_id,workspace_id,idempotency_digest,actor_user_id,subject_user_id,
  grant_id,request_digest,change,state,submission_receipt)
VALUES('elp2_restore_TEST_ONLY_proposal','elp2_restore_TEST_ONLY_workspace','TEST_ONLY_restore_key',
  'elp2_restore_TEST_ONLY_user','elp2_restore_TEST_ONLY_user','elp2_restore_TEST_ONLY_grant',
  'TEST_ONLY_restore_digest','{"TEST_ONLY":true}','REVOKED','{"TEST_ONLY":true,"outcome":"REVOKED"}');
INSERT INTO portal_access_policy_events(event_id,workspace_id,actor_user_id,subject_user_id,operation,
  request_digest,policy_revision,grant_id,proposal_id,before_fact,after_fact,receipt)
VALUES('elp2_restore_TEST_ONLY_event','elp2_restore_TEST_ONLY_workspace','elp2_restore_TEST_ONLY_user',
  'elp2_restore_TEST_ONLY_user','REVOKE','TEST_ONLY_restore_digest','TEST_ONLY_pending',
  'elp2_restore_TEST_ONLY_grant','elp2_restore_TEST_ONLY_proposal',NULL,'{"TEST_ONLY":true}',
  '{"TEST_ONLY":true,"outcome":"REVOKED"}');
COMMIT;
