/** Reactivate/revoke only the previously issued P23 readers through owner APIs. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, readBoundedJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';

export function allowedRetakeIdentity(user) {
  return /^p23-reader-(?:0[1-9]|1[0-9]|20)$/.test(user.username);
}
async function operation(owner, user, action, revision) {
  assert(allowedRetakeIdentity(user) || action === 'revoke-sessions' && user.username === 'p23-owner'
    || action === 'disable' && user.username === 'p23-approver',
    'ONLY_OWNED_RETAKE_IDENTITIES');
  assert(Number.isSafeInteger(revision) && revision >= 0,'EXACT_ACCOUNT_REVISION_REQUIRED');
  const response=await fetch(`${BASE_URL}/api/admin/accounts/${encodeURIComponent(user.id)}/${action}`,{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(45000),headers:{origin:BASE_URL,
      accept:'application/json','content-type':'application/json','x-dev-access-email':'p23-owner@azdag.com',
      cookie:[...owner.jar].map(([key,value])=>`${key}=${value}`).join('; '),
      'x-portal-csrf':owner.jar.get('__Host-portal_csrf')??'',
      'x-portal-idempotency-key':`p23-retake-${randomUUID()}`},body:JSON.stringify({expected_revision:revision,
        ...(action==='activation'?{reissue:true}:{})}),
  });
  const body=await readBoundedJson(response);
  assert(response.status>=200 && response.status<300,`OWNED_ACCOUNT_${action}_REFUSED:${body.error?.code??response.status}`);
  return {status:response.status,operation_id:body.operation_id??null,
    ...(action==='activation'?{activation:body.activation?.token}:{} )};
}
export async function retakeIdentities(home,enable,label) {
  home=validateHome(home);const sessions=loadSessions(home);
  if(label!==undefined) assert(/^[a-z][a-z0-9-]{0,63}$/.test(label),'BOUNDED_IDENTITY_RECEIPT_LABEL_REQUIRED');
  const target=join(home,label?`${label}.json`:enable?'mixed-retake-identities-enable.json':'mixed-retake-identities-cleanup.json');
  if(label) assert(!existsSync(target),'PRIOR_IDENTITY_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const user=sessions.identities.find(x=>x.username==='p23-owner');assert(user,'EXISTING_TEST_OWNER_REQUIRED');
  const owner=makeClient(user);
  await owner.call('POST','/api/auth/login',{username:user.username,credential:user.password},[201]);
  assert.equal((await owner.call('GET','/api/auth/context')).body.principal.principalId,user.id);
  await owner.call('POST','/api/admin/step-up',{password:user.password},[201]);
  const readers=sessions.identities.filter(allowedRetakeIdentity);assert.equal(readers.length,20);
  const receipt={project:PROJECT,base_url:BASE_URL,action:enable?'ENABLE_FOR_MIXED_RETAKE':'DISABLE_AND_REVOKE',
    at_utc:new Date().toISOString(),accounts:[],activation_reissues:[],passed:false};
  savePrivate(target,receipt);
  for(const reader of readers) {
    const account=(await owner.call('GET',`/api/admin/accounts/${reader.id}`)).body.account;
    assert.equal(account.username,reader.username);assert.equal(account.user_id,reader.id);
    const action=enable?'enable':'disable';
    if(account.account_state!==(enable?'ACTIVE':'DISABLED')) {
      receipt.accounts.push({id:reader.id,username:reader.username,action,
        response:await operation(owner,reader,action,account.account_revision)});
    }
    if(enable) {
      const client=makeClient(reader);
      // Bootstrap may have issued a fresh one-time credential when this
      // isolated cell was recreated. Never mine logs or change password rows.
      // Recover only this QA account through the normal owner activation API,
      // keep the returned token private and consume it via change-password.
      const current=(await owner.call('GET',`/api/admin/accounts/${reader.id}`)).body.account;
      if(current.must_change_password) {
        const activated=await operation(owner,reader,'activation',current.account_revision);
        assert(typeof activated.activation==='string','ONE_TIME_QA_ACTIVATION_REQUIRED');
        reader.retake_activation=activated.activation;savePrivate(join(home,'sessions.json'),sessions);
        await client.call('POST','/api/auth/login',{username:reader.username,credential:activated.activation},[201]);
        await client.call('POST','/api/auth/change-password',{
          current_password:activated.activation,new_password:reader.password},[201]);
        receipt.activation_reissues.push({id:reader.id,operation_id:activated.operation_id});
        delete reader.retake_activation;
      }
      await client.call('POST','/api/auth/login',{username:reader.username,credential:reader.password},[201]);
      assert.equal((await client.call('GET','/api/auth/context')).body.principal.principalId,reader.id);
    }
    savePrivate(target,receipt);savePrivate(join(home,'sessions.json'),sessions);
  }
  if(!enable) {
    const approver=sessions.identities.find(x=>x.username==='p23-approver');
    if(approver) {
      const account=(await owner.call('GET',`/api/admin/accounts/${approver.id}`)).body.account;
      if(account.account_state!=='DISABLED') {
        receipt.accounts.push({id:approver.id,username:approver.username,action:'disable',
          response:await operation(owner,approver,'disable',account.account_revision)});
      }
    }
    const account=(await owner.call('GET',`/api/admin/accounts/${user.id}`)).body.account;
    receipt.owner_sessions_revoked=await operation(owner,user,'revoke-sessions',account.account_revision);
  }
  receipt.passed=true;savePrivate(target,receipt);savePrivate(join(home,'sessions.json'),sessions);
  console.log(JSON.stringify({passed:true,action:receipt.action,readers:20,
    qa_activation_reissues:receipt.activation_reissues.length,production_identity_changed:false}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert(process.argv.includes('--enable')!==process.argv.includes('--cleanup'),'CHOOSE_ENABLE_OR_CLEANUP');
  retakeIdentities(process.argv.find(x=>x.startsWith('--home='))?.slice(7)??DEFAULT_HOME,process.argv.includes('--enable'),
    process.argv.find(x=>x.startsWith('--label='))?.slice(8))
    .catch(error=>{console.error('P23 retake identity refused:',error.message);process.exitCode=1;});
}
