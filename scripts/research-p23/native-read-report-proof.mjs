#!/usr/bin/env node
/** Exact retained run, candidate readers + normal forward migration; no engine or deployment. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {savePrivate} from './api-client.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.argv[2];
assert(out?.startsWith('/home/bobby/.local/state/portal-research-p23/'),'PRIVATE_RECEIPT_PATH_REQUIRED');
const project='portal-research-preview',runId='rrun_ee50cb82d6de9e495e10b32323b62f8c',workspaceId='ws_06GCVTHWC9WVPGEPR85AB15K82';
const inspect=service=>{const r=JSON.parse(execFileSync('sudo',['-n','docker','inspect',`${project}-${service}-1`],{encoding:'utf8'}))[0];
 assert.equal(r.Config.Labels['com.docker.compose.project'],project);return r;};
const control=inspect('control-api'),pg=inspect('portal-postgres'),portal=inspect('portal-api');
const env=Object.fromEntries(control.Config.Env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const url=new URL(env.DATABASE_URL);assert.equal(url.hostname,'portal-postgres');assert.equal(url.pathname,'/portal_control');
const ips=Object.values(pg.NetworkSettings.Networks).map(r=>r.IPAddress).filter(Boolean);assert.equal(ips.length,1);url.hostname=ips[0];
const require=createRequire(join(root,'apps/control-api/package.json'));require('reflect-metadata');
const mod=name=>require(`./dist/${name}`),{Pool}=require('pg'),{loadConfig}=mod('config'),{createControlApiApp}=mod('app');
const {ResearchNativeReadService}=mod('research/native-read.service'),{ResearchNativeReadRepository}=mod('research/native-read.repository');
const {ResearchSearchService}=mod('research/search.service'),{ResearchFreezeService}=mod('research/freeze.service');
const {ResearchReportService}=mod('research/report.service'),{ResearchReportReadResponseSchema}=mod('research/report.contract');
const {NativeCustodySchema}=mod('research/native-read.contract'),{sha256ResearchJson}=mod('research/preflight.service');
const pool=new Pool({connectionString:url.toString(),max:4});let app,stage='migration';
try{
 await mod('cli/migrate').runControlApiMigrations(url.toString(),join(root,'apps/control-api/migrations'),()=>{});
 const config=loadConfig({...env,DATABASE_URL:url.toString(),NODE_ENV:'test'});
 app=await createControlApiApp(config,pool);
 const db=async(sql,args=[])=>{const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='5s'");
  const r=await c.query(sql,args);await c.query('COMMIT');return r.rows;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const [run]=await db('SELECT submitted_by_user_id AS actor,state,state_version,updated_at FROM research.runs WHERE workspace_id=$1 AND run_id=$2',[workspaceId,runId]);
 assert(['READY','COMPLETED'].includes(run.state),'EXISTING_RUN_MUST_BE_TERMINAL_SUCCESS');const scope={workspaceId,actorUserId:run.actor};
 const native=app.get(ResearchNativeReadService),repo=app.get(ResearchNativeReadRepository),search=app.get(ResearchSearchService),freeze=app.get(ResearchFreezeService),report=app.get(ResearchReportService);
 const wfoId='rrun_cf5ed033560082488b559baf29be4754',beforeWfo=await report.read(scope,wfoId);
 const binding=await repo.binding(scope,runId);assert(binding);
 stage='verified-P05-source';
 const sourceText=readFileSync(join(root,'apps/portal/backend/src/portal_api/services/research_native_read.py'),'utf8');
 const code=`__package__='portal_api.services'\n${sourceText.replace('from __future__ import annotations','')}\nfrom portal_api.api.routes_research_internal import retained_artifact_root\nbinding=json.loads(${JSON.stringify(JSON.stringify(binding))})\nprint(json.dumps(prepare_native_read(retained_artifact_root(),binding)))\n`;
 const raw=JSON.parse(execFileSync('sudo',['-n','docker','exec','-i',`${project}-portal-api-1`,'python','-'],{input:code,encoding:'utf8',maxBuffer:1024*1024}));
 const parsed=NativeCustodySchema.safeParse(raw);
 if(!parsed.success)console.error(JSON.stringify({population:raw.trials.length,parts:raw.source_parts,
  retained:raw.summary.retained_trials,complete:raw.trials.filter(t=>t.state==='COMPLETE').length,summary_complete:raw.summary.completed_trials,
  ordinal_mismatches:raw.trials.filter((t,i)=>t.source_ordinal!==i||t.trial_ordinal!==t.trial_number+1).length,
  distinct:new Set(raw.trials.map(t=>sha256ResearchJson(t.parameters))).size,summary_distinct:raw.summary.distinct_parameter_sets,
  selected:raw.trials.filter(t=>t.selected).map(t=>({number:t.trial_number,objective:t.objective.value,parameters_digest:sha256ResearchJson(t.parameters)})),
  summary_objective:raw.summary.selected_objective,summary_parameters_digest:sha256ResearchJson(raw.summary.selected_parameters),
  parameters_digest:raw.selected_parameters_digest}));
 const source=NativeCustodySchema.parse(raw);
 // Only transport is substituted in this candidate process: returned facts
 // above are actual verified P05 bytes inside the installed preview image.
 native.observe=async()=>source;
 stage='immutable-sidecar';
 const prepared=await native.prepare(scope,runId),again=await native.prepare(scope,runId);
 assert.equal(prepared.digest,again.digest);assert.equal(prepared.checkedAtUtcMs,again.checkedAtUtcMs);
 stage='S06-S07';
 const s06=await search.detail(scope,runId,{native_limit:20}),s07=await freeze.detail(scope,runId,{});
 assert.equal(s06.native_search.ledger.total,100);assert.equal(s06.native_search.ledger.rows.length,20);
 const ids=[...s06.native_search.ledger.rows.map(t=>t.trial_number)];let cursor=s06.native_search.ledger.next_cursor;
 while(cursor){const p=await search.detail(scope,runId,{native_limit:20,native_cursor:cursor});ids.push(...p.native_search.ledger.rows.map(t=>t.trial_number));cursor=p.native_search.ledger.next_cursor;}
 assert.equal(new Set(ids).size,100);assert.equal(s06.native_search.selected_trial_number,41);
 assert.equal(s07.native_freeze.selected_parameters_digest,s06.native_search.selected_parameters_digest);
 assert.equal(s06.native_search.selection_process.retained_source_metadata.medoid_trial_number,41);
 await assert.rejects(search.detail(scope,runId,{native_limit:20,native_cursor:'invalid'}),e=>e.status===400);
 stage='Report-seal';
 const detail=await report.materialize(scope,runId);assert(ResearchReportReadResponseSchema.safeParse(detail).success);
 assert.equal(detail.frozen_core.report_source,'NATIVE_RETAINED_ENGINE_AUDIT');
 assert.equal(detail.frozen_core.native_report.population.total,100);
 assert.equal(detail.frozen_core.native_report.freeze.selected_trial_number,41);
 assert.deepEqual(detail.frozen_core.native_report.windows.map(w=>w.window),['IS','OOS','HOLDOUT']);
 const stable=await report.read(scope,runId);assert.equal(stable.report_revision,detail.report_revision);
 assert.equal((await report.materialize(scope,runId)).report_revision,detail.report_revision);
 const fixedRuns=await db(`SELECT r.run_id,p.execution_profile_id FROM research.runs r JOIN research.run_producers p USING(workspace_id,run_id)
   WHERE r.workspace_id=$1 AND r.state='READY' AND p.execution_profile_id LIKE 'p10.delta-%'
     AND p.execution_profile_id <> $2 ORDER BY r.created_at DESC`,[workspaceId,binding.execution_profile_id]);
 const {executionRecipe}=mod('research/execution-recipes');const fixed=[];
 for(const row of fixedRuns){let recipe;try{recipe=executionRecipe(row.execution_profile_id);}catch{continue;}
  if(recipe.descriptor.schema_version!=='research.native-route-profile.v1'||recipe.public_profile.trial_count.max!==1)continue;
  if(fixed.some(r=>r.profile===row.execution_profile_id))continue;
  const r=await report.materialize(scope,row.run_id);assert.equal(r.frozen_core.native_report.kind,'NATIVE_FIXED');
  assert.equal(r.frozen_core.native_report.population,null);fixed.push({run_id:row.run_id,profile:row.execution_profile_id,report_revision:r.report_revision,execution:r.frozen_core.native_report.execution});
  if(fixed.length===3)break;
 }
 assert(fixed.length>=1,'FIXED_NATIVE_REPORT_REGRESSION_REQUIRED');
 stage='export';const exports=[];
 for(const format of ['REPORT_JSON','REPORT_CSV']){
  const job=await report.requestExport(scope,runId,format);let status=await report.readExport(scope,runId,job.job_id);
  for(let i=0;i<20&&status.state!=='READY';i++){await report.processOneExport();status=await report.readExport(scope,runId,job.job_id);}
  assert.equal(status.state,'READY');const download=await report.download(scope,runId,job.job_id);
  assert.equal(createHash('sha256').update(download.bytes).digest('hex'),status.sha256);
  const text=download.bytes.toString('utf8');assert(text.includes(format==='REPORT_JSON'?'research.native-report.v1':'native_parameters'));
  exports.push({format,status,byte_length:download.bytes.length});
 }
 stage='isolation';
 await assert.rejects(native.read({...scope,actorUserId:'usr_native_proof_nonmember'},runId),e=>e.status===403);
 await assert.rejects(report.read(scope,'rrun_native_proof_unknown'),e=>e.status===404);
 assert.equal(sha256ResearchJson((await report.read(scope,wfoId)).frozen_core),sha256ResearchJson(beforeWfo.frozen_core));
 assert.deepEqual((await db('SELECT submitted_by_user_id AS actor,state,state_version,updated_at FROM research.runs WHERE workspace_id=$1 AND run_id=$2',[workspaceId,runId]))[0],run);
 const [manifest]=await db('SELECT manifest_digest FROM research.artifacts WHERE workspace_id=$1 AND artifact_id=$2',[workspaceId,binding.artifact_id]);assert.equal(manifest.manifest_digest,binding.manifest_digest);
 const receipt={measured_at_utc:new Date().toISOString(),authority:'CANDIDATE_READERS_AND_VERIFIED_REAL_P05_ON_PREVIEW_DB_NOT_DEPLOYED_HTTP',
  source_head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  deployed_images:{control:control.Image,portal:portal.Image,postgres:pg.Image},binding,
  preparation:{digest:prepared.digest,checked_at_utc_ms:prepared.checkedAtUtcMs,source_code_sha256:createHash('sha256').update(sourceText).digest('hex')},
  search:s06,search_full:await search.detail(scope,runId,{native_limit:200}),freeze:s07,report:detail,fixed_native_reports:fixed,exports,all_trials_seen:ids,wfo_digest_unchanged:sha256ResearchJson(beforeWfo.frozen_core),
  lifecycle_and_P05_manifest_unchanged:true,engine_rerun:false,deployment:false,browser_acceptance:'PENDING_CLAUDE_CONSUMER'};
 savePrivate(out,receipt);console.log(JSON.stringify({status:'PASS',run_id:runId,trials:ids.length,selected_trial:41,report_revision:detail.report_revision,exports:exports.map(e=>({format:e.format,bytes:e.byte_length})),authority:receipt.authority}));
}catch(e){console.error(`NATIVE_READ_REPORT_PROOF_FAILED:${stage}:${e.code??e.name}:${e.cause?.code??'none'}`);
 if(e.code?.startsWith('RESEARCH_'))console.error(e.message);
 if(e.code==='ERR_ASSERTION')console.error(e.message);
 if(e.cause?.issues)console.error(JSON.stringify(e.cause.issues.map(i=>({path:i.path,message:i.message}))).slice(0,4000));
 if(e.issues)console.error(JSON.stringify(e.issues.map(i=>({path:i.path,message:i.message}))).slice(0,4000));
 process.exitCode=1;
}finally{if(app)await app.close();await pool.end();}
