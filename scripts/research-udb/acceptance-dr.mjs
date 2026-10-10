#!/usr/bin/env node
/** Owned UDB04 fault/DR and current-authority cutover, never shared PG. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {VERIFY_ARTIFACTS} from '../research-p23/restore-receipt.mjs';
import {HISTORICAL_TEST_MANIFEST_LOSSES} from '../research-p23/historical-manifest-exceptions.mjs';
import {PROJECT,HOME,SOURCE,docker,owned,compose,privateWrite,readPrivate,coreQuery,inControl} from './acceptance-cell.mjs';
import {namedClient,client,sessions,authSetup,refreshSessions} from './acceptance-api.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));

function dump(service,user,db,name){
  const bytes=execFileSync('sudo',['-n','docker','exec',owned(service),'pg_dump','-U',user,'-d',db,'-Fc'],
    {maxBuffer:512*1024*1024,timeout:180000,stdio:['pipe','pipe','pipe']});
  writeFileSync(join(HOME,name),bytes,{mode:0o600});return {name,bytes:bytes.length,sha256:hash(bytes)};
}
function restore(service,user,db,name){
  docker(['exec','-i',owned(service),'pg_restore','-U',user,'-d',db,'--clean','--if-exists','--single-transaction',
    '--exit-on-error','--no-owner'],readFileSync(join(HOME,name)),512*1024*1024);
}
function dumpArtifacts(){
  const bytes=execFileSync('sudo',['-n','docker','exec',owned('portal-api'),'tar','-C',
    '/var/lib/portal/artifacts','-czf','-','.'],{maxBuffer:512*1024*1024,timeout:180000,stdio:['pipe','pipe','pipe']});
  writeFileSync(join(HOME,'artifacts-final.tar.gz'),bytes,{mode:0o600});
  return {name:'artifacts-final.tar.gz',bytes:bytes.length,sha256:hash(bytes)};
}
function restoreArtifacts(backup){
  const bytes=readFileSync(join(HOME,'artifacts-final.tar.gz'));assert.equal(hash(bytes),backup.sha256);
  const volume=PROJECT+'_portal-artifacts';
  assert.equal(docker(['volume','inspect','-f','{{index .Labels "com.docker.compose.project"}}',volume]).trim(),PROJECT);
  // Restore into a fresh owned volume, not over surviving bytes: an overlay
  // extraction could falsely pass even when the archive omitted a manifest.
  // The immutable archive stays outside this clone and is verified above.
  const holders=docker(['ps','-a','--filter','volume='+volume,'--format','{{.Names}}']).trim().split('\n').filter(Boolean);
  const allowed=['portal-api','quant-worker-py'].map(service=>owned(service));
  assert.equal(holders.length,allowed.length,'EXACT_ARTIFACT_HOLDERS_REQUIRED');
  assert(holders.every(name=>allowed.includes(name)),'UNEXPECTED_ARTIFACT_VOLUME_HOLDER');
  for(const name of allowed){
    assert.equal(docker(['inspect','-f','{{.State.Running}}',name]).trim(),'false','STOPPED_ARTIFACT_HOLDER_REQUIRED');
  }
  for(const name of allowed)docker(['rm',name]); // Only stopped owned app containers, never a DB.
  docker(['volume','rm',volume]);
  assert.equal(docker(['volume','create','--label','com.docker.compose.project='+PROJECT,
    '--label','com.docker.compose.volume=portal-artifacts','--label','udb04.owner='+PROJECT,volume]).trim(),volume);
  docker(['run','--rm','-i','--label','udb04.owner='+PROJECT,'--network','none','--memory','150000000',
    '--memory-swap','150000000','--pids-limit','64','-v',volume+':/restore','--entrypoint','tar',
    readPrivate('identity.json').images['portal-postgres'].image_id,'-C','/restore','-xzf','-'],bytes);
}
const custodySQL=`SELECT coalesce(json_agg(x ORDER BY kind),'[]') FROM (
 SELECT 'users' kind,(SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM portal_users t) data
 UNION ALL SELECT 'credentials',(SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM password_credentials t)
 UNION ALL SELECT 'anchor',(SELECT jsonb_agg(to_jsonb(t)) FROM portal_owner_anchor t)
 UNION ALL SELECT 'grants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY grant_id) FROM portal_capability_grants t)
 UNION ALL SELECT 'retained_access',(SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id,workspace_id) FROM execution_retained_review_access t)
 UNION ALL SELECT 'sessions',(SELECT jsonb_agg(jsonb_build_object('id',session_id,'state',state,'version',session_version,
   'user_id',user_id,'revoked_at',revoked_at,'revoke_reason',revoke_reason) ORDER BY session_id) FROM auth_sessions)
 UNION ALL SELECT 'publications',(SELECT jsonb_agg(to_jsonb(t) ORDER BY release_candidate_id) FROM research.release_candidate_publications_v1 t)
 UNION ALL SELECT 'seals',(SELECT jsonb_agg(to_jsonb(t) ORDER BY run_id) FROM research.current_source_seals_v1 t)
 UNION ALL SELECT 'migrations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM pgmigrations t)) x`;
function custody(){return hash(docker(['exec',owned('portal-postgres'),'psql','-X','-U','portal','-d','portal_control','-Atc',custodySQL]));}
function domainHash(backupDatabase=false){return inControl(String.raw`
const {Pool}=require('pg'),{loadConfig}=require('./dist/config'),{createHash}=require('node:crypto');
(async()=>{const url=new URL(loadConfig().EXECUTION_DATABASE_URL);`+
 (backupDatabase?'url.pathname="/udb04_dr_verify";':'')+String.raw`
const p=new Pool({connectionString:url.toString(),max:1});try{
await p.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const tables=(await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
const out={};for(const {tablename}of tables){const rows=(await p.query("SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') h FROM public.\""+tablename+"\" t")).rows;
const hashes=rows.map(r=>r.h).sort();out[tablename]={count:hashes.length,sha256:createHash('sha256').update(hashes.join('')).digest('hex')};}await p.query('COMMIT');console.log(JSON.stringify(out));}finally{await p.end();}})();`);}
function artifacts(){
  const facts={artifacts:coreQuery("SELECT workspace_id,run_id,artifact_id,artifact_revision,manifest_digest FROM research.artifacts WHERE state='SEALED' ORDER BY artifact_id").rows,
    parts:coreQuery("SELECT p.* FROM research.artifact_parts p JOIN research.artifacts a USING(workspace_id,artifact_id) WHERE a.state='SEALED' ORDER BY artifact_id,table_kind,part_ordinal").rows,
    record_missing_manifests:true};
  // pg returns bigint as a string; the original pg_json verifier received a
  // JSON number. Normalize only bounded revision identities, never decimal
  // business amounts, and fail rather than rounding an unsafe bigint.
  for(const artifact of facts.artifacts){const revision=Number(artifact.artifact_revision);
    assert(Number.isSafeInteger(revision)&&revision>0);artifact.artifact_revision=revision;}
  const snapshot=JSON.parse(docker(['run','--rm','-i','--label','udb04.owner='+PROJECT,'--network','none',
    '--memory','350000000','--memory-swap','350000000','--pids-limit','64','--read-only','--user','0:0',
    '-v',PROJECT+'_portal-artifacts:/owned-artifacts:ro',readPrivate('identity.json').images['portal-api'].image_id,
    'python','-c',VERIFY_ARTIFACTS],JSON.stringify(facts)));
  for(const missing of snapshot.missing_manifests){const expected=HISTORICAL_TEST_MANIFEST_LOSSES.find(e=>e.artifact_id===missing.artifact_id);
    assert(expected&&expected.expected_manifest_digest===missing.expected_manifest_digest,'NEW_OR_CHANGED_MANIFEST_LOSS');
    const record=facts.artifacts.find(a=>a.artifact_id===missing.artifact_id);
    assert(record.workspace_id===expected.workspace_id&&record.run_id===expected.run_id&&record.artifact_revision===1,'EXCEPTION_SCOPE_DRIFT');}
  return {...snapshot,strict_verified:snapshot.verified.length,strict_denominator:facts.artifacts.length,
    full_store_integrity_passed:snapshot.missing_manifests.length===0,
    historical_exception_population:'Original P23 population remains83/86; do not replace its denominator with this preview population.',
    byte_recovery_performed:false};
}
async function authMatrix(){
  const reader=namedClient('udb04-reader-01'),other=namedClient('udb04-operator'),owner=namedClient('bobby'),reviewer=namedClient('claude-preview');
  const publication=readPrivate('reader-authority.json').publication,
    r1=`/api/v1/execution/governance/approvals/${publication.approval_id}/r1?workspace_id=${publication.workspace_id}`;
  const checks=[];async function check(name,c,method,path,body,status=[200],headers){
    const result=await c.call(method,path,body,status,headers);checks.push({name,status:result.status,code:result.body.error?.code??null,
      schema_version:result.body.schema_version??null});return result.body;}
  const ownedAccess=await check('owner-anchor-self',owner,'GET','/api/admin/access/self');assert.equal(ownedAccess.is_owner,true);
  const reviewerAccess=await check('scoped-reviewer-self',reviewer,'GET','/api/admin/access/self');
  assert.equal(reviewerAccess.is_owner,false);assert.equal(reviewerAccess.capabilities.filter(c=>c.endsWith('.decide')).length,0);
  const roleAccess=await check('admin-role-is-not-owner',other,'GET','/api/admin/access/self');assert.equal(roleAccess.is_owner,false);assert.deepEqual(roleAccess.capabilities,[]);
  const review=await check('retained-read-only',reader,'GET','/api/v1/execution/retained-review');assert.equal(review.permissions.manage,false);assert.equal(review.stream_enabled,false);
  await check('real-rc-publication',reviewer,'GET',`/api/v1/research/release-candidates/${publication.release_candidate_id}/publication?workspace_id=${publication.workspace_id}`);
  const gate=await check('real-r1-reviewer',reviewer,'GET',r1);privateWrite('real-r1.json',gate);
  await check('reader-no-governance-grant',reader,'GET',r1,undefined,[403]);
  const cc=await check('command-center-no-governance-data',reader,'GET',`/api/v1/execution/command-center?workspace_id=${publication.workspace_id}`);
  assert(!JSON.stringify(cc).includes(publication.approval_id),'COMMAND_CENTER_GOVERNANCE_LEAK');
  await check('research-wrong-workspace',reader,'GET',`/api/v1/quantbt/runs/${publication.run_id}/report?workspace_id=ws_wrong`,undefined,[404]);
  await check('execution-wrong-workspace',reader,'GET','/api/v1/execution/retained-review?workspace_id=ws_wrong',undefined,[404]);
  await check('profile-selector-refused',reader,'GET','/api/v1/execution/retained-review?profile_id=LIVE_BAD',undefined,[400]);
  await check('missing-object-hidden',reader,'GET','/api/v1/execution/broker-bindings/missing?environment=paper',undefined,[404]);
  await check('retained-reader-not-research-member',other,'GET',`/api/v1/quantbt/runs/${publication.run_id}/report?workspace_id=${publication.workspace_id}`,undefined,[404]);
  await check('non-owner-settings',other,'GET','/api/admin/profile-access',undefined,[403]);
  await check('anonymous',client({username:'udb04-anonymous',cookies:{}}),'GET','/api/v1/execution/retained-review',undefined,[401]);
  await check('no-execution-stream',reader,'GET','/api/v1/execution/profiles/paper/stream',undefined,[404]);
  await check('csrf-refusal',other,'POST','/api/v1/research/preflights',{requested_spec:readPrivate('mixed-load.json').spec},[403],{'x-portal-csrf':'invalid'});
  await check('origin-refusal',other,'POST','/api/v1/research/preflights',{requested_spec:readPrivate('mixed-load.json').spec},[403],{origin:'https://wrong.example'});
  for(const gateName of ['r2','live']){
    // Authorized read does not invent a downstream capture for an R1 object.
    const result=await reviewer.call('GET',r1.replace('/r1?',`/${gateName}?`),undefined,[200,404]);
    checks.push({name:'authorized-'+gateName+'-surface',status:result.status,code:result.body.error?.code??null});
  }
  // Grant qualification is independent from a source capture existing.
  for(const surface of ['canary','live']){
    const path=`/api/v1/execution/deployments/udb04-no-source/${surface}?workspace_id=${publication.workspace_id}`;
    await check('scoped-'+surface+'-read',reviewer,'GET',path,undefined,[200,404]);
    await check('no-'+surface+'-read-grant',reader,'GET',path,undefined,[403]);
  }
  await check('owner-needs-real-step-up',owner,'POST','/api/admin/profile-access',
    {grantee_user_id:other.user.id,capability:'governance.r1.read'},[403],{'x-portal-idempotency-key':'udb04-no-forged-step-up'});
  const revoked=namedClient('udb04-revoked'),disabled=namedClient('udb04-disabled');
  inControl(authSetup+`(async()=>{try{await admin.revokeSessions('${revoked.user.id}');await admin.disable('${disabled.user.id}');console.log(JSON.stringify({done:true}));}finally{await p.end();}})();`);
  await check('revoked-no-cached-authority',revoked,'GET','/api/v1/execution/retained-review',undefined,[401]);
  await check('disabled-no-cached-authority',disabled,'GET','/api/v1/quantbt/runs',undefined,[401]);
  const expired=namedClient('udb04-reader-19');
  const expiredFixture=coreQuery("UPDATE auth_sessions SET idle_expires_at=now()-interval '1 minute' WHERE user_id=$1",[expired.user.id]);
  assert(expiredFixture.rowCount>0);await check('expired-owned-session',expired,'GET','/api/v1/execution/retained-review',undefined,[401]);
  return {passed:true,checks,real_stan_tested:false,reviewer_basis:'Actual cloned claude-preview read grants, no decide grant',
    external_ttl:'NOT_APPLICABLE_AUTH_DEV_EDGE_DISABLED',self_approval_and_idempotency:'Unchanged service-policy regression suite; no fabricated owner password step-up'};
}
async function main(){
  await refreshSessions();
  // A revoked grant cannot be re-issued without a new owner approval. A
  // repeat uses a different already-approved owned grant, never clears a
  // revocation or silently restores stale authority to make the test pass.
  const revokeTarget=coreQuery(`SELECT u.username FROM execution_retained_review_access a
    JOIN portal_users u ON u.user_id=a.user_id WHERE a.revoked_at IS NULL AND a.expires_at>now()
    AND u.username LIKE 'udb04-reader-%' AND u.username NOT IN ('udb04-reader-01','udb04-reader-19')
    ORDER BY u.username DESC LIMIT 1`).rows[0];
  assert(revokeTarget,'NEW_OWNED_ACTIVE_GRANT_REQUIRED_FOR_DR');
  const workload=readPrivate('mixed-load.json'),operator=namedClient('udb04-operator');
  // DR is an independent gate. A failed latency gate remains failed in the
  // phase matrix; it must not prevent collecting the safety evidence.
  assert(workload.load && workload.load.errors.length===0,'VALID_CANDIDATE_BEFORE_DR');
  const timeout=Date.now()+480000;
  while(Date.now()<timeout){const progress=await operator.call('GET',`/api/v1/research/runs/${workload.jobs[0].run_id}/progress`);
    if(progress.body.current.effective_status==='COMPLETED'&&progress.body.current.terminal_materialization!=='PENDING')break;
    await pause(1000);}
  assert.equal(coreQuery("SELECT count(*)::int n FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')").rows[0].n,0,'NO_LIVE_CHILD_DURING_RESTORE');
  const result={project:PROJECT,identity:readPrivate('identity.json'),load_passed:workload.passed,
    auth:await authMatrix(),passed:false};
  privateWrite('authorization-dr.json',result);
  const reader=namedClient(revokeTarget.username);result.owned_revoke_target=reader.user.id;
  const domainBefore=domainHash();result.domain_before=domainBefore;result.artifacts_before=artifacts();
  privateWrite('authorization-dr.json',result);
  result.backup_before_revoke=dump('portal-postgres','portal','portal_control','core-before-revoke.dump');
  result.domain_backup=dump('execution-postgres','exec_owner','portal_execution','execution-final.dump');
  result.artifact_backup=dumpArtifacts();
  docker(['exec',owned('control-api'),'node','dist/cli/execution-store.js','revoke-review',reader.user.username]);
  const refused=await reader.call('GET','/api/v1/execution/alphas?environment=paper',undefined,[404]);
  result.read_grant_revoke_status=refused.status;
  inControl(authSetup+`(async()=>{try{await admin.revokeSessions('${reader.user.id}');console.log(JSON.stringify({done:true}));}finally{await p.end();}})();`);
  await reader.call('GET','/api/v1/execution/retained-review',undefined,[401]);
  result.backup_current_auth=dump('portal-postgres','portal','portal_control','core-current-auth.dump');
  privateWrite('authorization-dr.json',result);
  // Execution outage must not affect Research reads or start source fallback.
  try{
    docker(['stop','--time','15',owned('execution-postgres')]);
    await pause(2100); // Expire the explicitly bounded retained-data cache.
    result.execution_outage_core=(await operator.call('GET','/api/v1/quantbt/runs')).status;
    result.execution_outage_refusal=await namedClient('udb04-reader-01').call('GET','/api/v1/execution/alphas?environment=paper',undefined,[503]);
    result.execution_context_outage_refusal=await namedClient('udb04-reader-01').call('GET','/api/v1/execution/retained-review',undefined,[503]);
  }finally{docker(['start',owned('execution-postgres')]);}
  privateWrite('authorization-dr.json',result);
  await pause(1000);await namedClient('udb04-reader-01').call('GET','/api/v1/execution/alphas?environment=paper');
  compose(['stop','quant-worker-py','portal-api']);
  let cutoverAllowed=true;
  try{
    try{docker(['stop','--time','15',owned('portal-postgres')]);
      const r=await namedClient('udb04-reader-01').call('GET','/api/v1/execution/retained-review',undefined,[401,503]);
      result.core_outage_fail_closed={status:r.status,code:r.body.error?.code??null};
      result.core_outage_research_refusal=await operator.call('GET','/api/v1/quantbt/runs',undefined,[503]);
      result.independent_execution_alive=docker(['exec',owned('execution-postgres'),'pg_isready','-U','exec_owner','-d','portal_execution']).includes('accepting');
    }finally{docker(['start',owned('portal-postgres')]);}
    await pause(1000);await operator.call('GET','/api/v1/quantbt/runs');
    compose(['stop','control-api']);const currentCustody=custody();result.current_authority_sha256=currentCustody;
    cutoverAllowed=false;
    restore('portal-postgres','portal','portal_control','core-before-revoke.dump');
    result.stale_auth_restore_rejected=custody()!==currentCustody;assert.equal(result.stale_auth_restore_rejected,true);
    // Never start an application against the stale auth restore. Restore
    // current custody first, verify exact hash, then permit local cutover.
    restore('portal-postgres','portal','portal_control','core-current-auth.dump');
    assert.equal(custody(),currentCustody,'CURRENT_AUTH_CUSTODY_REQUIRED');result.current_auth_cutover_verified=true;
    restore('execution-postgres','exec_owner','portal_execution','execution-final.dump');
    restoreArtifacts(result.artifact_backup);
    cutoverAllowed=true;
  }finally{
    privateWrite('authorization-dr.json',{...result,cutover_allowed:cutoverAllowed});
    // An unsuccessful current-authority restore MUST NOT start applications
    // against the stale-before-revoke snapshot, even from a cleanup finally.
    if(cutoverAllowed){
      compose(['up','-d','--no-build','--no-deps','--pull','never','--wait','--wait-timeout','120','control-api','portal-api','quant-worker-py']);
      docker(['exec',owned('portal-web'),'nginx','-s','reload']);
    }
  }
  result.domain_after=domainHash();assert.deepEqual(result.domain_after,domainBefore);result.domain_all_table_parity=true;
  result.artifacts_after=artifacts();assert.deepEqual(result.artifacts_after,result.artifacts_before);
  privateWrite('authorization-dr.json',result);
  await reader.call('GET','/api/v1/execution/retained-review',undefined,[401]);
  await namedClient('udb04-reader-01').call('GET','/api/v1/execution/alphas?environment=all&limit=20');
  await operator.call('GET','/api/v1/quantbt/runs');
  result.passed=true;privateWrite('authorization-dr.json',result);
  console.log(JSON.stringify({passed:true,auth_cases:result.auth.checks.length,stale_auth_cutover_rejected:true,
    execution_table_count:Object.keys(result.domain_after).length,artifacts:result.artifacts_after.strict_verified,
    denominator:result.artifacts_after.strict_denominator,missing:result.artifacts_after.missing_manifests.length}));
}
async function resumeReads(){
  const result=readPrivate('authorization-dr.json');
  assert(result.current_auth_cutover_verified&&result.cutover_allowed&&result.stale_auth_restore_rejected,
    'RESTORE_CHECKPOINT_REQUIRED_BEFORE_HTTP_RESUME');
  assert.equal(custody(),result.current_authority_sha256,'CURRENT_AUTH_CUSTODY_REQUIRED');
  assert.equal(hash(readFileSync(join(HOME,result.domain_backup.name))),result.domain_backup.sha256);
  // The previous run reached its final HTTP read, but a socket closure lost
  // the final in-memory hashes. Compare the restored domain independently to
  // the same original backup in a NEW named database; no repeated outages,
  // no source restore and no manufactured rows or artifact bytes.
  const exists=docker(['exec',owned('execution-postgres'),'psql','-X','-U','exec_owner','-d','postgres','-Atc',
    "SELECT count(*) FROM pg_database WHERE datname='udb04_dr_verify'"]).trim();assert.equal(exists,'0');
  docker(['exec',owned('execution-postgres'),'createdb','-U','exec_owner','udb04_dr_verify']);
  try{
    restore('execution-postgres','exec_owner','udb04_dr_verify',result.domain_backup.name);
    result.domain_before=domainHash(true);result.domain_after=domainHash();assert.deepEqual(result.domain_after,result.domain_before);
    result.domain_all_table_parity=true;
  }finally{docker(['exec',owned('execution-postgres'),'dropdb','-U','exec_owner','udb04_dr_verify']);}
  result.artifacts_after=artifacts();assert.deepEqual(result.artifacts_after,result.artifacts_before);
  privateWrite('authorization-dr.json',result);
  const state=sessions(),revoked=state.identities.find(u=>u.id===result.owned_revoke_target);assert(revoked);
  await client(revoked).call('GET','/api/v1/execution/retained-review',undefined,[401]);
  for(const name of ['udb04-reader-01','udb04-operator']){
    const u=state.identities.find(u=>u.username===name);assert(u);
    await client(u).call('POST','/api/auth/login',{username:u.username,credential:u.password},[201]);
  }
  privateWrite('sessions.json',state);
  await namedClient('udb04-reader-01').call('GET','/api/v1/execution/alphas?environment=all&limit=20');
  await namedClient('udb04-operator').call('GET','/api/v1/quantbt/runs');
  result.passed=true;result.http_resume='ONLY_HTTP_AND_VERIFICATION_RETAKEN_AFTER_IDLE_SOCKET_CLOSED';
  privateWrite('authorization-dr.json',result);
  console.log(JSON.stringify({passed:true,auth_cases:result.auth.checks.length,
    execution_tables:Object.keys(result.domain_after).length,artifacts:result.artifacts_after.strict_verified,
    denominator:result.artifacts_after.strict_denominator,missing:result.artifacts_after.missing_manifests.length,stale_auth_cutover_rejected:true}));
}
if(process.argv.includes('--resume-reads'))await resumeReads();else await main();
