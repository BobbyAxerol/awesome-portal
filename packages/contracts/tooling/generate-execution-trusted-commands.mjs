import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {capitalWorkflowSchemas} from './execution-capital-workflow-schema.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),cache=new Map();
function load(path){if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>name.startsWith('.')?load(resolve(dirname(path),name+'.ts')):require(name),module,module.exports);return module.exports;}
const c=load(resolve(root,'../../apps/control-api/src/execution-v2/command.contract.ts'));
const cc=load(resolve(root,'../../apps/control-api/src/execution-v2/command-collection.contract.ts'));
const wc=load(resolve(root,'../../apps/control-api/src/execution-v2/workflow.contract.ts'));
const wf=load(resolve(root,'../../apps/control-api/src/execution-v2/workflow.ts'));
function json(s){const d=s._def,t=d.typeName;
  if(t==='ZodEffects')return json(d.schema);
  if(t==='ZodOptional')return json(d.innerType);
  if(t==='ZodDefault')return {...json(d.innerType),default:d.defaultValue()};
  if(t==='ZodArray'){const v={type:'array',items:json(d.type)};
    if(d.minLength)v.minItems=d.minLength.value;if(d.maxLength)v.maxItems=d.maxLength.value;
    return v;}
  if(t==='ZodNullable')return {anyOf:[json(d.innerType),{type:'null'}]};
  if(t==='ZodLiteral')return {const:d.value};
  if(t==='ZodBoolean')return {type:'boolean'};
  if(t==='ZodEnum')return {type:'string',enum:d.values};
  if(t==='ZodRecord')return {type:'object',additionalProperties:json(d.valueType)};
  if(t==='ZodUnknown')return {};
  if(t==='ZodString'){const v={type:'string'};for(const x of d.checks){if(x.kind==='min')v.minLength=x.value;else if(x.kind==='max')v.maxLength=x.value;else if(x.kind==='regex')v.pattern=x.regex.source;else throw Error(x.kind);}return v;}
  if(t==='ZodNumber'){const v={type:d.checks.some(x=>x.kind==='int')?'integer':'number'};for(const x of d.checks){if(x.kind==='min')v.minimum=x.value;else if(x.kind==='max')v.maximum=x.value;else if(x.kind!=='int')throw Error(x.kind);}return v;}
  if(t==='ZodObject'){const shape=d.shape();return {type:'object',additionalProperties:d.unknownKeys!=='strict',properties:Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,json(v)])),required:Object.entries(shape).filter(([,v])=>!v.isOptional()).map(([k])=>k)};}
  throw Error('Unsupported command Zod '+t);
}
// Reuse P01's exact operation-specific PM schema. Do not weaken a transform
// to an untyped object in generated browser types.
const foundation=JSON.parse(readFileSync(resolve(root,'openapi/execution-v2-foundation.openapi.json'),'utf8'));
const schemas={...foundation.components.schemas,CommandIntent:json(c.commandIntent),CommandSubmit:json(c.commandSubmit),
  CommandPreview:json(c.commandPreview),CommandStatus:json(c.publicCommandStatus),
  CommandCollectionQuery:json(cc.commandCollectionQuery),CommandCollection:json(cc.commandCollection),
  ...capitalWorkflowSchemas(wc,json)};
schemas.CommandCollection.properties.items.items={$ref:'#/components/schemas/CommandStatus'};
// Same PM currency grammar as the unchanged intent, including its documented
// runtime UTF-8 byte bound. No ISO/uppercase/three-letter assumption is added.
schemas.CommandStatus.properties.currency=structuredClone(
  foundation.components.schemas.PmaCandidateCapitalCommand.oneOf[0].properties.currency);
schemas.CommandStatus.description='Served status only. Required currency is copied exactly from the original immutable intent after current exact-resource authority and stored actor/intent/authorization/hash validation. A legacy stored status may lack this field and is projected without rewriting any stored row or event. Missing/corrupt original provenance is a sanitized refusal, never inferred USD, source-receipt currency or zero. Existing pre-upgrade HTTP bodies without currency are not complete according to this served schema.';
schemas.CommandCollection.description='Finite exact-resource/environment trusted-capital statuses only. Not the mixed operation queue. Current TS-accepted audit authorization precedes collection. Runtime also verifies cross-row target and page-count invariants.';
schemas.CommandProblem={type:'object',additionalProperties:false,required:['error','request_id'],properties:{error:{type:'object',additionalProperties:false,
  required:['code','message'],properties:{code:{type:'string'},message:{type:'string'}}},request_id:{type:'string'},public_copy_key:{type:'string'},
  safe_next_action:{type:'string',enum:['QUERY_SAME_INTENT','REVIEW_BLOCKER']}}};
schemas.CommandIntent.properties.business_payload={$ref:'#/components/schemas/PmaCandidateCapitalCommand'};
schemas.CommandIntent.properties.business_payload.description='Unchanged PM wire. Eight candidate capital operations only; unsupported operator-control/profile/safety operations remain disabled. Portal fingerprint is NOT PM resolved-source canonical digest.';
schemas.CommandSubmit.properties.intent={$ref:'#/components/schemas/CommandIntent'};
const paths={};
for(const [route,method,operation,input,output] of [
  ['/preview','post','Preview','CommandIntent','CommandPreview'],['','post','Submit','CommandSubmit','CommandStatus'],
  ['/{id}','get','Status',null,'CommandStatus'],['/{id}/reconcile','post','Reconcile',null,'CommandStatus'],
  ['','get','Collection','CommandCollectionQuery','CommandCollection'],
  ['/{id}/workflow','get','WorkflowGet',null,'WorkflowCapital']]){
  const parameters=route.includes('{id}')?[{name:'id',in:'path',required:true,schema:json(c.commandId)}]:[];
  const collection=operation==='Collection';
  const workflow=operation==='WorkflowGet',finiteRead=collection||workflow;
  if(collection){const query=schemas.CommandCollectionQuery;
    parameters.push(...Object.entries(query.properties).map(([name,schema])=>({
      name,in:'query',required:query.required.includes(name),schema})));
  }else if(method==='get')parameters.push({name:'workspace_id',in:'query',required:true,schema:{type:'string',minLength:1,maxLength:256}});
  if(method==='post')parameters.push({name:'x-portal-idempotency-key',in:'header',required:true,schema:json(c.commandKey)});
  const path='/api/v1/execution/capital-commands'+route;
  const headers={'Cache-Control':{description:'Authenticated private read; never a shared cache entry.',
    schema:{type:'string',const:'private, no-store'}}};
  // GET collection and existing POST submit share one path. Never replace its
  // other method while appending this independently authorized read operation.
  paths[path]??={};
  paths[path][method]={operationId:'executionCapitalCommand'+operation+'V1',security:[{PortalSession:[]}],parameters,
    description:workflow
      ?'Read-only local projection of one durable original capital command. Strict id/workspace query, current exact TS-accepted audit.read before disclosure and after final I/O, including all DENY and delegation ancestry. The original sender may differ from this reviewer; original send expiry does not revoke current report permission. Immutable command/profile/qualification/intent/status correlation is checked. Four outcome dimensions remain separate; UNKNOWN never causes resend. source_as_of_ms is null because no owning-source cutoff is stored; observed_at_ms is the Portal local-read clock, not source freshness. Stable snapshot_ref contains only authorized public fields and excludes private authority and read time. No prepare/send/lookup/recover/reconcile or command/event/audit writes; existing authority-provider resolution remains possible. Retained exact Core workspace is preserved. Hidden/missing share404, visible corrupt data has sanitized503. All responses are private, no-store.'
      :collection
      ?'Local finite exact-resource/environment trusted-capital status collection, not the mixed operation queue. Exact current TS-accepted audit.read before DB and after I/O. Unknown/hidden resources have the same404. Strict query rejects unknown fields. No send, lookup, recover, reconcile, writes or ACK. Cursor binds actor/session/workspace/query/current authority and only authorized statuses;400 invalid/expired cursor,409 refresh after visible data/authority change,503 explicit overflow/response bound. All responses are private, no-store.'
      :'Source-dark by default. Session/current exact action + origin/CSRF/step-up for new sends. Retained preview rejects mutations. Browser cannot install actor/workload/context/profile/credentials. ACK is not APPLIED. GET is local-only; reconcile only queries same authoritative key, never resends. Public error text is fixed, never raw source text. All responses are private, no-store.',
    ...(method==='post'?{requestBody:{required:true,content:{'application/json':{schema:input?{$ref:'#/components/schemas/'+input}:json(c.commandWorkspace)}}}}:{}),
    responses:{200:{description:workflow?'Current-authorized original command workflow, no execution effect or source-freshness inference':collection?'Finite exact-authorized-target status page; no global total or mixed-queue completeness':'Typed preview or durable status; no runtime authority inferred',
      ...(finiteRead?{headers}:{}),content:{'application/json':{schema:{$ref:'#/components/schemas/'+output}}}},
      ...Object.fromEntries((finiteRead?[400,401,403,404,409,503]:[400,401,403,404,409,502,503]).map(status=>[status,{
        description:workflow
          ?({400:'COMMAND_INPUT_INVALID; malformed id/workspace or unknown query field.',
              401:'Session authentication required.',403:'Current actor/session authority refused.',
              404:'COMMAND_RESOURCE_NOT_FOUND; hidden and unknown are identical.',
              409:'ACCESS_RETRY_REQUIRED; current Core authority changed during read.',
              503:'COMMAND_STATUS_UNVERIFIED or sanitized COMMAND_UNAVAILABLE; no partial response or raw diagnostics.'}[status])
          :collection
          ?({400:'COMMAND_INPUT_INVALID or COMMAND_COLLECTION_CURSOR_INVALID; malformed/expired cursor.',
              401:'Session authentication required.',403:'Current actor/session authority refused.',
              404:'COMMAND_RESOURCE_NOT_FOUND; hidden and unknown are identical.',
              409:'COMMAND_COLLECTION_CURSOR_CHANGED or ACCESS_RETRY_REQUIRED; refresh exact resource.',
              503:'COMMAND_COLLECTION_OVERFLOW, COMMAND_COLLECTION_RESPONSE_BOUND, COMMAND_COLLECTION_NOT_CONFIGURED, COMMAND_STATUS_UNVERIFIED or sanitized COMMAND_UNAVAILABLE; no partial success.'}[status])
          :'Closed input / current authority / correlation / capacity failure. Never blindly retry; query same intent.',
        ...(finiteRead?{headers}:{}),content:{'application/json':{schema:{$ref:'#/components/schemas/CommandProblem'}}}}]))}};
}
const needed=new Set(['CommandIntent','CommandSubmit','CommandPreview','CommandStatus','CommandProblem','CommandCollectionQuery','CommandCollection','WorkflowContext','WorkflowCapital']);
function refs(v){if(!v||typeof v!=='object')return;for(const [key,value] of Object.entries(v)){
  if(key==='$ref'&&typeof value==='string'&&value.startsWith('#/components/schemas/')){const name=value.split('/').at(-1);if(!needed.has(name)){needed.add(name);refs(schemas[name]);}}
  else refs(value);}}
for(const name of [...needed])refs(schemas[name]);
const commandFixture=JSON.parse(readFileSync(resolve(root,'fixtures/execution-trusted-commands.synthetic.valid.json'),'utf8'));
const context={workspace_id:commandFixture.intent.workspace_id,environment:commandFixture.ack_only.environment,
  resource:commandFixture.ack_only.resource,policy_revision:'TEST_ONLY:policy',snapshot_ref:'TEST_ONLY:scoped-snapshot',
  source_as_of_ms:null,observed_at_ms:1792100000000};
const outputs={'openapi/execution-trusted-commands.openapi.json':{openapi:'3.1.0',info:{title:'Trusted PM capital command/status bridge',version:'1.0.0'},paths,components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'portal_session'}},schemas:Object.fromEntries(Object.entries(schemas).filter(([name])=>needed.has(name)))}},
  'fixtures/execution-command-currency.synthetic.valid.json':{lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',runtime_qualified:false,
    stored_status:commandFixture.ack_only,
    public_status:c.publicCommandStatus.parse({...commandFixture.ack_only,currency:commandFixture.intent.business_payload.currency})},
  'fixtures/execution-trusted-command-collection.synthetic.valid.json':{lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',
    query:{workspace_id:context.workspace_id,resource_kind:context.resource.kind,resource_id:context.resource.id,environment:context.environment},
    collection:cc.commandCollection.parse({schema_version:'portal.execution.command-collection.v1',family:'TRUSTED_CAPITAL_COMMANDS_ONLY',
      coverage:'EXACT_AUTHORIZED_RESOURCE_ONLY',resource:context.resource,environment:context.environment,
      items:[c.publicCommandStatus.parse({...commandFixture.ack_only,currency:commandFixture.intent.business_payload.currency})],
      page:{limit:25,returned_count:1,has_more:false,next_cursor:null}})},
  'fixtures/execution-capital-workflow.synthetic.valid.json':{lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',runtime_qualified:false,
    command_id:commandFixture.ack_only.command_id,query:{workspace_id:context.workspace_id},
    response:wf.capitalWorkflow(context,commandFixture.intent.business_payload.currency,commandFixture.ack_only)}};
for(const [name,value] of Object.entries(outputs)){const bytes=JSON.stringify(value,null,2)+'\n',path=resolve(root,name);
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw Error('Command contract drift '+name);}else writeFileSync(path,bytes);}
