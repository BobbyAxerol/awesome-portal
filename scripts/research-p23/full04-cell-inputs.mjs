#!/usr/bin/env node
/** Configure an initialized owned FULL04 or explicitly fresh expansion cell. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,chmodSync,lstatSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateHome} from './cell.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
const slice=process.argv.find(a=>a.startsWith('--slice='))?.slice(8)??'full04';
assert(['full04','expanded'].includes(slice)&&home.endsWith('/'+slice),'EXACT_QUALIFICATION_HOME');
const file=join(home,'preview.env'),stat=lstatSync(file);
assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_ENV_REQUIRED');
const env=Object.fromEntries(readFileSync(file,'utf8').split('\n').filter(s=>/^[A-Z0-9_]+=/.test(s))
  .map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
assert(env.PORTAL_STACK_NAME==='portal-research-p23-ol12'&&env.PORTAL_HTTP_PORT==='8096','EXACT_OWNED_CELL');
if(process.argv.includes('--install-index')){
  const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',stdio:'pipe',timeout:30000});
  const container='portal-research-p23-ol12-portal-api-1';
  assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container]).trim(),env.PORTAL_STACK_NAME);
  const target='/var/lib/portal/artifacts/runs/durable-store/research-dataset-index';
  docker(['exec','-u','0',container,'python','-c',
    'from pathlib import Path;p=Path("'+target+'");assert not (p/"current").exists(),"IMMUTABLE_INDEX_EXISTS";p.mkdir(parents=True,exist_ok=True)']);
  // path.join(...,'.') removes the trailing dot, and Docker then nests the
  // directory instead of copying its immutable pointer/revision contents.
  docker(['cp',`${join(home,'dataset-index')}/.`,`${container}:${target}`]);
  docker(['exec','-u','0',container,'chown','-R','10001:10001',target]);
  console.log('FULL04 owned cell receives unchanged published metadata index; no historical market bytes copied.');
  process.exit(0);
}
const profile=slice==='expanded'?'p10.delta-event-driven-limit-oco-fixed-1h.v1':'p10.delta-mode3-global-1h.v1';
if(slice==='expanded'){
  assert(home.endsWith('/20261008/expanded'),'EXACT_LIMIT_OCO_CELL_HOME');
  env.P23_VOLUME_EDITION='20261008-limit-oco';
}
Object.assign(env,{P23_QUALIFICATION_SLICE:slice,PORTAL_IMAGE_PREFIX:slice==='expanded'?'local/portal-research-limit-oco':'local/portal-research-full04',PORTAL_IMAGE_TAG:'candidate',
  CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:profile,
  PORTAL_RECIPE_QUALIFICATION_PROFILE_ID:profile,
  CONTROL_API_FEATURE_RESEARCH_FULL03_PROFILE:'true',PORTAL_FEATURE_RESEARCH_FULL03_PROFILE:'true',
  CONTROL_API_FEATURE_RESEARCH_FULL04_PROFILE:'true',PORTAL_FEATURE_RESEARCH_FULL04_PROFILE:'true',
  CONTROL_API_FEATURE_RESEARCH_FULL06_PROFILE:slice==='expanded'?'true':env.CONTROL_API_FEATURE_RESEARCH_FULL06_PROFILE,
  PORTAL_FEATURE_RESEARCH_FULL06_PROFILE:slice==='expanded'?'true':env.PORTAL_FEATURE_RESEARCH_FULL06_PROFILE,
  CONTROL_API_FEATURE_RESEARCH_PREVIEW_LONG_WFO:slice==='expanded'?'true':'false',PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO:slice==='expanded'?'true':'false'});
writeFileSync(file,'# Private FULL04 owned qualification inputs; never print or commit.\n'
  +Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});chmodSync(file,0o600);
const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',stdio:'pipe',timeout:30000});
for(const service of ['portal-web','roadmap-task-board-api']){
  // The old running roadmap index may no longer exist in containerd after a
  // tag replacement. Reuse the preserved P23 image for this unchanged service;
  // never recreate or retag the active preview container's missing index.
  const id=service==='roadmap-task-board-api'
    ?docker(['image','inspect','--format','{{.Id}}','local/portal-research-p23-roadmap-task-board-api:qualification']).trim()
    :docker(['inspect','--format','{{.Image}}',`portal-research-preview-${service}-1`]).trim();
  assert(/^sha256:[a-f0-9]{64}$/.test(id));
  docker(['image','tag',id,`${env.PORTAL_IMAGE_PREFIX}-${service}:${env.PORTAL_IMAGE_TAG}`]);
}
const index=join(home,'dataset-index');
if(!existsSync(index)){
  mkdirSync(index,{mode:0o700});
  docker(['cp','portal-research-preview-portal-api-1:/var/lib/portal/artifacts/runs/durable-store/research-dataset-index/.',index]);
}
console.log('FULL04 private cell inputs ready; inherited images/index copied read-only, no preview runtime changed.');
