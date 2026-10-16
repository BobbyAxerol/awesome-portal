import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),cache=new Map();
function load(path){if(cache.has(path))return cache.get(path).exports;const module={exports:{}};cache.set(path,module);
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>name.startsWith('.')?load(resolve(dirname(path),name+'.ts')):require(name),module,module.exports);return module.exports;}
const c=load(resolve(root,'../../apps/control-api/src/execution-v2/command.contract.ts'));
function json(s){const d=s._def,t=d.typeName;
  if(t==='ZodEffects')return json(d.schema);
  if(t==='ZodNullable')return {anyOf:[json(d.innerType),{type:'null'}]};
  if(t==='ZodLiteral')return {const:d.value};
  if(t==='ZodBoolean')return {type:'boolean'};
  if(t==='ZodEnum')return {type:'string',enum:d.values};
  if(t==='ZodRecord')return {type:'object',additionalProperties:json(d.valueType)};
  if(t==='ZodUnknown')return {};
  if(t==='ZodString'){const v={type:'string'};for(const x of d.checks){if(x.kind==='min')v.minLength=x.value;else if(x.kind==='max')v.maxLength=x.value;else if(x.kind==='regex')v.pattern=x.regex.source;else throw Error(x.kind);}return v;}
  if(t==='ZodNumber'){const v={type:d.checks.some(x=>x.kind==='int')?'integer':'number'};for(const x of d.checks){if(x.kind==='min')v.minimum=x.value;else if(x.kind==='max')v.maximum=x.value;else if(x.kind!=='int')throw Error(x.kind);}return v;}
  if(t==='ZodObject'){const shape=d.shape();return {type:'object',additionalProperties:d.unknownKeys!=='strict',properties:Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,json(v)])),required:Object.keys(shape)};}
  throw Error('Unsupported command Zod '+t);
}
// Reuse P01's exact operation-specific PM schema. Do not weaken a transform
// to an untyped object in generated browser types.
const foundation=JSON.parse(readFileSync(resolve(root,'openapi/execution-v2-foundation.openapi.json'),'utf8'));
const schemas={...foundation.components.schemas,CommandIntent:json(c.commandIntent),CommandSubmit:json(c.commandSubmit),
  CommandPreview:json(c.commandPreview),CommandStatus:json(c.commandStatus)};
schemas.CommandProblem={type:'object',additionalProperties:false,required:['error','request_id'],properties:{error:{type:'object',additionalProperties:false,
  required:['code','message'],properties:{code:{type:'string'},message:{type:'string'}}},request_id:{type:'string'},public_copy_key:{type:'string'},
  safe_next_action:{type:'string',enum:['QUERY_SAME_INTENT','REVIEW_BLOCKER']}}};
schemas.CommandIntent.properties.business_payload={$ref:'#/components/schemas/PmaCandidateCapitalCommand'};
schemas.CommandIntent.properties.business_payload.description='Unchanged PM wire. Eight candidate capital operations only; unsupported operator-control/profile/safety operations remain disabled. Portal fingerprint is NOT PM resolved-source canonical digest.';
schemas.CommandSubmit.properties.intent={$ref:'#/components/schemas/CommandIntent'};
const paths={};
for(const [route,method,operation,input,output] of [
  ['/preview','post','Preview','CommandIntent','CommandPreview'],['','post','Submit','CommandSubmit','CommandStatus'],
  ['/{id}','get','Status',null,'CommandStatus'],['/{id}/reconcile','post','Reconcile',null,'CommandStatus']]){
  const parameters=route.includes('{id}')?[{name:'id',in:'path',required:true,schema:json(c.commandId)}]:[];
  if(method==='get')parameters.push({name:'workspace_id',in:'query',required:true,schema:{type:'string',minLength:1,maxLength:256}});
  if(method==='post')parameters.push({name:'x-portal-idempotency-key',in:'header',required:true,schema:json(c.commandKey)});
  paths['/api/v1/execution/capital-commands'+route]={[method]:{operationId:'executionCapitalCommand'+operation+'V1',security:[{PortalSession:[]}],parameters,
    description:'Source-dark by default. Session/current exact action + origin/CSRF/step-up for new sends. Retained preview rejects mutations. Browser cannot install actor/workload/context/profile/credentials. ACK is not APPLIED. GET is local-only; reconcile only queries same authoritative key, never resends. Public error text is fixed, never raw source text.',
    ...(method==='post'?{requestBody:{required:true,content:{'application/json':{schema:input?{$ref:'#/components/schemas/'+input}:json(c.commandWorkspace)}}}}:{}),
    responses:{200:{description:'Typed preview or durable status; no runtime authority inferred',content:{'application/json':{schema:{$ref:'#/components/schemas/'+output}}}},
      ...Object.fromEntries([400,401,403,404,409,502,503].map(status=>[status,{description:'Closed input / current authority / correlation / capacity failure. Never blindly retry; query same intent.',content:{'application/json':{schema:{$ref:'#/components/schemas/CommandProblem'}}}}]))}}};
}
const needed=new Set(['CommandIntent','CommandSubmit','CommandPreview','CommandStatus','CommandProblem']);
function refs(v){if(!v||typeof v!=='object')return;for(const [key,value] of Object.entries(v)){
  if(key==='$ref'&&typeof value==='string'&&value.startsWith('#/components/schemas/')){const name=value.split('/').at(-1);if(!needed.has(name)){needed.add(name);refs(schemas[name]);}}
  else refs(value);}}
for(const name of [...needed])refs(schemas[name]);
const outputs={'openapi/execution-trusted-commands.openapi.json':{openapi:'3.1.0',info:{title:'Trusted PM capital command/status bridge',version:'1.0.0'},paths,components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'portal_session'}},schemas:Object.fromEntries(Object.entries(schemas).filter(([name])=>needed.has(name)))}}};
for(const [name,value] of Object.entries(outputs)){const bytes=JSON.stringify(value,null,2)+'\n',path=resolve(root,name);
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw Error('Command contract drift '+name);}else writeFileSync(path,bytes);}
