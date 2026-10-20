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
    unavailable_fields:[{field:'days_in_stage',reason_code:'STAGE_ENTRY_TIME_NOT_PUBLISHED'},
      {field:'entered_at_ms',reason_code:'STAGE_ENTRY_TIME_NOT_PUBLISHED'}]};
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

const partitionOf=(currency,tag)=>({economic_domain:'PAPER',currency,basis:'TEST_ONLY:net-ledger',
  native_profile_ref:`TEST_ONLY:paper-ledger-${tag}`,domain_proof_ref:'TEST_ONLY:not-economic-authority'});

/** BE-P1 positive example of the partition invariants (MD-1..MD-8). Derived from the rows fixture, never from a runtime
 * read: row A has one USDT partition and its headline is that partition's figure; row B holds a USDT and a EUR partition,
 * so it publishes NO headline money figure (typed absence MIXED_ECONOMIC_DOMAINS); one group and the capital statements
 * keep the two currencies in separate partitions. There is no cross-currency total anywhere. */
export function managerP1PartitionsSyntheticFixture(rows){
  if(rows.lane!==lane || rows.value.items.length!==1)throw new Error('The TEST_ONLY rows fixture is required');
  const sample=clone(rows), body=sample.value, rowA=body.items[0], rowB=clone(rowA);
  Object.assign(rowB,{row_key:'["TEST_ONLY:alpha-b","TEST_ONLY:av-b","TEST_ONLY:portfolio"]',alpha_id:'TEST_ONLY:alpha-b',
    alpha_version_id:'TEST_ONLY:av-b',name:'TEST_ONLY · two currencies'});
  Object.assign(rowB.children[0],{alpha_id:'TEST_ONLY:alpha-b',alpha_version_id:'TEST_ONLY:av-b',deployment_id:'TEST_ONLY:deployment-b'});
  const usdt=clone(rowA.metrics.net_pnl), eur={...clone(rowA.metrics.net_pnl),currency:'EUR',value:'-12.5'};
  const mixed=metric=>({...clone(metric),reason_code:'MIXED_ECONOMIC_DOMAINS'});
  rowB.metrics.net_pnl=mixed(rowA.metrics.allocation); rowB.metrics.unrealized_pnl=mixed(rowA.metrics.allocation);
  rowB.economic_partitions=[{partition:partitionOf('USDT','usdt'),metrics:{net_pnl:clone(usdt)}},
    {partition:partitionOf('EUR','eur'),metrics:{net_pnl:clone(eur)}}];
  body.items=[rowA,rowB];
  body.page={limit:100,returned_count:2,authorized_filtered_count:2,next_cursor:null,previous_cursor:null};
  body.groups=[{key:[{field:'portfolio_id',value:'TEST_ONLY:portfolio'}],unique_row_count:2,totals_scope:'FULL_AUTHORIZED_FILTERED_QUERY',
    economic_partitions:[{partition:partitionOf('USDT','usdt'),metrics:{net_pnl:clone(usdt)}},
      {partition:partitionOf('EUR','eur'),metrics:{net_pnl:clone(eur)}}]}];
  body.capital_statements=[{partition:partitionOf('USDT','usdt'),metrics:{balance_total:clone(usdt)}},
    {partition:partitionOf('EUR','eur'),metrics:{balance_total:clone(eur)}}];
  return sample;
}

/** Operations of the negative fixture on a JSON path of the positive example: set, delete, append, append_copy, set_copy. */
export function applyManagerP1Ops(base,ops){
  const body=clone(base), at=path=>path.reduce((node,key)=>node[key],body);
  for(const op of ops){
    const parent=at(op.path.slice(0,-1)), key=op.path.at(-1);
    if(op.op==='set')parent[key]=clone(op.value);
    else if(op.op==='delete')delete parent[key];
    else if(op.op==='append')parent[key].push(clone(op.value));
    else if(op.op==='append_copy')parent[key].push(clone(at(op.from)));
    else if(op.op==='set_copy')parent[key]=clone(at(op.from));
    else throw new Error('Unknown fixture operation '+op.op);
  }
  return body;
}

/** BE-P1 negative cases MD-1..MD-8. `refused_by` says who refuses the mutated body: SCHEMA_AND_PRODUCER (JSON Schema can
 * state it) or PRODUCER_ONLY (it cannot: equality of two fields, identity inside a list, a property of two items). `code`
 * is the producer's issue message (or Zod issue code). MD-5 (negative zero) is deliberately absent: it waits for an
 * owner decision. */
export function managerP1InvariantNegativeFixture(){
  const both='SCHEMA_AND_PRODUCER', producer='PRODUCER_ONLY';
  const set=(path,value)=>({op:'set',path,value});
  const copy=(path,from)=>({op:'append_copy',path,from});
  const cases=[
    ['MD-1','empty-page-with-a-count',both,'MANAGER_PAGE_RETURNED_COUNT_MISMATCH','an empty page publishes returned_count 0',[set(['items'],[]),set(['groups'],[])]],
    ['MD-1','rows-with-a-zero-count',both,'MANAGER_PAGE_RETURNED_COUNT_MISMATCH','a page with rows publishes at least 1',[set(['page','returned_count'],0)]],
    ['MD-1','returned-count-below-the-rows',producer,'MANAGER_PAGE_RETURNED_COUNT_MISMATCH','returned_count equals items.length',[set(['page','returned_count'],1)]],
    ['MD-1','returned-count-above-the-limit',producer,'MANAGER_PAGE_RETURNED_OVER_LIMIT','returned_count is at most limit',[set(['page','limit'],1)]],
    ['MD-1','more-rows-than-the-filtered-query',producer,'MANAGER_PAGE_RETURNED_OVER_FILTERED','returned_count is at most authorized_filtered_count',
      [set(['page','authorized_filtered_count'],1),set(['page','next_cursor'],'TEST_ONLY:cursor')]],
    ['MD-1','no-cursor-but-fewer-rows-than-the-filtered-query',producer,'MANAGER_PAGE_CURSOR_MISSING','a non-empty page with neither cursor is the whole result',
      [set(['page','authorized_filtered_count'],5)]],
    ['MD-2','foreign-currency-inside-a-partition',producer,'MANAGER_PARTITION_CURRENCY_MISMATCH','a metric that names a currency names its partition\'s',
      [set(['capital_statements',0,'metrics','balance_total','currency'],'EUR')]],
    ['MD-3','partition-object-repeated',both,'MANAGER_PARTITION_DUPLICATE','a partition appears once per list (exact repeat)',
      [copy(['capital_statements'],['capital_statements',0])]],
    ['MD-3','partition-identity-repeated-with-other-content',producer,'MANAGER_PARTITION_DUPLICATE','identity is domain, currency, basis, native profile',
      [copy(['capital_statements'],['capital_statements',0]),set(['capital_statements',2,'partition','domain_proof_ref'],'TEST_ONLY:other-proof')]],
    ['MD-4','unpublished-preset-with-a-window',both,'MANAGER_WINDOW_OPTION_INVALID','a preset the source does not publish carries no window',
      [set(['query_options','window','presets',0,'resolved'],{from_ms:1,to_ms:2})]],
    ['MD-6','row-repeated',both,'MANAGER_ROW_KEY_DUPLICATE','a row appears once (exact repeat)',
      [copy(['items'],['items',0]),set(['page','returned_count'],3),set(['page','authorized_filtered_count'],3)]],
    ['MD-6','row-key-shared-by-two-rows',producer,'MANAGER_ROW_KEY_DUPLICATE','row_key is unique within a body',
      [set(['items',1,'row_key'],'["TEST_ONLY:alpha","TEST_ONLY:av","TEST_ONLY:portfolio"]')]],
    ['MD-6','group-repeated',both,'MANAGER_GROUP_DUPLICATE','a group appears once (exact repeat)',[copy(['groups'],['groups',0])]],
    ['MD-7','group-over-a-non-groupable-field',both,'invalid_enum_value','a group key names one of the eight groupable fields',
      [set(['groups',0,'key',0,'field'],'name')]],
    ['MD-7','field-twice-in-one-group-key',both,'MANAGER_GROUP_KEY_FIELD_DUPLICATE','a field is named once in a group key',
      [{op:'append',path:['groups',0,'key'],value:{field:'portfolio_id',value:'TEST_ONLY:other'}}]],
    ['MD-7','more-unique-rows-than-the-filtered-query',producer,'MANAGER_GROUP_COUNT_OVER_FILTERED','a group holds at most authorized_filtered_count rows',
      [set(['groups',0,'unique_row_count'],10)]],
    ['MD-8','usdt-headline-above-a-eur-partition',producer,'MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE','a headline money figure is one partition\'s figure',
      [{op:'set_copy',path:['items',1,'metrics','net_pnl'],from:['items',0,'metrics','net_pnl']},set(['items',1,'metrics','net_pnl','value'],'1')]],
  ].map(([gap,id,refused_by,code,rule,ops])=>({id:`${gap}/${id}`,gap,rule,refused_by,code,ops}));
  return {lane,base:'execution-manager-dataset.partitions.synthetic.valid.json',
    note:'Each case mutates the base example. MD-5 (negative zero) is not a rule: it waits for an owner decision.',cases};
}
