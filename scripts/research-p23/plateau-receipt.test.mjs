import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {assessPlateau,PLATEAU_LIMITS,NODE_PROBE,preflightBudgetReady} from './plateau-receipt.mjs';
const baseline={resource:{total_current_bytes:100},api:{parent_start:'a',rss_bytes:100,pss_bytes:90,fds:12},worker:{parent_start:'w',rss_bytes:100,pss_bytes:90,fds:12,scratch:[{kind:'scratch',files:3,bytes:32}]}};
test('three rounds require the same parent, stable FD/RSS/PSS and no new scratch files',()=>{
 const rounds=Array.from({length:3},()=>structuredClone(baseline));assert.equal(assessPlateau(baseline,rounds).passed,true);
 assert.throws(()=>assessPlateau(baseline,rounds.slice(1)),/THREE_POST_WARMUP/);
 for(const mutate of [r=>{r.api.parent_start='restarted';},r=>{r.worker.rss_bytes+=PLATEAU_LIMITS.parent_rss_growth_bytes+1;},r=>{r.worker.pss_bytes+=PLATEAU_LIMITS.parent_pss_growth_bytes+1;},r=>{r.api.fds+=5;},r=>{r.worker.scratch[0].bytes++;},r=>{r.worker.scratch[0].files++;},r=>{r.resource.total_current_bytes=PLATEAU_LIMITS.maximum_bytes+1;}]) {
  const changed=structuredClone(rounds);mutate(changed[2]);assert.equal(assessPlateau(baseline,changed).passed,false);
 }
});
test('Control API measurement selects node dist/main.js, not Docker init PID 1 or a probe',()=>{
 const run=processes=>{
  let result;
  const fake={readdirSync:p=>p==='/proc'?Object.keys(processes):['0','1','2','3','4'],readFileSync:p=>{
   const [,scope,pid,file]=p.split('/');if(scope!=='proc')return '12345';const proc=processes[pid];
   if(file==='cmdline')return proc.join('\0')+'\0';
   if(file==='stat')return pid+' (node) '+Array.from({length:20},(_,i)=>i===19?'987':'0').join(' ');
   if(file==='status')return 'VmRSS: 1024 kB';if(file==='smaps_rollup')return 'Pss: 512 kB';throw new Error('unexpected probe read');
  }};
  runInNewContext(NODE_PROBE,{require:name=>{assert.equal(name,'node:fs');return fake;},console:{log:value=>{result=value;}}});
  return JSON.parse(result);
 };
 const measured=run({'1':['/sbin/docker-init','--','node','dist/main.js'],'7':['node','dist/main.js'],'31':['node','-e','probe']});
 assert.equal(measured.parent_pid,7);assert.equal(measured.parent_start,'987');assert.equal(measured.rss_bytes,1048576);assert.equal(measured.pss_bytes,524288);assert.equal(measured.fds,5);
 assert.throws(()=>run({'1':['/sbin/docker-init','--','node','dist/main.js']}),/EXACT_CONTROL_API_MAIN_PID_REQUIRED/);
 assert.throws(()=>run({'7':['node','dist/main.js'],'8':['node','dist/main.js']}),/EXACT_CONTROL_API_MAIN_PID_REQUIRED/);
});
test('fault is bound to new exact child/lease and never restarts services or edits source/SQL',()=>{
 const code=readFileSync(new URL('./plateau-receipt.mjs',import.meta.url),'utf8');
 assert(code.includes("payload['lease_epoch']==int(epoch)"));assert(code.includes('str(int(epoch))==str(epoch)'));
 assert(code.includes('os.getpgid(pid)==pid'));
 assert(code.includes('launcher_start'));assert(code.includes('os.killpg(pid,signal.SIGKILL)'));
 assert(!code.includes("docker(['stop'"));assert(!code.includes('UPDATE research.'));assert(!code.includes('rmtree'));
});
test('preflight token backpressure waits for natural expiry without changing the eight-slot budget',()=>{
 assert.equal(preflightBudgetReady({count:7,capacity:8}),true);assert.equal(preflightBudgetReady({count:8,capacity:8}),false);
 assert.equal(preflightBudgetReady({count:9,capacity:8}),false);
 for(const value of [{count:-1,capacity:8},{count:'8',capacity:8},{count:0,capacity:17},{count:0,capacity:0}])assert.throws(()=>preflightBudgetReady(value));
 const code=readFileSync(new URL('./plateau-receipt.mjs',import.meta.url),'utf8');
 assert(code.includes('m.actor_user_id=p.actor_user_id'));assert(code.includes('m.expires_at>now()'));
 assert(!code.includes('UPDATE research.'));assert(!code.includes('DELETE FROM'));assert(code.includes('660000'));
});
