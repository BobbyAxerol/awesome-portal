#!/usr/bin/env node
/** Bounded, serial ordinary qualification. Never two heavy children at once. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateHome} from './cell.mjs';
import {privateJson,refreshTestSessions} from './api-client.mjs';
import {full03Receipt} from './full03-product-receipt.mjs';
import {assertModeTruth} from './full04-qualification.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full04'),'EXACT_FULL04_HOME');
const table=JSON.parse(readFileSync(new URL('../../apps/portal/registry/research-execution-recipes.v1.json',import.meta.url)));
const modes=['mode3-global','mode2-global','mode4-global','mode4-causal','mode5-global'];
const clocks=['1h','1m','5m','15m','30m','4h','1d'];
const ids=clocks.flatMap(tf=>modes.map(mode=>`p10.delta-${mode}-${tf}.v1`));
const selected=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',')??ids;
assert(selected.length>0&&new Set(selected).size===selected.length&&selected.every(id=>ids.includes(id)),'EXACT_RECIPE_IDS_ONLY');
try{
  for(const id of selected){
    const row=table.recipes.find(r=>r.profile_id===id),label=id.replace(/^p10\./,'').replace(/\.v1$/,'');
    const attempts=readdirSync(home).filter(name=>name.startsWith(`qualification-${label}`)&&name.endsWith('.json'))
      .map(name=>privateJson(join(home,name))).filter(value=>value.profile_id===id);
    const passed=attempts.find(value=>value.passed);
    if(passed){assertModeTruth(row,passed);console.log('FULL04 verified existing receipt',id);continue;}
    await refreshTestSessions(home);
    const attempt=attempts.length?attempts.length+1:1;
    assert(attempt<=5,'BOUNDED_ATTEMPTS');
    const result=await full03Receipt(home,id,attempt,'full04');
    assertModeTruth(row,result);
  }
  console.log(JSON.stringify({passed:true,exact_recipes:selected.length,serial_heavy_children:true}));
}catch(error){console.error('FULL04 batch stopped without broadening admission:',error.message);process.exitCode=1;}
