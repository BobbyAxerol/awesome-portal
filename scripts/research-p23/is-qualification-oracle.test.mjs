/** Synthetic raw-source/DTO unit inputs; these tests are not real engine evidence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { canonicalIsJson, verifyIsQualification, verifyIsWitness } from './is-qualification-oracle.mjs';

const D = 86_400_000, START = 1_780_272_000_000, DIGEST = 'b'.repeat(64);
const BINDING = { run_id: 'rrun_is_oracle_unit', job_id: 'job_is_oracle_unit', worker_attempt_id: 'worker_is_oracle_unit', lease_epoch: 1 };
const LOCATOR = "quantbt==1.1.1:scoped_result(scope='test',fold_table=[declared_IS.start,last_actual_IS_bar_before_end_exclusive])";
const sha = text => createHash('sha256').update(text).digest('hex');
const repr = value => Number.isInteger(value) ? `${value}.0` : String(value);
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values, p) => {
  const ordered = [...values].sort((a,b) => a-b), at = (ordered.length-1)*p, low = Math.floor(at);
  return ordered[low] + (ordered[Math.ceil(at)]-ordered[low])*(at-low);
};

function wire(rows, windows, headerChange) {
  const observation = { definition: 'B9_FULL_DECLARED_IS_ACCOUNT_AND_DAILY_DISTRIBUTION_V1',
    bounds: { ...windows.is, bounds_semantics: 'START_INCLUSIVE_END_EXCLUSIVE' }, symbols: ['DEFAULT'],
    position_columns: ['Position_DEFAULT'], benchmark_locator: 'P08.verified_tape:unit_source_digest:close:OOS' };
  const header = { schema_version: 'research.is-qualification-witness.v1', binding: structuredClone(BINDING),
    source_windows: structuredClone(windows), observation_header: observation };
  headerChange?.(header);
  const lines = rows.map(row => JSON.stringify(row));
  const bytes = Buffer.from(`${canonicalIsJson(header)}\n${lines.join('\n')}\n`);
  const metadata = { schema_version: 'research.is-qualification-source.v1', state: 'AVAILABLE', reason_code: null,
    file_name: 'is-qualification.ndjson', file_sha256: sha(bytes), byte_count: bytes.length,
    normalized_rows_sha256: sha(`[${lines.join(',')}]`), observation_is_digest: sha(`${canonicalIsJson(header.observation_header)}${lines.join('')}`),
    row_count: rows.length, is_start_utc_ms: windows.is.start_ms, is_end_exclusive_utc_ms: windows.is.end_ms,
    first_observed_utc_ms: rows[0][0], last_observed_utc_ms: rows.at(-1)[0], binding_sha256: sha(canonicalIsJson(header.binding)) };
  return { bytes, metadata };
}
function fixture({ days = [0,1,2,3], equity = [100,110,99,120], barReturns, step = D } = {}) {
  const rows = days.map((day,index) => [START+day*step, repr(equity[index]), repr(barReturns?.[index] ?? (index ? (equity[index]-equity[index-1])/equity[index-1] : 0)),
    [index%2 ? '-1.0' : '1.0'], repr(50+index*5)]);
  const end = rows.at(-1)[0]+step;
  const windows = Object.fromEntries([['is',START,end], ['oos',end,end+2*D], ['holdout',end+2*D,end+3*D]]
    .map(([kind,start,finish]) => [kind,{start_ms:start,end_ms:finish,source_locator:`P10.immutable_requested_spec.windows.${kind}`} ]));
  const witness = wire(rows,windows);
  const observedCloses = new Map(rows.map(row => [Math.floor(row[0]/D),Number(row[1])]));
  const observed = [...observedCloses.values()], engineDaily = observed.slice(1).map((v,i)=>(v-observed[i])/observed[i]);
  const sample = engineDaily.length ? engineDaily : rows.map(row => Number(row[2]));
  const periods = engineDaily.length ? 365 : 365.25*D/step;
  const mean = average(sample), sd = sample.length>=2 ? Math.sqrt(sample.reduce((sum,r)=>sum+(r-mean)**2,0)/(sample.length-1)) : NaN;
  const daily = []; let prior;
  for (let day=Math.floor(rows[0][0]/D);day<=Math.floor(rows.at(-1)[0]/D);day++) {
    const last=observedCloses.get(day)??prior;
    if(prior!==undefined)daily.push(last/prior-1);
    prior=last;
  }
  const policy = { quantile_method:'LINEAR_TYPE_7',probability:'0.95',risk_variable:'LOSS_FRACTION_NEGATIVE_RETURN',
    risk_sign:'SIGNED_LOSS_FRACTION',tail:'LOSS_GTE_VAR_INCLUSIVE',minimum_observations:2 };
  const fact = (value,origin,source_locator,reason=null) => ({state:reason?'NOT_APPLICABLE':'AVAILABLE',reason_code:reason,
    value:reason?null:String(value),origin,scope:'IS',source_locator,input_digest:DIGEST});
  let peak=equity[0]; const dd=equity.map(value=>{peak=Math.max(peak,value);return value/peak-1;});
  const scalars = {mean:average(daily),median:percentile(daily,.5),var_95:percentile(daily.map(r=>-r),.95)};
  scalars.cvar_95=average(daily.map(r=>-r).filter(loss=>loss>=scalars.var_95));
  const definitions={mean:'arithmetic_mean_return',median:'return_type7_p0.5',var_95:'signed_loss_type7_p0.95',cvar_95:'mean_signed_loss_gte_var_inclusive'};
  const nonconstant=daily.length>=2 && Math.min(...daily)!==Math.max(...daily);
  const buckets=[];
  if(nonconstant){
    const low=Math.min(...daily),high=Math.max(...daily),edges=Array.from({length:13},(_,i)=>(low*(12-i)+high*i)/12);
    for(let i=0;i<12;i++)buckets.push({lower_inclusive:String(edges[i]),upper:String(edges[i+1]),upper_inclusive:i===11?'true':'false',
      count:daily.filter(value=>value>=edges[i]&&(i===11?value<=edges[i+1]:value<edges[i+1])).length});
  }
  const points = values=>rows.map((row,i)=>({at_utc_ms:row[0],value:String(values[i])}));
  const payload = {state:'AVAILABLE',reason_code:null,basis:'ALL_TIME',scope:{window:'IS',coverage:'FULL_SOURCE_IS',
    ...windows.is,bounds_semantics:'START_INCLUSIVE_END_EXCLUSIVE',first_at_utc_ms:rows[0][0],last_at_utc_ms:rows.at(-1)[0],
    observation_count:rows.length,source_table:'OBSERVATION_IS',locator:LOCATOR},
    facts:{metrics:{
      sharpe:fact(sd>0?mean/sd*Math.sqrt(periods):null,'ENGINE_DIRECT',sd>0?'quantbt.metrics.performance.full_report(trading_days=365).sharpe:DECLARED_IS':
        'quantbt.full_report.sharpe:DECLARED_IS',sample.length<2?'P13_IS_RETURN_SAMPLE_BELOW_TWO':sd===0?'P13_IS_RETURN_ZERO_VARIANCE':null),
      return_fraction:fact(equity.at(-1)/equity[0]-1,'PORTAL_DERIVED','QuantBT.result.equity:DECLARED_IS:first_last_ratio_minus_one'),
      max_drawdown_fraction:fact(Math.min(...dd),'ENGINE_DIRECT','quantbt.metrics.performance.full_report.max_drawdown_pct:-/100:DECLARED_IS')}},
    return_basis:{definition_id:'FIRST_LAST_DECLARED_IS_EQUITY_V1',start_equity:String(equity[0]),end_equity:String(equity.at(-1)),
      first_at_utc_ms:rows[0][0],last_at_utc_ms:rows.at(-1)[0],source_locator:LOCATOR},
    benchmark:{state:'AVAILABLE',reason_code:null,definition_id:'DECLARED_IS_SOURCE_CLOSE_REBASED_100_V1',
      source_locator:'P08.verified_tape:unit_source_digest:close:IS',input_digest:DIGEST},
    curves:{sampling:{source_observation_count:rows.length,emitted_point_count:rows.length,method:'EXTREMA_BUCKET_V1'},
      strategy_rebased_100:points(equity.map(e=>e/equity[0]*100)),benchmark_rebased_100:points(rows.map(row=>Number(row[4])/Number(rows[0][4])*100)),drawdown_fraction:points(dd)},
    return_distribution:{state:nonconstant?'AVAILABLE':'NOT_APPLICABLE',reason_code:nonconstant?null:daily.length<2?
      'PORTAL_DAILY_RETURN_DISTRIBUTION_TOO_FEW_OBSERVATIONS':'PORTAL_DAILY_RETURN_DISTRIBUTION_ZERO_VARIANCE',origin:'PORTAL_DERIVED',sampling:'UTC_DAY',
      observation_count:daily.length,bucket_basis:'ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1',statistics_policy:policy,buckets,
      ...Object.fromEntries(Object.entries(definitions).map(([key,definition])=>[key,fact(scalars[key],'PORTAL_DERIVED',
        `scoped.daily_returns:ALL_TIME_UTC_DAY:${definition}:DECLARED_IS`,daily.length<2?'PORTAL_DAILY_RETURN_STATISTICS_TOO_FEW_OBSERVATIONS':null)]))}};
  const oosPoints=[{at_utc_ms:end,value:'100'},{at_utc_ms:end+D,value:'101'}];
  const block={schema_version:'research.enriched-analysis.v1',lane:'FIXED',run_id:BINDING.run_id,input_digest:DIGEST,
    source_tables:[{name:'OBSERVATION',row_count:2,digest:'a'.repeat(64)},{name:'OBSERVATION_IS',row_count:rows.length,digest:witness.metadata.observation_is_digest}],
    scope:{window:'OOS',coverage:'FULL_RETAINED_OOS',first_at_utc_ms:end,last_at_utc_ms:end+D,observation_count:2},
    windows:Object.fromEntries(Object.entries(windows).map(([key,value])=>[key,{...value,bounds_semantics:'START_INCLUSIVE_END_EXCLUSIVE',
      state:key==='holdout'?'NOT_PUBLISHED':'AVAILABLE',reason_code:key==='holdout'?'RETAINED_NO_HOLDOUT_ACCOUNT_PAYLOAD':null}])),
    by_window:{is:payload},facts:{},curves:{strategy_rebased_100:oosPoints,benchmark_rebased_100:oosPoints,drawdown_fraction:oosPoints.map(p=>({...p,value:'0'}))},
    library_summary:{return_fraction:'0.01',sparkline:oosPoints},monthly_returns:{},return_distribution:{},drawdown_episodes:{},rolling:null};
  const baseline=structuredClone(block);delete baseline.by_window;baseline.source_tables=baseline.source_tables.filter(table=>table.name!=='OBSERVATION_IS');
  return {rows,windows,block, baseline,input:{witnessBytes:witness.bytes,metadata:witness.metadata,expectedBinding:BINDING,expectedWindows:windows,
    expectedSymbols:['DEFAULT'],expectedPositionColumns:['Position_DEFAULT'],expectedBenchmarkLocator:'P08.verified_tape:unit_source_digest:close:OOS',
    hub:{status:200,body:{enriched_analysis:block}},report:{status:200,body:{enriched_analysis:structuredClone(block)}},oosBaseline:baseline}};
}
function both(input, mutate){mutate(input.hub.body.enriched_analysis);input.report.body.enriched_analysis=structuredClone(input.hub.body.enriched_analysis);}

test('independent raw IS proof binds file/row/observation domains and exact named Hub/Report metrics',()=>{
  const {input}=fixture(),proof=verifyIsQualification(input);
  assert.equal(proof.passed,true);assert.equal(proof.source_rows,4);assert.equal(proof.engine_sample_count,3);
  assert.equal(proof.calendar_daily_return_count,3);assert.equal(proof.annualization_periods,365);assert.equal(proof.oos_baseline_compared,true);
  assert.equal(new Set([proof.file_sha256,proof.normalized_rows_sha256,proof.observation_is_digest]).size,3);
  assert(!JSON.stringify(proof).includes('Position_DEFAULT'));assert(!Object.hasOwn(proof,'rows'));
});
test('Python float repr strings survive hashing without numeric reserialization',()=>{
  const {input}=fixture();const original=verifyIsWitness(input);
  assert.equal(original.metadata.observation_is_digest,input.hub.body.enriched_analysis.source_tables[1].digest);
  const changed=Buffer.from(input.witnessBytes.toString().replace('"100.0"','"100"'));
  input.witnessBytes=changed;input.metadata.file_sha256=sha(changed);input.metadata.byte_count=changed.length;
  assert.throws(()=>verifyIsWitness(input),/DIGEST_MISMATCH/);
});
test('observed-day Sharpe and filled-calendar statistics remain separate with real source gaps',()=>{
  const {input}=fixture({days:[0,1,3,4]});const proof=verifyIsQualification(input);
  assert.equal(proof.source_rows,4);assert.equal(proof.engine_sample_count,3);assert.equal(proof.calendar_daily_return_count,4);
  both(input,b=>{b.by_window.is.facts.metrics.sharpe.value=String(Number(b.by_window.is.facts.metrics.sharpe.value)*2);});
  assert.throws(()=>verifyIsQualification(input),/IS_QUANTBT_SHARPE/);
});
test('single-day report uses raw native bar returns with median-step annualization; daily facts remain absent',()=>{
  const {input}=fixture({days:[0,1],equity:[100,99],barReturns:[.25,-.1],step:3_600_000});
  const proof=verifyIsQualification(input);
  assert.equal(proof.engine_sample_kind,'NATIVE_BAR_RETURNS');assert.equal(proof.annualization_periods,8766);
  assert.equal(proof.calendar_daily_return_count,0);assert.equal(proof.engine_sample_count,2);
});
test('one observed daily return cannot masquerade as an available Sharpe or minimum-two distribution',()=>{
  const {input}=fixture({days:[0,1],equity:[100,110]});assert.equal(verifyIsQualification(input).passed,true);
  both(input,b=>{b.by_window.is.facts.metrics.sharpe.state='AVAILABLE';b.by_window.is.facts.metrics.sharpe.reason_code=null;b.by_window.is.facts.metrics.sharpe.value='0';});
  assert.throws(()=>verifyIsQualification(input),/TYPED_ABSENCE/);
});
test('constant returns produce typed zero-variance Sharpe/histogram absence, not fabricated histogram counts',()=>{
  const {input}=fixture({equity:[100,100,100,100]});assert.equal(verifyIsQualification(input).passed,true);
  both(input,b=>{b.by_window.is.return_distribution.buckets=[{lower_inclusive:'0',upper:'0',upper_inclusive:'true',count:3}];});
  assert.throws(()=>verifyIsQualification(input),/BUCKET_COUNT/);
});
test('all-gain signed-loss VaR and CVaR can legitimately be negative',()=>{
  const {input}=fixture({equity:[100,110,132,171.6]});assert.equal(verifyIsQualification(input).passed,true);
  assert(Number(input.hub.body.enriched_analysis.by_window.is.return_distribution.var_95.value)<0);
});
for(const field of ['file_sha256','normalized_rows_sha256','observation_is_digest','binding_sha256'])test(`rejects tampered ${field} domain`,()=>{
  const {input}=fixture();input.metadata[field]='c'.repeat(64);assert.throws(()=>verifyIsQualification(input),/DIGEST_MISMATCH/);
});
test('byte tamper, trailing data, noncanonical header and OOS boundary rows fail even with re-hashed file metadata',()=>{
  const {input,rows,windows}=fixture();const tampered=Buffer.from(input.witnessBytes);tampered[tampered.length-5]^=1;
  assert.throws(()=>verifyIsQualification({...input,witnessBytes:tampered}),/FILE_BYTE_DIGEST/);
  const outside=structuredClone(rows);outside.at(-1)[0]=windows.oos.start_ms;
  const rewritten=wire(outside,windows);assert.throws(()=>verifyIsWitness({...input,witnessBytes:rewritten.bytes,metadata:rewritten.metadata}),/OUTSIDE_DECLARED_IS/);
  const badHeader=wire(rows,windows,header=>{delete header.observation_header.bounds.bounds_semantics;});
  assert.throws(()=>verifyIsWitness({...input,witnessBytes:badHeader.bytes,metadata:badHeader.metadata}),/NORMALIZED_IS_HASH_BOUNDS/);
  const text=input.witnessBytes.toString().replace(/\n$/,'\n{}\n'),bytes=Buffer.from(text);
  assert.throws(()=>verifyIsWitness({...input,witnessBytes:bytes,metadata:{...input.metadata,byte_count:bytes.length,file_sha256:sha(bytes)}}),/EXACT_SOURCE_ROW/);
});
test('refuses scope, native symbol, position prefix, source close locator and exact attempt substitutions',()=>{
  const {input,rows,windows}=fixture();
  for(const modify of [h=>{h.binding.lease_epoch=2;},h=>{h.observation_header.symbols=['BTCUSDT'];},
    h=>{h.observation_header.position_columns=['BTCUSDT'];},h=>{h.observation_header.benchmark_locator='invented:close:OOS';}]){
    const changed=wire(rows,windows,modify);assert.throws(()=>verifyIsWitness({...input,witnessBytes:changed.bytes,metadata:changed.metadata}),/MISMATCH/);
  }
  const wrong={...input,expectedWindows:structuredClone(windows)};wrong.expectedWindows.is.start_ms+=1;
  assert.throws(()=>verifyIsWitness(wrong),/WINDOWS_MISMATCH/);
});
for(const mutate of [b=>{b.by_window.is.facts.metrics.return_fraction.value='0.5';},b=>{b.by_window.is.facts.metrics.max_drawdown_fraction.value='0';},
  b=>{b.by_window.is.return_distribution.mean.value='0';},b=>{b.by_window.is.return_distribution.buckets[0].count++;},
  b=>{b.by_window.is.curves.benchmark_rebased_100[1].value='999';},b=>{b.by_window.is.curves.strategy_rebased_100[1].value='999';},
  b=>{b.by_window.is.curves.drawdown_fraction[2].value='0';},b=>{b.by_window.is.facts.metrics.sharpe.input_digest='e'.repeat(64);},
  b=>{b.source_tables[1].digest='e'.repeat(64);},b=>{b.by_window.is.scope.locator='display_sample';}])test('rejects numerical/provenance mismatch against independent raw observations',()=>{
  const {input}=fixture();both(input,mutate);assert.throws(()=>verifyIsQualification(input));
});
test('OOS remains separately source-bound and unchanged rather than silently acquiring IS points',()=>{
  const {input}=fixture();both(input,b=>{b.curves.strategy_rebased_100[0].at_utc_ms=START;});
  assert.throws(()=>verifyIsQualification(input),/IS_OR_HOLDOUT/);
  const other=fixture().input;both(other,b=>{b.library_summary.return_fraction='0.2';});
  assert.throws(()=>verifyIsQualification(other),/EXISTING_OOS_BEHAVIOR/);
});
test('invalid close produces typed qualification absence without numerical PASS; forged AVAILABLE raw invalid-close rows are refused',()=>{
  const {input,rows,windows}=fixture();input.witnessBytes=undefined;input.metadata={schema_version:'research.is-qualification-source.v1',state:'NOT_PUBLISHED',
    reason_code:'IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE',binding_sha256:sha(canonicalIsJson(BINDING)),is_start_utc_ms:windows.is.start_ms,is_end_exclusive_utc_ms:windows.is.end_ms};
  both(input,b=>{b.by_window.is.benchmark.state='NOT_PUBLISHED';b.by_window.is.benchmark.reason_code='IS_SOURCE_ALIGNED_POSITIVE_CLOSE_NOT_PUBLISHED';b.by_window.is.curves.benchmark_rebased_100=[];});
  const proof=verifyIsQualification(input);assert.equal(proof.passed,false);assert.equal(proof.state,'NOT_PUBLISHED');
  for(const value of ['0.0','-1.0','nan','inf']){
    const changed=structuredClone(rows);changed[1][4]=value;const witness=wire(changed,windows);
    assert.throws(()=>verifyIsWitness({...fixture().input,witnessBytes:witness.bytes,metadata:witness.metadata}),/SOURCE.*CLOSE/);
  }
});
test('caps rows/bytes/metadata and does not import Python calculators or execute runtime/read operations',()=>{
  const {input,rows,windows}=fixture();const tooMany=Array.from({length:20_001},(_,i)=>[START+i,'100.0','0.0',['1.0'],'50.0']);
  const witness=wire(tooMany,windows);assert.throws(()=>verifyIsWitness({...input,witnessBytes:witness.bytes,metadata:witness.metadata}),/ROW_CAP/);
  assert.throws(()=>verifyIsWitness({...input,witnessBytes:Buffer.alloc(2*1024*1024+1)}),/BYTE_CAP/);
  assert.throws(()=>verifyIsWitness({...input,metadata:{...input.metadata,excess:'x'.repeat(2048)}}),/METADATA_BYTE_CAP/);
  const source=readFileSync(new URL('./is-qualification-oracle.mjs',import.meta.url),'utf8');
  assert(!/child_process|fetch\(|quantbt.*import|portal_api|8095/.test(source));
  assert(!source.includes('readFileSync'));assert.equal(rows.length,4);
});
