// Generate the public contract from the actual backend Zod vocabulary. Custom
// semantic refinements remain server checks and have explicit parity fixtures.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { amendManagerP1Schemas, describeCanonicalDecimals, managerCurrentOnlyProblem } from './execution-manager-p1-semantics.mjs';
import { amendManagerLifecycleSchemas, attachManagerLifecycleSynthetic,
  managerLifecycleLiveSyntheticFixture } from './execution-manager-lifecycle-semantics.mjs';
import { managerAllEnvironmentsSyntheticFixture, managerAllEnvironmentsNegativeFixture, amendManagerAllSchemas } from './execution-manager-all-fixtures.mjs';
import { managerP1NoFactsSyntheticOptions, attachManagerP1SyntheticOptions,
  managerP1AllWindowSyntheticFixture, managerP1PartitionsSyntheticFixture, managerP1InvariantNegativeFixture,
  applyManagerP1Ops } from './execution-manager-p1-fixtures.mjs';
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
const regimes = load(resolve(sourceRoot, 'manager-regime-history.contract.ts'));
const p1 = load(resolve(sourceRoot, 'manager-query-p1.contract.ts'));
const invariants = load(resolve(sourceRoot, 'manager-dataset-invariants.ts'));
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
  if (type === 'ZodTuple') return { type:'array',...(d.items.length ? {prefixItems:d.items.map(json)} : {}),minItems:d.items.length,maxItems:d.items.length,items:false };
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
query.properties.group_limit.description = 'Independent group page size, default 200; row limit does not limit the authorized group population.';
query.properties.group_after.description = 'Opaque forward group cursor; not interchangeable with the row cursor. Bound to current authority, source and query.';
query.properties.group_before.description = 'Opaque backward group cursor; mutually exclusive with group_after.';
query.allOf = [...(query.allOf ?? []),
  {not:{properties:{group_after:{},group_before:{}},required:['group_after','group_before']}},
  {if:{anyOf:['group_limit','group_after','group_before'].map(name=>({properties:{[name]:{}},required:[name]}))},
    then:{required:['group_by'],properties:{group_by:{type:'array',minItems:1}}}},
];
response.properties.group_page.description = 'Pagination over all authorized filtered groups, independent of page/items. A null next_cursor means complete; exactly 200 groups need not be truncated. Group aggregates retain their full group population.';
// Zod refinements do not serialize themselves: retain the operator-specific
// value shape in the published JSON contract rather than publishing loose IN.
const scalarFilter=query.properties.filters.items;
scalarFilter.properties.values.uniqueItems=true;
scalarFilter.oneOf=[
  {properties:{op:{const:'IN'},values:{}},required:['values'],not:{properties:{value:{}},required:['value']}},
  {properties:{op:{const:'IS_NULL'}},not:{anyOf:[
    {properties:{value:{}},required:['value']},{properties:{values:{}},required:['values']},
  ]}},
  {properties:{op:{enum:['EQ','GTE','LTE']},value:{}},required:['value'],not:{properties:{values:{}},required:['values']}},
];
const schemas = { ManagerDataset: response, ManagerDatasetQuery: query, ManagerMetric: json(contract.managerResponseMetric), ManagerDatasetRow: json(contract.managerDatasetRow), ManagerScorePublication: json(contract.managerScorePublication), ManagerCompositionPublication: json(contract.managerCompositionPublication), ManagerRegimePublication: json(contract.managerRegimePublication) };
schemas.ManagerQueryOptions=json(p1.managerP1Options);
schemas.ManagerSelectedWindow=json(p1.managerSelectedWindow);
schemas.ManagerCurrentOnlyProblem=structuredClone(managerCurrentOnlyProblem);
// A filter value is a SOURCE-form decimal (it may still be "-0"): it keeps the plain exact decimal, not the canonical response one.
const queryDecimal=json(contract.managerMetric).properties.value.anyOf.find(s=>s.type==='string');
amendManagerP1Schemas({response:schemas.ManagerDataset,query:schemas.ManagerDatasetQuery,
  metric:schemas.ManagerMetric,row:schemas.ManagerDatasetRow,
  options:schemas.ManagerQueryOptions,selectedWindow:schemas.ManagerSelectedWindow,queryDecimal});
amendManagerAllSchemas({response:schemas.ManagerDataset,query:schemas.ManagerDatasetQuery,row:schemas.ManagerDataset.properties.items.items});
// MD-5 (owner decision C): the response decimals are canonical-zero; the rule text sits next to the pattern.
const canonicalDecimal={pattern:invariants.MANAGER_CANONICAL_DECIMAL_PATTERN.source,note:invariants.MANAGER_CANONICAL_ZERO_NOTE};
for(const schema of [schemas.ManagerDataset,schemas.ManagerMetric,schemas.ManagerDatasetRow])describeCanonicalDecimals(schema,canonicalDecimal);
amendManagerLifecycleSchemas({response:schemas.ManagerDataset,row:schemas.ManagerDatasetRow});
Object.assign(schemas,{ManagerScoreRevisionQuery:json(revisions.managerScoreRevisionQuery),ManagerScoreRevisionHistoryQuery:json(revisions.managerScoreRevisionHistoryQuery),
  ManagerScoreRevisionView:json(revisions.managerScoreRevisionView),ManagerScoreRevisionHistory:json(revisions.managerScoreRevisionHistory),
  ManagerHistoricalComposition:json(revisions.managerHistoricalComposition),
  ManagerHistoricalRegimeDetail:json(regimes.managerHistoricalRegimeDetail),
  ManagerHistoricalRegimeEntry:json(regimes.managerHistoricalRegimeEntry),
  ManagerHistoricalRegimeResult:json(regimes.managerHistoricalRegimeResult)});
const routes = [['fund-overview','FundOverview'],['fleet','Fleet'],['portfolios/{id}/overview','Portfolio360'],['alphas/{id}/overview','Alpha360'],['accounts/{id}/overview','Account360'],['deployments/{id}/overview','Deployment360']];
const paths = Object.fromEntries(routes.map(([route,operation]) => ['/api/v1/execution/manager/' + route, { get: {
  operationId: 'executionManager' + operation + 'GetV1', security: [{ PortalSession: [] }],
  description: 'Scoped qualified projection only. Current grants precede financial filtering/grouping/counts. Exact decimals, UTC milliseconds. No browser source/SQL/credential inputs. TEST_ONLY is never product authority. environment=ALL (Fleet only) is NAVIGATION across separately authorized environments: authorized rows of each environment with its own economic partitions, one cursor over one snapshot, per-environment coverage, and never a total over environments or partitions. Any other read pins one economic profile.',
  parameters: [...(route.includes('{id}') ? [{ name:'id', in:'path', required:true, schema:{type:'string',minLength:1,maxLength:256} }] : []),
    ...Object.entries(query.properties).map(([name,schema]) => ({ name, in:'query', required:query.required.includes(name),
      ...(['filters','sort','economic_partition','window','group_sort','group_filters'].includes(name) ? { content: { 'application/json': { schema } } } :
        { schema, ...(schema.type === 'array' ? { style:'form',explode:false } : {}) }) }))],
  responses: { 200:{description:'Authorized current snapshot; absence and policy-pending remain typed',content:{'application/json':{schema:{$ref:'#/components/schemas/ManagerDataset'}}}},
    ...Object.fromEntries([400,401,404,409,503].map(code => [code,{description:({400:'Invalid closed query',401:'Session required',404:'Resource or current grant unavailable',409:'Authority, snapshot or cursor changed',503:'Source publication, field policy, projection or bounded capacity unavailable'})[code]}])) },
} }]));
// Actual safe ErrorFilter shape. It is intentionally not a CommandProblem.
schemas.ManagerQueryProblem={type:'object',additionalProperties:false,required:['error','request_id'],properties:{
  error:{type:'object',additionalProperties:false,required:['code','message'],properties:{
    code:{type:'string',enum:['EXECUTION_READ_NOT_AVAILABLE','EXECUTION_READ_QUERY_INVALID','EXECUTION_READ_CURSOR_INVALID']},
    message:{const:'The requested Execution read is not available.'}}},request_id:{type:'string'}}};
const privateHeaders={'Cache-Control':{required:true,schema:{type:'string',const:'private, no-store'}}};
for(const [route] of routes){
  const operation=paths['/api/v1/execution/manager/'+route].get;
  for(const response of Object.values(operation.responses))response.headers=structuredClone(privateHeaders);
  operation.responses[400]={
    description:'Closed query rejected; any supplied as_of_ms is explicitly CURRENT_ONLY',
    headers:structuredClone(privateHeaders),content:{'application/json':{
      schema:{oneOf:[{$ref:'#/components/schemas/ManagerCurrentOnlyProblem'},{$ref:'#/components/schemas/ManagerQueryProblem'}]},
      examples:{current_only:{value:{error:{code:'EXECUTION_READ_CURRENT_ONLY',
        message:'The requested Execution read is not available.'},request_id:'TEST_ONLY:current-only'}}}}}};
}
for(const [route,operation,request,result] of [
  ['score-view','executionManagerScoreRevisionGetV1','ManagerScoreRevisionQuery','ManagerScoreRevisionView'],
  ['score-revisions','executionManagerScoreRevisionHistoryGetV1','ManagerScoreRevisionHistoryQuery','ManagerScoreRevisionHistory']]){
  const q=schemas[request];paths['/api/v1/execution/manager/'+route]={get:{operationId:operation,security:[{PortalSession:[]}],
    description:'Explicit authorized historical ORIGINAL/RESTATED only; never current operational Score or Regime signal. Optional metric_family=COMPOSITION selects Fund/Portfolio full-accounting allocation-bound history. REGIME selects independently retained Alpha/Deployment historical matching only after current authorization of the entire original subject/reference corpus; no inherited financial Score grant. Omitted/explicit SCORE preserves the Score projection and opaque-reference recipe. Exact retained source requires its own current dataset authority. History enumeration may be typed unavailable with null counts, not empty complete history. No GET calculation, source send or ACK.',
    parameters:Object.entries(q.properties).map(([name,schema])=>({name,in:'query',required:q.required.includes(name),
      ...(name==='economic_partition'?{content:{'application/json':{schema}}}:{schema,...(schema.type==='array'?{style:'form',explode:false}:{})})})),
    responses:{200:{description:'Explicit historical view or typed absence; null knowledge clocks are never inferred',content:{'application/json':{schema:{$ref:'#/components/schemas/'+result}}}},
      ...Object.fromEntries([400,401,404,409,503].map(code=>[code,{description:({400:'Invalid closed query',401:'Session required',404:'Reference or current grant unavailable',409:'Authority/source/policy changed',503:'Qualified source or bounded capability unavailable'})[code]}]))}}};
}
const outputs = {
  'fixtures/execution-manager-query-in.synthetic.valid.json':{
    lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',
    cases:[{environment:'paper',filters:[{field:'health',op:'IN',values:['HEALTHY','DEGRADED']}]},
      {environment:'paper',filters:[{field:'net_pnl',op:'IN',values:['0','100.0000000000000001']}],
        economic_partition:{economic_domain:'PAPER',currency:'USDT',basis:'TEST_ONLY:net-ledger',native_profile_ref:'TEST_ONLY:paper',domain_proof_ref:'TEST_ONLY:proof'}}],
  },
  'schemas/execution-manager-dataset.v1.schema.json': { $schema:'https://json-schema.org/draft/2020-12/schema',
    $id:'https://schemas.primusspark.com/portal/execution-manager-dataset.v1.schema.json', ...response },
  'schemas/execution-manager-score-revision.v1.schema.json':{$schema:'https://json-schema.org/draft/2020-12/schema',
    $id:'https://schemas.primusspark.com/portal/execution-manager-score-revision.v1.schema.json',...schemas.ManagerScoreRevisionView},
  'schemas/execution-manager-score-history.v1.schema.json':{$schema:'https://json-schema.org/draft/2020-12/schema',
    $id:'https://schemas.primusspark.com/portal/execution-manager-score-history.v1.schema.json',...schemas.ManagerScoreRevisionHistory},
  'openapi/execution-manager-models.openapi.json': { openapi:'3.1.0',info:{title:'Scoped Manager projections and 360',version:'1.0.0'},paths,
    components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'__Host-portal_session'}},schemas} },
};
// Explicit TEST_ONLY field contexts, never rows -> installed permissions.
for(const [name,context] of [
  ['execution-manager-dataset.synthetic.valid.json',{metricKeys:[],sortFields:[],groupFields:[],canSearchName:false}],
  ['execution-manager-dataset.rows.synthetic.valid.json',{
    metricKeys:['unrealized_pnl','net_pnl','allocation'],canSearchName:true,
    sortFields:['alpha_id','alpha_version_id','name','owner_user_id','portfolio_id','lifecycle','venue','health','source_state',
      'allocation','net_pnl','unrealized_pnl','stage_presence','current_stage'],
    groupFields:['portfolio_id','owner_user_id','alpha_id','stage_presence','current_stage','venue','health','source_state','lifecycle']}],
]){
  const base=JSON.parse(readFileSync(resolve(root,'fixtures',name),'utf8'));
  const options=managerP1NoFactsSyntheticOptions({asOf:base.value.as_of_ms,...context});
  p1.managerP1Options.parse(options);
  const sample=attachManagerP1SyntheticOptions(attachManagerLifecycleSynthetic(base),options);
  contract.managerDatasetResponse.parse(sample.value);
  outputs['fixtures/'+name]=sample;
  if(name==='execution-manager-dataset.rows.synthetic.valid.json'){
    const contributors=structuredClone(sample);
    const row=contributors.value.items[0];
    contributors.value.surface='FUND';
    contributors.value.groups=[{key:[{field:'alpha_id',value:row.alpha_id}],
      unique_row_count:1,totals_scope:'FULL_AUTHORIZED_FILTERED_QUERY',economic_partitions:[],
      attribution:{alpha_id:row.alpha_id,name:row.name,owner_user_id:row.owner_user_id,
        name_reason_code:null,owner_reason_code:null}}];
    contributors.value.group_page={limit:200,returned_count:1,authorized_filtered_count:1,next_cursor:null,previous_cursor:null};
    contract.managerDatasetResponse.parse(contributors.value);
    outputs['fixtures/execution-manager-contributors.synthetic.valid.json']=contributors;
    const all=managerP1AllWindowSyntheticFixture(sample);
    contract.managerDatasetResponse.parse(all.value);
    outputs['fixtures/execution-manager-dataset.all-window.synthetic.valid.json']=all;
    // BE-P1: positive partition example + the negative cases. The generator proves every negative case is refused by the
    // producer with the stated code (and that the positive example is accepted) before it writes either file.
    const partitions=managerP1PartitionsSyntheticFixture(sample);
    contract.managerDatasetResponse.parse(partitions.value);
    outputs['fixtures/execution-manager-dataset.partitions.synthetic.valid.json']=partitions;
    const negative=managerP1InvariantNegativeFixture();
    for(const c of negative.cases){
      const refused=contract.managerDatasetResponse.safeParse(applyManagerP1Ops(partitions.value,c.ops));
      if(refused.success || !refused.error.issues.some(i=>i.message===c.code || i.code===c.code))
        throw new Error('Negative Manager fixture case is not refused with its code: '+c.id);
    }
    // MD-5: the emit step turns every source example into its stated form, and its output is a valid response decimal.
    for(const {source,emitted} of negative.emit_examples){
      if(invariants.canonicalManagerZero(source)!==emitted || invariants.canonicalManagerZero(emitted)!==emitted)
        throw new Error('Canonical zero emit example is wrong: '+source);
      if(!invariants.managerResponseDecimal.safeParse(emitted).success) throw new Error('Canonical zero example is not a response decimal: '+emitted);
    }
    outputs['fixtures/execution-manager-dataset.invariants.synthetic.negative.json']=negative;
    // FE-CAT-3: the Fleet ALL lens (separately labelled environments, no cross-environment sum). The generator proves the positive
    // example is accepted and that every negative case is refused by the producer with the stated code before it writes either file.
    const allEnvironments=managerAllEnvironmentsSyntheticFixture(sample);
    contract.managerDatasetResponse.parse(allEnvironments.value);
    outputs['fixtures/execution-manager-dataset.all-environments.synthetic.valid.json']=allEnvironments;
    const allNegative=managerAllEnvironmentsNegativeFixture();
    for(const c of allNegative.cases){
      const refused=contract.managerDatasetResponse.safeParse(applyManagerP1Ops(allEnvironments.value,c.ops));
      if(refused.success || !refused.error.issues.some(i=>i.message===c.code || i.code===c.code))
        throw new Error('Negative ALL fixture case is not refused with its code: '+c.id);
    }
    outputs['fixtures/execution-manager-dataset.all-environments.synthetic.negative.json']=allNegative;
    const lifecycle=managerLifecycleLiveSyntheticFixture(sample);
    contract.managerDatasetResponse.parse(lifecycle.value);
    outputs['fixtures/execution-manager-dataset.lifecycle.live.synthetic.valid.json']=lifecycle;
    const timedLifecycle=managerLifecycleLiveSyntheticFixture(sample, {withTransitions:true});
    contract.managerDatasetResponse.parse(timedLifecycle.value);
    outputs['fixtures/execution-manager-dataset.lifecycle.transitions.synthetic.valid.json']=timedLifecycle;
  }
}
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value,null,2) + '\n', path = resolve(root,file);
  if (process.argv.includes('--check')) { if (readFileSync(path,'utf8') !== content) throw new Error('Generated Manager contract drift: ' + file); }
  else writeFileSync(path,content);
}
