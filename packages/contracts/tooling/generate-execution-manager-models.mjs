// Generate the public contract from the actual backend Zod vocabulary. Custom
// semantic refinements remain server checks and have explicit parity fixtures.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(root, '../../apps/control-api/src/execution-v2');
const require = createRequire(import.meta.url), cache = new Map();
const { z } = require('zod');
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} }; cache.set(path, module);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name === 'zod' ? { z } : name.startsWith('.') ? load(resolve(dirname(path), name + '.ts')) : require(name);
  new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
  return module.exports;
}
const contract = load(resolve(sourceRoot, 'manager-model.contract.ts'));
const revisions = load(resolve(sourceRoot, 'manager-score-revision.contract.ts'));
function json(schema) {
  const d = schema._def, type = d.typeName;
  if (['ZodEffects','ZodDefault','ZodOptional'].includes(type)) return json(d.schema ?? d.innerType);
  if (type === 'ZodNullable') return { anyOf: [json(d.innerType), { type: 'null' }] };
  if (type === 'ZodUnion') return { anyOf: d.options.map(json) };
  if (type === 'ZodNull') return { type: 'null' };
  if (type === 'ZodBoolean') return { type: 'boolean' };
  if (type === 'ZodLiteral') return { const: d.value };
  if (type === 'ZodEnum') return { type: 'string', enum: d.values };
  if (type === 'ZodString') {
    const value = { type: 'string' };
    for (const c of d.checks) {
      if (c.kind === 'min') value.minLength = c.value;
      else if (c.kind === 'max') value.maxLength = c.value;
      else if (c.kind === 'regex') value.pattern = c.regex.source;
      else throw new Error('Unsupported string constraint: ' + c.kind);
    } return value;
  }
  if (type === 'ZodNumber') {
    const value = { type: d.checks.some(c => c.kind === 'int') ? 'integer' : 'number' };
    for (const c of d.checks) {
      if (c.kind === 'min') value[c.inclusive ? 'minimum' : 'exclusiveMinimum'] = c.value;
      else if (c.kind === 'max') value[c.inclusive ? 'maximum' : 'exclusiveMaximum'] = c.value;
      else if (c.kind !== 'int') throw new Error('Unsupported number constraint');
    } return value;
  }
  if (type === 'ZodArray') return { type: 'array', items: json(d.type), ...(d.minLength ? { minItems: d.minLength.value } : {}), ...(d.maxLength ? { maxItems: d.maxLength.value } : {}), ...(d.exactLength ? {minItems:d.exactLength.value,maxItems:d.exactLength.value} : {}) };
  if (type === 'ZodRecord') return { type: 'object', propertyNames: json(d.keyType), additionalProperties: json(d.valueType) };
  if (type === 'ZodObject') {
    const shape = d.shape();
    return { type: 'object', additionalProperties: d.unknownKeys !== 'strict', properties: Object.fromEntries(Object.entries(shape).map(([k,v]) => [k,json(v)])),
      required: Object.entries(shape).filter(([,v]) => !v.isOptional()).map(([k]) => k) };
  }
  throw new Error('Unsupported Zod node: ' + type);
}
const response = json(contract.managerDatasetResponse), query = json(contract.managerModelQuery);
const schemas = { ManagerDataset: response, ManagerDatasetQuery: query, ManagerMetric: json(contract.managerMetric), ManagerDatasetRow: json(contract.managerDatasetRow), ManagerScorePublication: json(contract.managerScorePublication), ManagerCompositionPublication: json(contract.managerCompositionPublication), ManagerRegimePublication: json(contract.managerRegimePublication) };
Object.assign(schemas,{ManagerScoreRevisionQuery:json(revisions.managerScoreRevisionQuery),ManagerScoreRevisionHistoryQuery:json(revisions.managerScoreRevisionHistoryQuery),
  ManagerScoreRevisionView:json(revisions.managerScoreRevisionView),ManagerScoreRevisionHistory:json(revisions.managerScoreRevisionHistory)});
const routes = [['fund-overview','FundOverview'],['fleet','Fleet'],['portfolios/{id}/overview','Portfolio360'],['alphas/{id}/overview','Alpha360'],['accounts/{id}/overview','Account360'],['deployments/{id}/overview','Deployment360']];
const paths = Object.fromEntries(routes.map(([route,operation]) => ['/api/v1/execution/manager/' + route, { get: {
  operationId: 'executionManager' + operation + 'GetV1', security: [{ PortalSession: [] }],
  description: 'Scoped qualified projection only. Current grants precede financial filtering/grouping/counts. Exact decimals, UTC milliseconds. No browser source/SQL/credential inputs. TEST_ONLY is never product authority. ALL cross-profile navigation remains the separate existing stage-union API; this API pins one economic profile.',
  parameters: [...(route.includes('{id}') ? [{ name:'id', in:'path', required:true, schema:{type:'string',minLength:1,maxLength:256} }] : []),
    ...Object.entries(query.properties).map(([name,schema]) => ({ name, in:'query', required:query.required.includes(name),
      ...(['filters','sort','economic_partition'].includes(name) ? { content: { 'application/json': { schema } } } :
        { schema, ...(schema.type === 'array' ? { style:'form',explode:false } : {}) }) }))],
  responses: { 200:{description:'Authorized current snapshot; absence and policy-pending remain typed',content:{'application/json':{schema:{$ref:'#/components/schemas/ManagerDataset'}}}},
    ...Object.fromEntries([400,401,404,409,503].map(code => [code,{description:({400:'Invalid closed query',401:'Session required',404:'Resource or current grant unavailable',409:'Authority, snapshot or cursor changed',503:'Source publication, field policy, projection or bounded capacity unavailable'})[code]}])) },
} }]));
for(const [route,operation,request,result] of [
  ['score-view','executionManagerScoreRevisionGetV1','ManagerScoreRevisionQuery','ManagerScoreRevisionView'],
  ['score-revisions','executionManagerScoreRevisionHistoryGetV1','ManagerScoreRevisionHistoryQuery','ManagerScoreRevisionHistory']]){
  const q=schemas[request];paths['/api/v1/execution/manager/'+route]={get:{operationId:operation,security:[{PortalSession:[]}],
    description:'Explicit authorized historical ORIGINAL/RESTATED only; never current operational Score. Exact retained source requires its own current dataset authority. History enumeration may be typed unavailable, not empty complete history. No GET calculation, source send or ACK.',
    parameters:Object.entries(q.properties).map(([name,schema])=>({name,in:'query',required:q.required.includes(name),
      ...(name==='economic_partition'?{content:{'application/json':{schema}}}:{schema,...(schema.type==='array'?{style:'form',explode:false}:{})})})),
    responses:{200:{description:'Explicit historical view or typed absence; null knowledge clocks are never inferred',content:{'application/json':{schema:{$ref:'#/components/schemas/'+result}}}},
      ...Object.fromEntries([400,401,404,409,503].map(code=>[code,{description:({400:'Invalid closed query',401:'Session required',404:'Reference or current grant unavailable',409:'Authority/source/policy changed',503:'Qualified source or bounded capability unavailable'})[code]}]))}}};
}
const outputs = {
  'schemas/execution-manager-dataset.v1.schema.json': { $schema:'https://json-schema.org/draft/2020-12/schema',
    $id:'https://schemas.primusspark.com/portal/execution-manager-dataset.v1.schema.json', ...response },
  'schemas/execution-manager-score-revision.v1.schema.json':{$schema:'https://json-schema.org/draft/2020-12/schema',
    $id:'https://schemas.primusspark.com/portal/execution-manager-score-revision.v1.schema.json',...schemas.ManagerScoreRevisionView},
  'schemas/execution-manager-score-history.v1.schema.json':{$schema:'https://json-schema.org/draft/2020-12/schema',
    $id:'https://schemas.primusspark.com/portal/execution-manager-score-history.v1.schema.json',...schemas.ManagerScoreRevisionHistory},
  'openapi/execution-manager-models.openapi.json': { openapi:'3.1.0',info:{title:'Scoped Manager projections and 360',version:'1.0.0'},paths,
    components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'portal_session'}},schemas} },
};
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value,null,2) + '\n', path = resolve(root,file);
  if (process.argv.includes('--check')) { if (readFileSync(path,'utf8') !== content) throw new Error('Generated Manager contract drift: ' + file); }
  else writeFileSync(path,content);
}
