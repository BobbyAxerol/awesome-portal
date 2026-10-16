import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const nullable=s=>({anyOf:[s,{type:'null'}]});
const text={type:'string',minLength:1,maxLength:256,pattern:'^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])'};
const decimal={type:'string',maxLength:128,pattern:'^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$(?![\\s\\S])'};
const count={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const cursor=nullable({type:'string',minLength:1,maxLength:4096,pattern:'^[A-Za-z0-9._-]+$(?![\\s\\S])'});
const ref=n=>({$ref:`#/components/schemas/${n}`});
const fields=obj({
  ...Object.fromEntries(['alpha_id','alpha_version_id','strategy_id','portfolio_id','deployment_id','account_id','binding_id','instrument_id','position_id','order_id','fill_id','name','state','status','stage','venue','currency','base_currency','side'].map(k=>[k,nullable(text)])),
  ...Object.fromEntries(['quantity','price','notional','allocation','balance_total','balance_free','balance_locked','realized_pnl','unrealized_pnl','net_pnl','equity'].map(k=>[k,nullable(decimal)])),
  ...Object.fromEntries(['timestamp_ms','occurred_at_ms','created_at','updated_at'].map(k=>[k,nullable(count)]))},[]);
const group=obj({state:{enum:['PARTIAL','EMPTY','UNAVAILABLE']},completeness:{const:'PARTIAL'},freshness:{const:'UNKNOWN'},as_of_ms:{type:'null'},
  returned_count:{type:'integer',minimum:0,maximum:200},truncated:{type:'boolean'},reason_code:{enum:['AUTHORIZED_RETAINED_FACTS','RETAINED_FACTS_NOT_PUBLISHED']},items:{type:'array',maxItems:200,items:ref('ScopedRecordFields')}});
const groups=['strategies','deployments','accounts','positions','reconciliation','performance','account_equity','portfolio_equity','balances','margin','account_sync','broker_sync','venue_accounts','orders','fills','sessions','command_journal','conditional_order_groups','conditional_order_group_legs'];
const adapter=obj({schema_version:{const:'portal.execution.profile-read-adapter.v2'},capability_id:{enum:['admin.inspect','admin.performance','admin.broker-read','event.order-lifecycle']},
  authority:{const:'PORTAL_SGP_PROJECTION'},workspace_id:text,environment:{enum:['paper','sandbox','live']},profile_id:text,visibility:{const:'SCOPED'},coverage:{const:'AUTHORIZED_ONLY'},policy_revision:text,
  bounds:obj({maximum_rows_per_relation:{const:200},maximum_response_bytes:{const:1048576}}),relations:obj(Object.fromEntries(groups.map(k=>[k,ref('ScopedAdapterGroup')])),[])});
const subject=obj({schema_version:{const:'portal.execution.subject-records.v2'},logical_operation_id:{enum:['executionAlphaOrdersV1','executionAlphaFillsV1','executionAccountOrdersV1','executionAccountFillsV1']},
  authority:{const:'PORTAL_SGP_RETAINED_CURRENT_WINDOW'},source_authority:{const:'TRADING_SYSTEM_CURRENT_SOURCE'},history_semantics:{const:'RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY'},
  environment:{enum:['paper','sandbox','live']},profile_id:text,resource:obj({kind:{enum:['alpha','account']},id:text}),
  read_scope:obj({visibility:{const:'SCOPED'},coverage:{const:'AUTHORIZED_ONLY'},policy_revision:text}),state:{enum:['EMPTY','PARTIAL']},reason_code:{const:'SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY'},
  coverage:obj({retained_row_count:count,oldest_observed_at_ms:nullable(count),newest_observed_at_ms:nullable(count)}),
  page:obj({limit:{type:'integer',minimum:1,maximum:500},maximum_page_rows:{const:500},returned_count:{type:'integer',minimum:0,maximum:500},has_more:{type:'boolean'},next_cursor:cursor}),
  records:{type:'array',maxItems:500,items:obj({record_id:text,observed_at_ms:count,values:ref('ScopedRecordFields')})}});
const op=(id,schema,parameters)=>({operationId:id,security:[{PortalSession:[]}],parameters,
  description:'V2 alternative selected by durable server policy only. Existing legacy compatibility DTO is unchanged. No caller-provided scope, raw relation selector, credentials or global metadata. This document publishes scoped consumers; not a browser opt-in. HTTP private,no-store.',
  responses:{200:{description:'Scoped response on V2 authority',content:{'application/json':{schema:ref(schema)}}},
    ...Object.fromEntries([400,401,403,404,409,503].map(s=>[s,{description:'Typed safe refusal; never a legacy/upstream fallback.'}]))}});
const param=(name,schema,location='query')=>({name,in:location,required:location==='path',schema});
const pageParams=[param('environment',{enum:['paper','sandbox','live']}),param('workspace_id',text),param('limit',{type:'integer',minimum:1,maximum:500}),param('after',{type:'string',maxLength:4096}),param('relation',{enum:['orders','fills']},'path')];
const document={openapi:'3.1.0',info:{title:'Execution scoped adapters and retained subject records',version:'2.0.0'},paths:{
  '/api/v1/execution/adapters/{environment}/{capabilityId}':{get:op('executionScopedAdapterGet','ScopedAdapterResponse',[param('environment',{enum:['paper','sandbox','live']},'path'),param('capabilityId',adapter.properties.capability_id,'path')])},
  '/api/v1/execution/resources/alphas/{alphaId}/{relation}':{get:op('executionScopedAlphaRecordsGet','ScopedSubjectRecordsResponse',[param('alphaId',text,'path'),...pageParams])},
  '/api/v1/execution/resources/accounts/{accountId}/{relation}':{get:op('executionScopedAccountRecordsGet','ScopedSubjectRecordsResponse',[param('accountId',text,'path'),...pageParams])}},
  components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'__Host-portal_session'}},schemas:{ScopedRecordFields:fields,ScopedAdapterGroup:group,ScopedAdapterResponse:adapter,ScopedSubjectRecordsResponse:subject}}};
const adapterValue={schema_version:'portal.execution.profile-read-adapter.v2',capability_id:'admin.inspect',authority:'PORTAL_SGP_PROJECTION',workspace_id:'workspace_TEST_ONLY',environment:'paper',profile_id:'profile_TEST_ONLY',visibility:'SCOPED',coverage:'AUTHORIZED_ONLY',policy_revision:'TEST_ONLY-policy',bounds:{maximum_rows_per_relation:200,maximum_response_bytes:1048576},relations:{strategies:{state:'PARTIAL',completeness:'PARTIAL',freshness:'UNKNOWN',as_of_ms:null,returned_count:1,truncated:false,reason_code:'AUTHORIZED_RETAINED_FACTS',items:[{alpha_id:'alpha_TEST_ONLY',name:'TEST_ONLY Alpha'}]}}};
const subjectValue={schema_version:'portal.execution.subject-records.v2',logical_operation_id:'executionAlphaFillsV1',authority:'PORTAL_SGP_RETAINED_CURRENT_WINDOW',source_authority:'TRADING_SYSTEM_CURRENT_SOURCE',history_semantics:'RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY',environment:'paper',profile_id:'profile_TEST_ONLY',resource:{kind:'alpha',id:'alpha_TEST_ONLY'},read_scope:{visibility:'SCOPED',coverage:'AUTHORIZED_ONLY',policy_revision:'TEST_ONLY-policy'},state:'PARTIAL',reason_code:'SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY',coverage:{retained_row_count:1,oldest_observed_at_ms:1790812800000,newest_observed_at_ms:1790812800000},page:{limit:200,maximum_page_rows:500,returned_count:1,has_more:false,next_cursor:null},records:[{record_id:'fill_TEST_ONLY',observed_at_ms:1790812800000,values:{fill_id:'fill_TEST_ONLY',price:'100.1234567890123456789',quantity:'0'}}]};
const fixtures={lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',cases:[{type:'ScopedAdapterResponse',value:adapterValue},{type:'ScopedSubjectRecordsResponse',value:subjectValue}]};
const technicalProfile={environment:{enum:['paper','sandbox','live']},profile_id:text};
document.components.schemas.TechnicalHealth=obj({schema_version:{const:'portal.execution.technical-health.v1'},read_scope:{const:'TECHNICAL_AUTHORIZED'},
  ...technicalProfile,component:{const:'DURABLE_MIRROR'},state:{enum:['READY','PARTIAL','UNAVAILABLE']},reason_code:nullable(text),revision:nullable(text),observed_at:nullable(count)});
document.components.schemas.TechnicalDiagnostics=obj({schema_version:{const:'portal.execution.technical-diagnostics.v1'},read_scope:{const:'TECHNICAL_AUTHORIZED'},
  profiles:{type:'array',minItems:1,maxItems:3,items:obj({...technicalProfile,component:{const:'LOCAL_PROJECTION'},state:text,health:{enum:['OBSERVED','NOT_PUBLISHED']},lag_ms:nullable(count),last_error_code:nullable(text)})}});
document.paths['/api/v1/execution/durable-mirror/integrity']={get:op('executionScopedTechnicalHealthGet','TechnicalHealth',[
  param('environment',{enum:['paper','sandbox','live']}),param('workspace_id',text)])};
document.paths['/api/v1/execution/realtime/diagnostics']={get:op('executionScopedTechnicalDiagnosticsGet','TechnicalDiagnostics',[])};
fixtures.cases.push({type:'TechnicalHealth',value:{schema_version:'portal.execution.technical-health.v1',read_scope:'TECHNICAL_AUTHORIZED',
  environment:'paper',profile_id:'profile_TEST_ONLY',component:'DURABLE_MIRROR',state:'PARTIAL',reason_code:'TEST_ONLY_INCOMPLETE',revision:null,observed_at:null}},
  {type:'TechnicalDiagnostics',value:{schema_version:'portal.execution.technical-diagnostics.v1',read_scope:'TECHNICAL_AUTHORIZED',profiles:[{
    environment:'paper',profile_id:'profile_TEST_ONLY',component:'LOCAL_PROJECTION',state:'TEST_ONLY_UNKNOWN',health:'NOT_PUBLISHED',lag_ms:null,last_error_code:null}]}});
for(const [file,data] of Object.entries({'openapi/execution-scoped-records.openapi.json':document,'fixtures/execution-scoped-records.synthetic.valid.json':fixtures})){
  const path=resolve(root,file),bytes=JSON.stringify(data,null,2)+'\n';
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw new Error(`Generated drift: ${file}`);}
  else writeFileSync(path,bytes);
}
