#!/usr/bin/env node
/** Exact actor-local RC seal/retry and existing terminal reads on owned :8096. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, docker } from './runtime-tools.mjs';

const WORKSPACE='ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const RC_RUN='rrun_0d7891d8904d2a753d87771a59ffcdde';
const TERMINAL_RUNS={FAILED:'rrun_26c7490c49549f89e1b665a9b83b7037',CANCELLED:'rrun_c3fbd622a5498da697a01035d0451cb5'};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertActorLocked(composed) {
  assert.equal(composed.local_seal.state,'SEALED_LOCAL');
  assert.equal(composed.actions.may_edit_draft,false);
  assert.equal(composed.actions.may_seal,false);
  assert.equal(composed.actions.seal_blocked_reason,'P21_ALREADY_SEALED');
}
export async function rcTerminalReceipt(home=DEFAULT_HOME) {
  home=validateHome(home);
  const user=loadSessions(home).identities.find(row=>row.username==='p23-owner');
  assert(user?.id && user.password,'EXISTING_OWNER_ANCHOR_REQUIRED');
  const client=makeClient({...user,cookies:{}});
  const receipt={schema_version:'research.b8-rc-terminal-owned-api.v1',project:PROJECT,base_url:BASE_URL,
    at_utc:new Date().toISOString(),image_id:docker(['inspect','--format','{{.Image}}',container('control-api')]).trim(),
    run_id:RC_RUN,rc:{},terminals:[],passed:false};
  const path=join(home,'b8-rc-terminal-receipt.json');
  const query=`workspace_id=${WORKSPACE}`;
  const read=(id,suffix)=>client.call('GET',`/api/v1/quantbt/runs/${id}/${suffix}?${query}`);
  let authenticated=false;
  try {
    await client.call('POST','/api/auth/login',{username:user.username,credential:user.password},[201]);authenticated=true;
    const initial=await read(RC_RUN,'release-candidate');receipt.rc.initial=initial;
    let draft=initial.body;
    if(draft.local_seal.state==='UNSEALED') {
      assert.equal(draft.actions.may_edit_draft,true);assert.equal(draft.pack_counts.missing,0);
      receipt.rc.patch=await client.call('PATCH',`/api/v1/quantbt/runs/${RC_RUN}/release-candidate/draft?${query}`,{
        expected_revision:draft.draft.revision,expected_source_fingerprint:draft.source_fingerprint,
        known_limitations:'Isolated B8 contract qualification only. Missing engine certificates and generation clocks remain explicitly absent. This pack makes no financial efficacy claim.',
        proposed_use_restrictions:'Owned P23 test workspace only. No Trading System, deployment, publication, broker or funds authority.',
      });
      draft=receipt.rc.patch.body;assert.equal(draft.actions.may_seal,true);savePrivate(path,receipt);
    } else assertActorLocked(draft);
    const input={draft_id:draft.draft.draft_id,expected_draft_revision:draft.draft.revision,
      expected_source_fingerprint:draft.draft.source_fingerprint};
    const sealPath=`/api/v1/quantbt/runs/${RC_RUN}/release-candidate/seal?${query}`;
    receipt.rc.seal=await client.call('POST',sealPath,input,[201]);savePrivate(path,receipt);
    const sealed=await read(RC_RUN,'release-candidate');receipt.rc.sealed=sealed;assertActorLocked(sealed.body);
    receipt.rc.retry=await client.call('POST',sealPath,input,[201]);assert.deepEqual(receipt.rc.retry.body,receipt.rc.seal.body);
    receipt.rc.refused_patch=await client.call('PATCH',`/api/v1/quantbt/runs/${RC_RUN}/release-candidate/draft?${query}`,{
      expected_revision:sealed.body.draft.revision,expected_source_fingerprint:sealed.body.draft.source_fingerprint,
      known_limitations:sealed.body.draft.known_limitations,proposed_use_restrictions:sealed.body.draft.proposed_use_restrictions,
    },[409]);assert.equal(receipt.rc.refused_patch.body.error.code,'RESEARCH_RELEASE_CANDIDATE_CONFLICT');
    const rcId=receipt.rc.seal.body.release_candidate_id;
    receipt.rc.pack=await client.call('GET',`/api/v1/research/release-candidates/${rcId}?${query}`);
    assert.equal(receipt.rc.pack.body.pack_digest,receipt.rc.seal.body.pack_digest);
    const after=await read(RC_RUN,'release-candidate');assertActorLocked(after.body);
    assert.deepEqual(after.body.local_seal,sealed.body.local_seal);
    assert.equal(after.body.local_seal.delivery_state,'NOT_DELIVERED');
    assert(after.body.pack.find(row=>row.n===1).source.href.startsWith('/research/quantbt/alphas/'));
    for(const n of [10,12]) assert.equal(after.body.pack.find(row=>row.n===n).source.href,`/research/quantbt/runs/${RC_RUN}/release-candidate`);
    for(const [status,id] of Object.entries(TERMINAL_RUNS)) {
      const progress=await client.call('GET',`/api/v1/research/runs/${id}/progress?${query}`);
      assert.equal(progress.body.current.effective_status,status);
      const split=await read(id,'current-source/split');
      assert.equal(split.body.schema_version,'research.current-source-split-terminal-absence.v1');
      assert.equal(split.body.lane.effective_status,status);
      assert.equal(split.body.availability.state,'NOT_PUBLISHED');assert(!('folds' in split.body));
      const console=await client.call('GET',`/api/v1/research/runs/${id}/console?${query}`);
      receipt.terminals.push({run_id:id,status,progress,split,console});savePrivate(path,receipt);
    }
    receipt.passed=true;return receipt;
  } finally {
    if(authenticated) await client.call('POST','/api/auth/logout',{},[200,201]);
    receipt.owner_session_revoked=authenticated;receipt.finished_at_utc=new Date().toISOString();savePrivate(path,receipt);
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  rcTerminalReceipt(process.argv.find(arg=>arg.startsWith('--home='))?.slice(7)??DEFAULT_HOME)
    .then(value=>console.log(`Owned RC lock/retry + terminal reads PASS ${sha(value)}`))
    .catch(error=>{console.error('Owned RC/terminal refused:',error.message);process.exitCode=1;});
}
