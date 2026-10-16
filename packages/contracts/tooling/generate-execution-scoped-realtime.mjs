import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'), require=createRequire(import.meta.url),cache=new Map();
function load(path){
  if(cache.has(path))return cache.get(path).exports;
  const module={exports:{}};cache.set(path,module);
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>name.startsWith('.')?load(resolve(dirname(path),name+'.ts')):require(name),module,module.exports);
  return module.exports;
}
function json(s){
  const d=s._def,t=d.typeName;
  if(t==='ZodEffects')return json(d.schema);
  if(t==='ZodNullable')return{anyOf:[json(d.innerType),{type:'null'}]};
  if(t==='ZodLiteral')return{const:d.value};
  if(t==='ZodBoolean')return{type:'boolean'};
  if(t==='ZodEnum')return{type:'string',enum:d.values};
  if(t==='ZodArray')return{type:'array',items:json(d.type),...(d.maxLength?{maxItems:d.maxLength.value}:{})};
  if(t==='ZodString'){
    const v={type:'string'};
    for(const x of d.checks){if(x.kind==='min')v.minLength=x.value;else if(x.kind==='max')v.maxLength=x.value;else if(x.kind==='regex')v.pattern=x.regex.source;else throw Error(x.kind);}
    return v;
  }
  if(t==='ZodNumber'){
    const v={type:d.checks.some(x=>x.kind==='int')?'integer':'number'};
    for(const x of d.checks){if(x.kind==='min')v.minimum=x.value;else if(x.kind==='max')v.maximum=x.value;else if(x.kind!=='int')throw Error(x.kind);}
    return v;
  }
  if(t==='ZodObject'){const shape=d.shape();return{type:'object',additionalProperties:d.unknownKeys!=='strict',properties:Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,json(v)])),required:Object.keys(shape)};}
  throw Error('Unsupported realtime Zod '+t);
}
const c=load(resolve(root,'../../apps/control-api/src/execution-v2/realtime.contract.ts'));
const foundation=JSON.parse(readFileSync(resolve(root,'openapi/execution-v2-foundation.openapi.json'),'utf8'));
const ref=name=>({$ref:'#/components/schemas/'+name});
// Scope binding is deliberately server-private, not a browser DTO or route.
const schemas={Quality:foundation.components.schemas.Quality,EdgeScopedNotice:json(c.edgeScopedNotice),
  EdgeScopedNoticeBatch:json(c.edgeScopedNoticeBatch),ScopedRealtimeFrame:json(c.scopedRealtimeFrame)};
schemas.EdgeScopedNotice.properties.quality=ref('Quality');
schemas.EdgeScopedNoticeBatch.properties.notices.items=ref('EdgeScopedNotice');
schemas.EdgeScopedNoticeBatch.description='Server-private Edge transport batch. caught_up is a transport hint, not economic completeness or source-loss proof. Never expose this object to the browser.';
schemas.ScopedRealtimeFrame.properties.quality={anyOf:[ref('Quality'),{type:'null'}]};
schemas.ScopedRealtimeFrame.allOf=[
  {if:{properties:{event_type:{enum:['resync_required','access_revoked','unavailable']}},required:['event_type']},
    then:{properties:{terminal:{const:true},resume_cursor:{type:'null'},projection_generation:{type:'null'},quality:{type:'null'},reason_code:{type:'string'}}},
    else:{properties:{terminal:{const:false},resume_cursor:{type:'string'},projection_generation:{type:'string'},reason_code:{type:'null'}}}},
  ...Object.entries({revalidate:'READ_NAMED_SNAPSHOT',heartbeat:'RESUME_PORTAL_CURSOR',resync_required:'READ_NAMED_SNAPSHOT',access_revoked:'SIGN_IN_OR_REQUEST_ACCESS',unavailable:'WAIT'}).map(([event,action])=>({
    if:{properties:{event_type:{const:event}},required:['event_type']},then:{properties:{next_action:{const:action},reconnect_required:{const:event==='resync_required'},
      ...(event==='revalidate'?{quality:ref('Quality')}:event==='heartbeat'?{quality:{type:'null'}}:{})}}})),
];
const api={openapi:'3.1.0',info:{title:'Execution scoped notifications — schema-only handoff, no mounted SSE API',version:'1.0.0'},paths:{},components:{schemas}};
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://schemas.primusspark.com/portal/execution-scoped-realtime.v1.schema.json',
  $defs:JSON.parse(JSON.stringify(schemas).replaceAll('#/components/schemas/','#/$defs/'))};
const quality={completeness:'PARTIAL',freshness:'UNKNOWN',coverage:'AUTHORIZED_ONLY',source_as_of_ms:null,
  portal_observed_at_ms:1800000000000,source_set_ref:'TEST_ONLY:source-set',confidence:'PROVISIONAL',reasons:['TEST_ONLY_NOT_SOURCE_QUALIFICATION']};
const base={schema_version:'portal.execution.scoped-realtime.v1',semantics:'NOTIFICATION_ONLY',terminal:false,reconnect_required:false,
  resume_cursor:'TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME',projection_generation:'TEST_ONLY:g1',quality:null,reason_code:null};
const notice={resume_cursor:'TEST_ONLY-private-cursor-opaque',projection_generation:'TEST_ONLY:g1',quality};
const cases=[
  {id:'N09-REVALIDATE',schema:'ScopedRealtimeFrame',response:{...base,event_type:'revalidate',quality,next_action:'READ_NAMED_SNAPSHOT'}},
  {id:'N09-HEARTBEAT',schema:'ScopedRealtimeFrame',response:{...base,event_type:'heartbeat',next_action:'RESUME_PORTAL_CURSOR'}},
  ...[['resync_required','GENERATION_CHANGED','READ_NAMED_SNAPSHOT'],['access_revoked','ACCESS_CHANGED','SIGN_IN_OR_REQUEST_ACCESS'],['unavailable','SOURCE_UNAVAILABLE','WAIT']].map(([event,reason,action])=>({
    id:'N09-'+event.toUpperCase(),schema:'ScopedRealtimeFrame',response:{...base,event_type:event,terminal:true,reconnect_required:event==='resync_required',
      resume_cursor:null,projection_generation:null,quality:null,reason_code:reason,next_action:action}})),
  {id:'N09-SOURCE-NOTICE',schema:'EdgeScopedNotice',response:notice},
  {id:'N09-SOURCE-COALESCED',schema:'EdgeScopedNoticeBatch',response:{notices:[notice],next_cursor:notice.resume_cursor,caught_up:true}},
  {id:'N09-SOURCE-HIDDEN-ONLY',schema:'EdgeScopedNoticeBatch',response:{notices:[],next_cursor:'TEST_ONLY-hidden-scan-end',caught_up:true}},
];
const outputs={'openapi/execution-scoped-realtime.openapi.json':api,'schemas/execution-scoped-realtime.v1.schema.json':schema,
  'fixtures/execution-scoped-realtime.synthetic.valid.json':{lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',production_config:false,cases}};
for(const[name,value]of Object.entries(outputs)){
  const bytes=JSON.stringify(value,null,2)+'\n',path=resolve(root,name);
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw Error('Scoped realtime contract drift '+name);}
  else writeFileSync(path,bytes);
}
