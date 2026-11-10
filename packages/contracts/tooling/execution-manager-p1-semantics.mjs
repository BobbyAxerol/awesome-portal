// Finite JSON cross-invariants matching runtime. No Ajv extensions/source inputs.
export const managerP1MetricKeys = ['allocation','net_pnl','unrealized_pnl','balance_total','equity_30d_end_value','return_30d_pct','score'];
const moneyKeys = ['allocation','net_pnl','unrealized_pnl','balance_total','equity_30d_end_value'];
const stockKeys = ['allocation','balance_total','unrealized_pnl'];
const groupKeys = ['portfolio_id','owner_user_id','alpha_id','stage_presence','current_stage','venue','health','source_state','lifecycle'];
const windowReasons = ['EXACT_METRIC_WINDOW_NOT_PUBLISHED','ALL_HISTORY_WINDOW_NOT_PUBLISHED'];
const summaryNames = ['raw','direct_nav','composition'];
const obj = (properties, required=[]) => ({type:'object',properties,...(required.length?{required}:{})});
const requiredKey = key => obj({[key]:{}},[key]);
const contains = key => ({type:'array',contains:{const:key},minContains:1});
const isField = (key,value) => obj({[key]:{const:value}},[key]);
const add = (schema,...conditions) => { schema.allOf=[...(schema.allOf??[]),...conditions]; };
const objectPart = schema => schema?.properties ? schema : schema?.anyOf?.find(s=>s.properties);
const noKey = key => ({not:requiredKey(key)});

function metricSemantics(metric) {
  add(metric,
    {if:isField('availability','AVAILABLE'),then:obj({value:{not:{type:'null'}}}),
      else:obj({value:{type:'null'},reason_code:{type:'string'}})},
    {if:isField('unit','MONEY'),then:obj({currency:{type:'string'}})});
}
function summarySemantics(summary) {
  add(summary,
    {if:obj({status:{enum:['available','provisional']}},['status']),then:obj({value:{not:{type:'null'}}}),else:obj({value:{type:'null'}})},
    {if:isField('status','window_not_published'),then:obj({reason_code:{enum:windowReasons}},['reason_code']),else:noKey('reason_code')});
}
function walk(schema, visit) {
  if (!schema || typeof schema!=='object') return;
  for (const child of Object.values(schema)) {
    if (Array.isArray(child)) for (const item of child) walk(item,visit);
    else if (child && typeof child==='object') walk(child,visit);
  }
  visit(schema);
}
function amendOptions(options) {
  const p=options.properties;
  for(const key of ['sort_fields','group_fields','metric_keys','economic_partition_required_for']) p[key].uniqueItems=true;
  p.window.properties.independent_metrics.uniqueItems=true;
  add(options,{if:obj({search:obj({fields:{type:'array',maxItems:0}},['fields'])},['search']),
    then:obj({search:obj({modes:{type:'array',maxItems:0}})}),
    else:obj({search:obj({modes:{type:'array',minItems:2,maxItems:2,uniqueItems:true}})})});
  add(options,{if:obj({sort_fields:contains('name')},['sort_fields']),
    then:obj({search:obj({fields:{type:'array',minItems:1,maxItems:1}})}),
    else:obj({search:obj({fields:{type:'array',maxItems:0}})})});
  for(const [property,keys] of [['metric_keys',managerP1MetricKeys],['group_fields',groupKeys]])for(const key of keys)
    add(options,{if:obj({sort_fields:contains(key)},['sort_fields']),then:obj({[property]:contains(key)}),
      else:obj({[property]:{type:'array',not:{contains:{const:key}}}})});
  for (const [arrayPath,keys] of [['money',moneyKeys],['stocks',stockKeys]]) for (const key of keys) {
    const target=arrayPath==='money'?obj({economic_partition_required_for:contains(key)}):obj({window:obj({independent_metrics:contains(key)})});
    const absent=arrayPath==='money'?obj({economic_partition_required_for:{type:'array',not:{contains:{const:key}}}}):
      obj({window:obj({independent_metrics:{type:'array',not:{contains:{const:key}}}})});
    add(options,{if:obj({metric_keys:contains(key)},['metric_keys']),then:target,else:absent});
  }
  const presets=p.window.properties.presets;
  presets.prefixItems=['7D','30D','90D','ALL'].map(value=>isField('value',value));
  // Keep existing bounded item schema in `items`, not `items:false`: each prefix
  // must ALSO have the complete preset object schema; allOf avoids its removal.
  presets.allOf=[{type:'array',items:presets.items}];
  presets.items=false;
  const preset=presets.allOf[0].items;
  add(preset,
    {if:isField('data_state','METRIC_SPECIFIC'),then:obj({resolved:{type:'object'},reason_code:{type:'null'}}),
      else:obj({resolved:{type:'null'},reason_code:{type:'string',enum:windowReasons}})},
    {if:isField('value','ALL'),then:obj({resolved:{type:'null'},reason_code:{const:'ALL_HISTORY_WINDOW_NOT_PUBLISHED'}})});
  p.stage_environment.prefixItems=[
    {const:{environment:'paper',stages:['PAPER']}},{const:{environment:'sandbox',stages:['SANDBOX']}},
    {const:{environment:'live',stages:['CANARY','LIVE']}}];
  p.stage_environment.allOf=[{type:'array',items:p.stage_environment.items}];
  p.stage_environment.items=false;
}
function selectedWindowSemantics(selected) {
  add(selected,{if:isField('requested','ALL'),
    then:obj({resolved:{type:'null'},reason_code:{const:'ALL_HISTORY_WINDOW_NOT_PUBLISHED'}}),
    else:obj({resolved:{type:'object'},reason_code:{type:'null'}})});
}
function scoreWindowSemantics(response) {
  const scores=response.properties.scores;
  for(const key of summaryNames) summarySemantics(scores.properties[key]);
  const summaryIsWindow=key=>obj({scores:obj({[key]:isField('status','window_not_published')},[key])},['scores']);
  add(response,{if:{anyOf:summaryNames.map(summaryIsWindow)},then:obj({selected_window:{type:'object'}})});
  const allMissing={allOf:summaryNames.map(summaryIsWindow)};
  add(response,{if:allMissing,then:obj({scores:obj({reason_code:{enum:windowReasons}})}),
    else:obj({scores:obj({reason_code:{not:{enum:windowReasons}}})})});
  // Only two possible window reasons, so equality is finite JSON conditionals,
  // not a nonstandard $data comparison or an inferred engine availability.
  for (const [all,reason] of [[true,windowReasons[1]],[false,windowReasons[0]]]) {
    const requestedAll=obj({selected_window:obj({requested:{const:'ALL'}},['requested'])},['selected_window']);
    const selectionCondition=all?requestedAll:{not:requestedAll};
    for(const key of summaryNames) add(response,{if:{allOf:[selectionCondition,summaryIsWindow(key)]},
      then:obj({scores:obj({[key]:obj({reason_code:{const:reason}},['reason_code'])})})});
    add(response,{if:{allOf:[selectionCondition,allMissing]},then:obj({scores:obj({reason_code:{const:reason}})})});
  }
}
const PARTITION_LIST_NOTE='A partition appears once per list (identity: economic_domain, currency, basis, native_profile_ref; '+
  'domain_proof_ref is evidence, not identity). A metric that names a currency names its partition\'s currency. '+
  'uniqueItems here catches an exact repeat; a repeat of the identity with different metrics is refused by the producer '+
  '(MANAGER_PARTITION_DUPLICATE) and by the reader, because JSON Schema cannot compare a property of two items.';
/** BE-B1 (MD-9): the two well-known PERCENT keys of an economic partition's open metric map. */
const PERCENT_ROW_NOTE='Open PERCENT keys max_drawdown_pct and win_rate_pct (BE-B1, MD-9): no currency; unit PERCENT when available; win_rate_pct is within '+
  '0..100 (MANAGER_PERCENT_METRIC_HAS_CURRENCY, MANAGER_PERCENT_METRIC_UNIT_INVALID, MANAGER_WIN_RATE_OUT_OF_RANGE). The key is omitted when no source fact '+
  'states it: omission is Not published, never 0.';
const PERCENT_POOLED_NOTE='A win rate is row level only (a rate is never pooled): no group and no capital statement carries win_rate_pct (MANAGER_WIN_RATE_NOT_POOLABLE).';
function partitionListSemantics(list,note=PARTITION_LIST_NOTE) {
  list.uniqueItems=true;
  list.description=note;
}
/** Finite JSON part of the producer invariants MD-1..MD-9 (see manager-dataset-invariants.ts for the rest). */
function datasetInvariantSemantics(response,row) {
  const page=response.properties.page;
  page.description='returned_count is items.length, at most limit and at most authorized_filtered_count; a non-empty page '+
    'with neither cursor is the whole filtered result (returned_count equals authorized_filtered_count). JSON Schema cannot '+
    'compare a count with an array length: the producer refuses to emit a body that breaks this (MANAGER_PAGE_*), and the '+
    'reader refuses it too. The schema states the empty case exactly.';
  add(response,{if:obj({items:{type:'array',maxItems:0}},['items']),
    then:obj({page:obj({returned_count:{const:0}})}),else:obj({page:obj({returned_count:{type:'integer',minimum:1}})})});
  response.properties.items.uniqueItems=true;
  response.properties.items.description='A row appears once: row_key is unique within a body (MANAGER_ROW_KEY_DUPLICATE). '+
    'uniqueItems catches an exact repeat; a repeated row_key with different content is refused by the producer.';
  row.properties.row_key.description='Unique within a body (MANAGER_ROW_KEY_DUPLICATE).';
  row.properties.metrics.description='A money metric that names a currency is the figure of exactly one partition listed in '+
    'economic_partitions (the same metric), never a total across partitions. When a query pins one economic_partition the '+
    'row still lists its other partitions and the headline is the pinned partition\'s figure (MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE).';
  partitionListSemantics(row.properties.economic_partitions,PARTITION_LIST_NOTE+' '+PERCENT_ROW_NOTE);
  const group=response.properties.groups;
  group.uniqueItems=true;
  group.description='A group appears once (identity: key) and holds no more unique rows than page.authorized_filtered_count '+
    '(MANAGER_GROUP_DUPLICATE, MANAGER_GROUP_COUNT_OVER_FILTERED). Its key names a field of query_options.group_fields once '+
    '(MANAGER_GROUP_FIELD_NOT_OFFERED).';
  const key=group.items.properties.key;
  // A field twice in one key: finite over the eight groupable fields, no $data comparison.
  key.allOf=key.items.properties.field.enum.map(field=>({not:{type:'array',
    contains:obj({field:{const:field}},['field']),minContains:2}}));
  partitionListSemantics(group.items.properties.economic_partitions,PARTITION_LIST_NOTE+' '+PERCENT_POOLED_NOTE);
  partitionListSemantics(response.properties.capital_statements,PARTITION_LIST_NOTE+' '+PERCENT_POOLED_NOTE);
}
/** MD-5 canonical zero (owner decision C): the response decimal carries the lookahead-free canonical pattern; this puts the
 * rule text next to it, wherever it occurs (metric value/denominator, score summaries, series points). Idempotent. */
export function describeCanonicalDecimals(schema,{pattern,note}) {
  let count=0;
  walk(schema,node=>{if(node.type==='string' && node.pattern===pattern){node.description=note;count++;}});
  if(!count) throw new Error('No canonical-zero decimal found to describe');
  return count;
}
/** Call once on freshly derived Zod schemas before publishing components/files.
 * `queryDecimal` is the SOURCE exact decimal (a filter value may still be "-0"): never the canonical response decimal. */
export function amendManagerP1Schemas({response,query,metric,row:standaloneRow,options,selectedWindow,queryDecimal}) {
  if(!response?.properties?.query_options || !query?.properties?.window)
    throw new Error('Manager P1 runtime schema must be integrated before semantic generation');
  add(query,{if:requiredKey('q_mode'),then:requiredKey('q')},{not:obj({after:{},before:{}},['after','before'])});
  query.properties.group_by.uniqueItems=true;
  const filter=query.properties.filters.items;
  add(filter,{if:isField('op','IS_NULL'),then:noKey('value'),else:{
    if:isField('op','IN'),then:requiredKey('values'),else:requiredKey('value')
  }});
  const decimalString=queryDecimal;
  const scalarFields=query.properties.sort.items.properties.field.enum;
  if(!decimalString || !Array.isArray(scalarFields) || !scalarFields.length) throw new Error('Manager scalar/decimal schema missing');
  add(filter,{if:obj({field:{enum:[...moneyKeys,'return_30d_pct','score']},op:{not:{const:'IS_NULL'}}},['field','op']),
    then:{if:isField('op','IN'),then:obj({values:{type:'array',items:structuredClone(decimalString)}},['values']),
      else:obj({value:structuredClone(decimalString)},['value'])}});
  for (const key of query.properties.sort.items.properties.field.enum) add(query.properties.sort,
    {type:'array',contains:isField('field',key),minContains:0,maxContains:1});
  // Amend every embedded actual metric as well as the standalone component.
  walk(response,node=>{if(node.properties?.availability && node.properties?.provenance_refs && node.properties?.calculation_revision)metricSemantics(node);});
  metricSemantics(metric);
  if(standaloneRow){
    standaloneRow.properties.metrics.propertyNames={type:'string',enum:managerP1MetricKeys};
    partitionListSemantics(standaloneRow.properties.economic_partitions,PARTITION_LIST_NOTE+' '+PERCENT_ROW_NOTE);
    walk(standaloneRow,node=>{if(node.properties?.availability && node.properties?.provenance_refs && node.properties?.calculation_revision)metricSemantics(node);});
  }
  const row=response.properties.items.items;
  datasetInvariantSemantics(response,row);
  row.properties.metrics.propertyNames={type:'string',enum:managerP1MetricKeys};
  for(const key of managerP1MetricKeys) add(response,{
    if:obj({query_options:obj({metric_keys:contains(key)},['metric_keys'])},['query_options']),
    then:obj({items:{type:'array',items:obj({metrics:requiredKey(key)},['metrics'])}}),
    else:obj({items:{type:'array',items:obj({metrics:noKey(key)},['metrics'])}})});
  amendOptions(response.properties.query_options);
  selectedWindowSemantics(objectPart(response.properties.selected_window));
  scoreWindowSemantics(response);
  for(const [env,stages] of [['paper',['PAPER']],['sandbox',['SANDBOX']],['live',['CANARY','LIVE']]]){
    add(query,{if:isField('environment',env),then:obj({stage_filter:{type:'array',items:{type:'string',enum:stages}}})});
    add(response,{if:isField('environment',env),then:obj({items:{type:'array',items:obj({
      stage_presence:{type:'array',items:{type:'string',enum:stages}},
      children:{type:'array',items:obj({stage:{type:'string',enum:stages}})}
    })}})});
  }
  if(options)amendOptions(options);
  if(selectedWindow)selectedWindowSemantics(selectedWindow);
  return {response,query,metric,row:standaloneRow,options,selectedWindow};
}
export const managerCurrentOnlyProblem={type:'object',additionalProperties:false,required:['error','request_id'],properties:{
  error:{type:'object',additionalProperties:false,required:['code','message'],properties:{code:{const:'EXECUTION_READ_CURRENT_ONLY'},
    message:{const:'The requested Execution read is not available.'}}},request_id:{type:'string'}}};
