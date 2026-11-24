// Ordinary app authority only. No install route or upstream permission implied.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),cache=new Map();
function load(path){
  if(cache.has(path))return cache.get(path).exports;
  const module={exports:{}};cache.set(path,module);
  const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',js)(name=>name.startsWith('.')?load(resolve(dirname(path),name+'.ts')):require(name),module,module.exports);
  return module.exports;
}
const c=load(resolve(root,'../../apps/control-api/src/execution-v2/ordinary-profile-authority.contract.ts'));
function json(schema){
  const d=schema._def,k=d.typeName;
  if(['ZodEffects','ZodOptional','ZodDefault'].includes(k))return json(d.schema??d.innerType);
  if(k==='ZodNullable')return {anyOf:[json(d.innerType),{type:'null'}]};
  if(k==='ZodLiteral')return {const:d.value};
  if(k==='ZodEnum')return {type:'string',enum:d.values};
  if(k==='ZodString'){
    const value={type:'string'};
    for(const check of d.checks){
      if(check.kind==='min')value.minLength=check.value;
      else if(check.kind==='max')value.maxLength=check.value;
      else if(check.kind==='regex')value.pattern=check.regex.source;
      else throw Error('Unsupported ordinary string constraint: '+check.kind);
    }return value;
  }
  if(k==='ZodNumber'){
    const value={type:d.checks.some(v=>v.kind==='int')?'integer':'number'};
    for(const check of d.checks){
      if(check.kind==='min')value.minimum=check.value;
      else if(check.kind==='max')value.maximum=check.value;
      else if(check.kind!=='int')throw Error('Unsupported ordinary number constraint');
    }return value;
  }
  if(k==='ZodObject'){
    const shape=d.shape();return {type:'object',additionalProperties:d.unknownKeys!=='strict',
      properties:Object.fromEntries(Object.entries(shape).map(([name,value])=>[name,json(value)])),
      required:Object.entries(shape).filter(([,value])=>!value.isOptional()).map(([name])=>name)};
  }
  throw Error('Unsupported ordinary Zod node: '+k);
}
const schemas={OrdinaryDelegateRequest:json(c.ordinaryDelegateRequest),OrdinaryRevokeRequest:json(c.ordinaryRevokeRequest),
  OrdinaryAuthorityReceipt:json(c.ordinaryAuthorityReceipt),OrdinaryStepUpRequest:json(c.ordinaryAuthorityStepUpRequest),
  OrdinaryStepUpResponse:json(c.ordinaryAuthorityStepUpResponse),
  OrdinaryAuthorityProblem:{type:'object',additionalProperties:false,required:['error','request_id'],properties:{
    error:{type:'object',additionalProperties:false,required:['code','message'],properties:{
      code:{type:'string',description:'Stable Portal AuthError/authority refusal code; no secret context.'},message:{type:'string'}},},
    request_id:{type:'string'},}}};
schemas.OrdinaryDelegateRequest['x-server-invariants']=['ONE_CURRENT_PARENT','EXACT_PROFILE_SEALS','OWNER_CEILING',
  'INTERVAL_SUBSET','CURRENT_STEP_UP','HEAD_REVISION_AND_DIGEST_CAS','NO_ONWARD_DELEGATION'];
const headers={'Cache-Control':{required:true,schema:{const:'private, no-store'}}};
const paths=Object.fromEntries([
  ['delegations','ordinaryProfileDelegateV1','OrdinaryDelegateRequest','OrdinaryAuthorityReceipt'],
  ['revocations','ordinaryProfileRevokeV1','OrdinaryRevokeRequest','OrdinaryAuthorityReceipt'],
  ['step-up','ordinaryProfileStepUpV1','OrdinaryStepUpRequest','OrdinaryStepUpResponse'],
].map(([path,operationId,body,response])=>['/api/admin/ordinary-profile-access/v1/'+path,{post:{operationId,
  description:'Only mounted by explicit private composition. Authenticated current session, same-origin CSRF and fresh own-password ACCESS_ADMIN step-up. READ app authority only; not source qualification, HISTORY, STREAM, command or Live. Delegation/revocation operation_id must equal the idempotency header. No root artifact installation over HTTP.',
  security:[{PortalSession:[]}],parameters:[{name:'X-Portal-Idempotency-Key',in:'header',required:true,
    schema:{type:'string',minLength:8,maxLength:128,pattern:'^[A-Za-z0-9._:-]{8,128}$'}},
    {name:'Origin',in:'header',required:true,schema:{type:'string'},description:'Exact configured Portal origin.'},
    {name:'X-Portal-CSRF',in:'header',required:true,schema:{type:'string'},description:'Must match the csrf cookie and authenticated session hash.'}],
  requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/'+body}}}},
  responses:{200:{description:'App authority receipt or session-only step-up; no upstream acceptance inferred.',headers,
    content:{'application/json':{schema:{$ref:'#/components/schemas/'+response}}}},
    ...Object.fromEntries(Object.entries({400:'Invalid closed request or key',401:'Session required',403:'CSRF, password, current authority or delegation refused',
      404:'Private composition not installed',409:'CAS/key conflict or current authority changed',503:'Source-independent authority/drain/capacity unavailable; reconcile same operation'}).map(([status,description])=>[status,{description,headers,
        content:{'application/json':{schema:{$ref:'#/components/schemas/OrdinaryAuthorityProblem'}}}}]))},
}}]));
const api={openapi:'3.1.0',info:{title:'Execution ordinary profile authority',version:'1.0.0'},paths,
  components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'__Host-portal_session'}},schemas}};
const head={revision:'synthetic-ordinary-head-1',digest:'sha256:'+'a'.repeat(64)};
const delegate={operation_id:'synthetic-delegate-0001',workspace_id:'synthetic-workspace',subject_user_id:'synthetic-employee',
  parent_grant_id:'synthetic-stan-grant',expected_parent_revision:'synthetic-parent-1',expected_head:head,
  valid_from_ms:1800000000000,valid_until_ms:1800000060000,reason:'SYNTHETIC contract vector'};
const revoke={operation_id:'synthetic-revoke-0001',workspace_id:delegate.workspace_id,grant_id:'synthetic-child-grant',
  expected_grant_revision:'synthetic-child-1',expected_head:head,reason:'SYNTHETIC contract vector'};
const receipt={schema_version:'portal.ordinary-profile-operation.v1',operation_id:delegate.operation_id,operation:'DELEGATE',
  workspace_id:delegate.workspace_id,head_revision:'synthetic-ordinary-head-2',head_digest:'sha256:'+'b'.repeat(64),
  grant_id:'synthetic-child-grant',outcome:'APP_APPLIED',decided_at_ms:1800000000000,
  source_qualified:false,stream_commissioned:false,command_commissioned:false};
const fixtures={schema_version:'execution-ordinary-profile-authority.synthetic.v1',runtime_qualified:false,
  cases:{delegate,revoke,receipt,step_up_request:{workspace_id:delegate.workspace_id,password:'SYNTHETIC_NOT_A_CREDENTIAL'},
    step_up_response:{schema_version:'portal.access-step-up.v1',state:'ACTIVE',family:'ACCESS_ADMIN',expires_at_ms:1800000060000}}};
for(const [schema,value] of [[c.ordinaryDelegateRequest,delegate],[c.ordinaryRevokeRequest,revoke],[c.ordinaryAuthorityReceipt,receipt],
  [c.ordinaryAuthorityStepUpRequest,fixtures.cases.step_up_request],[c.ordinaryAuthorityStepUpResponse,fixtures.cases.step_up_response]])schema.parse(value);
const save=(path,value)=>{
  const bytes=JSON.stringify(value,null,2)+'\n',target=resolve(root,path);
  if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==bytes)throw Error('Ordinary contract drift: '+path);}
  else writeFileSync(target,bytes);
};
save('openapi/execution-ordinary-profile-authority.openapi.json',api);
save('schemas/execution-ordinary-profile-authority.v1.schema.json',{$schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://schemas.primusspark.com/portal/execution-ordinary-profile-authority.v1.schema.json',...schemas.OrdinaryAuthorityReceipt});
save('fixtures/execution-ordinary-profile-authority.synthetic.valid.json',fixtures);
