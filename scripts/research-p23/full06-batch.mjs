#!/usr/bin/env node
/** One ordinary percent-equity child at a time; no direct engine substitute. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateHome} from './cell.mjs';
import {privateJson,refreshTestSessions} from './api-client.mjs';
import {full03Receipt} from './full03-product-receipt.mjs';
import {assertModeTruth} from './full04-qualification.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full06'),'EXACT_FULL06_HOME');
const table=JSON.parse(readFileSync(new URL('../../apps/portal/registry/research-execution-recipes.v1.json',import.meta.url)));
const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full06-delta-profile.v1');
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',')??rows.map(r=>r.profile_id);
assert(ids.length&&new Set(ids).size===ids.length&&ids.every(id=>rows.some(r=>r.profile_id===id)),'EXACT_PERCENT_EQUITY_IDS');
try{
  for(const id of ids){
    const row=rows.find(r=>r.profile_id===id),label=id.replace(/^p10\./,'').replace(/\.v1$/,'');
    const attempts=readdirSync(home).filter(n=>n.startsWith(`qualification-${label}`)&&n.endsWith('.json')).map(n=>privateJson(join(home,n))).filter(r=>r.profile_id===id);
    if(attempts.some(r=>r.passed)){console.log('FULL06 preserved completed ordinary receipt',id);continue;}
    await refreshTestSessions(home);
    const attempt=attempts.length+1;assert(attempt<=5,'BOUNDED_ATTEMPTS');
    const result=await full03Receipt(home,id,attempt,'full06');
    assert.equal(result.run.requested_spec.execution_route,'pct_equity');
    assert.equal(result.run.requested_spec.alpha_binding.alpha_version_id,'av_delta_rsi_polynomial_alpha_1_0_2');
    if(row.public_profile.optimization_mode!=='mode_1_decay')assertModeTruth(row,result);
  }
  console.log(JSON.stringify({passed:true,exact_percent_equity_recipes:ids.length,serial_heavy_children:true}));
}catch(error){console.error('FULL06 stopped without widening admission:',error.message);process.exitCode=1;}
