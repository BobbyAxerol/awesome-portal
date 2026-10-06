#!/usr/bin/env node
/** C4 quiet-window cleanup: exact old unshared recomputable BuildKit records only. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
import {validateHome} from './cell.mjs';
import {savePrivate} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full06'),'EXACT_FULL06_CAPACITY_HOME');
const action=process.argv.find(a=>a.startsWith('--action='))?.slice(9);
assert(['inventory','cleanup'].includes(action),'EXPLICIT_CAPACITY_ACTION');
const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',maxBuffer:16*1024*1024});
const bytes=value=>{const m=value.toUpperCase().match(/^([\d.]+)([KMGTP]?B)$/);assert(m,'EXPLICIT_CACHE_SIZE');
  return Number(m[1])*({B:1,KB:1e3,MB:1e6,GB:1e9,TB:1e12,PB:1e15}[m[2]]);};
const capacity=()=>{const fs=statfsSync('/');return{root_total_bytes:fs.blocks*fs.bsize,root_free_bytes:fs.bavail*fs.bsize,
  root_free_fraction:fs.bavail/fs.blocks};};
const record={recorded_at_utc:new Date().toISOString(),scope:'EXACT_OLD_UNSHARED_BUILDKIT_CACHE_NOT_IMAGES_VOLUMES_OR_DATA',
  action,before:capacity(),passed:false};
const attempt=Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??1);
assert(Number.isSafeInteger(attempt)&&attempt>=1&&attempt<=5,'BOUNDED_CAPACITY_ATTEMPT');
const path=join(home,`capacity-${action}${attempt===1?'':'-attempt'+attempt}.json`);assert(!existsSync(path),'IMMUTABLE_CAPACITY_RECEIPT');
const inventory=()=>docker(['buildx','du','--format','json']).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
const old=r=>r.Reclaimable&&!r.Shared&&!r.Mutable&&(/^[1-9][0-9]* weeks? ago$/.test(r.LastUsedAt)
  ||/^[1-9][0-9]* months? ago$/.test(r.LastUsedAt)
  ||(/^[0-9]+ days? ago$/.test(r.LastUsedAt)&&parseInt(r.LastUsedAt)>=8));
try{
 const records=inventory();record.total_cache_records=records.length;
 // Select the whole exact old/private immutable set. Never include recent or
 // shared descendants merely to release a parent.
 const candidates=records.filter(old).sort((a,b)=>bytes(b.Size)-bytes(a.Size));
 assert(candidates.every(r=>/^[a-z0-9]{20,32}$/.test(r.ID)),'EXACT_CACHE_IDENTIFIERS');
 record.candidates=candidates;record.upper_bound_reclaim_bytes=candidates.reduce((n,r)=>n+bytes(r.Size),0);
 if(action==='cleanup'){
  assert(candidates.length>0,'NO_EXPIRED_CACHE_TO_CLEAN');
  const processes=execFileSync('ps',['-eo','pid=,args='],{encoding:'utf8'}).split('\n');
  const busy=processes.filter(line=>!line.trim().startsWith(String(process.pid)+' ')
    &&!line.includes('full06-capacity.mjs')
    &&/(?:docker\s+(?:compose\s+.*\s+)?build\b|buildx\s+(?:build|bake)\b|Runner\.Worker|pg_dump\b|portal_api\.workers\.research_child|dist\/cli\/migrate|node\s+scripts\/research-p23\/(?:.*(?:batch|receipt|qualification|restore|transition)))\b/.test(line));
  assert.equal(busy.length,0,'C4_ACTIVE_BUILD_BACKUP_OR_EVIDENCE_COLLECTION');
  const control='portal-research-p23-ol12-control-api-1';
  assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',control]).trim(),'portal-research-p23-ol12');
  const running=docker(['exec',control,'node','-e',`const{Pool}=require('pg'),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
p.query("SELECT count(*)::int n FROM research.runs WHERE state IN ('RUNNING','SEALING')")
.then(r=>process.stdout.write(String(r.rows[0].n))).finally(()=>p.end()).catch(()=>process.exitCode=1);`]).trim();
  assert.equal(running,'0','C4_OWNED_CHILD_IN_FLIGHT');
  // BuildKit booleans expose an empty value only when present. The regex ^$
  // matches that value; bare selectors fail Docker CLI parsing and == without
  // a RHS fails BuildKit parsing. Keep age and exact inventory IDs too.
  record.prune_output=docker(['buildx','prune','--force','--filter','until=168h',
    '--filter','private~=^$','--filter','immutable~=^$','--filter','id~=^('+candidates.map(r=>r.ID).join('|')+')$']);
  record.after=capacity();const remaining=new Set(inventory().map(r=>r.ID));
  record.removed_cache_ids=candidates.filter(r=>!remaining.has(r.ID)).map(r=>r.ID);
  assert(record.removed_cache_ids.length>0,'NO_EXACT_OLD_CACHE_RECLAIMED');
  record.root_build_floor_satisfied=record.after.root_free_fraction>=0.20;
 }
 record.passed=true;console.log(JSON.stringify({passed:true,action,candidates:candidates.length,
  upper_bound_reclaim_bytes:record.upper_bound_reclaim_bytes,before:record.before,after:record.after,
  removed_cache_records:record.removed_cache_ids?.length??0}));
}finally{savePrivate(path,record);}
