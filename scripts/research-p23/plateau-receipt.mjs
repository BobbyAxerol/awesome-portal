#!/usr/bin/env node
/** W08: real public WFO complete/fail/cancel, no parent restart or source rewrite. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, privateJson, refreshTestSessions, savePrivate } from './api-client.mjs';
import { PROJECT, validateHome } from './cell.mjs';
import { admitRealRun } from './real-run.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';
import { takeSnapshot } from './resource-snapshot.mjs';

export const PLATEAU_LIMITS = Object.freeze({ rounds: 3, maximum_bytes: 5_000_000_000,
  parent_rss_growth_bytes: 64 * 1024 * 1024, parent_pss_growth_bytes: 64 * 1024 * 1024,
  parent_fd_growth: 4, scratch_file_growth: 0, scratch_byte_growth: 0 });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const PROBE=String.raw`
import json,os,pathlib,stat,signal,sys
input=json.load(sys.stdin)
root=pathlib.Path(os.environ.get('PORTAL_ARTIFACT_ROOT','/var/lib/portal/artifacts/runs'))
scratch=pathlib.Path(os.environ.get('PORTAL_RESEARCH_P10_SCRATCH_ROOT',str(root/'p10-scratch'))).resolve()
if input['action']=='sample':
 p=pathlib.Path('/proc/1');start=p.joinpath('stat').read_text().rsplit(') ',1)[1].split()[19]
 status=dict(line.split(':',1) for line in p.joinpath('status').read_text().splitlines() if ':' in line)
 roll=dict(line.split(':',1) for line in p.joinpath('smaps_rollup').read_text().splitlines() if ':' in line)
 out={'parent_start':start,'rss_bytes':int(status['VmRSS'].split()[0])*1024,'pss_bytes':int(roll['Pss'].split()[0])*1024,'fds':len(list(p.joinpath('fd').iterdir())),'cgroup_bytes':int(pathlib.Path('/sys/fs/cgroup/memory.current').read_text()),'scratch':[]}
 if input['worker']:
  for key,default in [('PORTAL_RESEARCH_P10_MARKET_ROOT',root/'p10-market'),('PORTAL_RESEARCH_P10_SCRATCH_ROOT',scratch)]:
   directory=pathlib.Path(os.environ.get(key,str(default))).resolve();count=total=entries=0
   if directory.exists():
    for f in directory.rglob('*'):
     entries+=1
     if entries>20000:raise RuntimeError('BOUNDED_SCRATCH_INVENTORY_REQUIRED')
     info=f.lstat()
     if stat.S_ISLNK(info.st_mode):raise RuntimeError('SCRATCH_SYMLINK_REFUSED')
     if stat.S_ISREG(info.st_mode):count+=1;total+=info.st_size
   out['scratch'].append({'kind':key,'files':count,'bytes':total})
 print(json.dumps(out))
else:
 assert input['action'] in ('observe-child','fail-child')
 expected=scratch/input['job_id']/input['worker_attempt_id']/'receipt.json'
 assert expected.resolve().is_relative_to(scratch) and not expected.is_symlink()
 matches=[]
 for p in pathlib.Path('/proc').iterdir():
  if not p.name.isdecimal() or int(p.name)<=1:continue
  try:
   args=p.joinpath('cmdline').read_bytes().split(b'\0')
   if not args or pathlib.Path(os.fsdecode(args[0])).name!='unshare' or b'--receipt' not in args:continue
   index=args.index(b'--receipt')
   if index+1>=len(args) or pathlib.Path(os.fsdecode(args[index+1]))!=expected:continue
   payload=json.loads(expected.read_text())
   epoch=input['lease_epoch']
   assert type(epoch) in (int,str) and str(epoch).isascii() and str(epoch).isdecimal() and int(epoch)>0 and str(int(epoch))==str(epoch)
   assert type(payload['lease_epoch']) is int
   assert payload['job_id']==input['job_id'] and payload['worker_attempt_id']==input['worker_attempt_id'] and payload['lease_epoch']==int(epoch)
   pid=int(p.name);assert os.getpgid(pid)==pid
   matches.append((pid,p.joinpath('stat').read_text().rsplit(') ',1)[1].split()[19]))
  except (FileNotFoundError,ProcessLookupError):continue
 assert len(matches)<=1
 out={'matched':len(matches)==1,'action':input['action']}
 if matches:
  pid,start=matches[0]
  assert pathlib.Path('/proc',str(pid),'stat').read_text().rsplit(') ',1)[1].split()[19]==start
  out.update({'launcher_pid':pid,'launcher_start':start,'exact_receipt_bound':True})
  if input['action']=='fail-child':os.killpg(pid,signal.SIGKILL);out['signal']='SIGKILL'
 print(json.dumps(out))
`;
function probe(service,input) {
  return JSON.parse(docker(['exec','-i',container(service),'python','-c',PROBE],JSON.stringify(input)));
}
// Control API image has Node only: the same proc fields are measured without a helper image.
export const NODE_PROBE=String.raw`const fs=require('node:fs');const text=p=>fs.readFileSync(p,'utf8');const fields=p=>Object.fromEntries(text(p).split('\n').filter(x=>x.includes(':')).map(x=>{const i=x.indexOf(':');return[x.slice(0,i),x.slice(i+1)];}));const matches=fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x)).filter(x=>{try{const args=text('/proc/'+x+'/cmdline').split('\0').filter(Boolean);return args.length===2&&args[0].split('/').at(-1)==='node'&&args[1]==='dist/main.js';}catch(e){if(e.code==='ENOENT'||e.code==='ESRCH')return false;throw e;}});if(matches.length!==1)throw new Error('EXACT_CONTROL_API_MAIN_PID_REQUIRED');const pid=Number(matches[0]),root='/proc/'+pid,s=fields(root+'/status'),r=fields(root+'/smaps_rollup');console.log(JSON.stringify({parent_pid:pid,parent_start:text(root+'/stat').split(') ')[1].trim().split(/\s+/)[19],rss_bytes:parseInt(s.VmRSS)*1024,pss_bytes:parseInt(r.Pss)*1024,fds:fs.readdirSync(root+'/fd').length,cgroup_bytes:Number(text('/sys/fs/cgroup/memory.current'))}));`;
function sample() {
  const worker=probe('quant-worker-py',{action:'sample',worker:true});
  const api=JSON.parse(docker(['exec',container('control-api'),'node','-e',NODE_PROBE]));
  const resource=takeSnapshot(PROJECT,true);
  assert(resource.within_base_limit&&resource.all_active_services_bounded,'EXACT_AGGREGATE_5GB_CAP_REQUIRED');
  return {at_utc:new Date().toISOString(),worker,api,resource};
}
export function assessPlateau(baseline,rounds) {
  assert.equal(rounds.length,PLATEAU_LIMITS.rounds,'THREE_POST_WARMUP_ROUNDS_REQUIRED');
  const failures=[];
  for(const [index,current] of rounds.entries()) {
    if(current.resource.total_current_bytes>PLATEAU_LIMITS.maximum_bytes)failures.push(`AGGREGATE_CAP:${index}`);
    for(const service of ['worker','api']) {
      const first=baseline[service],next=current[service];
      if(next.parent_start!==first.parent_start)failures.push(`${service}:PARENT_RESTART:${index}`);
      if(first.parent_pid!==undefined&&next.parent_pid!==first.parent_pid)failures.push(`${service}:PARENT_PID_CHANGED:${index}`);
      for(const [field,limit] of [['rss_bytes',PLATEAU_LIMITS.parent_rss_growth_bytes],['pss_bytes',PLATEAU_LIMITS.parent_pss_growth_bytes],['fds',PLATEAU_LIMITS.parent_fd_growth]])
        if(next[field]-first[field]>limit)failures.push(`${service}:${field}:GROWTH:${index}`);
    }
    for(const first of baseline.worker.scratch) {
      const next=current.worker.scratch.find(x=>x.kind===first.kind);assert(next,'SAME_SCRATCH_ROOTS_REQUIRED');
      if(next.files>first.files||next.bytes>first.bytes)failures.push(`${first.kind}:SCRATCH_GROWTH:${index}`);
    }
  }
  return {passed:failures.length===0,failures};
}
const active=()=>dbQuery("SELECT count(*)::int AS n FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')").rows[0].n;
const immutable=()=>dbQuery("SELECT artifact_id,artifact_revision,state,manifest_digest FROM research.artifacts WHERE state='SEALED' ORDER BY artifact_id,artifact_revision").rows;

export function preflightBudgetReady({count,capacity}) {
  assert(Number.isSafeInteger(count)&&count>=0,'MEASURED_PREFLIGHT_COUNT_REQUIRED');
  assert(Number.isSafeInteger(capacity)&&capacity>=1&&capacity<=16,'PUBLISHED_PREFLIGHT_CAPACITY_REQUIRED');
  return count<capacity;
}
async function waitForPreflightSlot(receipt,warm,path) {
  // The producer correctly keeps a finite actor-scoped token budget. Wait for
  // natural expiry; never delete/expire tokens in SQL or increase the cap.
  const capacity=JSON.parse(docker(['exec',container('control-api'),'node','-e',
    "console.log(JSON.stringify(Number(process.env.RESEARCH_PREFLIGHT_MAXIMUM_ACTIVE_MANIFESTS_PER_ACTOR??8)))"]));
  const deadline=Date.now()+660000;
  let wait;
  for(;;) {
    const budget=dbQuery(`SELECT count(m.preflight_token)::int AS count
      FROM research.run_producers p LEFT JOIN research.preflight_manifests m
        ON m.workspace_id=p.workspace_id AND m.actor_user_id=p.actor_user_id AND m.expires_at>now()
      WHERE p.run_id=$1`,[warm.run_id]).rows[0];
    if(preflightBudgetReady({...budget,capacity})) {
      if(wait){wait.completed_at_utc=new Date().toISOString();savePrivate(path,receipt);}
      return Boolean(wait);
    }
    assert(Date.now()<deadline,'BOUNDED_NATURAL_PREFLIGHT_EXPIRY_REQUIRED');
    if(!wait){wait={started_at_utc:new Date().toISOString(),capacity,initial_count:budget.count,samples:0};(receipt.budget_waits??=[]).push(wait);}
    wait.samples++;savePrivate(path,receipt);
    console.log('P23 plateau waits for natural actor-scoped preflight expiry',budget.count,capacity);
    await sleep(15000);receipt.samples.push(sample());savePrivate(path,receipt);
  }
}

export async function plateauReceipt(home=DEFAULT_HOME,label='wfo-cycles') {
  home=validateHome(home);assert(/^[a-z][a-z0-9-]{0,30}$/.test(label));
  const path=join(home,`plateau-${label}.json`);assert(!existsSync(path),'INSPECT_EXISTING_CYCLES_DO_NOT_REPEAT');
  assert.equal(active(),0,'ACTIVE_COMPUTE_REFUSED');
  const warm=privateJson(join(home,'run-plateau-warmup.json'));
  assert.equal(warm.final.body.current.effective_status,'COMPLETED','ACTUAL_WFO_WARMUP_REQUIRED');
  const identity=privateJson(join(home,'identity.json')),original=immutable();
  const receipt={schema_version:'research.p23-plateau.v1',project:PROJECT,identity,
    instrumentation_sha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    started_at_utc:new Date().toISOString(),limits:PLATEAU_LIMITS,warmup_run_id:warm.run_id,
    fault_scope:'Only exact new receipt-bound unshare process group SIGKILL; public cancel; no parent/service restart, source timestamp/SQL mutation or immutable-byte edit.',
    baseline:sample(),original_seals:original,original_seals_sha256:hash(original),
    cycles:[],round_samples:[],samples:[],passed:false};
  savePrivate(path,receipt);
  let currentEntry;
  try {
    for(let round=0;round<PLATEAU_LIMITS.rounds;round++)for(const mode of ['complete','fail','cancel']) {
      assert.equal(active(),0,'ONE_OWNED_JOB_AT_A_TIME');
      if (await waitForPreflightSlot(receipt,warm,path)) {
        // The finite preflight token wait can outlive the test session. Renew
        // only the existing owned identities through their real password login.
        await refreshTestSessions(home);
      }
      const entry=await admitRealRun(home,'wfo',`plateau-${label}-${round}-${mode}`);
      currentEntry=entry;
      const cycle={round,mode,run_id:entry.receipt.run_id,started_at_utc:new Date().toISOString(),fault:null};
      receipt.cycles.push(cycle);savePrivate(path,receipt);
      const deadline=Date.now()+180000;
      while(Date.now()<deadline) {
        if(mode!=='complete'&&!cycle.fault) {
          // A 202 is admission, not proof that a worker has claimed the job.
          // Wait for the real attempt; never manufacture a lease to inject a fault.
          const claim=dbQuery(`SELECT j.job_id,j.current_worker_attempt_id AS worker_attempt_id,w.lease_epoch
            FROM research.run_producers p JOIN research.jobs j USING(workspace_id,job_id)
            JOIN research.worker_attempts w ON w.workspace_id=j.workspace_id AND w.worker_attempt_id=j.current_worker_attempt_id
            WHERE p.run_id=$1`,[cycle.run_id]).rows[0];
          const found=claim ? probe('quant-worker-py',{action:mode==='fail'?'fail-child':'observe-child',...claim}) : {matched:false};
          if(found.matched) {
            cycle.fault={...found,at_utc:new Date().toISOString()};
            if(mode==='cancel')cycle.cancel=await entry.client.call('POST',`/api/v1/research/runs/${cycle.run_id}/cancel`,{reason:'P23 W08 exact owned cycle cancellation'},[202]);
            savePrivate(path,receipt);
          }
        }
        const progress=await entry.client.call('GET',`/api/v1/research/runs/${cycle.run_id}/progress`);
        receipt.samples.push(sample());savePrivate(path,receipt);
        const state=progress.body.current.effective_status;
        if(['COMPLETED','FAILED','CANCELLED'].includes(state)&&progress.body.current.terminal_materialization!=='PENDING') {
          cycle.final=progress;assert.equal(state,{complete:'COMPLETED',fail:'FAILED',cancel:'CANCELLED'}[mode]);
          if(mode!=='complete')assert(cycle.fault,'ACTUAL_RUNNING_CHILD_FAULT_REQUIRED');
          cycle.completed_at_utc=new Date().toISOString();savePrivate(path,receipt);break;
        }
        await sleep(250);
      }
      assert(cycle.final,'BOUNDED_REAL_TERMINAL_REQUIRED');assert.equal(active(),0);
      await sleep(1000);
      if(mode==='cancel')receipt.round_samples.push(sample());
      console.log('P23 plateau cycle',round,mode,cycle.final.body.current.effective_status);
    }
    receipt.plateau=assessPlateau(receipt.baseline,receipt.round_samples);
    const ids=original.map(x=>`${x.artifact_id}:${x.artifact_revision}`);
    const after=immutable().filter(x=>ids.includes(`${x.artifact_id}:${x.artifact_revision}`));
    assert.deepEqual(after,original,'ORIGINAL_SEALS_CHANGED');receipt.original_seals_sha256=hash(original);
    receipt.passed=receipt.plateau.passed;receipt.completed_at_utc=new Date().toISOString();savePrivate(path,receipt);
    console.log(JSON.stringify({passed:receipt.passed,cycles:receipt.cycles.length,plateau:receipt.plateau}));
    assert(receipt.passed,'W08_PLATEAU_FAILED');
    return receipt;
  } catch(error) {
    receipt.failure=error.message;receipt.failed_at_utc=new Date().toISOString();savePrivate(path,receipt);throw error;
  } finally {
    // On an instrumentation failure, cancel only the newly admitted test run.
    // Do not kill/restart the parent or interrupt an unrelated job.
    if(currentEntry) {
      const own=dbQuery(`SELECT j.state FROM research.run_producers p JOIN research.jobs j USING(workspace_id,job_id) WHERE p.run_id=$1`,[currentEntry.receipt.run_id]).rows[0];
      if(own&&['CLAIMED','RUNNING','QUEUED'].includes(own.state)) {
        receipt.cleanup_cancel=await currentEntry.client.call('POST',`/api/v1/research/runs/${currentEntry.receipt.run_id}/cancel`,{reason:'P23 exact owned interrupted instrumentation cleanup'},[202,409]);
        savePrivate(path,receipt);
      }
    }
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  plateauReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
    process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'wfo-cycles')
    .catch(error=>{console.error('P23 plateau refused:',error.message);process.exitCode=1;});
}
