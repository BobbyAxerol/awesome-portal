/** Generate from the same closed Zod source; semantic refinements run in tests. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=new URL('../../../apps/control-api/src/research/window-execution.contract.ts',import.meta.url);
const loaded=new Module(fileURLToPath(source));
const controlRequire=createRequire(source);
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
loaded.require=id=>id==='./preflight.service'?{sha256ResearchJson:v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex')}:controlRequire(id);
loaded._compile(ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,fileURLToPath(source));
const schema=loaded.exports;
export function jsonSchema(s){
  const d=s._def;
  switch(d.typeName){
    case 'ZodEffects':return jsonSchema(d.schema);
    case 'ZodOptional':return jsonSchema(d.innerType);
    case 'ZodDefault':return {...jsonSchema(d.innerType),default:d.defaultValue()};
    case 'ZodNullable':return {anyOf:[jsonSchema(d.innerType),{type:'null'}]};
    case 'ZodNull':return {type:'null'};
    case 'ZodLiteral':return {const:d.value};
    case 'ZodEnum':return {type:'string',enum:d.values};
    case 'ZodBoolean':return {type:'boolean'};
    case 'ZodString':{
      const result={type:'string'};for(const c of d.checks){if(c.kind==='min')result.minLength=c.value;if(c.kind==='max')result.maxLength=c.value;if(c.kind==='regex')result.pattern=c.regex.source;}return result;
    }
    case 'ZodNumber':{
      const result={type:d.checks.some(c=>c.kind==='int')?'integer':'number'};for(const c of d.checks){if(c.kind==='min')result.minimum=c.value;if(c.kind==='max')result.maximum=c.value;}return result;
    }
    case 'ZodArray':return {type:'array',items:jsonSchema(d.type),...(d.minLength?{minItems:d.minLength.value}:{}),...(d.maxLength?{maxItems:d.maxLength.value}:{})};
    case 'ZodObject':{const shape=d.shape();return {type:'object',additionalProperties:false,properties:Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,jsonSchema(v)])),required:Object.entries(shape).filter(([,v])=>!v.isOptional()).map(([k])=>k)};}
    case 'ZodRecord':return {type:'object',propertyNames:jsonSchema(d.keyType),additionalProperties:jsonSchema(d.valueType)};
    case 'ZodUnion':case 'ZodDiscriminatedUnion':return {anyOf:d.options.map(jsonSchema)};
    default:throw new Error(`Unsupported Zod source ${d.typeName}`);
  }
}
const ref=n=>({$ref:`#/components/schemas/${n}`}),nullable=v=>({anyOf:[v,{type:'null'}]});
export function windowExecutionOpenApi(){
  const schemas={WindowAnalytics:jsonSchema(schema.WindowAnalyticsSchema),NativeExecutionRecord:jsonSchema(schema.NativeExecutionRecordSchema),
    WindowDescriptor:jsonSchema(schema.WindowDescriptorSchema),WindowExecutionRow:jsonSchema(schema.WindowExecutionReadRowSchema),
    WindowObservation:jsonSchema(schema.WindowObservationSchema),ActiveProtectionLevel:jsonSchema(schema.ActiveProtectionLevelSchema),
    WindowExecutionPage:jsonSchema(schema.WindowExecutionPageSchema)};
  // Reuse definitions rather than allowing independently drifting UI types.
  schemas.WindowExecutionPage.properties.rows.items=ref('WindowExecutionRow');
  schemas.WindowExecutionRow.anyOf[0].properties.payload=ref('WindowObservation');
  schemas.WindowObservation.properties.active_level_availability.properties.active_stop=ref('ActiveProtectionLevel');
  schemas.WindowObservation.properties.active_level_availability.properties.active_take_profit=ref('ActiveProtectionLevel');
  schemas.WindowExecutionRow.anyOf[1].properties.payload=ref('WindowAnalytics');
  schemas.WindowExecutionRow.anyOf[2].properties.payload=ref('NativeExecutionRecord');
  schemas.WindowCompare={type:'object',additionalProperties:false,required:['schema_version','window','fold_id','basis','alignment','runs','revision','correlation'],properties:{
    schema_version:{const:'research.window-compare.v1'},window:jsonSchema(schema.WindowKindSchema),fold_id:nullable({type:'string'}),
    basis:{const:'ALL_TIME_FULL_RETAINED_WINDOW'},alignment:{const:'INDEPENDENT_ACCOUNT_WINDOWS_NOT_FORWARD_FILLED'},revision:{type:'string',pattern:'^[a-f0-9]{64}$'},
    runs:{type:'array',minItems:2,maxItems:2,items:{type:'object',additionalProperties:false,required:['run_id','availability','revision','descriptor','analysis'],properties:{run_id:{type:'string'},
      availability:schemas.WindowExecutionPage.properties.availability,revision:nullable({type:'string'}),descriptor:nullable(ref('WindowDescriptor')),analysis:nullable(ref('WindowAnalytics'))}}},
    correlation:{type:'object',additionalProperties:false,required:['state','reason_code','value','matched_observation_count','basis'],properties:{state:{enum:['AVAILABLE','NOT_PUBLISHED','NOT_APPLICABLE']},reason_code:nullable({type:'string'}),value:nullable({type:'string',pattern:'^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$'}),matched_observation_count:nullable({type:'integer',minimum:0,maximum:200000}),basis:{const:'EXACT_SHARED_UTC_MS_RETURN_FRACTIONS_NO_FORWARD_FILL'}}}}};
  const shape=schema.WindowExecutionQuerySchema._def.shape();
  const query=Object.entries(shape).map(([name,value])=>({name,in:'query',schema:jsonSchema(value)}));
  const paths={};
  const responses=name=>({'200':{description:'Exact complete source window or typed absence; private no-store; at most 200 rows/1 MiB.',content:{'application/json':{schema:ref(name)}}},
    ...Object.fromEntries([400,401,403,404,409,503].map(code=>[code,{description:'Typed authority, query, cursor or availability refusal.'}]))});
  for(const [suffix,operationId,summary]of [['windows/analytics','researchWindowAnalyticsGetV1','Read full-population descriptive analytics for one completed window'],
    ['windows/observations','researchWindowObservationsGetV1','Read bounded complete source observations for one completed window'],
    ['execution/records','researchNativeExecutionRecordsGetV1','Read actual native order/fill/lifecycle records, not broker history']]){
    const filters=query.filter(q=>suffix==='windows/analytics'?['workspace_id','window','fold_id'].includes(q.name):suffix==='windows/observations'?q.name!=='record_kind':true);
    paths[`/api/v1/quantbt/runs/{runId}/${suffix}`]={get:{operationId,summary,parameters:[{name:'runId',in:'path',required:true,schema:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'}},...filters],responses:responses('WindowExecutionPage')}};
  }
  paths['/api/v1/quantbt/windows/compare']={get:{operationId:'researchWindowCompareGetV1',summary:'Compare the same explicit window of two completed runs',parameters:[{name:'runs',in:'query',required:true,schema:{type:'string',pattern:'^rrun_[a-f0-9]{32},rrun_[a-f0-9]{32}$'}},...query.filter(q=>['workspace_id','window','fold_id'].includes(q.name))],responses:responses('WindowCompare')}};
  schemas.WindowObservation.description='Public read projection only. active_stop and active_take_profit are null when flat or without a positive source level. active_level_availability records each typed reason and the original exact source_value. revision remains the immutable retained-source identity, not a hash of this normalized DTO. No normalization of journal/order-intent prices.';
  return {openapi:'3.1.0',info:{title:'Research completed windows and native execution API',version:'1.0.1',description:'All-time descriptive analytics; WFO training folds remain separate and have no independent Holdout. Native source relation ordinals are not a global causal ordering. Null fields have explicit source absence; no inferred SL/TP/OCO or broker events.'},servers:[{url:'/'}],security:[{portalSession:[]}],paths,components:{securitySchemes:{portalSession:{type:'apiKey',in:'cookie',name:'portal_session'}},schemas}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const path=new URL('../openapi/research-window-execution.openapi.json',import.meta.url),bytes=JSON.stringify(windowExecutionOpenApi(),null,2)+'\n';
  if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==bytes)throw new Error('Window execution generated contract drift');}else writeFileSync(path,bytes);
}
