#!/usr/bin/env node
/** UDB04: fixed, private clone of the preview. Never take over a shared DB. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync,existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const PROJECT='portal-research-udb04';
export const SOURCE='portal-research-preview';
export const ORIGIN='http://127.0.0.1:8097';
// A terminal lane is immutable. A final retake must use a new bounded,
// private receipt directory instead of clearing its teardown marker or
// overwriting the failed candidate's evidence.
export const HOME=process.env.PORTAL_UDB04_RECEIPT_DIR??'/home/bobby/.local/state/portal-udb04/acceptance-20261011';
assert(/^\/home\/bobby\/\.local\/state\/portal-udb04\/acceptance(?:-final)?-\d{8}$/.test(HOME),
  'UDB04_RECEIPT_DIRECTORY_OUTSIDE_OWNED_ALLOWLIST');
export const SERVICES=['portal-postgres','execution-postgres','portal-nats','roadmap-task-board-api',
  'portal-api','control-api','quant-worker-py','portal-web'];
export function controlBuildInputs(){
  // Actual COPY inputs, not a claim that an uncommitted source tree is a
  // release. Verify these bytes again after the normal-hook commit.
  const paths=['apps/control-api/src','apps/control-api/migrations','apps/control-api/package.json',
    'apps/control-api/package-lock.json','apps/control-api/tsconfig.json','apps/control-api/tsconfig.build.json',
    'deploy/images/control-api.Dockerfile','deploy/control-api/bootstrap-users.yaml','.dockerignore'];
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--',...paths],{cwd:ROOT,encoding:'utf8'}).split('\0').filter(Boolean).sort();
  const h=createHash('sha256');for(const path of files){h.update(path+'\0');h.update(readFileSync(join(ROOT,path)));h.update('\0');}
  return {sha256:h.digest('hex'),files:files.length,source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
}
const budgets={'portal-postgres':900000000,'execution-postgres':536870912,'portal-nats':150000000,
  'roadmap-task-board-api':200000000,'portal-api':500000000,'control-api':650000000,
  'quant-worker-py':1500000000,'portal-web':100000000};
export function docker(args,input,maximum=16*1024*1024){return execFileSync('sudo',['-n','docker',...args],{
  encoding:'utf8',input,maxBuffer:maximum,timeout:180000,stdio:['pipe','pipe','pipe']});}
export function privateWrite(name,value){
  assert(/^[a-zA-Z0-9_.-]+$/.test(name));mkdirSync(HOME,{recursive:true,mode:0o700});chmodSync(HOME,0o700);
  const path=join(HOME,name);if(existsSync(path))assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink());
  writeFileSync(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);
}
export function readPrivate(name){const path=join(HOME,name),s=lstatSync(path);
  assert(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0);return JSON.parse(readFileSync(path,'utf8'));}
export function owned(service){assert(SERVICES.includes(service));const name=PROJECT+'-'+service+'-1';
  assert.equal(docker(['inspect','-f','{{index .Config.Labels "com.docker.compose.project"}}',name]).trim(),PROJECT);return name;}
export function compose(args){return docker(['compose','-p',PROJECT,'--project-directory',ROOT,
  '-f',join(HOME,'compose.json'),...args]);}
export function coreQuery(text,values=[]){return JSON.parse(docker(['exec','-i',owned('control-api'),'node','-e',`
const {Pool}=require('pg');let input='';process.stdin.on('data',v=>input+=v);process.stdin.on('end',async()=>{
 const {text,values}=JSON.parse(input),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
 try{const r=await p.query(text,values);console.log(JSON.stringify({rows:r.rows,rowCount:r.rowCount}));}finally{await p.end();}
});`],JSON.stringify({text,values})));}
export function inControl(source,input=''){return JSON.parse(docker(['exec','-i',owned('control-api'),'node','-e',source],input));}
function identity(){const images=Object.fromEntries(SERVICES.map(service=>{
  const c=JSON.parse(docker(['inspect','--format','{{json .}}',owned(service)]));
  assert.equal(c.HostConfig.Memory,budgets[service]);assert.equal(c.HostConfig.MemorySwap,budgets[service]);
  return [service,{container_id:c.Id,image_id:c.Image,memory_limit_bytes:c.HostConfig.Memory,
    swap_limit_bytes:c.HostConfig.MemorySwap,apparmor:c.AppArmorProfile}];}));
  const planned=readPrivate('inputs.json');for(const service of SERVICES)assert.equal(images[service].image_id,planned.images[service]);
  privateWrite('identity.json',{project:PROJECT,origin:ORIGIN,at_utc:new Date().toISOString(),
    source_candidate:planned.source_candidate,images,config_sha256:planned.config_sha256,
    artifact_archive_sha256:planned.artifact_archive_sha256,core_backup_sha256:planned.core_backup_sha256,
    execution_backup_sha256:planned.execution_backup_sha256});return images;
}
async function init(){
  assert(!existsSync(join(HOME,'inputs.json')),'INIT_ONCE_NEVER_OVERWRITE');
  assert.equal(docker(['ps','-aq','--filter','label=com.docker.compose.project='+PROJECT]).trim(),'');
  assert.equal(docker(['volume','ls','-q','--filter','label=com.docker.compose.project='+PROJECT]).trim(),'');
  const args=['compose','-p',SOURCE,'--project-directory',ROOT,'--env-file','/home/bobby/.config/portal-research-preview/preview.env',
    ...['compose.yaml','deploy/compose.research-progress.yaml','deploy/research-preview/compose.research-preview.yaml',
      'deploy/research-preview/compose.execution-store.yaml','deploy/research-preview/compose.retained-review.yaml',
      'deploy/research-preview/compose.research-p23-5gb.yaml','deploy/research-preview/compose.execution-store-p23.yaml'].flatMap(f=>['-f',join(ROOT,f)]),
    'config','--format','json'];
  const cfg=JSON.parse(docker(args));cfg.name=PROJECT;const images={};
  for(const [service,c] of Object.entries(cfg.services)){
    if(!SERVICES.includes(service)){delete cfg.services[service];continue;}
    const current=JSON.parse(docker(['inspect','--format','{{json .}}',SOURCE+'-'+service+'-1']));
    images[service]=current.Image;c.image=current.Image;delete c.build;delete c.container_name;delete c.depends_on;
    c.restart='no';delete c.profiles;c.mem_limit=budgets[service];c.memswap_limit=budgets[service];
    c.ports=service==='portal-web'?[{target:80,published:'8097',host_ip:'127.0.0.1',protocol:'tcp'}]:[];
    if(c.environment){for(const key of ['PORTAL_PUBLIC_ORIGIN','CONTROL_API_PUBLIC_ORIGIN','PUBLIC_ORIGIN'])
      if(key in c.environment)c.environment[key]=ORIGIN;
      if('PREVIEW_AUTO_LOGIN_USERNAME' in c.environment)c.environment.PREVIEW_AUTO_LOGIN_USERNAME='';}
    for(const mount of c.volumes??[])if(mount.type==='bind')assert(mount.read_only,'WRITABLE_HOST_BIND_REFUSED:'+mount.target);
  }
  for(const [name,v]of Object.entries(cfg.volumes??{})){delete v.external;v.name=PROJECT+'_'+name;v.labels={'udb04.owner':PROJECT};}
  for(const [name,n]of Object.entries(cfg.networks??{})){delete n.external;n.name=PROJECT+'_'+name;}
  const exec=cfg.services['control-api'].environment;
  assert.equal(exec.EXECUTION_READ_PROFILE,'retained_review_v1');
  for(const key of ['FEATURE_EXECUTION_EDGE','FEATURE_EXECUTION_REALTIME_SSE','FEATURE_EXECUTION_COMMAND_RELAY',
    'FEATURE_EXECUTION_DURABLE_MIRROR','FEATURE_EXECUTION_DURABLE_MIRROR_READS'])assert.equal(exec[key],'false');
  assert(SERVICES.every(s=>cfg.services[s]));privateWrite('compose.json',cfg);
  for(const [service,db,user,file]of [['portal-postgres','portal_control','portal','core.dump'],
    ['execution-postgres','portal_execution','exec_owner','execution.dump']]){
    const bytes=execFileSync('sudo',['-n','docker','exec',SOURCE+'-'+service+'-1','pg_dump','-U',user,'-d',db,'-Fc'],
      {maxBuffer:512*1024*1024,timeout:180000,stdio:['pipe','pipe','pipe']});
    writeFileSync(join(HOME,file),bytes,{mode:0o600});
  }
  const archive=execFileSync('sudo',['-n','docker','exec',SOURCE+'-portal-api-1','tar','-C','/var/lib/portal/artifacts','-czf','-','.'],
    {maxBuffer:512*1024*1024,timeout:180000,stdio:['pipe','pipe','pipe']});
  writeFileSync(join(HOME,'artifacts.tar.gz'),archive,{mode:0o600});
  const sha=name=>createHash('sha256').update(readFileSync(join(HOME,name))).digest('hex');
  const buildInputs=controlBuildInputs();
  privateWrite('inputs.json',{project:PROJECT,source_candidate:buildInputs.source_commit,control_build_inputs:buildInputs,
    created_at_utc:new Date().toISOString(),images,config_sha256:sha('compose.json'),
    artifact_archive_sha256:sha('artifacts.tar.gz'),core_backup_sha256:sha('core.dump'),execution_backup_sha256:sha('execution.dump'),
    retention_days:30});
  console.log('UDB04 private candidate/clone backups prepared; no shared state changed.');
}
async function up(){
  readPrivate('inputs.json');
  assert(!existsSync(join(HOME,'teardown.json')),'TERMINAL_CELL_REQUIRES_A_NEW_APPROVED_RECEIPT_DIRECTORY');
  if(!existsSync(join(HOME,'restored.json'))){
  compose(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','90','portal-postgres','execution-postgres','portal-nats']);
  // pg_dump is database-local; RLS policies also reference cluster roles.
  // Preserve the original private role attributes/password hashes, rather
  // than silently dropping RLS or creating more privileged substitute roles.
  const rolesPath=join(HOME,'core-roles.sql');
  if(!existsSync(rolesPath))privateWrite('core-roles.sql',docker(['exec',SOURCE+'-portal-postgres-1',
    'pg_dumpall','-U','portal','--roles-only']));
  const roles=readFileSync(rolesPath,'utf8').replace(/^CREATE ROLE portal;\r?\n/m,'');
  // This is allowed only before this cell has ever started an application.
  assert.equal(docker(['ps','-aq','--filter','label=com.docker.compose.project='+PROJECT,
    '--filter','label=com.docker.compose.service=control-api']).trim(),'','RESTORE_REFUSES_EXISTING_APPLICATION');
  docker(['exec','-i',owned('portal-postgres'),'psql','-U','portal','-d','postgres','-v','ON_ERROR_STOP=1'],roles);
  for(const [service,db,user,file]of [['portal-postgres','portal_control','portal','core.dump'],
    ['execution-postgres','portal_execution','exec_owner','execution.dump']]){
    // Exact disposable clone only; retry a failed restore without carrying a
    // partial schema forward. Original source and backup stay untouched.
    docker(['exec',owned(service),'dropdb','-U',user,'--if-exists',db]);
    docker(['exec',owned(service),'createdb','-U',user,db]);
    docker(['exec','-i',owned(service),'pg_restore','-U',user,'-d',db,'--single-transaction','--exit-on-error','--no-owner'],readFileSync(join(HOME,file)),512*1024*1024);
  }
  compose(['create','--no-build','portal-api']);
  const target=PROJECT+'_portal-artifacts';
  assert.equal(docker(['volume','inspect','-f','{{index .Labels "com.docker.compose.project"}}',target]).trim(),PROJECT);
  docker(['run','--rm','-i','--label','udb04.owner='+PROJECT,'--network','none','--memory','150000000','--memory-swap','150000000',
    '-v',target+':/target','--entrypoint','tar',readPrivate('inputs.json').images['portal-postgres'],'-C','/target','-xzf','-'],
    readFileSync(join(HOME,'artifacts.tar.gz')),512*1024*1024);
  privateWrite('restored.json',{at_utc:new Date().toISOString(),source_volumes_mounted_rw:false});
  }
  compose(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','120',...SERVICES]);identity();
  console.log('UDB04 isolated clone ready on localhost8097; exact source image IDs and memory caps verified.');
}
function recoverRoadmap(){
  const original=readPrivate('inputs.json'),cfg=readPrivate('compose.json'),service='roadmap-task-board-api';
  assert.equal(docker(['ps','-q','--filter','label=com.docker.compose.project='+PROJECT,
    '--filter','label=com.docker.compose.service='+service]).trim(),'','RECOVERY_BEFORE_QUALIFICATION_ONLY');
  const imageName=docker(['inspect','-f','{{.Config.Image}}',SOURCE+'-'+service+'-1']).trim();
  const replacement=docker(['image','inspect','-f','{{.Id}}',imageName]).trim();
  const hashCommand='find /opt/roadmap-task-board/backend -type f ! -path "*/__pycache__/*" -exec sha256sum {} + | sort | sha256sum';
  const oldHash=docker(['exec',SOURCE+'-'+service+'-1','sh','-c',hashCommand]).trim().split(' ')[0];
  const newHash=docker(['run','--rm','--network','none','--label','udb04.owner='+PROJECT,'--memory','150000000',
    '--memory-swap','150000000','--entrypoint','sh',replacement,'-c',hashCommand]).trim().split(' ')[0];
  assert.equal(oldHash,newHash,'REPLACEMENT_CODE_MUST_MATCH');
  privateWrite('original-inputs.json',original);
  privateWrite('roadmap-pin-recovery.json',{original_image:original.images[service],replacement_image:replacement,
    application_sha256:oldHash,artifact_is_identical:false,application_bytes_identical:true,
    reason:'Original OCI index reference lost; replacement separately qualified, never relabelled as original.'});
  cfg.services[service].image=replacement;privateWrite('compose.json',cfg);
  original.images[service]=replacement;original.config_sha256=createHash('sha256').update(readFileSync(join(HOME,'compose.json'))).digest('hex');
  privateWrite('inputs.json',original);console.log('Roadmap replacement pin recorded separately; application bytes identical.');
}
function reprofileExecution(){
  const cfg=readPrivate('compose.json'),input=readPrivate('inputs.json');
  privateWrite('250mb-inputs.json',input);
  cfg.services['execution-postgres'].mem_limit=budgets['execution-postgres'];
  cfg.services['execution-postgres'].memswap_limit=budgets['execution-postgres'];
  privateWrite('compose.json',cfg);input.config_sha256=createHash('sha256').update(readFileSync(join(HOME,'compose.json'))).digest('hex');
  privateWrite('inputs.json',input);
  compose(['up','-d','--no-build','--no-deps','--pull','never','--wait','--wait-timeout','90','execution-postgres']);identity();
  console.log('Only cloned Execution PG recreated with512MiB; original failed candidate preserved.');
}
function adoptControl(){
  assert.equal(Number(docker(['exec',owned('portal-postgres'),'psql','-X','-U','portal','-d','portal_control','-Atc',"SELECT count(*) FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')"]).trim()),0);
  const cfg=readPrivate('compose.json'),input=readPrivate('inputs.json');
  const previous='before-control-'+input.images['control-api'].slice(7,19)+'.json';
  assert(!existsSync(join(HOME,previous)),'CANDIDATE_HISTORY_MUST_NOT_BE_OVERWRITTEN');
  privateWrite(previous,input);
  const image=docker(['image','inspect','-f','{{.Id}}','local/portal-research-preview-control-api:rf02']).trim();
  // Keep the exact OCI index reachable across subsequent BuildKit tag moves.
  docker(['tag',image,'local/portal-udb04-control:'+image.slice(7,19)]);
  cfg.services['control-api'].image=image;input.images['control-api']=image;privateWrite('compose.json',cfg);
  input.control_build_inputs=controlBuildInputs();
  input.config_sha256=createHash('sha256').update(readFileSync(join(HOME,'compose.json'))).digest('hex');
  privateWrite('inputs.json',input);
  compose(['up','-d','--no-build','--no-deps','--pull','never','--wait','--wait-timeout','90','control-api']);
  docker(['exec',owned('portal-web'),'nginx','-s','reload']);identity();
  console.log('Only owned Control API updated; exact images/config recorded, immutable previous candidate retained.');
}
function reprofileCore(){
  assert.equal(Number(docker(['exec',owned('portal-postgres'),'psql','-X','-U','portal','-d','portal_control','-Atc',"SELECT count(*) FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')"]).trim()),0);
  const cfg=readPrivate('compose.json'),input=readPrivate('inputs.json');
  privateWrite('before-core-budget.json',input);compose(['stop','quant-worker-py','portal-api','control-api']);
  for(const service of ['portal-postgres','portal-api']){cfg.services[service].mem_limit=budgets[service];cfg.services[service].memswap_limit=budgets[service];}
  privateWrite('compose.json',cfg);input.config_sha256=createHash('sha256').update(readFileSync(join(HOME,'compose.json'))).digest('hex');privateWrite('inputs.json',input);
  compose(['up','-d','--no-build','--no-deps','--pull','never','--wait','--wait-timeout','120','portal-postgres','control-api','portal-api','quant-worker-py']);
  docker(['exec',owned('portal-web'),'nginx','-s','reload']);identity();
  console.log('Owned Core900MB/API500MB profile adopted; unchanged hard5GB gate, no shared PG change.');
}
async function down(){
  readPrivate('inputs.json');for(const s of SERVICES)owned(s);
  // Keep immutable backups/receipts. Delete only this cell's labelled volumes.
  const volumes=docker(['volume','ls','-q','--filter','label=com.docker.compose.project='+PROJECT]).trim().split('\n').filter(Boolean);
  assert(volumes.every(v=>v.startsWith(PROJECT+'_')));
  compose(['down']);for(const v of volumes)docker(['volume','rm',v]);
  privateWrite('teardown.json',{at_utc:new Date().toISOString(),removed_volumes:volumes,backups_retained_days:30});
  console.log('UDB04 owned cell removed; private backups/evidence retained30days; no image pruning.');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const command=process.argv[2];assert(['init','up','identity','down','recover-roadmap','reprofile-execution','reprofile-core','adopt-control'].includes(command));
  if(command==='reprofile-core')reprofileCore();
  if(command==='adopt-control')adoptControl();
  if(command==='reprofile-execution')reprofileExecution();
  if(command==='recover-roadmap')recoverRoadmap();
  if(command==='init')await init();if(command==='up')await up();if(command==='identity')identity();if(command==='down')await down();
}
