/** Source-owned Zod definitions, additive public schemas and generated clients. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {jsonSchema} from './generate-research-window-execution.mjs';
import {replaceComponent} from './generate-research-progress-truth.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),cache=new Map();
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
function load(name){
 if(cache.has(name))return cache.get(name).exports;
 const path=new URL(`../../../apps/control-api/src/research/${name}.ts`,import.meta.url),m=new Module(fileURLToPath(path));cache.set(name,m);
 m.require=id=>id==='./preflight.service'?{sha256ResearchJson:v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex')}:
   id.startsWith('./')?load(id.slice(2)):createRequire(path)(id);
 m._compile(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,fileURLToPath(path));return m.exports;
}
const native=load('native-read.contract'),report=load('native-report.contract');
const refs=n=>({$ref:`#/components/schemas/${n}`});
for(const [name,component,schema,prop] of [
 ['research-search','SearchDetail',native.NativeSearchSchema,'native_search'],
 ['research-freeze','FreezeDetail',native.NativeFreezeSchema,'native_freeze'],
 ['research-report','FrozenCoreV2',report.ResearchNativeReportSchema,'native_report']]){
 const path=new URL(`../openapi/${name}.openapi.json`,import.meta.url),old=readFileSync(path,'utf8'),doc=JSON.parse(old);
 const targetName=Object.keys(doc.components.schemas).find(k=>doc.components.schemas[k]?.properties?.schema_version?.const===
   ({'research-search':'research.search-detail.v1','research-freeze':'research.freeze-detail.v1','research-report':'research.report-frozen-core.v2'}[name]));
 if(!targetName)throw Error(`Native schema target missing: ${name}/${component}`);
 let next=old;const key={native_search:'NativeSearch',native_freeze:'NativeFreeze',native_report:'NativeReport'}[prop];
 const definition=jsonSchema(schema);
 if(prop==='native_report')definition.properties.windows={...definition.properties.windows,minItems:3,maxItems:3};
 if(doc.components.schemas[key])next=replaceComponent(next,key,definition);
 else next=next.replace('    "schemas": {\n',`    "schemas": {\n      "${key}": ${JSON.stringify(definition)},\n`);
 const target=structuredClone(doc.components.schemas[targetName]);target.properties[prop]=refs(key);
 if(prop==='native_report'&&!target.properties.report_source.enum.includes('NATIVE_RETAINED_ENGINE_AUDIT'))target.properties.report_source.enum.push('NATIVE_RETAINED_ENGINE_AUDIT');
 next=replaceComponent(next,targetName,target);
 if(name==='research-freeze'){
  const verification=structuredClone(doc.components.schemas.FreezeVerification);
  if(!verification)throw Error('Native Freeze verification target missing');
  verification.properties.native_freeze=refs(key);
  next=replaceComponent(next,'FreezeVerification',verification);
 }
 if(name==='research-search'){
  const parsed=JSON.parse(next),op=parsed.paths['/api/v1/quantbt/runs/{runId}/search'].get;
  for(const param of [{name:'native_cursor',in:'query',required:false,schema:{type:'string',minLength:1,maxLength:4096}},
    {name:'native_limit',in:'query',required:false,schema:{type:'integer',minimum:1,maximum:200}}])
    if(!op.parameters.some(p=>p.name===param.name))op.parameters.push(param);
  // Preserve shared file formatting, replacing just the parameter array.
  const start=next.indexOf('"parameters":',next.indexOf('"/api/v1/quantbt/runs/{runId}/search"'));
  const open=next.indexOf('[',start);let depth=0,end=open,quoted=false,escape=false;
  for(;end<next.length;end++){
   const c=next[end];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue;}if(c==='[')depth++;if(c===']'&&--depth===0)break;
  }
  if(depth!==0)throw Error('Native search parameter array is malformed');
  const indentation=next.slice(next.lastIndexOf('\n',start)+1,start).match(/^ */)[0];
  next=next.slice(0,open)+JSON.stringify(op.parameters,null,2).split('\n').join('\n'+indentation)+next.slice(end+1);
 }
 if(process.argv.includes('--check')){if(next!==old)throw Error(`Native read contract drift: ${name}`);}else if(next!==old)writeFileSync(path,next);
}
