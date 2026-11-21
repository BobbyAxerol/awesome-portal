import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const obj = (properties, required = Object.keys(properties)) => ({type:'object',additionalProperties:false,properties,required});
const nullable = s => ({anyOf:[s,{type:'null'}]});
const text = {type:'string',minLength:1,maxLength:256,pattern:'^[^\\u0000-\\u001f\\u007f]+$'};
const ms = {type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const decimal = {type:'string',maxLength:128,pattern:'^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])'};
const count = {type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const iso = {type:'string',minLength:1,maxLength:35};
const identifiers = ['alpha_id','alpha_version_id','portfolio_id','deployment_id','account_id','strategy_id','instrument_id','order_id','fill_id','position_id'];
const decimals = ['quantity','price','notional','allocation','balance_total','balance_free','balance_locked','realized_pnl','unrealized_pnl','net_pnl','exposure','equity','drawdown','return'];
const texts = ['currency','base_currency','side'];
const ref = n => ({$ref:`#/components/schemas/${n}`});
const common = {authority:{const:'PORTAL_SGP_HISTORY_MIRROR'},environment:{enum:['paper','sandbox','live']},profile_id:text,
  relation_key:text,state:{enum:['AVAILABLE','EMPTY']},completeness:{const:'PARTIAL'},
  reason_code:{const:'N33_RETAINED_RANGE_NOT_AUTHORITATIVE_HISTORY'}};
const page = {returned_count:{type:'integer',minimum:0,maximum:2000},limit:{type:'integer',minimum:1,maximum:2000},
  maximum_response_bytes:{const:1048576},has_more:{type:'boolean'}};
const v2 = obj({schema_version:{const:'portal.execution.timeseries-history.v2'},...common,
  read_scope:obj({visibility:{const:'SCOPED'},coverage:{const:'AUTHORIZED_ONLY'},policy_revision:{type:'string',minLength:1,maxLength:256}}),
  coverage:obj({basis:{const:'EXACT_AUTHORIZED_RETAINED_RANGE'},row_count:count,oldest_ms:nullable(ms),newest_ms:nullable(ms),
    range:{const:'START_INCLUSIVE_END_EXCLUSIVE'}}),
  page:obj({...page,next_cursor:nullable({type:'string',minLength:1,maxLength:4096,pattern:'^[A-Za-z0-9._-]+$(?![\\s\\S])'})}),
  items:{type:'array',maxItems:2000,items:ref('ScopedHistoryRow')},
});
v2.description = 'Server-selected V2 only after current scoped authority. Authorized coverage, never source/global totals. UTC epoch-ms and exact decimal strings. Omitted field means not disclosed; null is a published absence, never zero. Private cursor retains sub-ms ordering. Source history is partial, not authoritative event replay. Runtime also checks cross-field counts, bounds, state and cursor consistency.';
const v1 = obj({schema_version:{const:'portal.execution.timeseries-history.v1'},...common,
  coverage:obj({basis:{const:'EXACT_REQUESTED_RETAINED_RANGE'},row_count:count,oldest_ts:nullable(iso),newest_ts:nullable(iso)}),
  page:obj({...page,next_after_ts:nullable(iso),next_after_id:nullable({type:'string',maxLength:512})}),
  items:{type:'array',maxItems:2000,items:{type:'object',additionalProperties:true}},
});
v1.description = 'Unchanged legacy certified DTO, selected only by durable server policy. No browser selector switches V2 back to legacy. ISO/raw keyset fields remain legacy-only.';
const schemas = {ScopedHistoryRow:obj({timestamp_ms:ms,
  ...Object.fromEntries(identifiers.map(k=>[k,nullable(text)])),...Object.fromEntries(decimals.map(k=>[k,nullable(decimal)])),
  ...Object.fromEntries(texts.map(k=>[k,nullable(text)]))},['timestamp_ms']),ScopedHistoryResponse:v2,LegacyHistoryResponse:v1,
  HistoryProblem:obj({error:obj({code:text,message:{type:'string'}}),request_id:{type:'string'}})};
const response = (schema,description) => ({description,content:{'application/json':{schema}}});
const query = (name,schema,description) => ({name,in:'query',required:false,schema,description});
const operation = {operationId:'executionRetainedHistoryGet',deprecated:true,security:[{PortalSession:[]}],
  description:'Existing deprecated, catalogue-bound history compatibility route, not an arbitrary relation proxy. private,no-store. V2 policy refuses hidden filter fields, scope/workspace/profile/limit/revision cursor changes and raw legacy cursors. No browser authority/qualification/actor input.',
  parameters:[{name:'environment',in:'path',required:true,schema:common.environment},
    {name:'relationKey',in:'path',required:true,schema:text,description:'Only existing server-catalogued ladder bindings; no SQL, schema, URL or cursor relation input.'},
    query('workspace_id',text,'Current authenticated membership; never a scope grant.'),
    ...['from','to'].map(n=>query(n,iso,'ISO UTC/offset input; V2 [from,to), equal/reversed endpoints refused.')),
    query('limit',{type:'integer',minimum:1,maximum:2000,default:500},'Page bound, not a total-history cap.'),
    query('cursor',{type:'string',minLength:1,maxLength:4096,pattern:'^[A-Za-z0-9._-]+$(?![\\s\\S])'},'V2 opaque signed cursor; bound to actor/session/policy/source/filter/window/limit.'),
    ...['after_ts','after_id'].map(n=>({...query(n,{type:'string',maxLength:n==='after_id'?512:35},'Legacy-only; V2 refuses this parameter.'),deprecated:true})),
    ...['account_id','portfolio_id','deployment_id','strategy_id','instrument_id'].map(n=>query(n,{type:'string',minLength:1,maxLength:192},'At most one entity filter; field must be disclosed/queryable under current policy.'))],
  responses:{200:response({oneOf:[ref('ScopedHistoryResponse'),ref('LegacyHistoryResponse')]},'Server-selected schema; authorized empty is 200, not an unqualified source success.'),
    ...Object.fromEntries([400,401,403,404,409,503].map(s=>[s,response(ref('HistoryProblem'),'Typed public refusal, no hidden counts, SQL, custody or source credentials.')])),
  }};
const document={openapi:'3.1.0',info:{title:'Execution retained history scoped compatibility read',version:'2.0.0'},
  paths:{'/api/v1/execution/history/{environment}/{relationKey}':{get:operation}},
  components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'__Host-portal_session'}},schemas}};
const value={schema_version:'portal.execution.timeseries-history.v2',authority:'PORTAL_SGP_HISTORY_MIRROR',environment:'paper',
  profile_id:'profile_TEST_ONLY',relation_key:'manager.performance:account_equity_snapshots',state:'AVAILABLE',completeness:'PARTIAL',
  reason_code:'N33_RETAINED_RANGE_NOT_AUTHORITATIVE_HISTORY',read_scope:{visibility:'SCOPED',coverage:'AUTHORIZED_ONLY',policy_revision:'TEST_ONLY-r1'},
  coverage:{basis:'EXACT_AUTHORIZED_RETAINED_RANGE',row_count:2,oldest_ms:1790812800000,newest_ms:1790816400000,range:'START_INCLUSIVE_END_EXCLUSIVE'},
  page:{returned_count:2,limit:500,maximum_response_bytes:1048576,has_more:false,next_cursor:null},
  items:[{timestamp_ms:1790812800000,alpha_id:'alpha_TEST_ONLY',equity:'100.1234567890123456789',realized_pnl:'0',currency:'USD'},
    {timestamp_ms:1790816400000,alpha_id:'alpha_TEST_ONLY',equity:null,realized_pnl:'-0.001',currency:'USD'}]};
const fixtures={lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',cases:[{type:'ScopedHistoryResponse',value},
  {type:'ScopedHistoryResponse',value:{...value,state:'EMPTY',coverage:{...value.coverage,row_count:0,oldest_ms:null,newest_ms:null},
    page:{...value.page,returned_count:0},items:[]}},
  {type:'LegacyHistoryResponse',value:{schema_version:'portal.execution.timeseries-history.v1',...Object.fromEntries(Object.keys(common).map(k=>[k,value[k]])),
    coverage:{basis:'EXACT_REQUESTED_RETAINED_RANGE',row_count:1,oldest_ts:'2026-10-01T00:00:00.000Z',newest_ts:'2026-10-01T00:00:00.000Z'},
    page:{returned_count:1,limit:500,maximum_response_bytes:1048576,has_more:false,next_after_ts:null,next_after_id:null},
    items:[{ts:'2026-10-01T00:00:00.000Z',equity:'100'}]}}]};
for(const [file,data] of Object.entries({'openapi/execution-history.openapi.json':document,'fixtures/execution-history.synthetic.valid.json':fixtures})){
  const target=resolve(root,file),bytes=JSON.stringify(data,null,2)+'\n';
  if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==bytes)throw new Error(`Generated drift: ${file}`);}
  else writeFileSync(target,bytes);
}
