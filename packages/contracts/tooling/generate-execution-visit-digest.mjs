import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const object = properties => ({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const revision = {type:'string',pattern:'^[0-9a-f]{64}$'};
const timestamp = {type:'string',format:'date-time'};
const version = {type:'integer',minimum:0,maximum:2147483646};
const seen = object({snapshot_revision:revision,expected_baseline_version:version});
const baseline = object({version:{...version,minimum:1},seen_at:timestamp,snapshot_revision:revision});
const item = object({id:{type:'string',minLength:1,maxLength:256},
  kind:{enum:['INCIDENT','APPROVAL','OPERATION','RECONCILIATION','REVIEW_DUE','CONDITION_EXPIRY','VERIFIED_OPERATION','JOURNAL_COMMAND','SOURCE','STAGE']},
  label:{type:'string',minLength:1,maxLength:512},value:{type:'string',maxLength:1024},
  href:{type:'string',pattern:'^/(?:execution|governance|deployments)(?:/|\\?|$)',maxLength:2048},
  as_of:{anyOf:[timestamp,{type:'null'}]},change:{enum:['NEW_OBSERVATION','CHANGED']},seen:{const:false}});
const response = {...object({schema_version:{const:'portal.execution.visit-digest.v1'},state:{enum:['NO_BASELINE','READY','EMPTY']},
  workspace_id:{type:'string',minLength:1,maxLength:96},
  may_mark_seen:{type:'boolean'},mark_seen_reason:{enum:['READ_ONLY_PROFILE',null]},
  reason_code:{enum:['NO_COMPARISON_BASELINE',null]},snapshot_revision:revision,observed_at:timestamp,
  coverage:{const:'BOUNDED_OBSERVATIONS'},baseline:{anyOf:[baseline,{type:'null'}]},
  items:{type:'array',maxItems:200,items:item},unseen_count:{type:'integer',minimum:0,maximum:200},mark_seen:seen}),
  description:'Portal-owned per-user/workspace last-seen observation baseline. GET has no writes. No complete event-history claim: absent rows are never inferred as resolved/deleted. Every read reapplies current authorization. NEW_OBSERVATION may be newly visible, not newly created. Mark seen explicitly with the supplied revision/version; stale source or another-tab baseline returns 409. First visit returns NO_BASELINE until acknowledged; no fabricated history. Real producer currently covers authorized bounded command-center triage/today/source facts, not NAV deltas or lifecycle event history.',
  allOf:[{if:{properties:{may_mark_seen:{const:true}}},then:{properties:{mark_seen_reason:{type:'null'}}},else:{properties:{mark_seen_reason:{const:'READ_ONLY_PROFILE'}}}},
    {if:{properties:{state:{const:'NO_BASELINE'}}},then:{properties:{baseline:{type:'null'},reason_code:{const:'NO_COMPARISON_BASELINE'},items:{maxItems:0},unseen_count:{const:0}}},
    else:{properties:{baseline,reason_code:{type:'null'}}}},
    {if:{properties:{state:{const:'READY'}}},then:{properties:{items:{minItems:1},unseen_count:{minimum:1}}}},
    {if:{properties:{state:{const:'EMPTY'}}},then:{properties:{items:{maxItems:0},unseen_count:{const:0}}}}]};
const problem = object({error:object({code:{type:'string'},message:{type:'string'}}),request_id:{type:'string'}});
const responses = {'200':{description:'Current authorized observations compared to this actor’s baseline.',headers:{'Cache-Control':{schema:{const:'private, no-store'}}},content:{'application/json':{schema:{$ref:'#/components/schemas/VisitDigest'}}}}};
for(const [code,description] of Object.entries({400:'Invalid fields; no user selector accepted.',401:'Session required.',403:'Current permission or Origin/CSRF refusal.',404:'Workspace unavailable or feature disabled.',409:'VISIT_DIGEST_SNAPSHOT_CHANGED / VISIT_DIGEST_BASELINE_CHANGED / authorization changed: refetch, do not blindly retry.',503:'Source/store unavailable: baseline not advanced.'}))
  responses[code]={description,content:{'application/json':{schema:{$ref:'#/components/schemas/VisitDigestProblem'}}}};
const workspace = {name:'workspace_id',in:'query',required:false,schema:{type:'string',minLength:1,maxLength:96}};
const api={openapi:'3.1.0',info:{title:'Execution visit digest',version:'1.0.0'},paths:{
  '/api/v1/execution/visit-digest':{get:{operationId:'executionVisitDigestGetV1',parameters:[workspace],responses}},
  '/api/v1/execution/visit-digest/seen':{post:{operationId:'executionVisitDigestSeenV1',parameters:[workspace,{name:'x-portal-csrf',in:'header',required:true,schema:{type:'string'}}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/VisitDigestSeen'}}}},responses}}},
  components:{schemas:{VisitDigest:response,VisitDigestSeen:seen,VisitDigestProblem:problem}}};
const outputs={'schemas/execution-visit-digest.v1.schema.json':{$schema:'https://json-schema.org/draft/2020-12/schema',...response},'openapi/execution-visit-digest.openapi.json':api};
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fact={id:'operation:TEST_ONLY:operation-1',kind:'OPERATION',label:'Capital request verified',value:'VERIFIED',
  href:'/execution/operations?operation_id=TEST_ONLY%3Aoperation-1&workspace_id=ws_TEST_ONLY',as_of:'2026-10-23T12:00:00.000Z'};
const old={...fact,value:'PENDING'};
const rev = f => hash(['ws_TEST_ONLY',[Object.fromEntries(Object.entries(f).filter(([k])=>k!=='as_of'))]]);
const base={version:1,seen_at:'2026-10-23T11:00:00.000Z',snapshot_revision:rev(old),fingerprints:{[old.id]:hash([old.kind,old.value])}};
const common={schema_version:'portal.execution.visit-digest.v1',workspace_id:'ws_TEST_ONLY',may_mark_seen:true,mark_seen_reason:null,snapshot_revision:rev(fact),observed_at:fact.as_of,coverage:'BOUNDED_OBSERVATIONS'};
outputs['fixtures/execution-visit-digest.synthetic.valid.json']={lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',
  input:{workspace_id:'ws_TEST_ONLY',fact,baseline:base},cases:{
    first_visit:{...common,state:'NO_BASELINE',reason_code:'NO_COMPARISON_BASELINE',baseline:null,items:[],unseen_count:0,mark_seen:{snapshot_revision:rev(fact),expected_baseline_version:0}},
    changed:{...common,state:'READY',reason_code:null,baseline:{version:base.version,seen_at:base.seen_at,snapshot_revision:base.snapshot_revision},items:[{...fact,change:'CHANGED',seen:false}],unseen_count:1,mark_seen:{snapshot_revision:rev(fact),expected_baseline_version:1}},
    seen:{...common,state:'EMPTY',reason_code:null,baseline:{version:2,seen_at:fact.as_of,snapshot_revision:rev(fact)},items:[],unseen_count:0,mark_seen:{snapshot_revision:rev(fact),expected_baseline_version:2}},
  }};
for(const [path,body] of Object.entries(outputs)){
  const data=JSON.stringify(body,null,2)+'\n';
  if(process.argv.includes('--check')){if(readFileSync(resolve(root,path),'utf8')!==data)throw new Error(`Stale ${path}`);}
  else writeFileSync(resolve(root,path),data);
}
