#!/usr/bin/env node
/** Real Portal Limit/OCO positive lane; preserve all private responses. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeReceipt} from './native-route-product-receipt.mjs';
import {loadSessions,makeClient,ensureOwnedOperatorSession,savePrivate} from './api-client.mjs';
import {validateHome} from './cell.mjs';
const PROFILE='p10.delta-event-driven-limit-oco-fixed-1h.v1';
export async function limitOcoReceipt(home,symbol){
 home=validateHome(home);
 const record=await nativeReceipt(home,PROFILE,symbol);
 const client=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner'),{connectionClose:true});
 await ensureOwnedOperatorSession(client,home);
 const proof={schema_version:'research.limit-oco-product-receipt.v1',profile_id:PROFILE,
  profile_digest:record.profile_digest,identity:record.identity,run_id:record.run.run_id,symbol,
  requested_spec:record.run.requested_spec,reads:{},passed:false};
 const path=join(home,`limit-oco-${symbol.toLowerCase()}.json`);
 try{
  const rows=[];
  for(const window of ['IS','OOS','HOLDOUT']){
   const pages=[];let cursor=null;
   do{
    assert(pages.length<10,'BOUNDED_NATIVE_JOURNAL_PAGING');
    const page=await client.call('GET',`/api/v1/quantbt/runs/${proof.run_id}/execution/records?window=${window}&limit=200${cursor?'&cursor='+encodeURIComponent(cursor):''}`);
    if(window==='HOLDOUT'){
     assert.equal(page.body.availability.state,'NOT_PUBLISHED');
     assert.equal(page.body.availability.reason_code,'FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT');
     assert.equal(page.body.rows.length,0);assert.equal(page.body.next_cursor,null);
    }else assert.equal(page.body.availability.state,'AVAILABLE','COMPLETED_NATIVE_WINDOW_AVAILABLE');
    assert(Buffer.byteLength(JSON.stringify(page.body))<=1048576,'NATIVE_PAGE_BYTE_BOUND');
    pages.push(page);rows.push(...page.body.rows.map(r=>r.payload));cursor=page.body.next_cursor;
   }while(cursor);
   proof.reads[window]=pages;savePrivate(path,proof);
  }
  const orders=rows.filter(r=>r.source_relation==='result.orders');
  const parent=orders.find(r=>r.order_id?.startsWith('delta-limit-oco-entry-')&&!r.parent_order_id);
  assert(parent&&parent.order_type==='limit'&&Number(parent.price)>0,'REAL_PARENT_LIMIT');
  // OrderIntent publishes prices but does not carry parent/OCO/activation.
  // Join by the source's exact order ID to its actual command report; do not
  // invent those fields on result.orders or infer them from ID suffixes.
  const commands=rows.filter(r=>r.source_relation==='metadata.command_report'&&r.parent_order_id===parent.order_id);
  assert.equal(commands.length,2,'PARENT_HAS_TWO_REAL_EXIT_COMMANDS');
  assert(commands.every(r=>r.reduce_only===true&&r.oco_group_id&&r.oco_group_id===commands[0].oco_group_id
   &&r.activation_policy==='on_parent_full_fill'),'ACTUAL_PARENT_BOUND_OCO_FULL_FILL_POLICY');
  const children=commands.map(command=>{
   const order=orders.find(r=>r.order_id===command.order_id);
   assert(order&&order.order_type===command.order_type&&order.reduce_only===command.reduce_only,'COMMAND_INTENT_IDENTITY_PARITY');
   return {...order,parent_order_id:command.parent_order_id,oco_group_id:command.oco_group_id};
  });
  assert(children.some(r=>r.order_type==='stop_market'&&Number(r.trigger_price)>0));
  assert(children.some(r=>r.order_type==='limit'&&Number(r.price)>0));
  const events=rows.filter(r=>r.source_relation==='metadata.lifecycle_event_report_v1');
  const parentFill=events.find(r=>r.order_id===parent.order_id&&r.event_name==='fill');
  assert(parentFill,'REAL_LIMIT_FILL_EVENT');
  for(const child of children)assert(events.some(r=>r.order_id===child.order_id&&r.event_name==='activate'
   &&r.timestamp_utc_ms>=parentFill.timestamp_utc_ms),'SOURCE_ACTIVATION_NOT_INVENTED');
  const filled=children.filter(c=>events.some(r=>r.order_id===c.order_id&&r.event_name==='fill'));
  const canceled=children.filter(c=>events.some(r=>r.order_id===c.order_id&&r.event_name==='cancel'));
  assert.equal(filled.length,1,'EXACTLY_ONE_OCO_EXIT_FILL');assert.equal(canceled.length,1,'REAL_SIBLING_CANCEL');
  assert.notEqual(filled[0].order_id,canceled[0].order_id);
  assert.equal(events.find(r=>r.order_id===filled[0].order_id&&r.event_name==='fill').timestamp_utc_ms,
   events.find(r=>r.order_id===canceled[0].order_id&&r.event_name==='cancel').timestamp_utc_ms,'SAME_ENGINE_OCO_TERMINAL_BAR');
  assert.equal(rows.filter(r=>r.source_relation==='result.fills').length,2,'REAL_ENTRY_AND_EXIT_FILLS');
  const progress=await client.call('GET',`/api/v1/research/runs/${proof.run_id}/progress`);
  assert.equal(progress.body.native_execution.input_protocol,'DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1');
  assert.deepEqual(progress.body.native_execution,record.reads.evidence.body.core.native_execution,'PROGRESS_EVIDENCE_FACT_PARITY');
  proof.progress=progress;
  proof.negative_cursor=await client.call('GET',`/api/v1/quantbt/runs/${proof.run_id}/execution/records?window=IS&cursor=invalid`,undefined,[400]);
  proof.journal={parent_order_id:parent.order_id,children:children.map(c=>({order_id:c.order_id,order_type:c.order_type,
   parent_order_id:c.parent_order_id,oco_group_id:c.oco_group_id,price:c.price,trigger_price:c.trigger_price})),
   filled_exit_id:filled[0].order_id,canceled_exit_id:canceled[0].order_id,source_event_count:events.length};
  proof.passed=true;console.log(JSON.stringify({passed:true,symbol,run_id:proof.run_id,journal:proof.journal}));
 }catch(e){proof.failure=e.message;throw e;}finally{proof.finished_at_utc=new Date().toISOString();savePrivate(path,proof);}
 return proof;
}
if(process.argv[1]===fileURLToPath(import.meta.url))limitOcoReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7),
 process.argv.find(a=>a.startsWith('--symbol='))?.slice(9)??'BTCUSDT').catch(e=>{console.error('Limit/OCO refused:',e.message);process.exitCode=1;});
