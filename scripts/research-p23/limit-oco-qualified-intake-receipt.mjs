#!/usr/bin/env node
/** Qualification metadata opening proof; no second engine run. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateHome} from './cell.mjs';
import {privateJson,savePrivate,loadSessions,makeClient,ensureOwnedOperatorSession} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/expanded'),'EXACT_APPROVED_CELL');
const env=join(home,'preview.env'),stat=lstatSync(env);
assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_OWNED_ENV');
let text=readFileSync(env,'utf8');
assert(/^PORTAL_STACK_NAME=portal-research-p23-ol12$/m.test(text)
 &&/^PORTAL_HTTP_PORT=8096$/m.test(text),'OWNED_PROJECT_ONLY');
const count=execFileSync('sudo',['-n','docker','exec','portal-research-p23-ol12-control-api-1','node','-e',`
const {Pool}=require('pg'),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
p.query("SELECT count(*)::int n FROM research.runs WHERE state IN ('QUEUED','RUNNING','SEALING')")
 .then(r=>process.stdout.write(String(r.rows[0].n))).finally(()=>p.end()).catch(()=>{process.exitCode=1});`],{encoding:'utf8'}).trim();
assert.equal(count,'0','NO_CHILD_DURING_QUALIFICATION_TRANSITION');
for(const key of ['CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID','PORTAL_RECIPE_QUALIFICATION_PROFILE_ID']){
 assert(new RegExp(`^${key}=.*$`,'m').test(text),'EXPLICIT_OWNED_SELECTOR');
 text=text.replace(new RegExp(`^${key}=.*$`,'m'),`${key}=`);
}
writeFileSync(env,text,{mode:0o600});
execFileSync('node',[fileURLToPath(new URL('./cell.mjs',import.meta.url)),'up',`--home=${home}`],
 {stdio:'pipe',timeout:240000,maxBuffer:4*1024**2});
const identity=privateJson(join(home,'identity.json'));
assert.equal(identity.qualification_profile_id,'','NO_CANDIDATE_BYPASS');
const client=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner'),{connectionClose:true});
await ensureOwnedOperatorSession(client,home);
const proof={schema_version:'research.limit-oco-qualified-intake-receipt.v1',identity,passed:false,reads:[]};
try{
 for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
  const original=privateJson(join(home,`qualification-native-event-driven-${symbol.toLowerCase()}-1.json`));
  const spec=original.run.requested_spec;
  const query=new URLSearchParams({...spec.alpha_binding,...spec.data});
  const options=await client.call('GET',`/api/v1/research/runs/setup-options?${query}`);
  const profile=options.body.profiles.find(r=>r.profile_id===original.profile_id);
  assert(profile&&profile.state==='ENABLED'&&profile.budget.qualification==='PRODUCT_RUN_QUALIFIED','QUALIFIED_WITHOUT_SELECTOR');
  const preflight=await client.call('POST','/api/v1/research/preflights',{requested_spec:spec},[201]);
  assert.equal(preflight.body.may_create_run,true,'ORDINARY_FRESH_PREFLIGHT');
  const progress=await client.call('GET',`/api/v1/research/runs/${original.run.run_id}/progress`);
  assert.equal(progress.body.current.effective_status,'COMPLETED','ORIGINAL_RUN_PRESERVED');
  assert.deepEqual(progress.body.native_execution,original.reads.evidence.body.core.native_execution,'SOURCE_FACTS_UNCHANGED');
  proof.reads.push({symbol,run_id:original.run.run_id,options,preflight,progress});
 }
 proof.passed=true;
 console.log(JSON.stringify({passed:true,selectors:'EMPTY',qualified_symbols:3,new_children:0}));
}finally{
 proof.finished_at_utc=new Date().toISOString();
 savePrivate(join(home,'limit-oco-qualified-intake.json'),proof);
}
