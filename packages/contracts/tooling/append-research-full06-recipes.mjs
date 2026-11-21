/** FULL06/6a: new immutable percent-equity binding; never mutate notional recipes. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url),path='apps/portal/registry/research-execution-recipes.v1.json';
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
const previous=JSON.parse(readFileSync(new URL('apps/portal/registry/research-full03-delta-binding.v1.json',root)));
const account={initial_capital:20000,leverage:3,alloc_per_trade:0.1,allocation_unit:'EQUITY_FRACTION',
  canonical_one_way_fee_rate:0.0005,slippage:0,funding_enabled:false,
  sizing_authority:'QUANTBT_PCT_EQUITY_LIVE_EQUITY_ON_SIGNAL_CHANGE_V1'};
const binding={...previous,schema_version:'research.full06-delta-binding.v1',alpha_version_id:'av_delta_rsi_polynomial_alpha_1_0_2',
  declared_contract:{...previous.declared_contract,version:'1.0.2',execution:{...previous.declared_contract.execution,
    execution_route:'pct_equity',account_model:'QUANTBT_PERCENT_EQUITY_V1',account}},account};
delete binding.adapter_contract_digest;binding.adapter_contract_digest=hash(binding);
writeFileSync(new URL('apps/portal/registry/research-full06-delta-binding.v1.json',root),JSON.stringify(binding,null,2)+'\n');
const table=JSON.parse(readFileSync(new URL(path,root)));
const templates=table.recipes.filter(r=>r.source_requirement==='FULL03_IMMUTABLE_DELTA_BINDING'&&r.descriptor.execution_route==='signal_notional');
assert.equal(templates.length,63);
for(const base of templates){
  const id=base.profile_id.replace('p10.delta-','p10.delta-pct-equity-');
  if(table.recipes.some(r=>r.profile_id===id))continue;
  const row=structuredClone(base),method=id.replace('p10.delta-','').replace('.v1','');
  row.profile_id=id;
  row.feature_flags=['FEATURE_RESEARCH_RUN_PRODUCER','FEATURE_RESEARCH_WFO_PROFILE','FEATURE_RESEARCH_FULL06_PROFILE'];
  row.descriptor={...row.descriptor,schema_version:'research.full06-delta-profile.v1',profile_id:id,
    execution_route:'pct_equity',adapter_contract_digest:binding.adapter_contract_digest,account,
    alpha_binding_requirements:{...row.descriptor.alpha_binding_requirements,alpha_version_id:binding.alpha_version_id,
      adapter_contract_digest:binding.adapter_contract_digest},
    current_source:{source_adapter_id:`full06.quantbt-${method}.v1`,profile_id:`full06.delta-${method}.v1`}};
  row.public_profile={...row.public_profile,profile_id:id,execution_route:'pct_equity',account_model:'QUANTBT_PERCENT_EQUITY_V1'};
  row.profile_digest=hash(row.descriptor);
  table.recipes.push(row);table.qualification_references.push({profile_id:id,recipe_digest:hash(row),
    kind:'CANDIDATE_NOT_QUALIFIED',receipt_path:null,receipt_sha256:null});
}
writeFileSync(new URL(path,root),JSON.stringify(table,null,2)+'\n');
const sp='apps/portal/registry/research-execution-recipes.v1.schema.json',schema=JSON.parse(readFileSync(new URL(sp,root)));
const flags=schema.properties.recipes.items.properties.feature_flags.items.enum;
if(!flags.includes('FEATURE_RESEARCH_FULL06_PROFILE'))flags.push('FEATURE_RESEARCH_FULL06_PROFILE');
writeFileSync(new URL(sp,root),JSON.stringify(schema,null,2)+'\n');
console.log('FULL06:63 candidate percent-equity recipes; prior98 descriptors/qualifications unchanged.');
