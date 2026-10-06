#!/usr/bin/env node
/** Private FULL05 cell only; reuse unchanged web/roadmap and metadata index. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,chmodSync,lstatSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateHome} from './cell.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
const slice=home.endsWith('/full06')?'full06':'full05';
assert(home.endsWith('/'+slice),'EXACT_FULL05_OR_FULL06_HOME');
const file=join(home,'preview.env'),stat=lstatSync(file);
assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_ENV_REQUIRED');
const env=Object.fromEntries(readFileSync(file,'utf8').split('\n').filter(s=>/^[A-Z0-9_]+=/.test(s)).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
assert(env.PORTAL_STACK_NAME==='portal-research-p23-ol12'&&env.PORTAL_HTTP_PORT==='8096','EXACT_OWNED_CELL');
const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',stdio:'pipe',timeout:30000});
if(process.argv.includes('--install-index')){
  const container='portal-research-p23-ol12-portal-api-1',target='/var/lib/portal/artifacts/runs/durable-store/research-dataset-index';
  assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container]).trim(),env.PORTAL_STACK_NAME);
  docker(['exec','-u','0',container,'python','-c','from pathlib import Path;p=Path("'+target+'");assert not (p/"current").exists();p.mkdir(parents=True,exist_ok=True)']);
  docker(['cp',`${join(home,'dataset-index')}/.`,`${container}:${target}`]);
  docker(['exec','-u','0',container,'chown','-R','10001:10001',target]);
  console.log('FULL05 owned metadata index installed unchanged; historical store remains read-only.');
}else{
  Object.assign(env,{P23_QUALIFICATION_SLICE:slice,PORTAL_IMAGE_PREFIX:'local/portal-research-'+slice,PORTAL_IMAGE_TAG:'candidate',
    CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:'p10.imported-wfo-temporal-1h.v1',PORTAL_RECIPE_QUALIFICATION_PROFILE_ID:'p10.imported-wfo-temporal-1h.v1',
    CONTROL_API_FEATURE_RESEARCH_FULL05_PROFILE:'true',PORTAL_FEATURE_RESEARCH_FULL05_PROFILE:'true',
    CONTROL_API_FEATURE_RESEARCH_IMPORTED_EXECUTION:'true',PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION:'true',
    CONTROL_API_FEATURE_RESEARCH_PREVIEW_LONG_WFO:'false',PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO:'false'});
  if(slice==='full06')Object.assign(env,{CONTROL_API_FEATURE_RESEARCH_FULL06_PROFILE:'true',PORTAL_FEATURE_RESEARCH_FULL06_PROFILE:'true',
    CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:'p10.delta-pct-equity-wfo-temporal-1h.v1',PORTAL_RECIPE_QUALIFICATION_PROFILE_ID:'p10.delta-pct-equity-wfo-temporal-1h.v1'});
  writeFileSync(file,'# Private FULL05 owned inputs. Never print or commit.\n'+Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});chmodSync(file,0o600);
  for(const service of ['portal-web','roadmap-task-board-api']){
    const id=service==='roadmap-task-board-api'?docker(['image','inspect','--format','{{.Id}}','local/portal-research-p23-roadmap-task-board-api:qualification']).trim()
      :docker(['inspect','--format','{{.Image}}',`portal-research-preview-${service}-1`]).trim();
    assert(/^sha256:[a-f0-9]{64}$/.test(id));docker(['image','tag',id,`${env.PORTAL_IMAGE_PREFIX}-${service}:${env.PORTAL_IMAGE_TAG}`]);
  }
  const index=join(home,'dataset-index');
  if(!existsSync(index)){mkdirSync(index,{mode:0o700});docker(['cp','portal-research-preview-portal-api-1:/var/lib/portal/artifacts/runs/durable-store/research-dataset-index/.',index]);}
  console.log('FULL05 private inputs ready; unchanged web/roadmap reused, no preview runtime changed.');
}
