// Main may call from its existing finite Manager fixture generation lane.
const lane='TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT';
const clone=value=>structuredClone(value);
const stocks=new Set(['allocation','balance_total','unrealized_pnl']);

/** Explicit synthetic field-context input only; no rows→policy inference. A
 * focused test compares this finite no-facts context with managerQueryOptions.
 * These fixtures carry no Score or exact-window performance publication. */
export function managerP1NoFactsSyntheticOptions({asOf,sortFields,groupFields,metricKeys,canSearchName}){
  return {temporal_mode:'CURRENT_ONLY',search:{fields:canSearchName?['name']:[],
    modes:canSearchName?['PREFIX','CONTAINS']:[],maximum_text_length:160,
    normalization:'JS_TO_LOWER_CASE_NO_UNICODE_NORMALIZATION'},
    sort_fields:[...sortFields],group_fields:[...groupFields],metric_keys:[...metricKeys],
    economic_partition_required_for:metricKeys.filter(key=>['allocation','net_pnl','unrealized_pnl','balance_total','equity_30d_end_value'].includes(key)),
    window:{custom_supported:true,interpretation:'MATCH_ONLY_NO_READ_TIME_CALCULATION',
      independent_metrics:metricKeys.filter(key=>stocks.has(key)),
      presets:['7D','30D','90D','ALL'].map(value=>{const days={"7D":7,"30D":30,"90D":90}[value];
        return {value,resolved:days!==undefined&&asOf>=days*86_400_000?{from_ms:asOf-days*86_400_000,to_ms:asOf}:null,
          data_state:'NOT_PUBLISHED',reason_code:value==='ALL'?'ALL_HISTORY_WINDOW_NOT_PUBLISHED':'EXACT_METRIC_WINDOW_NOT_PUBLISHED'};})},
    stage_environment:[{environment:'paper',stages:['PAPER']},{environment:'sandbox',stages:['SANDBOX']},{environment:'live',stages:['CANARY','LIVE']}],
    unavailable_fields:[{field:'current_stage',reason_code:'CURRENT_STAGE_GRAIN_NOT_PUBLISHED'},
      {field:'days_in_stage',reason_code:'STAGE_ENTRY_TIME_NOT_PUBLISHED'}]};
}

/** Caller supplies options from the SAME explicit TEST_ONLY authorization
 * context/managerQueryOptions helper. Never derive a role/grant from a row. */
export function attachManagerP1SyntheticOptions(base,options){
  if(base.lane!==lane)throw new Error('TEST_ONLY fixture lane required');
  const sample=clone(base), keys=new Set(options.metric_keys);
  if(keys.size!==options.metric_keys.length || sample.value.items.some(row=>{
    const actual=Object.keys(row.metrics);return actual.length!==keys.size || actual.some(key=>!keys.has(key));
  }))throw new Error('Fixture options must match existing explicit TEST_ONLY keyset');
  sample.value.selected_window=null;
  sample.value.query_options=clone(options);
  return sample;
}

/** Negative-knowledge ALL variant. Original fixture source quality, provenance,
 * capital statements, economics and immutable source pins stay unchanged.
 * This is NOT proof that a live field policy or financial source is installed. */
export function managerP1AllWindowSyntheticFixture(legacy){
  if(legacy.lane!==lane || !legacy.value.query_options)throw new Error('Explicit TEST_ONLY options required');
  const sample=clone(legacy), reason='ALL_HISTORY_WINDOW_NOT_PUBLISHED';
  const absent=metric=>({...metric,value:null,denominator:null,availability:'UNAVAILABLE',reason_code:reason,
    quality:{...metric.quality,completeness:'UNRESOLVED'}});
  for(const row of sample.value.items){
    for(const key of Object.keys(row.metrics))if(!stocks.has(key))row.metrics[key]=absent(row.metrics[key]);
    for(const part of row.economic_partitions)for(const key of Object.keys(part.metrics))
      if(!stocks.has(key))part.metrics[key]=absent(part.metrics[key]);
  }
  for(const group of sample.value.groups)for(const part of group.economic_partitions)
    for(const key of Object.keys(part.metrics))if(!stocks.has(key))part.metrics[key]=absent(part.metrics[key]);
  sample.value.selected_window={requested:'ALL',resolved:null,selection_basis:'EXACT_PUBLISHED_METRIC_WINDOW_ONLY',reason_code:reason};
  for(const key of ['raw','direct_nav','composition'])sample.value.scores[key]={value:null,status:'window_not_published',reason_code:reason};
  sample.value.scores.reason_code=reason;
  if(sample.value.score_details!==undefined)sample.value.score_details=[];
  if(sample.value.composition_details!==undefined)sample.value.composition_details=[];
  return sample;
}
