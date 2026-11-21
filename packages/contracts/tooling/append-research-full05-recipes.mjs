/** FULL05 candidates: preserve every historical descriptor and receipt. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url),path='apps/portal/registry/research-execution-recipes.v1.json';
const table=JSON.parse(readFileSync(new URL(path,root)));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const templates=table.recipes.filter(r=>r.source_requirement==='FULL03_IMMUTABLE_DELTA_BINDING'
  &&['1h','4h','1d'].includes(r.public_profile.timeframe));
assert.equal(templates.length,27);
for(const base of templates){
  const id=base.profile_id.replace('p10.delta-','p10.imported-');
  if(table.recipes.some(r=>r.profile_id===id))continue;
  const row=structuredClone(base),method=id.replace('p10.imported-','').replace('.v1','');
  row.profile_id=id;row.adapter_kind='IMPORTED_SEARCH';row.work_schema_version='research.full05-imported-work.v1';
  row.source_requirement='IMPORTED_IMMUTABLE_SEARCH_BINDING';
  row.feature_flags=['FEATURE_RESEARCH_RUN_PRODUCER','FEATURE_RESEARCH_WFO_PROFILE','FEATURE_RESEARCH_IMPORTED_EXECUTION','FEATURE_RESEARCH_FULL05_PROFILE'];
  row.budgets.max_warmup_bars=4096;
  row.descriptor={...row.descriptor,schema_version:'research.full05-imported-profile.v1',profile_id:id,
    adapter_id:'p17.imported-signal-notional.v1',adapter_contract_digest:'b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6',
    alpha_binding_requirements:{source_contract:'research.alpha-source.v1',binding_contract:'research.imported-search-binding.v1',
      adapter_id:'p17.imported-signal-notional.v1',adapter_contract_digest:'b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6',max_warmup_bars:4096},
    current_source:{source_adapter_id:`full05.quantbt-imported-${method}.v1`,profile_id:`full05.imported-${method}.v1`}};
  row.public_profile.profile_id=id;
  row.profile_digest=hash(row.descriptor);
  table.recipes.push(row);table.qualification_references.push({profile_id:id,recipe_digest:hash(row),
    kind:'CANDIDATE_NOT_QUALIFIED',receipt_path:null,receipt_sha256:null});
}
writeFileSync(new URL(path,root),JSON.stringify(table,null,2)+'\n');
const sp='apps/portal/registry/research-execution-recipes.v1.schema.json',schema=JSON.parse(readFileSync(new URL(sp,root)));
const row=schema.properties.recipes.items.properties;
for(const [key,value]of[['adapter_kind','IMPORTED_SEARCH'],['source_requirement','IMPORTED_IMMUTABLE_SEARCH_BINDING']])
  if(!row[key].enum.includes(value))row[key].enum.push(value);
if(!row.feature_flags.items.enum.includes('FEATURE_RESEARCH_FULL05_PROFILE'))row.feature_flags.items.enum.push('FEATURE_RESEARCH_FULL05_PROFILE');
writeFileSync(new URL(sp,root),JSON.stringify(schema,null,2)+'\n');
console.log('FULL05:27 separate candidate recipes; all existing descriptor/qualification bytes unchanged.');
