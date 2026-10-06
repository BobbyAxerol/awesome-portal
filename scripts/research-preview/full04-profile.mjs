#!/usr/bin/env node
/** Exact preview backend-only activation. Never build/replace Claude's web. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const project='portal-research-preview',file='/home/bobby/.config/portal-research-preview/preview.env';
const slice=process.argv.find(a=>a.startsWith('--slice='))?.slice(8)??'full04';
assert(['full04','full05'].includes(slice),'EXACT_APPROVED_PREVIEW_SLICE');
const enabled=process.argv.find(a=>a.startsWith('--enabled='))?.slice(10)??'true';
assert(['true','false'].includes(enabled),'EXPLICIT_ADMISSION_STATE');
const value=readFileSync(file,'utf8'),stat=lstatSync(file);
assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_REGULAR_PREVIEW_INPUT_REQUIRED');
const env=Object.fromEntries(value.split('\n').filter(s=>/^[A-Z0-9_]+=/.test(s)).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
assert.equal(env.PORTAL_STACK_NAME,project);assert.equal(env.PORTAL_HTTP_PORT,'8095');
assert.equal(env.PORTAL_ENV,'local');assert.equal(env.CONTROL_API_AUTH_MODE,'dev');
assert.equal(env.CONTROL_API_FEATURE_RESEARCH_FULL03_PROFILE,'true');
assert.equal(env.PORTAL_FEATURE_RESEARCH_FULL03_PROFILE,'true');
assert(!env.CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID&&!env.PORTAL_RECIPE_QUALIFICATION_PROFILE_ID,
  'NO_SHARED_PREVIEW_CANDIDATE_SELECTOR');
const control=process.argv.find(a=>a.startsWith('--control-image='))?.slice(16);
const python=process.argv.find(a=>a.startsWith('--python-image='))?.slice(15);
assert(/^sha256:[a-f0-9]{64}$/.test(control)&&/^sha256:[a-f0-9]{64}$/.test(python),'EXACT_CONTENT_ADDRESSED_IMAGES_REQUIRED');
const registry=JSON.parse(readFileSync(root+'/apps/portal/registry/research-execution-recipes.v1.json'));
const rows=registry.recipes.filter(r=>r.descriptor.schema_version===`research.${slice}-${slice==='full05'?'imported':'delta'}-profile.v1`);
assert.equal(rows.length,slice==='full05'?27:35);
for(const row of rows){const ref=registry.qualification_references.find(r=>r.profile_id===row.profile_id);
  assert.equal(ref?.kind,'PRODUCT_RUN_QUALIFIED');
  assert.equal(createHash('sha256').update(readFileSync(root+'/'+ref.receipt_path)).digest('hex'),ref.receipt_sha256);}
const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:240000});
const inspect=name=>JSON.parse(docker(['inspect','--format','{{json .}}',name]));
const oldWeb=inspect(project+'-portal-web-1');
assert.equal(oldWeb.Config.Labels['com.docker.compose.project'],project);
// A profile activation must not kill an in-flight admitted, pinned child.
const busy=docker(['exec',project+'-control-api-1','node','-e',`
const {Pool}=require('pg'),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
p.query("SELECT count(*)::int AS n FROM research.runs WHERE state IN ('RUNNING','SEALING')")
.then(r=>process.stdout.write(String(r.rows[0].n))).finally(()=>p.end()).catch(()=>{process.exitCode=1});`]).trim();
assert.equal(busy,'0','PREVIEW_CHILD_IN_FLIGHT_DO_NOT_RESTART');
for(const [service,image]of [['control-api',control],['portal-api',python]]){
  assert.equal(docker(['image','inspect','--format','{{.Id}}',image]).trim(),image);
  const old=inspect(project+'-'+service+'-1');
  assert.equal(old.Config.Labels['com.docker.compose.project'],project);
  docker(['image','tag',old.Image,`local/portal-research-${slice}-preserved-${service}:${old.Image.slice(7,19)}`]);
  docker(['image','tag',image,`${env.PORTAL_IMAGE_PREFIX}-${service}:${env.PORTAL_IMAGE_TAG}`]);
}
let updated=value;
if(slice==='full05')for(const key of ['CONTROL_API_FEATURE_RESEARCH_IMPORTED_EXECUTION','PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION'])
  assert.equal(env[key],'true','PRESERVE_EXISTING_IMPORTED_PERMISSION_FENCE');
for(const key of [`CONTROL_API_FEATURE_RESEARCH_${slice.toUpperCase()}_PROFILE`,`PORTAL_FEATURE_RESEARCH_${slice.toUpperCase()}_PROFILE`]){
  const pattern=new RegExp(`^${key}=.*$`,'m');
  updated=pattern.test(updated)?updated.replace(pattern,key+'='+enabled):updated.trimEnd()+'\n'+key+'='+enabled+'\n';}
writeFileSync(file,updated,{mode:0o600});
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const compose=args=>execFileSync('sudo',['-n','env',`PORTAL_BUILD_COMMIT=${sha}`,'PORTAL_BUILD_DIRTY=true','docker','compose',
  '-p',project,'--project-directory',root,'--env-file',file,'-f',root+'/compose.yaml',
  '-f',root+'/deploy/compose.research-progress.yaml','-f',root+'/deploy/research-preview/compose.research-preview.yaml',...args],
  {cwd:root,encoding:'utf8',stdio:'pipe',maxBuffer:4*1024*1024,timeout:240000});
compose(['run','--rm','--no-deps','control-api-migrate']);
compose(['up','-d','--no-build','--no-deps','--wait','--wait-timeout','150','control-api','portal-api','quant-worker-py']);
docker(['exec',oldWeb.Id,'nginx','-t']);docker(['exec',oldWeb.Id,'nginx','-s','reload']);
assert.equal(inspect(project+'-portal-web-1').Id,oldWeb.Id,'CLAUDE_WEB_CONTAINER_MUST_STAY');
assert.equal(inspect(project+'-portal-web-1').Image,oldWeb.Image,'CLAUDE_WEB_IMAGE_MUST_STAY');
console.log(JSON.stringify({passed:true,project,slice,enabled_recipes:enabled==='true'?rows.length:0,web_preserved:true,control_image:control,python_image:python}));
