#!/usr/bin/env node
/** Exact private recipe admission switch, never a shared/prod environment. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateHome} from './cell.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
const slice=home.endsWith('/full06')?'full06':'full05';
assert(home.endsWith('/'+slice),'EXACT_PRIVATE_RECIPE_HOME');
const enabled=process.argv.find(a=>a.startsWith('--enabled='))?.slice(10);
assert(['true','false'].includes(enabled),'EXPLICIT_ADMISSION_STATE');
const file=join(home,'preview.env'),stat=lstatSync(file),value=readFileSync(file,'utf8');
assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_REGULAR_INPUT');
assert(/^PORTAL_STACK_NAME=portal-research-p23-ol12$/m.test(value)&&/^PORTAL_HTTP_PORT=8096$/m.test(value),'EXACT_OWNED_CELL');
const container='portal-research-p23-ol12-control-api-1';
const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',timeout:30000});
assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container]).trim(),'portal-research-p23-ol12');
assert.equal(docker(['exec',container,'node','-e',`const {Pool}=require('pg'),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
p.query("SELECT count(*)::int n FROM research.runs WHERE state IN ('RUNNING','SEALING')")
.then(r=>process.stdout.write(String(r.rows[0].n))).finally(()=>p.end()).catch(()=>process.exitCode=1);`]).trim(),'0','OWNED_CHILD_IN_FLIGHT');
let next=value;
for(const key of [`CONTROL_API_FEATURE_RESEARCH_${slice.toUpperCase()}_PROFILE`,`PORTAL_FEATURE_RESEARCH_${slice.toUpperCase()}_PROFILE`]){
  const pattern=new RegExp(`^${key}=.*$`,'m');assert(pattern.test(next));next=next.replace(pattern,key+'='+enabled);
}
for(const key of ['CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID','PORTAL_RECIPE_QUALIFICATION_PROFILE_ID'])
  next=next.replace(new RegExp(`^${key}=.*$`,'m'),key+'=');
writeFileSync(file,next,{mode:0o600});
execFileSync('node',[new URL('./cell.mjs',import.meta.url).pathname,'up','--home='+home],{stdio:'pipe',timeout:240000,maxBuffer:4*1024*1024});
console.log(JSON.stringify({passed:true,project:'portal-research-p23-ol12',enabled,qualification_selector_cleared:true}));
