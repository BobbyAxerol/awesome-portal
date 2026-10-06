#!/usr/bin/env node
/** One real imported child at a time; exact candidates, no direct engine calls. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateHome} from './cell.mjs';
import {privateJson,refreshTestSessions} from './api-client.mjs';
import {full03Receipt} from './full03-product-receipt.mjs';
import {assertModeTruth} from './full04-qualification.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full05'),'EXACT_FULL05_HOME');
const table=JSON.parse(readFileSync(new URL('../../apps/portal/registry/research-execution-recipes.v1.json',import.meta.url)));
const rows=table.recipes.filter(r=>r.source_requirement==='IMPORTED_IMMUTABLE_SEARCH_BINDING');
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',')??rows.map(r=>r.profile_id);
assert(ids.length&&new Set(ids).size===ids.length&&ids.every(id=>rows.some(r=>r.profile_id===id)),'EXACT_IMPORTED_IDS_ONLY');
try{
  for(const id of ids){
    const row=rows.find(r=>r.profile_id===id),label=id.replace(/^p10\./,'').replace(/\.v1$/,'');
    const attempts=readdirSync(home).filter(n=>n.startsWith(`qualification-${label}`)&&n.endsWith('.json')).map(n=>privateJson(join(home,n))).filter(r=>r.profile_id===id);
    const existing=attempts.find(r=>r.passed);
    if(existing){console.log('FULL05 preserved completed ordinary receipt',id);continue;}
    await refreshTestSessions(home);
    const attempt=attempts.length?attempts.length+1:1;assert(attempt<=5,'BOUNDED_ATTEMPTS');
    const result=await full03Receipt(home,id,attempt,'full05');
    assert.equal(result.run.requested_spec.alpha_binding.alpha_version_id,result.imported_registration.registration.alpha_version_id);
    if(row.public_profile.optimization_mode!=='mode_1_decay')assertModeTruth(row,result);
  }
  console.log(JSON.stringify({passed:true,exact_imported_recipes:ids.length,serial_heavy_children:true}));
}catch(error){console.error('FULL05 stopped without widening admission:',error.message);process.exitCode=1;}
