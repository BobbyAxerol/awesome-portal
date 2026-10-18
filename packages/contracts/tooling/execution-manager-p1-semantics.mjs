// Finite JSON cross-invariants matching runtime. No Ajv extensions/source inputs.
export const managerP1MetricKeys = ['allocation','net_pnl','unrealized_pnl','balance_total','equity_30d_end_value','return_30d_pct','score'];
const moneyKeys = ['allocation','net_pnl','unrealized_pnl','balance_total','equity_30d_end_value'];
const stockKeys = ['allocation','balance_total','unrealized_pnl'];
const groupKeys = ['portfolio_id','owner_user_id','alpha_id','stage_presence','venue','health','source_state','lifecycle'];
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
      else:obj({reason_code:{type:'string',enum:windowReasons}})},
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
/** Call once on freshly derived Zod schemas before publishing components/files. */
export function amendManagerP1Schemas({response,query,metric,row:standaloneRow,options,selectedWindow}) {
  if(!response?.properties?.query_options || !query?.properties?.window)
    throw new Error('Manager P1 runtime schema must be integrated before semantic generation');
  add(query,{if:requiredKey('q_mode'),then:requiredKey('q')},{not:obj({after:{},before:{}},['after','before'])});
  query.properties.group_by.uniqueItems=true;
  const filter=query.properties.filters.items;
  add(filter,{if:isField('op','IS_NULL'),then:noKey('value'),else:requiredKey('value')});
  const decimalString=metric.properties.value.anyOf.find(s=>s.type==='string');
  const scalarFields=query.properties.sort.items.properties.field.enum;
  if(!decimalString || !Array.isArray(scalarFields) || !scalarFields.length) throw new Error('Manager scalar/decimal schema missing');
  add(filter,{if:obj({field:{enum:[...moneyKeys,'return_30d_pct','score']},op:{not:{const:'IS_NULL'}}},['field','op']),
    then:obj({value:structuredClone(decimalString)},['value'])});
  for (const key of query.properties.sort.items.properties.field.enum) add(query.properties.sort,
    {type:'array',contains:isField('field',key),minContains:0,maxContains:1});
  // Amend every embedded actual metric as well as the standalone component.
  walk(response,node=>{if(node.properties?.availability && node.properties?.provenance_refs && node.properties?.calculation_revision)metricSemantics(node);});
  metricSemantics(metric);
  if(standaloneRow){
    standaloneRow.properties.metrics.propertyNames={type:'string',enum:managerP1MetricKeys};
    walk(standaloneRow,node=>{if(node.properties?.availability && node.properties?.provenance_refs && node.properties?.calculation_revision)metricSemantics(node);});
  }
  const row=response.properties.items.items;
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
