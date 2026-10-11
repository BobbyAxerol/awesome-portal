#!/usr/bin/env node
/** Retake affected cached read failures on the exact final owned image.
 * Unchanged dump/artifact recovery is reconciled separately, not rerun. */
import assert from 'node:assert/strict';
import {docker,owned,readPrivate,privateWrite} from './acceptance-cell.mjs';
import {namedClient,refreshSessions} from './acceptance-api.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await refreshSessions();
const reader=namedClient('udb04-reader-01'),operator=namedClient('udb04-operator');
const portfolios=(await reader.call('GET','/api/v1/execution/portfolios?environment=all')).body;
assert(portfolios.items.length>0);
const resource='/api/v1/execution/resources/portfolios/'+encodeURIComponent(portfolios.items[0].portfolio_id);
const context='/api/v1/execution/retained-review';
const receipt={identity:readPrivate('identity.json'),checks:[],passed:false,db_restore_rerun:false};
async function check(name,c,path,status=[200]){
  const r=await c.call('GET',path,undefined,status);
  receipt.checks.push({name,status:r.status,code:r.body.error?.code??null});
  return r;
}
try{
  await check('warm-context',reader,context);await check('warm-portfolio',reader,resource);
  try{
    docker(['stop','--time','15',owned('execution-postgres')]);await pause(2100);
    await check('expired-data-context-domain-outage',reader,context,[503]);
    await check('expired-data-portfolio-domain-outage',reader,resource,[503]);
    await check('research-independent-of-domain-outage',operator,'/api/v1/quantbt/runs');
  }finally{docker(['start',owned('execution-postgres')]);}
  await pause(1000);
  await check('domain-restart-context',reader,context);await check('domain-restart-portfolio',reader,resource);
  try{
    docker(['stop','--time','15',owned('portal-postgres')]);
    await check('warm-portfolio-core-authority-outage',reader,resource,[503]);
    await check('context-core-authority-outage',reader,context,[503]);
    await check('research-core-authority-outage',operator,'/api/v1/quantbt/runs',[503]);
    assert(docker(['exec',owned('execution-postgres'),'pg_isready','-U','exec_owner','-d','portal_execution']).includes('accepting'));
    receipt.execution_db_independently_alive=true;
  }finally{docker(['start',owned('portal-postgres')]);}
  await pause(1000);
  await check('core-restart-context',reader,context);await check('core-restart-portfolio',reader,resource);
  await check('core-restart-research',operator,'/api/v1/quantbt/runs');
  receipt.passed=true;
}finally{privateWrite('outage-closeout.json',receipt);}
console.log(JSON.stringify({passed:receipt.passed,checks:receipt.checks.length,
  execution_independent:receipt.execution_db_independently_alive,db_restore_rerun:false}));
