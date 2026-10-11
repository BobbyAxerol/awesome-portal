#!/usr/bin/env node
/** Revoke only this private cell's test identities, then preserve current
 * post-revocation authority backup before the labelled cell is removed. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {HOME,docker,owned,coreQuery,inControl,privateWrite} from './acceptance-cell.mjs';
import {sessions,client,authSetup} from './acceptance-api.mjs';
assert.equal(coreQuery("SELECT count(*)::int n FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')").rows[0].n,0);
const s=sessions(),users=s.identities.filter(u=>u.username.startsWith('udb04-'));assert.equal(users.length,23);
for(const u of users.filter(u=>u.username.startsWith('udb04-reader-')))
  docker(['exec',owned('control-api'),'node','dist/cli/execution-store.js','revoke-review',u.username]);
const identities=inControl(authSetup+`
let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',async()=>{try{
const users=JSON.parse(input);assert.equal(users.length,23);
for(const u of users){assert(u.username.startsWith('udb04-'));const actual=await auth.users.findById(u.id);
assert.equal(actual.username,u.username);await admin.disable(u.id);await admin.revokeSessions(u.id);}
console.log(JSON.stringify({disabled:users.length,revoked:users.length}));}finally{await p.end();}});`,JSON.stringify(users));
for(const u of s.identities.filter(u=>['bobby','claude-preview'].includes(u.username))){
  assert(u.session_id);inControl(authSetup+`(async()=>{try{await auth.sessions.revokeSession('${u.session_id}','udb04_owned_session_cleanup');
console.log(JSON.stringify({revoked:true}));}finally{await p.end();}})();`);
}
const result=coreQuery(`SELECT
 (SELECT count(*) FROM portal_users WHERE username LIKE 'udb04-%' AND status='ACTIVE')::int active_users,
 (SELECT count(*) FROM auth_sessions s JOIN portal_users u USING(user_id) WHERE u.username LIKE 'udb04-%' AND s.state='ACTIVE')::int active_sessions,
 (SELECT count(*) FROM execution_retained_review_access g JOIN portal_users u USING(user_id)
  WHERE u.username LIKE 'udb04-%' AND g.revoked_at IS NULL)::int active_grants`).rows[0];
assert.deepEqual(result,{active_users:0,active_sessions:0,active_grants:0});
const bytes=execFileSync('sudo',['-n','docker','exec',owned('portal-postgres'),'pg_dump','-U','portal','-d','portal_control','-Fc'],{maxBuffer:512*1024*1024});
writeFileSync(join(HOME,'core-post-cleanup-auth.dump'),bytes,{mode:0o600});
// Include this lane's later disposable output, not only the archive taken
// before its mixed-load children ran. This is custody/backup, not a new DR
// restore claim; old manifest exceptions and recovery denominators stay exact.
const artifactBytes=execFileSync('sudo',['-n','docker','exec',owned('portal-api'),
  'tar','-C','/var/lib/portal/artifacts','-czf','-','.'],{maxBuffer:512*1024*1024,timeout:180000});
writeFileSync(join(HOME,'artifacts-post-cleanup.tar.gz'),artifactBytes,{mode:0o600});
privateWrite('identity-cleanup.json',{passed:true,identities,...result,exact_original_user_sessions_revoked:2,
  original_credentials_changed:false,original_global_sessions_revoked:false,backup_days:30,
  post_cleanup_backup_sha256:createHash('sha256').update(bytes).digest('hex'),
  later_test_artifacts_backed_up:true,artifact_archive_bytes:artifactBytes.length,
  artifact_archive_sha256:createHash('sha256').update(artifactBytes).digest('hex'),
  artifact_backup_scope:'OWNED_TERMINAL_LANE_NOT_NEW_RECOVERY_PROOF'});
console.log(JSON.stringify({passed:true,disabled:23,retained_grants_revoked:20,...result}));
