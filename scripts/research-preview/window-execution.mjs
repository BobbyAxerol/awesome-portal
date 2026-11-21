#!/usr/bin/env node
// Ordinary preview admission -> isolated child -> P05 -> same-origin reads.
// No direct engine call, DB read, frontend edit, source mutation or production.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from '../../apps/portal/frontend/node_modules/playwright/index.mjs';
const [kind,out]=process.argv.slice(2),base='http://localhost:8095';
assert(['three-a','three-b','wfo','intrabar_bracket','reactive','event_driven','compare'].includes(kind));
assert(out?.startsWith('/home/bobby/.local/state/portal-research-p23/window-execution-'),'PRIVATE_RECEIPT_ROOT_REQUIRED');
mkdirSync(out,{recursive:true,mode:0o700});
const redact=v=>Array.isArray(v)?v.map(redact):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/token|credential|secret|cookie|jwt/i.test(k)?'[REDACTED]':redact(x)])):v;
function save(name,body){const p=resolve(out,name);assert(!existsSync(p),'IMMUTABLE_RECEIPT');writeFileSync(p,JSON.stringify(redact(body),null,2)+'\n',{mode:0o600});}
const origin=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8').match(/^PORTAL_PUBLIC_ORIGIN=(.+)$/m)?.[1];assert(origin);
const browser=await chromium.launch(),context=await browser.newContext({extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}}),api=context.request;
let csrf;
try{
  const login=await api.post(base+'/api/auth/login',{headers:{origin},data:{username:'claude-preview',credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});assert(login.ok());
  csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;assert(csrf);
  async function get(name,path){const r=await api.get(base+path,{timeout:90000}),body=await r.json();save(name,{status:r.status(),body});assert(r.ok(),`${path}: ${r.status()} ${JSON.stringify(body).slice(0,180)}`);return body;}
  async function post(name,path,data){const r=await api.post(base+path,{headers:{origin,'x-portal-csrf':csrf},data,timeout:180000}),body=await r.json();save(name,{status:r.status(),request:data,body});assert(r.ok(),`${path}: ${r.status()} ${JSON.stringify(body).slice(0,220)}`);return body;}
  if(kind==='compare'){
    const runs=['three-a-final','three-b'].map(n=>JSON.parse(readFileSync(resolve(out,'..',n,'receipt.json'),'utf8')).run_id);
    for(const window of ['IS','OOS','HOLDOUT']){
      const r=await get(window+'.json','/api/v1/quantbt/windows/compare?'+new URLSearchParams({runs:runs.join(','),window}));
      assert.equal(r.window,window);assert(r.runs.every(x=>x.availability.state==='AVAILABLE'&&x.analysis.window===window));
      assert(['AVAILABLE','NOT_APPLICABLE'].includes(r.correlation.state));assert(r.correlation.matched_observation_count>20);
    }
    console.log(JSON.stringify({kind,runs,windows:3,result:'PASS'}));
  }else{
    const sources='/home/bobby/.local/state/portal-research-p23/20261006/expanded';
    const file=kind==='intrabar_bracket'?'qualification-native-intrabar-bracket-v3-btcusdt-3.json':
      kind==='reactive'?'qualification-native-reactive-v3-btcusdt-2.json':kind==='event_driven'?'qualification-native-event-driven-v3-btcusdt-2.json':
      'qualification-delta-pct-equity-three-window-optimized-1h-btcusdt-3.json';
    const spec=structuredClone(JSON.parse(readFileSync(resolve(sources,file),'utf8')).run.requested_spec);
    if(kind==='three-b') spec.parameter_space_overrides=[{name:'rvol',kind:'pin',value:1.8}];
    if(kind==='wfo'){
      spec.schema_version='research.requested-spec.v2';spec.protocol='advanced';delete spec.windows;
      spec.walk_forward={start:'2026-07-01T00:00:00Z',end_exclusive:'2026-08-24T00:00:00Z',split_mode:'2026-08-03T00:00:00Z',frequency:'weekly',window_mode:'expanding',label_horizon_bars:0,purge_bars:0,embargo_bars:0};
      spec.optuna_trials=3;
    }
    const resume=process.env.RESEARCH_WEX_RESUME;
    if(resume)assert(resume.startsWith('/home/bobby/.local/state/portal-research-p23/window-execution-')&&resume.endsWith('/created.json'));
    let created;
    if(resume){created=JSON.parse(readFileSync(resume,'utf8')).body;save('resumed-created.json',{original_receipt:resume,body:created});}
    else{const pf=await post('preflight.json','/api/v1/research/preflights',{requested_spec:spec});assert.equal(pf.may_create_run,true);
      created=await post('created.json','/api/v1/research/runs',{schema_version:'research.run-create.v1',client_intent_id:randomUUID(),intent_kind:'NEW',requested_spec:spec,preflight_token:pf.preflight_token});}
    const id=created.run_id??created.run?.run_id;assert(/^rrun_[a-f0-9]{32}$/.test(id));console.log(JSON.stringify({kind,run_id:id}));
    const protectedWindow=await get('protected-holdout.json',`/api/v1/quantbt/runs/${id}/windows/observations?window=HOLDOUT`);
    if(protectedWindow.availability.state!=='AVAILABLE')assert.equal(protectedWindow.rows.length,0);
    const timeline=[];let progress;const deadline=Date.now()+15*60000;
    while(Date.now()<deadline){const r=await api.get(`${base}/api/v1/research/runs/${id}/progress`),body=await r.json();assert(r.ok());progress=body;
      const p={at:new Date().toISOString(),state:body.current?.effective_status,materialization:body.current?.terminal_materialization};timeline.push(p);
      if(timeline.length===1||p.state!==timeline.at(-2).state)console.log(JSON.stringify(p));
      if(['COMPLETED','FAILED','CANCELLED'].includes(p.state)&&p.materialization!=='PENDING')break;
      await new Promise(r=>setTimeout(r,6000));}
    save('progress.json',progress);save('timeline.json',timeline);assert.equal(progress.current.effective_status,'COMPLETED');assert.equal(progress.current.terminal_materialization,'READY');
    const root=`/api/v1/quantbt/runs/${id}`,windows=[];
    for(const window of ['IS','OOS','HOLDOUT']){
      if(kind==='wfo'&&window==='IS')continue;
      const a=await get(`analytics-${window}.json`,root+'/windows/analytics?window='+window),o=await get(`observations-${window}.json`,root+'/windows/observations?'+new URLSearchParams({window,limit:'200'}));
      if(kind.startsWith('three')||kind==='wfo'&&window==='OOS'||['intrabar_bracket','reactive','event_driven'].includes(kind)&&window!=='HOLDOUT'){
        assert.equal(a.availability.state,'AVAILABLE');assert.equal(a.rows[0].payload.window,window);assert.equal(Object.keys(a.rows[0].payload.metrics).length,25);
        assert.equal(o.availability.state,'AVAILABLE');assert(o.rows.every(r=>r.payload.candle!==null));assert(o.counts.matching>100);
        if(o.next_cursor){const next=await get(`observations-${window}-next.json`,root+'/windows/observations?'+new URLSearchParams({window,limit:'200',cursor:o.next_cursor}));assert(next.rows[0].source_ordinal>o.rows.at(-1).source_ordinal);
          const wrong=await api.get(base+root+'/windows/observations?'+new URLSearchParams({window:window==='IS'?'OOS':'IS',limit:'200',cursor:o.next_cursor}));assert.equal(wrong.status(),400);save(`cursor-refusal-${window}.json`,{status:wrong.status(),body:await wrong.json()});}
      }else assert(['NOT_APPLICABLE','NOT_PUBLISHED'].includes(a.availability.state));
      windows.push({window,availability:a.availability,observations:o.counts.matching,revision:a.revision});
    }
    const replay=await get('replay.json',root+'/current-source/replay');
    if(kind==='wfo'){
      const folds=replay.replay_navigation?.segments??replay.navigation?.segments??replay.fold_spans??[];
      // Public fold descriptors, not a guessed ordinal or another run's scope.
      const evidence=await get('evidence.json',root+'/current-source/evidence');
      const split=await get('split.json',root+'/current-source/split');
      const candidates=split.fold_plan?.folds??split.split?.folds??split.folds??folds;
      assert(candidates.length>1,'REAL_ENGINE_FOLDS_REQUIRED');
      for(const fold of candidates){const foldId=String(fold.fold_id??fold.id??fold.fold);
        const a=await get('analytics-IS-fold-'+foldId+'.json',root+'/windows/analytics?'+new URLSearchParams({window:'IS',fold_id:foldId}));
        assert.equal(a.availability.state,'AVAILABLE');assert.equal(a.descriptor.authority,'FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC');}
    }
    if(['intrabar_bracket','reactive','event_driven'].includes(kind)){
      const journal=await get('journal.json',root+'/execution/records?window=OOS&limit=200');assert.equal(journal.availability.state,'AVAILABLE');assert(journal.rows.length>0,'ACTUAL_ENGINE_JOURNAL_REQUIRED');
      const fills=await get('fills.json',root+'/execution/records?window=OOS&record_kind=FILL&limit=200');assert(fills.rows.length>0,'POSITIVE_FILL_PROOF_REQUIRED');
      assert(fills.rows.every(r=>r.payload.fill_price===r.payload.price&&r.payload.fill_qty===r.payload.qty
        &&r.payload.filled_at_utc_ms===r.at_utc_ms),'EXACT_SOURCE_FILL_ALIASES_REQUIRED');
      if(kind==='intrabar_bracket')assert(fills.rows.some(r=>r.payload.exit_reason!==null));
      if(kind==='intrabar_bracket'){
        const orders=await get('order-relation-absence.json',root+'/execution/records?window=OOS&record_kind=ORDER');
        assert.equal(orders.availability.state,'NOT_PUBLISHED');assert.equal(orders.counts.matching,null);
      }
    }
    const identities={project:'portal-research-preview',git_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),working_tree_dirty:true,images:{}};
    for(const service of ['portal-api','control-api','portal-web','quant-worker-py']){
      const actual=JSON.parse(execFileSync('sudo',['-n','docker','inspect','--format','{{json .}}','portal-research-preview-'+service+'-1'],{encoding:'utf8'}));
      assert.equal(actual.Config.Labels['com.docker.compose.project'],identities.project);identities.images[service]=actual.Image;
    }
    save('identity.json',identities);
    const receipt={kind,run_id:id,at_utc:new Date().toISOString(),terminal:progress.current.effective_status,windows,result:'PASS'};
    save('receipt.json',receipt);console.log(JSON.stringify(receipt));
  }
}finally{
  if(csrf){const r=await api.post(base+'/api/auth/logout',{headers:{origin,'x-portal-csrf':csrf}});assert(r.ok(),'OWN_REVIEW_SESSION_REVOKED');}
  await browser.close();
}
