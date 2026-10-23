// FE-CAT-3: TEST_ONLY examples of the Fleet ALL lens (`environment: ALL`): navigation across separately labelled environments,
// never a consolidated money scope. Derived from the rows fixture, never from a runtime read.
const lane='TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT';
const clone=value=>structuredClone(value);
const keyOf=(environment,row)=>JSON.stringify([environment,row.alpha_id,row.alpha_version_id,row.portfolio_id]);
const partitionOf=(domain,tag)=>({economic_domain:domain,currency:'USDT',basis:'TEST_ONLY:net-ledger',
  native_profile_ref:`TEST_ONLY:${tag}-ledger`,domain_proof_ref:'TEST_ONLY:not-economic-authority'});
const withValue=(metric,value)=>({...clone(metric),value,availability:'AVAILABLE',reason_code:null});

/** One Paper row and one Live row of the same alpha and the SAME currency (USDT): they stay two rows with two partitions, each tagged by its
 * economic domain. The Sandbox environment is typed UNAVAILABLE (its publication is not qualified), so the body is PARTIAL, never COMPLETE.
 * There is no money total anywhere: the page counts rows, the capital statements are one partition per environment. */
export function managerAllEnvironmentsSyntheticFixture(rows){
  if(rows.lane!==lane || rows.value.items.length!==1)throw new Error('The TEST_ONLY rows fixture is required');
  const sample=clone(rows), body=sample.value, paper=body.items[0], live=clone(paper);
  paper.environment='paper';
  live.environment='live';
  live.stage_presence=['LIVE'];
  live.children[0].stage='LIVE';
  if('current_stage' in live)live.current_stage='LIVE';
  paper.economic_partitions[0].partition=partitionOf('PAPER','paper');
  live.economic_partitions=[{partition:partitionOf('ACTUAL','live'),metrics:{
    net_pnl:withValue(paper.metrics.net_pnl,'12.5'),unrealized_pnl:clone(paper.metrics.unrealized_pnl)}}];
  live.metrics.net_pnl=clone(live.economic_partitions[0].metrics.net_pnl);
  live.metrics.unrealized_pnl=clone(live.economic_partitions[0].metrics.unrealized_pnl);
  paper.row_key=keyOf('paper',paper); live.row_key=keyOf('live',live);
  body.environment='ALL'; body.selected_window=null;
  body.items=[paper,live];
  body.page={limit:100,returned_count:2,authorized_filtered_count:2,next_cursor:null,previous_cursor:null};
  const included=(environment,count)=>({environment,availability:'INCLUDED',reason_code:null,
    snapshot_id:`sha256:${environment==='paper'?'2':'3'}`.padEnd(71,environment==='paper'?'2':'3'),
    as_of_ms:body.as_of_ms,recorded_through_ms:body.recorded_through_ms,facts_through_ms:body.facts_through_ms,
    quality:clone(body.quality),authorized_filtered_count:count,returned_count:count});
  body.environment_coverage=[included('paper',1),
    {environment:'sandbox',availability:'UNAVAILABLE',reason_code:'PUBLICATION_NOT_QUALIFIED',snapshot_id:null,as_of_ms:null,
      recorded_through_ms:null,facts_through_ms:null,quality:null,authorized_filtered_count:null,returned_count:null},
    included('live',1)];
  body.quality={completeness:'PARTIAL',freshness:'STALE',reasons:['paper:TEST_ONLY_SOURCE_NOT_QUALIFIED','live:TEST_ONLY_SOURCE_NOT_QUALIFIED',
    'sandbox:ENVIRONMENT_UNAVAILABLE:PUBLICATION_NOT_QUALIFIED']};
  body.groups=[];
  const nav=(environment,value)=>({partition:partitionOf(environment==='paper'?'PAPER':'ACTUAL',environment),
    metrics:{balance_total:withValue(paper.metrics.net_pnl,value)}});
  body.capital_statements=[nav('paper','1000'),nav('live','2500')];
  return sample;
}

/** Negative cases of the ALL shape. `refused_by` says who refuses the mutated body (as the Manager invariant fixture does). */
export function managerAllEnvironmentsNegativeFixture(){
  const both='SCHEMA_AND_PRODUCER', producer='PRODUCER_ONLY';
  const set=(path,value)=>({op:'set',path,value});
  const cases=[
    ['coverage-list-missing',both,'MANAGER_ALL_COVERAGE_REQUIRED','an ALL body carries one coverage entry per environment',[{op:'delete',path:['environment_coverage']}]],
    ['row-without-its-environment',both,'MANAGER_ALL_ROW_ENVIRONMENT_REQUIRED','every row of an ALL body names its own environment',[{op:'delete',path:['items',0,'environment']}]],
    ['single-environment-body-with-a-coverage-list',both,'MANAGER_ALL_COVERAGE_FORBIDDEN','only an ALL body is ALL-shaped',[set(['environment'],'paper')]],
    ['row-key-without-the-environment-first',producer,'MANAGER_ALL_ROW_KEY_INVALID','the row key is [environment, alpha, version, portfolio]',
      [set(['items',0,'row_key'],'["TEST_ONLY:alpha","TEST_ONLY:av","TEST_ONLY:portfolio"]')]],
    ['page-count-is-not-the-sum-of-the-environments',producer,'MANAGER_ALL_COUNT_MISMATCH','page.authorized_filtered_count is the sum of the included environments\' counts',
      [set(['environment_coverage',0,'authorized_filtered_count'],5)]],
    ['unavailable-environment-with-a-count',both,'MANAGER_ALL_COVERAGE_INCONSISTENT','an unavailable environment carries a reason and nothing else',
      [set(['environment_coverage',1,'authorized_filtered_count'],0)]],
    ['included-environment-without-a-snapshot',both,'MANAGER_ALL_COVERAGE_INCONSISTENT','an included environment carries its snapshot, clocks, quality and counts',
      [set(['environment_coverage',0,'snapshot_id'],null)]],
    ['unavailable-environment-reads-complete',producer,'MANAGER_ALL_UNAVAILABLE_READS_COMPLETE','a body that lost an environment is never COMPLETE',
      [set(['quality','completeness'],'COMPLETE')]],
    ['live-row-with-a-paper-partition',producer,'MANAGER_ALL_ROW_DOMAIN_MISMATCH','a row\'s figures live in its own environment\'s economic domain',
      [set(['items',1,'economic_partitions',0,'partition','economic_domain'],'PAPER')]],
    ['coverage-order-changed',producer,'MANAGER_ALL_COVERAGE_ORDER','coverage is paper, sandbox, live',[set(['environment_coverage',0,'environment'],'live')]],
    ['all-with-a-window',both,'MANAGER_ALL_WINDOW_FORBIDDEN','a window resolves against one environment\'s cutoff; ALL carries none',
      [set(['selected_window'],{requested:'7D',resolved:{from_ms:1,to_ms:2},selection_basis:'EXACT_PUBLISHED_METRIC_WINDOW_ONLY',reason_code:null})]],
    ['live-row-in-a-paper-stage',both,'MANAGER_ENVIRONMENT_STAGE_MISMATCH','a row is judged against its own environment\'s stages',
      [set(['items',1,'stage_presence'],['PAPER'])]],
  ].map(([id,refused_by,code,rule,ops])=>({id:`FE-CAT-3/${id}`,rule,refused_by,code,ops}));
  return {lane,base:'execution-manager-dataset.all-environments.synthetic.valid.json',
    note:'Each case mutates the base example. ALL is navigation across separately labelled environments: no case here creates, and no rule here permits, a total over partitions.',cases};
}

/** The finite JSON part of the ALL shape (the producer enforces the rest: counts that add up, identity of a row with its environment). */
export function amendManagerAllSchemas({response,query,row}){
  const add=(schema,...conditions)=>{ schema.allOf=[...(schema.allOf??[]),...conditions]; };
  const isAll={properties:{environment:{const:'ALL'}},required:['environment']};
  const named=key=>({type:'object',required:[key],properties:{[key]:{}}});
  add(response,{if:isAll,
    then:{type:'object',required:['environment_coverage'],properties:{environment_coverage:{},selected_window:{type:'null'},
      items:{type:'array',items:named('environment')}}},
    else:{not:named('environment_coverage'),type:'object',properties:{items:{type:'array',items:{not:named('environment')}}}}});
  add(query,{if:isAll,then:{not:named('window')}});
  response.properties.environment.description='A single environment, or ALL (Fleet only): navigation across separately authorized '+
    'environments. An ALL body lists the authorized rows of every environment that answered, each row with its own environment and economic '+
    'partitions, plus environment_coverage. It never carries a total over environments or partitions.';
  const coverage=response.properties.environment_coverage;
  coverage.description='ALL only: exactly one entry per environment, in the order paper, sandbox, live. INCLUDED carries that environment\'s own '+
    'snapshot, clocks, quality and counts (a counted zero is INCLUDED with 0). UNAVAILABLE carries a closed reason and nothing else: a missing '+
    'environment is typed, never absent and never zero. page.authorized_filtered_count and page.returned_count are the sums of the INCLUDED '+
    'entries (rows, never money); quality is never COMPLETE while an environment is UNAVAILABLE (MANAGER_ALL_*).';
  add(coverage.items,{if:{properties:{availability:{const:'INCLUDED'}},required:['availability']},
    then:{properties:{reason_code:{type:'null'},snapshot_id:{type:'string'},as_of_ms:{type:'integer'},recorded_through_ms:{type:'integer'},
      quality:{type:'object'},authorized_filtered_count:{type:'integer'},returned_count:{type:'integer'}}},
    else:{properties:{reason_code:{type:'string'},snapshot_id:{type:'null'},as_of_ms:{type:'null'},recorded_through_ms:{type:'null'},
      facts_through_ms:{type:'null'},quality:{type:'null'},authorized_filtered_count:{type:'null'},returned_count:{type:'null'}}}});
  row.properties.environment.description='ALL only: the environment this row belongs to. row_key is [environment, alpha_id, alpha_version_id, '+
    'portfolio_id] and every economic partition of the row is of that environment\'s economic domain (live: ACTUAL).';
}
