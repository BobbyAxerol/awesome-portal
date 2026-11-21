#!/usr/bin/env node
/** Explicit isolated 1.1.0 -> 1.1.1 Portal producer proof, never a deploy. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestedSpec } from './real-run.mjs';
import { readBoundedJson } from './api-client.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOME = '/home/bobby/.local/state/portal-research-p23/20261004/portal-engine-transition-01';
const PROJECT = 'portal-research-p24-engine-transition';
const ORIGIN = 'http://127.0.0.1:8097';
const OLD_IMAGE = 'sha256:9a14f138a7feae74bcab88feaea63d495a5f8312b0d4ed989f9c252571abc717';
const NEW_IMAGE = 'local/portal-research-p24-portal-api:closeout-20261004';
const CONTROL_IMAGE = 'local/portal-research-p24-control-api:closeout-20261004';
const WEB_IMAGE = 'local/portal-research-p24-portal-web:closeout-20261004';
const ENV = join(HOME, 'preview.env'), OVERLAY = join(HOME, 'transition.yaml');
const privateWrite = (file, value) => { writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {mode:0o600}); chmodSync(file,0o600); };
const docker = (args, input) => execFileSync('sudo', ['-n','docker',...args], {input,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
const container = service => `${PROJECT}-${service}-1`;
const composition = () => ['compose','-p',PROJECT,'--project-directory',ROOT,'--env-file',ENV,
  ...['compose.yaml','deploy/compose.research-progress.yaml','deploy/research-preview/compose.research-p23-activation.yaml',
    'deploy/research-preview/compose.research-p23-5gb.yaml'].flatMap(path=>['-f',join(ROOT,path)]), '-f',OVERLAY];
const compose = args => docker([...composition(),...args]);
const hash = value => createHash('sha256').update(value).digest('hex');
function readableTree(path) { chmodSync(path,statSync(path).isDirectory()?0o755:0o644); if(statSync(path).isDirectory()) for(const file of readdirSync(path)) readableTree(join(path,file)); }
function overlay(version, workerVersion=version) {
  assert(['110','111'].includes(version) && ['110','111'].includes(workerVersion));
  const source = `${HOME}/source`;
  const image = pin => pin==='110'?OLD_IMAGE:NEW_IMAGE;
  return `services:
  control-api:
    image: ${CONTROL_IMAGE}
    environment:
      RESEARCH_ENGINE_QUALIFICATION_VERSION: "1.1.0"
    volumes:
      - ${ROOT}/apps/control-api/dist:/opt/control-api/dist:ro
  control-api-migrate:
    image: ${CONTROL_IMAGE}
  control-api-bootstrap:
    image: ${CONTROL_IMAGE}
  portal-web:
    image: ${WEB_IMAGE}
  roadmap-task-board-api:
    image: ${docker(['inspect','--format','{{.Image}}','portal-research-p23-ol12-roadmap-task-board-api-1']).trim()}
  portal-api:
    image: ${image(version)}
    environment:
      PORTAL_ENV: local
      PORTAL_RESEARCH_ENGINE_QUALIFICATION_VERSION: "1.1.0"
    volumes:
      - ${source}:/opt/portal/src:ro
      - ${HOME}/registry-${version}:/opt/portal/registry:ro
  quant-worker-py:
    image: ${image(workerVersion)}
    environment:
      PORTAL_ENV: local
      PORTAL_RESEARCH_ENGINE_QUALIFICATION_VERSION: "1.1.0"
      PORTAL_HISTORICAL_DATA_MODE: required
      HISTORICAL_MARKET_DATA_ROOT: /data
    group_add:
      - $\{PORTAL_HMD_READER_GID}
    volumes:
      - ${source}:/opt/portal/src:ro
      - $\{PORTAL_HISTORICAL_DATA_DIR}:/data:ro
      - ${HOME}/registry-${workerVersion}:/opt/portal/registry:ro
`;
}
function setOverlay(version, worker=version) { privateWrite(OVERLAY,overlay(version,worker)); }
function db(sql,params=[]) {
  const script=`const {Pool}=require('pg');const fs=require('node:fs'),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const a=JSON.parse(fs.readFileSync(0,'utf8'));p.query(a.sql,a.params).then(r=>console.log(JSON.stringify(r.rows))).finally(()=>p.end());`;
  return JSON.parse(docker(['exec','-i',container('control-api'),'node','-e',script],JSON.stringify({sql,params})));
}
function identity() {
  return Object.fromEntries(['control-api','portal-api','quant-worker-py','portal-web'].map(service=>{
    try { const actual=JSON.parse(docker(['inspect','--format','{{json .}}',container(service)]));
      assert.equal(actual.Config.Labels['com.docker.compose.project'],PROJECT);
      return [service,{image_id:actual.Image,container_id:actual.Id}];
    } catch { return [service,null]; }
  }));
}
async function ready() {
  const until=Date.now()+120000;
  while(Date.now()<until) { try { const r=await fetch(`${ORIGIN}/api/control/readyz`,{signal:AbortSignal.timeout(3000)}); if(r.ok)return; }catch{} await new Promise(r=>setTimeout(r,1000)); }
  throw Error('OWNED_CONTROL_READY_TIMEOUT');
}
async function client(user,record) {
  const jar = new Map(Object.entries(user.cookies??{}));
  return async function call(label,method,path,body,statuses=[200]) {
    assert(path.startsWith('/api/') && new URL(path,ORIGIN).origin===ORIGIN);
    const response=await fetch(new URL(path,ORIGIN), {method,redirect:'manual',signal:AbortSignal.timeout(45000),
      headers:{origin:ORIGIN,accept:'application/json','content-type':'application/json','x-dev-access-email':`${user.username}@azdag.com`,
        cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(method!=='GET'?{'x-portal-csrf':jar.get('__Host-portal_csrf')??''}:{})},
      body:body===undefined?undefined:JSON.stringify(body)});
    for(const cookie of response.headers.getSetCookie()) {const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    user.cookies=Object.fromEntries(jar); privateWrite(join(HOME,'session.json'),user);
    const result={status:response.status,body:await readBoundedJson(response)};
    if(!label.startsWith('auth')) { const safe=structuredClone(result); if(safe.body.preflight_token)delete safe.body.preflight_token;
      record.responses.push({label,method,path,...safe}); privateWrite(join(HOME,'receipt.json'),record); }
    assert(statuses.includes(response.status),`TRANSITION_API:${label}:${response.status}:${result.body.error?.code??result.body.error?.message}`);
    return result.body;
  };
}
async function init() {
  assert(!existsSync(HOME),'NEW_OWNED_HOME_REQUIRED');
  assert.equal(docker(['ps','-aq','--filter',`label=com.docker.compose.project=${PROJECT}`]).trim(),'');
  mkdirSync(HOME,{recursive:true,mode:0o700}); chmodSync(HOME,0o700);
  const init=spawnSync('bash',[join(ROOT,'scripts/research-preview/preview.sh'),'init'],
    {env:{...process.env,RESEARCH_PREVIEW_HOME:HOME,RESEARCH_PREVIEW_PORT:'8097'},encoding:'utf8'});
  assert.equal(init.status,0,'PRIVATE_INPUT_INIT_FAILED');
  const env=Object.fromEntries(readFileSync(ENV,'utf8').split('\n').filter(l=>/^[A-Z0-9_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
  const password=randomBytes(32).toString('hex'); Object.assign(env,{PORTAL_STACK_NAME:PROJECT,PORTAL_HTTP_PORT:'8097',PORTAL_PUBLIC_ORIGIN:ORIGIN,
    PORTAL_IMAGE_PREFIX:'local/portal-research-p24',PORTAL_IMAGE_TAG:'closeout-20261004',PREVIEW_AUTO_LOGIN_USERNAME:'',
    P23_DATABASE_PASSWORD:password,P23_DATABASE_URL:`postgres://portal:${password}@portal-postgres:5432/portal_control`,
    P23_OBJECT_PASSWORD:randomBytes(32).toString('hex'),P23_BOOTSTRAP_FILE:join(HOME,'bootstrap-users.yaml')});
  privateWrite(ENV,Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
  writeFileSync(env.P23_BOOTSTRAP_FILE,'users:\n  - username: p23-owner\n    role: ADMIN\n    owner: true\n',{mode:0o644}); chmodSync(env.P23_BOOTSTRAP_FILE,0o644);
  cpSync(join(ROOT,'apps/portal/backend/src'),join(HOME,'source'),{recursive:true}); readableTree(join(HOME,'source'));
  for(const version of ['110','111']) { cpSync(join(ROOT,'apps/portal/registry'),join(HOME,`registry-${version}`),{recursive:true}); readableTree(join(HOME,`registry-${version}`)); }
  const catalogPath=join(HOME,'registry-110/research-engine-catalog.v1.json');
  const catalog=JSON.parse(readFileSync(catalogPath,'utf8')); const release=catalog.releases.find(r=>r.role==='current');
  Object.assign(release,{release_id:'er_quantbt_110',version:'1.1.0',dist_info_record_sha256:'80636aa284227b47593e9610dc8b82ab4dc08ed9ee09215a1da18320bce18f68',
    wheel_sha256:'c319b24325230df99ce1803ae03df09c15acabd834dd2f6ccd17b21e70363e62'});
  Object.assign(release.native_dependency,{version:'0.4.1',dist_info_record_sha256:'f8c064d2e0fa28ac35874739a8f6750d5d7fa53d56f20a870ab31eeebfea41d9',wheel_sha256:'f26681ad154aea38d9d0fc8f9e828a6c480176cf7f20041cbb86f06e1dd38b3d'});
  writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
  const capabilityPath=join(HOME,'registry-110/engine-capabilities.v1.json'); const capability=JSON.parse(readFileSync(capabilityPath,'utf8'));
  Object.assign(capability.engine_releases[0],{release_id:release.release_id,version:release.version,dist_info_record_sha256:release.dist_info_record_sha256});
  for(const cap of capability.capabilities){cap.engine_release_id=release.release_id;if(cap.protocol!=='three_window_decay')cap.certified=false;}
  writeFileSync(capabilityPath,JSON.stringify(capability,null,2)+'\n');
  setOverlay('110'); console.log('Prepared owned8097 inputs, source overlay and exact physical110 catalogue; no shared runtime changes.');
}
async function run() {
  const resume=process.argv[2]==='resume';
  const record=resume?JSON.parse(readFileSync(join(HOME,'receipt.json'),'utf8')):{schema_version:'research.p24-portal-engine-transition.v1',project:PROJECT,origin:ORIGIN,
    started_at:new Date().toISOString(),source_sha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),dirty:true,
    responses:[],transitions:[],completed:false,identity_revoked:false};
  const username=process.argv[3]??'p23-reader-95';assert.match(username,/^p23-reader-9[5-9]$/);
  if(!resume && existsSync(join(HOME,'receipt.json'))) cpSync(join(HOME,'receipt.json'),join(HOME,`receipt-before-${username}.json`));
  const user=resume?JSON.parse(readFileSync(join(HOME,'session.json'),'utf8')):{username,password:randomBytes(32).toString('hex'),cookies:{}};
  if(resume) { assert.equal(record.project,PROJECT);assert.equal(user.username,'p23-reader-96');assert(record.old_run_id && record.images_inflight);record.identity_revoked=false;record.resumed_at=new Date().toISOString(); }
  const call=await client(user,record);
  try {
    if(!resume) {setOverlay('110'); compose(['up','-d','--no-build','--wait','--wait-timeout','120','portal-web']); await ready();
    record.images_initial=identity();
    const output=docker(['exec','-i',container('control-api'),'node','dist/cli/bootstrap.js','--file','/dev/stdin','--print-one-time-credentials'],`- username: ${user.username}\n  role: ADMIN\n`);
    const credential=output.split('\n').find(l=>l.startsWith(`ONE_TIME ${user.username} `))?.split(' ')[2];assert(credential);
    await call('auth-login','POST','/api/auth/login',{username:user.username,credential},[201]);
    await call('auth-password','POST','/api/auth/change-password',{current_password:credential,new_password:user.password},[200,201]);
    await call('auth-real-login','POST','/api/auth/login',{username:user.username,credential:user.password},[201]);
    } else {
      const update=`const {Pool}=require('pg'),{loadConfig}=require('./dist/config'),{AuthService}=require('./dist/auth/auth.service'),{Argon2CredentialService}=require('./dist/auth/argon');const c=loadConfig(),p=new Pool({connectionString:c.DATABASE_URL});(async()=>{const a=new AuthService(p,c,new Argon2CredentialService({memoryKib:c.ARGON2_MEMORY_KIB,iterations:c.ARGON2_ITERATIONS,parallelism:c.ARGON2_PARALLELISM}));const u=await a.users.findByUsername('p23-reader-96');if(u?.userId!==process.argv[1]||u.status!=='DISABLED')throw Error('EXACT_DISABLED_TEMP_QA_REQUIRED');await a.users.update({userId:u.userId,status:'ACTIVE'})})().finally(()=>p.end());`;
      docker(['exec',container('control-api'),'node','-e',update,user.id]);
      await call('auth-resume-existing-password','POST','/api/auth/login',{username:user.username,credential:user.password},[201]);
    }
    user.id=(await call('auth-context','GET','/api/auth/context')).principal.principalId;
    const binding=resume?record.responses.find(r=>r.label==='binding').body:await call('binding','POST','/api/v1/research/run-producer/p04-delta/install',{},[200,201]);
    const release=resume?record.responses.find(r=>r.label==='atlas110').body.atlas.current_release:(await call('atlas110','GET','/api/v1/research/quantbt/atlas')).atlas.current_release; assert.equal(release.expected_version,'1.1.0');
    const spec=resume?record.requested_spec:requestedSpec(binding,release,'p04'); record.requested_spec=spec;
    const create=async (label,spec,parent)=>{
      const pf=await call(`${label}-preflight`,'POST','/api/v1/research/preflights',{requested_spec:spec},[201]);
      assert.equal(pf.may_create_run,true,`${label}_PREFLIGHT_REFUSAL:${JSON.stringify(pf.run_admission)}`);
      return call(`${label}-create`,'POST','/api/v1/research/runs',{schema_version:'research.run-create.v1',client_intent_id:`transition-${label}-${randomUUID()}`,
        preflight_token:pf.preflight_token,requested_spec:spec,...(parent?{intent_kind:'REPRODUCE_EXISTING',lineage:{relation:'REPRODUCTION_OF',parent_run_id:parent}}:{})},[202]);
    };
    const old=resume?{run_id:record.old_run_id}:await create('old110',spec); record.old_run_id=old.run_id;
    if(!resume) {
    compose(['up','-d','--no-build','--no-deps','quant-worker-py']);
    let oldRunning=false; const started=Date.now();
    while(Date.now()-started<60000){const p=await call('old110-inflight','GET',`/api/v1/research/runs/${old.run_id}/progress`);
      if(p.current.effective_status==='RUNNING'){oldRunning=true;break;} assert(!['FAILED','CANCELLED','COMPLETED'].includes(p.current.effective_status));await new Promise(r=>setTimeout(r,300));}
    assert(oldRunning,'RUNNING_OLD_CHILD_REQUIRED');
    record.inflight_producer=db(`SELECT legacy_request#>>'{research,requested_spec,client,engine_release_id}' engine_release_id,legacy_request#>'{research,qualification_binding}' binding FROM research.run_producers WHERE run_id=$1`,[old.run_id]);
    record.images_inflight=identity();
    // Replace only this cell's API/default catalogue; the old child/worker is never restarted.
    record.default_transition_started_at=new Date().toISOString();
    setOverlay('111','110');compose(['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','90','portal-api']);
    compose(['up','-d','--no-build','--no-deps','--force-recreate','portal-web']); await ready();
    }
    const current=(await call('atlas111-during-old-child','GET','/api/v1/research/quantbt/atlas')).atlas.current_release;
    assert.equal(current.expected_version,'1.1.1'); record.images_after_default=identity();
    assert.equal(record.images_after_default['quant-worker-py'].container_id,record.images_inflight['quant-worker-py'].container_id,'OLD_WORKER_MUST_NOT_RESTART');
    const wait=async (label,id)=>{const until=Date.now()+240000;while(Date.now()<until){const p=await call(`${label}-progress`,'GET',`/api/v1/research/runs/${id}/progress`);
      assert(!['FAILED','CANCELLED'].includes(p.current.effective_status),`${label}_FAILED`);
      if(p.current.effective_status==='COMPLETED' && p.current.terminal_materialization!=='PENDING')return p;await new Promise(r=>setTimeout(r,1500));}throw Error(`${label}_TIMEOUT`);};
    await wait('old110',old.run_id);
    const read=async (label,id)=>{const results={};for(const name of ['evidence','split','search','freeze','report'])results[name]=await call(`${label}-${name}`,'GET',`/api/v1/quantbt/runs/${id}/${name}`);return results;};
    record.old_reads_after_upgrade=await read('old110-after-default111',old.run_id);
    record.old_receipt=db('SELECT legacy_request FROM research.run_producers WHERE run_id=$1',[old.run_id]);
    const refused=await call('old-spec-new-default-refused','POST','/api/v1/research/preflights',{requested_spec:spec},[201,409]);
    assert(refused.may_create_run!==true,'OLD_SPEC_MUST_NOT_SILENTLY_CHANGE_ENGINE');
    compose(['stop','quant-worker-py']);setOverlay('111');compose(['up','-d','--no-build','--no-deps','quant-worker-py']);
    const fresh=await create('new111',requestedSpec(binding,current,'p04')); record.new_run_id=fresh.run_id;await wait('new111',fresh.run_id);
    record.new_reads=await read('new111',fresh.run_id);record.images_new=identity();
    // Exact reproduction requires the old qualified runtime/catalogue, never an alias to111.
    compose(['stop','quant-worker-py']);setOverlay('110');compose(['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','90','portal-api']);
    compose(['up','-d','--no-build','--no-deps','--force-recreate','portal-web']);await ready();
    const rolled=(await call('rollback-atlas110','GET','/api/v1/research/quantbt/atlas')).atlas.current_release;assert.equal(rolled.expected_version,'1.1.0');
    const reproduction=await create('reproduction110',spec,old.run_id);record.reproduction_run_id=reproduction.run_id;
    assert.equal(reproduction.reproduction?.pin_scope,'IMMUTABLE_INPUT_PINS');
    compose(['up','-d','--no-build','--no-deps','quant-worker-py']);await wait('reproduction110',reproduction.run_id);
    record.reproduction_reads=await read('reproduction110',reproduction.run_id);
    record.completed=true;
  } finally {
    if(user.id){const script=`const {Pool}=require('pg'),{loadConfig}=require('./dist/config'),{AuthService}=require('./dist/auth/auth.service'),{AdminService}=require('./dist/admin/admin.service'),{Argon2CredentialService}=require('./dist/auth/argon');
const c=loadConfig(),p=new Pool({connectionString:c.DATABASE_URL,max:1});(async()=>{const a=new AuthService(p,c,new Argon2CredentialService({memoryKib:c.ARGON2_MEMORY_KIB,iterations:c.ARGON2_ITERATIONS,parallelism:c.ARGON2_PARALLELISM}));const u=await a.users.findByUsername('${user.username}');if(u?.userId!==process.argv[1])throw Error('EXACT_TEST_USER_REQUIRED');await new AdminService(p,c,a).disable(u.userId)})().finally(()=>p.end());`;
      docker(['exec',container('control-api'),'node','-e',script,user.id]);
      record.revocation=db("SELECT status,(SELECT count(*)::int FROM auth_sessions WHERE user_id=$1 AND state='ACTIVE') active_sessions FROM portal_users WHERE user_id=$1",[user.id]);
      assert.equal(record.revocation[0].status,'DISABLED');assert.equal(record.revocation[0].active_sessions,0);record.identity_revoked=true;}
    record.finished_at=new Date().toISOString();privateWrite(join(HOME,'receipt.json'),record);
    console.log(JSON.stringify({home:HOME,completed:record.completed,old_run_id:record.old_run_id,new_run_id:record.new_run_id,reproduction_run_id:record.reproduction_run_id,identity_revoked:record.identity_revoked}));
  }
}
function capture() {
  const receipt=JSON.parse(readFileSync(join(HOME,'receipt.json'),'utf8'));
  assert(receipt.completed && receipt.identity_revoked && receipt.project===PROJECT,'COMPLETE_REVOKED_OWNED_PROOF_REQUIRED');
  const code=String.raw`from pathlib import Path
import json,hashlib,importlib.metadata,sys
from portal_api.services.engine_capabilities import installed_dist_info_record_hash
ids=set(json.loads(sys.stdin.read()))
root=Path('/var/lib/portal/artifacts/runs/durable-store/research-retained/artifacts')
results=[]
for path in root.rglob('run_receipt.json'):
 raw=path.read_bytes();doc=json.loads(raw)
 if doc.get('run_id') not in ids: continue
 artifact=path.parent.parent;manifest_raw=(artifact/'manifest.json').read_bytes();manifest=json.loads(manifest_raw)
 entries=[part for table in manifest['tables'] for part in table['parts']]+manifest['documents']
 for entry in entries:
  target=(artifact/entry['relative_path']).resolve()
  assert target.is_relative_to(artifact.resolve())
  body=target.read_bytes()
  assert len(body)==entry['bytes'] and hashlib.sha256(body).hexdigest()==entry['sha256']
 run_root=Path('/var/lib/portal/artifacts/runs/durable')/doc['run_id']
 attempt=json.loads(next((run_root/'attempts').iterdir()).read_text())
 snapshot=json.loads(next((run_root/'progress').glob('*/snapshot.json')).read_text())
 results.append({'run_id':doc['run_id'],'engine':doc['engine'],'receipt_sha256':hashlib.sha256(raw).hexdigest(),
  'manifest_sha256':hashlib.sha256(manifest_raw).hexdigest(),'all_retained_bytes_verified':True,
  'retained_file_count':len(entries),'qualification_binding':doc.get('qualification_binding'),
  'requested_spec_digest':doc['requested_spec_digest'],'effective_spec_digest':doc['effective_spec_digest'],
  'dataset_binding_digest':doc['dataset_binding_digest'],'input_manifest_digest':doc['manifest_digest'],
  'completed_at':attempt['completed_at'],'source_terminal_state':snapshot['status']})
assert len(results)==len(ids)
print(json.dumps({'runs':results,'physical_old_runtime':{'engine_version':importlib.metadata.version('quantbt-engine'),
 'native_version':importlib.metadata.version('quantbt-native'),'engine_record_sha256':installed_dist_info_record_hash('quantbt-engine'),
 'native_record_sha256':installed_dist_info_record_hash('quantbt-native')}}))`;
  const proof=JSON.parse(docker(['exec','-i',container('quant-worker-py'),'python','-c',code],JSON.stringify([receipt.old_run_id,receipt.new_run_id,receipt.reproduction_run_id])));
  const old=proof.runs.find(r=>r.run_id===receipt.old_run_id),reproduction=proof.runs.find(r=>r.run_id===receipt.reproduction_run_id);
  for(const key of ['requested_spec_digest','effective_spec_digest','dataset_binding_digest','input_manifest_digest'])assert.equal(old[key],reproduction[key],`IMMUTABLE_REPRODUCTION_${key}`);
  assert.deepEqual(old.engine,reproduction.engine);
  assert(Date.parse(receipt.default_transition_started_at)<Date.parse(old.completed_at),'DEFAULT_CHANGE_MUST_BEGIN_WHILE_OLD_CHILD_RUNNING');
  proof.source_overlay_hashes=Object.fromEntries(['adapters/quantbt.py','domain/research_engine_qualification.py','domain/research_run_producer.py',
    'services/research_run_producer.py','services/research_supervisor.py','services/research_retained_receipt.py','workers/research_child.py']
    .map(path=>[path,hash(readFileSync(join(HOME,'source/portal_api',path)))]));
  proof.runtime_identity=identity();proof.recorded_at=new Date().toISOString();
  privateWrite(join(HOME,'retention-proof.json'),proof);
  for(const row of receipt.old_receipt??[]) if(row.legacy_request?.research) delete row.legacy_request.research.preflight_token;
  receipt.retention_proof_sha256=hash(readFileSync(join(HOME,'retention-proof.json')));privateWrite(join(HOME,'receipt.json'),receipt);
  console.log(JSON.stringify({retained_runs:proof.runs.length,all_files_verified:proof.runs.every(r=>r.all_retained_bytes_verified),reproduction_pins_equal:true,
    old_child_completed_after_default_change_started:true,retention_proof_sha256:receipt.retention_proof_sha256}));
}
const command=process.argv[2];
if(command==='init') await init();
else if(command==='run'||command==='resume') await run();
else if(command==='status') console.log(compose(['ps']));
else if(command==='capture') capture();
else if(command==='down') {compose(['down']);console.log('Owned8097 stopped; all data and receipt volumes retained, no -v.');}
else throw Error('Use init|run|status|down (exact owned8097 cell only)');
